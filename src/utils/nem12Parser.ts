import type { Nem12Data, IntervalRecord } from '../types';

export class Nem12ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Nem12ParseError';
  }
}

export function parseNem12(content: string): Nem12Data {
  // Strip UTF-8 BOM (﻿) if present — common in retailer exports
  const stripped = content.charCodeAt(0) === 0xFEFF ? content.slice(1) : content;
  const lines = stripped.split(/\r?\n/).filter(l => l.trim().length > 0);

  if (lines.length === 0) throw new Nem12ParseError('File is empty');

  // Validate loosely — some retailers omit the 100 header entirely
  const firstField = lines[0].split(',')[0].trim();
  if (!['100', '200', '300'].includes(firstField)) {
    throw new Nem12ParseError(
      `Unrecognised file format (first field is "${firstField}") — is this a NEM12 file?`
    );
  }

  let nmi = '';
  let intervalLength = 30;
  let selectedRegister = ''; // register we've committed to for the chosen NMI
  let currentNmi       = ''; // NMI of the most-recent 200 record
  let currentRegister  = ''; // register of the most-recent 200 record

  // Keyed by date — last record for a date wins (handles NEM12 correction/substitution records)
  const intervalMap = new Map<string, IntervalRecord>();

  for (const line of lines) {
    const fields = line.split(',');
    const recordType = fields[0].trim();

    if (recordType === '200') {
      const candidateNmi = fields[1]?.trim() ?? '';
      const rid          = fields[3]?.trim() ?? '';
      currentNmi      = candidateNmi;
      currentRegister = rid;

      if (nmi === '') {
        // Lock in the first NMI we see
        nmi              = candidateNmi;
        selectedRegister = rid;
        intervalLength   = parseInt(fields[8]?.trim() ?? '30', 10) || 30;
      } else if (candidateNmi === nmi && rid === 'E1' && selectedRegister !== 'E1') {
        // Same NMI — upgrade to E1 if we originally picked a different register
        selectedRegister = 'E1';
        intervalLength   = parseInt(fields[8]?.trim() ?? '30', 10) || 30;
      }
      // 200 records for a different NMI are ignored
    }

    if (recordType === '300' && nmi !== '' && currentNmi === nmi && currentRegister === selectedRegister) {
      const dateStr = fields[1]?.trim() ?? '';
      if (dateStr.length !== 8) continue;

      const intervalsPerDay = (24 * 60) / intervalLength;
      const values: number[] = [];

      for (let i = 2; i < 2 + intervalsPerDay; i++) {
        const v = parseFloat(fields[i] ?? '0');
        values.push(isNaN(v) ? 0 : v);
      }

      const qualityMethod = fields[2 + intervalsPerDay]?.trim() ?? 'A';
      intervalMap.set(dateStr, { date: dateStr, intervals: values, qualityMethod });
    }
  }

  if (nmi === '') throw new Nem12ParseError('No NMI data found — file may be malformed');
  if (intervalMap.size === 0) throw new Nem12ParseError('No interval data (300 records) found in file');

  const intervals = Array.from(intervalMap.values());
  intervals.sort((a, b) => a.date.localeCompare(b.date));

  console.log(`[parser] NMI: ${nmi}, register: ${selectedRegister}, unique dates: ${intervalMap.size}`,
    `(${intervals[0]?.date} → ${intervals[intervals.length - 1]?.date})`);

  const totalKwh = intervals.reduce(
    (sum, day) => sum + day.intervals.reduce((s, v) => s + v, 0),
    0
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
