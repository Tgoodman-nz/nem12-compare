import type { Nem12Data, IntervalRecord } from '../types';

export class Nem12ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Nem12ParseError';
  }
}

export function parseNem12(content: string): Nem12Data {
  const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);

  if (lines.length === 0) throw new Nem12ParseError('File is empty');

  const first = lines[0].split(',');
  if (first[0] !== '100') throw new Nem12ParseError('File does not start with a 100 record — is this a NEM12 file?');
  if (first[3] && !['NEM12', 'NEM13'].includes(first[3].trim())) {
    throw new Nem12ParseError(`Unexpected file version: ${first[3]}`);
  }

  let nmi = '';
  let intervalLength = 30;
  let registerId = '';
  const intervals: IntervalRecord[] = [];

  for (const line of lines) {
    const fields = line.split(',');
    const recordType = fields[0].trim();

    if (recordType === '200') {
      // Only grab the first E1 (import/consumption) register we find
      const rid = fields[3]?.trim() ?? '';
      if (nmi === '' || rid === 'E1' || rid === '') {
        nmi = fields[1]?.trim() ?? '';
        registerId = rid;
        intervalLength = parseInt(fields[8]?.trim() ?? '30', 10) || 30;
      }
    }

    if (recordType === '300' && nmi !== '') {
      // Skip if we've moved to a different register after finding E1
      const dateStr = fields[1]?.trim() ?? '';
      if (dateStr.length !== 8) continue;

      const intervalsPerDay = (24 * 60) / intervalLength;
      const values: number[] = [];

      for (let i = 2; i < 2 + intervalsPerDay; i++) {
        const v = parseFloat(fields[i] ?? '0');
        values.push(isNaN(v) ? 0 : v);
      }

      const qualityMethod = fields[2 + intervalsPerDay]?.trim() ?? 'A';

      intervals.push({ date: dateStr, intervals: values, qualityMethod });
    }
  }

  if (nmi === '') throw new Nem12ParseError('No NMI data found — file may be malformed');
  if (intervals.length === 0) throw new Nem12ParseError('No interval data (300 records) found in file');

  intervals.sort((a, b) => a.date.localeCompare(b.date));

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
