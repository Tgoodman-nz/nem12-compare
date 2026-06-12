import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from 'recharts';
import type { ComparisonResult } from '../types';

interface Props {
  result: ComparisonResult;
}

export function Results({ result }: Props) {
  const { fixedTotal, wholesaleTotal, difference, dailySeries, periodDays, totalKwh } = result;
  const wholesaleCheaper = difference > 0;

  // Thin out to weekly averages if more than 90 days (chart readability)
  const chartData = dailySeries.length > 90
    ? rollupWeekly(dailySeries)
    : dailySeries.map(d => ({
        label: formatLabel(d.date),
        fixed: d.fixedCost,
        wholesale: d.wholesaleCost,
        diff: round2(d.fixedCost - d.wholesaleCost),
      }));

  return (
    <div className="card">
      <h2>Results</h2>

      <div className="summary-grid">
        <div className="summary-box">
          <div className="summary-label">Fixed rate total</div>
          <div className="summary-value">${fixedTotal.toFixed(2)}</div>
        </div>
        <div className="summary-box">
          <div className="summary-label">Wholesale total</div>
          <div className="summary-value">${wholesaleTotal.toFixed(2)}</div>
        </div>
        <div className={`summary-box highlight ${wholesaleCheaper ? 'saving' : 'more-expensive'}`}>
          <div className="summary-label">
            {wholesaleCheaper ? 'Wholesale saves you' : 'Wholesale costs extra'}
          </div>
          <div className="summary-value">${Math.abs(difference).toFixed(2)}</div>
          <div className="summary-sub">over {periodDays} days · {totalKwh.toFixed(0)} kWh</div>
        </div>
      </div>

      <div className="chart-wrap">
        <h3>{dailySeries.length > 90 ? 'Weekly cost comparison' : 'Daily cost comparison'}</h3>
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={v => `$${v}`} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={v => `$${v}`} />
            <Tooltip formatter={(v: number) => `$${v.toFixed(2)}`} />
            <Legend />
            <Bar yAxisId="left" dataKey="fixed" name="Fixed" fill="#94a3b8" radius={[2,2,0,0]} />
            <Bar yAxisId="left" dataKey="wholesale" name="Wholesale" fill="#3b82f6" radius={[2,2,0,0]} />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="diff"
              name="Fixed − Wholesale"
              stroke="#f59e0b"
              dot={false}
              strokeWidth={2}
            />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="hint chart-note">
          Amber line shows daily difference — positive means fixed was more expensive that day.
        </p>
      </div>
    </div>
  );
}

function formatLabel(date: string): string {
  const [, m, d] = date.split('-');
  return `${d}/${m}`;
}

function rollupWeekly(series: ComparisonResult['dailySeries']) {
  const weeks: { label: string; fixed: number; wholesale: number; diff: number }[] = [];
  for (let i = 0; i < series.length; i += 7) {
    const chunk = series.slice(i, i + 7);
    const fixed = round2(chunk.reduce((s, d) => s + d.fixedCost, 0));
    const wholesale = round2(chunk.reduce((s, d) => s + d.wholesaleCost, 0));
    weeks.push({
      label: formatLabel(chunk[0].date),
      fixed,
      wholesale,
      diff: round2(fixed - wholesale),
    });
  }
  return weeks;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
