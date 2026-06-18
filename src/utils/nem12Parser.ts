import type { Nem12Data, IntervalRecord } from '../types';

export class Nem12ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Nem12ParseError';
  }
}

// Parses the flat "Meter Data Report" CSV: one row per day, date first, 48 half-hourly values.
// Format: YYYYMMDD, v1, v2, …, v48, quality, daily_total
function parseMeterDataReport(lines: string[], filename?: string): Nem12Data {
  // Try to extract NMI from filename pattern: XXXXXXXX_NMI_YYYYMMDD_...
  let nmi = 'UNKNOWN';
  if (filename) {
    const parts = filename.split('_');
    if (parts.length >= 2 && /^\d{10,11}$/.test(parts[1])) nmi = parts[1];
  }

  const intervalMap = new Map<string, IntervalRecord>();
  for (const line of lines) {
    const fields = line.split(',');
    const dateStr = fields[0].trim();
    if (!/^\d{8}$/.test(dateStr)) continue;
    const values: number[] = [];
    for (let i = 1; i <= 48; i++) {
      const v = parseFloat(fields[i] ?? '0');
      values.push(isNaN(v) ? 0 : v);
    }
    const qualityMethod = fields[49]?.trim() ?? 'A';
    intervalMap.set(dateStr, { date: dateStr, intervals: values, qualityMethod });
  }

  if (intervalMap.size === 0) throw new Nem12ParseError('No interval data found in file');

  const intervals = Array.from(intervalMap.values());
  intervals.sort((a, b) => a.date.localeCompare(b.date));

  const totalKwh = intervals.reduce(
    (sum, day) => sum + day.intervals.reduce((s, v) => s + (v > 0 ? v : 0), 0),
    0
  );

  console.log(
    `[parser] MeterDataReport NMI: ${nmi}, unique days: ${intervalMap.size}`,
    `(${intervals[0]?.date} → ${intervals[intervals.length - 1]?.date})`,
  );

  return {
    nmi,
    intervalLength: 30,
    dateFrom: intervals[0].date,
    dateTo: intervals[intervals.length - 1].date,
    intervals,
    totalKwh: Math.round(totalKwh * 1000) / 1000,
  };
}

export function parseNem12(content: string, filename?: string): Nem12Data {
  // Strip UTF-8 BOM (﻿) if present — common in retailer exports
  const stripped = content.charCodeAt(0) === 0xFEFF ? content.slice(1) : content;
  const lines = stripped.split(/\r?\n/).filter(l => l.trim().length > 0);

  if (lines.length === 0) throw new Nem12ParseError('File is empty');

  const firstField = lines[0].split(',')[0].trim();

  // Detect flat Meter Data Report format (date-first, no 100/200/300 records)
  if (/^\d{8}$/.test(firstField)) return parseMeterDataReport(lines, filename);

  // Validate loosely — some retailers omit the 100 header entirely
  if (!['100', '200', '300'].includes(firstField)) {
    throw new Nem12ParseError(
      `Unrecognised file format (first field is "${firstField}") — is this a NEM12 file?`
    );
  }

  let nmi = '';
  let intervalLength = 30;
  let selectedRegister = ''; // E1 import register
  let currentNmi       = ''; // NMI of the most-recent 200 record
  let currentRegister  = ''; // register of the most-recent 200 record
  let exportIntervalLength = 30; // B1 export register interval length

  // Pre-scan 200 records to determine selectedRegister before processing 300 data.
  // Without this, B1 records that appear before E1 in the file are misrouted to
  // intervalMap and then silently overwritten when E1 data arrives.
  for (const line of lines) {
    const fields = line.split(',');
    if (fields[0].trim() !== '200') continue;
    const candidateNmi = fields[1]?.trim() ?? '';
    const rid          = fields[3]?.trim() ?? '';
    if (nmi === '') {
      nmi              = candidateNmi;
      selectedRegister = rid;
      intervalLength   = parseInt(fields[8]?.trim() ?? '30', 10) || 30;
    } else if (candidateNmi === nmi) {
      if (rid === 'E1' && selectedRegister !== 'E1') {
        selectedRegister = 'E1';
        intervalLength   = parseInt(fields[8]?.trim() ?? '30', 10) || 30;
      }
      if (rid === 'B1') {
        exportIntervalLength = parseInt(fields[8]?.trim() ?? '30', 10) || 30;
      }
    }
  }
  // Reset for the main pass
  nmi = '';

  // E1 import intervals — last record per date wins (handles correction records)
  const intervalMap = new Map<string, IntervalRecord>();
  // B1 export intervals — stored as positive values, negated when merged
  const exportMap = new Map<string, number[]>();

  for (const line of lines) {
    const fields = line.split(',');
    const recordType = fields[0].trim();

    if (recordType === '200') {
      const candidateNmi = fields[1]?.trim() ?? '';
      const rid          = fields[3]?.trim() ?? '';
      currentNmi      = candidateNmi;
      currentRegister = rid;
      if (nmi === '') nmi = candidateNmi;
    }

    if (recordType === '300' && nmi !== '' && currentNmi === nmi) {
      const dateStr = fields[1]?.trim() ?? '';
      if (dateStr.length !== 8) continue;

      if (currentRegister === selectedRegister) {
        // E1 import data
        const intervalsPerDay = (24 * 60) / intervalLength;
        const values: number[] = [];
        for (let i = 2; i < 2 + intervalsPerDay; i++) {
          const v = parseFloat(fields[i] ?? '0');
          values.push(isNaN(v) ? 0 : v);
        }
        const qualityMethod = fields[2 + intervalsPerDay]?.trim() ?? 'A';
        intervalMap.set(dateStr, { date: dateStr, intervals: values, qualityMethod });

      } else if (currentRegister === 'B1') {
        // B1 export data — store positive values; negated when merged below
        const intervalsPerDay = (24 * 60) / exportIntervalLength;
        const values: number[] = [];
        for (let i = 2; i < 2 + intervalsPerDay; i++) {
          const v = parseFloat(fields[i] ?? '0');
          values.push(isNaN(v) ? 0 : v);
        }
        exportMap.set(dateStr, values); // last record wins
      }
    }
  }

  if (nmi === '') throw new Nem12ParseError('No NMI data found — file may be malformed');
  if (intervalMap.size === 0) throw new Nem12ParseError('No interval data (300 records) found in file');

  // Merge B1 export into E1 intervals as negative values.
  // Each 30-min slot is either import OR export — never both — so B1 > 0 overrides E1.
  for (const [date, exportVals] of exportMap) {
    const existing = intervalMap.get(date);
    if (existing) {
      exportVals.forEach((v, i) => {
        if (v > 0) existing.intervals[i] = -v;
      });
    } else {
      // Export-only day (rare but possible — e.g. fully off-grid with battery)
      intervalMap.set(date, {
        date,
        intervals: exportVals.map(v => (v > 0 ? -v : 0)),
        qualityMethod: 'A',
      });
    }
  }

  const intervals = Array.from(intervalMap.values());
  intervals.sort((a, b) => a.date.localeCompare(b.date));

  const totalKwh = intervals.reduce(
    (sum, day) => sum + day.intervals.reduce((s, v) => s + (v > 0 ? v : 0), 0),
    0
  );

  console.log(
    `[parser] NMI: ${nmi}, register: ${selectedRegister}, unique days: ${intervalMap.size}`,
    `(${intervals[0]?.date} → ${intervals[intervals.length - 1]?.date})`,
    exportMap.size > 0 ? `B1 export: ${exportMap.size} days` : 'no B1 export data',
  );

  return {
    nmi,
    intervalLength,
    dateFrom: intervals[0].date,
    dateTo: intervals[intervals.length - 1].date,
    intervals,
    totalKwh: Math.round(totalKwh * 1000) / 1000,
  };
}

export function formatNem12Date(yyyymmdd: string): string {
  const y = yyyymmdd.slice(0, 4);
  const m = yyyymmdd.slice(4, 6);
  const d = yyyymmdd.slice(6, 8);
  return `${d}/${m}/${y}`;
}
