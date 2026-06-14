import { useState } from 'react';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from 'recharts';
import type { Nem12Data, SpotPriceInterval } from '../types';

type Season = 'all' | 'summer' | 'autumn' | 'winter' | 'spring';

const SEASONS: { key: Season; label: string; subtitle: string }[] = [
  { key: 'all',    label: 'All year', subtitle: '' },
  { key: 'summer', label: 'Summer',   subtitle: 'Dec–Feb' },
  { key: 'autumn', label: 'Autumn',   subtitle: 'Mar–May' },
  { key: 'winter', label: 'Winter',   subtitle: 'Jun–Aug' },
  { key: 'spring', label: 'Spring',   subtitle: 'Sep–Nov' },
];

function getSeason(month: number): Season {
  if (month === 12 || month <= 2) return 'summer';
  if (month <= 5) return 'autumn';
  if (month <= 8) return 'winter';
  return 'spring';
}

function hourLabel(h: number): string {
  if (h === 0) return '12am';
  if (h < 12) return `${h}am`;
  if (h === 12) return '12pm';
  return `${h - 12}pm`;
}

// Spot price datetime is the NEM block-end key "YYYYMMDD-HH:MM".
// Map it back to the hour of day the block started in.
function spotBlockHour(datetime: string): number {
  const hh = parseInt(datetime.slice(9, 11), 10);
  const mm = parseInt(datetime.slice(12, 14), 10);
  if (mm === 30) return hh;        // "HH:30" → block started at HH:00
  if (hh === 0)  return 23;        // "00:00" → block started at 23:30 previous hour
  return hh - 1;                   // "HH:00" → block started at (HH-1):30
}

function computeHourly(
  nem12: Nem12Data,
  spotPrices: SpotPriceInterval[],
  season: Season,
) {
  const intervalsPerHour = 60 / nem12.intervalLength;
  const importSum = new Array<number>(24).fill(0);
  const exportSum = new Array<number>(24).fill(0);
  let dayCount = 0;

  for (const record of nem12.intervals) {
    const month = parseInt(record.date.slice(4, 6), 10);
    if (season !== 'all' && getSeason(month) !== season) continue;
    dayCount++;

    for (let i = 0; i < record.intervals.length; i++) {
      const hour = Math.floor(i / intervalsPerHour);
      if (hour >= 24) continue;
      const kwh = record.intervals[i];
      if (kwh > 0) importSum[hour] += kwh;
      else if (kwh < 0) exportSum[hour] += Math.abs(kwh);
    }
  }

  // Average spot price per hour in c/kWh ($/MWh ÷ 10 = c/kWh)
  const spotSum = new Array<number>(24).fill(0);
  const spotN   = new Array<number>(24).fill(0);
  for (const sp of spotPrices) {
    const month = parseInt(sp.datetime.slice(4, 6), 10);
    if (season !== 'all' && getSeason(month) !== season) continue;
    const hour = spotBlockHour(sp.datetime);
    spotSum[hour] += sp.rrp;
    spotN[hour]++;
  }

  return Array.from({ length: 24 }, (_, h) => ({
    hour: hourLabel(h),
    Consumed: dayCount > 0 ? Math.round((importSum[h] / dayCount) * 1000) / 1000 : 0,
    Exported: dayCount > 0 ? Math.round((exportSum[h] / dayCount) * 1000) / 1000 : 0,
    'Spot price': spotN[h] > 0
      ? Math.round((spotSum[h] / spotN[h]) / 10 * 10) / 10  // c/kWh, 1 dp
      : null,
  }));
}

interface Props {
  nem12: Nem12Data;
  spotPrices: SpotPriceInterval[];
}

export function HourlyProfileChart({ nem12, spotPrices }: Props) {
  const [season, setSeason] = useState<Season>('all');

  const hasExport = nem12.intervals.some(r => r.intervals.some(v => v < 0));
  const chartData = computeHourly(nem12, spotPrices, season);
  const hasSpotData = chartData.some(d => d['Spot price'] !== null);
  const activeSeason = SEASONS.find(s => s.key === season)!;

  return (
    <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid #e2e8f0' }}>
      <div style={{ marginBottom: '0.75rem' }}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#475569', margin: '0 0 0.5rem' }}>
          Average kWh per hour of day
          {activeSeason.subtitle && (
            <span style={{ fontWeight: 400, color: '#94a3b8', marginLeft: '0.5rem' }}>
              — {activeSeason.label} ({activeSeason.subtitle})
            </span>
          )}
        </h3>
        <div className="view-toggle">
          {SEASONS.map(s => (
            <button
              key={s.key}
              className={`view-btn${season === s.key ? ' active' : ''}`}
              onClick={() => setSeason(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 56, bottom: 4, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="hour" tick={{ fontSize: 10 }} interval={2} />
          <YAxis
            yAxisId="kwh"
            tick={{ fontSize: 11 }}
            unit=" kWh"
            width={64}
          />
          {hasSpotData && (
            <YAxis
              yAxisId="price"
              orientation="right"
              tick={{ fontSize: 11 }}
              tickFormatter={v => `${v}c`}
              width={48}
            />
          )}
          <Tooltip
            formatter={(v, name) => {
              if (!v && v !== 0) return [v, name];
              if (name === 'Spot price') return [`${(v as number).toFixed(1)} c/kWh`, name];
              return [`${(v as number).toFixed(3)} kWh`, name];
            }}
          />
          <Legend />
          <Bar yAxisId="kwh" dataKey="Consumed" fill="#f97316" radius={[2, 2, 0, 0]} />
          {hasExport && (
            <Bar yAxisId="kwh" dataKey="Exported" fill="#3b82f6" radius={[2, 2, 0, 0]} />
          )}
          {hasSpotData && (
            <Line
              yAxisId="price"
              type="monotone"
              dataKey="Spot price"
              stroke="#8b5cf6"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
      {hasSpotData && (
        <p style={{ fontSize: '0.75rem', color: '#94a3b8', textAlign: 'right', marginTop: '0.25rem' }}>
          Purple line = avg spot price (c/kWh, right axis)
        </p>
      )}
    </div>
  );
}
