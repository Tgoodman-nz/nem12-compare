import { useState } from 'react';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from 'recharts';
import type { ComparisonResult } from '../types';

interface Props {
  result: ComparisonResult;
}

const PLAN_COLORS = ['#f97316', '#8b5cf6', '#10b981'];

type Granularity = 'daily' | 'weekly' | 'monthly' | 'yearly';
type ChartType = 'bar' | 'line' | 'both';

const GRANULARITY_LABELS: Record<Granularity, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
};

export function Results({ result }: Props) {
  const { plans, dailySeries, periodDays, totalFileDays, totalKwh, totalExportKwh, spotDataAvailable } = result;

  const defaultGranularity: Granularity = dailySeries.length > 90 ? 'weekly' : 'daily';
  const [granularity, setGranularity] = useState<Granularity>(defaultGranularity);
  const [chartType, setChartType] = useState<ChartType>('bar');

  const cheapest = plans.length > 1
    ? plans.reduce((min, p) => (p.total < min.total ? p : min), plans[0])
    : null;

  const chartData = rollup(dailySeries, plans, granularity);

  return (
    <div className="card">
      <h2>Results</h2>

      <div className="summary-grid">
        {plans.map((plan, i) => {
          const isCheapest = cheapest !== null && plan.label === cheapest.label;
          const wholesalePlan = spotDataAvailable ? plans[plans.length - 1] : null;
          return (
            <div key={plan.label} className={`summary-box${isCheapest ? ' highlight saving' : ''}`}>
              <div className="summary-label">{plan.label}{isCheapest ? ' ✓ cheapest' : ''}</div>
              <div className="summary-value">${plan.total.toFixed(2)}</div>
              <div className="summary-sub">
                Usage ${plan.usageCost.toFixed(2)} · Supply ${plan.supplyCost.toFixed(2)}
                {plan.fitCredit > 0 && ` · FiT −$${plan.fitCredit.toFixed(2)}`}
              </div>
              {wholesalePlan !== null && i < plans.length - 1 && (() => {
                const diff = plan.total - wholesalePlan.total;
                return (
                  <div className="summary-sub">
                    {diff > 0
                      ? `$${diff.toFixed(2)} more than wholesale`
                      : `$${(-diff).toFixed(2)} less than wholesale`}
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>

      {!spotDataAvailable && (
        <div className="warning-card card" style={{ marginBottom: '1rem' }}>
          <p className="warning">
            Wholesale comparison unavailable — the OpenElectricity API returned no spot price data
            for your NEM12 date range. Your fixed plan cost{plans.length > 1 ? 's are' : ' is'} shown
            for the full {periodDays}-day period. Check the browser console (F12) for diagnostic details.
          </p>
        </div>
      )}

      <div className="summary-meta">
        {periodDays} days compared
        {totalFileDays !== periodDays && ` (${totalFileDays} days in file)`}
        {' · '}{totalKwh.toFixed(0)} kWh imported
        {totalExportKwh > 0 && ` · ${totalExportKwh.toFixed(0)} kWh exported`}
      </div>
      <p className="results-caveat">
        Fixed plan costs are calculated at the rates you entered — if your rates changed during this period, actual costs will differ.
        Wholesale costs use real historical AEMO spot prices and are not affected by this.
      </p>

      <div className="chart-wrap">
        <div className="chart-header">
          <h3>{GRANULARITY_LABELS[granularity]} cost comparison</h3>
          <div className="chart-controls">
            <select
              className="granularity-select"
              value={granularity}
              onChange={e => setGranularity(e.target.value as Granularity)}
            >
              {(Object.keys(GRANULARITY_LABELS) as Granularity[]).map(g => (
                <option key={g} value={g}>{GRANULARITY_LABELS[g]}</option>
              ))}
            </select>
            <div className="chart-type-toggle">
              {(['bar', 'line', 'both'] as ChartType[]).map(t => (
                <button
                  key={t}
                  className={`chart-type-btn${chartType === t ? ' active' : ''}`}
                  onClick={() => setChartType(t)}
                >
                  {t === 'bar' ? 'Bar' : t === 'line' ? 'Line' : 'Both'}
                </button>
              ))}
            </div>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${v}`} />
            <Tooltip formatter={(v: number) => `$${v.toFixed(2)}`} />
            <Legend />
            {plans.map((plan, i) => (chartType === 'bar' || chartType === 'both') && (
              <Bar
                key={`bar-${plan.label}`}
                dataKey={plan.label}
                name={plan.label}
                fill={PLAN_COLORS[i % PLAN_COLORS.length]}
                fillOpacity={chartType === 'both' ? 0.45 : 1}
                radius={[2, 2, 0, 0]}
              />
            ))}
            {plans.map((plan, i) => (chartType === 'line' || chartType === 'both') && (
              <Line
                key={`line-${plan.label}`}
                type="monotone"
                dataKey={plan.label}
                name={chartType === 'both' ? undefined : plan.label}
                stroke={PLAN_COLORS[i % PLAN_COLORS.length]}
                strokeWidth={2}
                dot={false}
                legendType={chartType === 'both' ? 'none' : 'line'}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function rollup(
  series: ComparisonResult['dailySeries'],
  plans: ComparisonResult['plans'],
  granularity: Granularity,
): Record<string, string | number>[] {
  if (granularity === 'daily') {
    return series.map(d => toChartRow(d.date, d.costs, plans, 'daily'));
  }

  const buckets = new Map<string, { firstDate: string; costs: number[] }>();
  for (const day of series) {
    const key = bucketKey(day.date, granularity);
    const existing = buckets.get(key);
    if (existing) {
      day.costs.forEach((c, i) => { existing.costs[i] = (existing.costs[i] ?? 0) + c; });
    } else {
      buckets.set(key, { firstDate: day.date, costs: [...day.costs] });
    }
  }

  return Array.from(buckets.values()).map(({ firstDate, costs }) =>
    toChartRow(firstDate, costs.map(round2), plans, granularity),
  );
}

function bucketKey(date: string, granularity: Granularity): string {
  // date is "YYYY-MM-DD"
  if (granularity === 'weekly') {
    // ISO week: group into 7-day blocks from the first date in the series
    const d = new Date(date + 'T00:00:00Z');
    const dayOfWeek = d.getUTCDay(); // 0=Sun
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() - ((dayOfWeek + 6) % 7));
    return monday.toISOString().slice(0, 10);
  }
  if (granularity === 'monthly') return date.slice(0, 7); // "YYYY-MM"
  if (granularity === 'yearly')  return date.slice(0, 4); // "YYYY"
  return date;
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function toChartRow(
  date: string,
  costs: number[],
  plans: ComparisonResult['plans'],
  granularity: Granularity,
): Record<string, string | number> {
  const [y, m, d] = date.split('-');
  let label: string;
  if (granularity === 'yearly')       label = y;
  else if (granularity === 'monthly') label = `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y.slice(2)}`;
  else                                label = `${d}/${m}`;

  const row: Record<string, string | number> = { label };
  plans.forEach((plan, i) => { row[plan.label] = costs[i]; });
  return row;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
