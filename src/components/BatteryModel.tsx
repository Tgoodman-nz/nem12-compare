import { useState, useMemo } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from 'recharts';
import type { Nem12Data, FixedRateConfig, WholesaleConfig, SpotPriceInterval } from '../types';
import { simulateBattery } from '../utils/batterySimulator';

const SIZES = [5, 10, 15, 20, 30];

const SCENARIO_COLORS = {
  Pessimistic: '#94a3b8',
  Optimistic:  '#10b981',
};

interface PlanBaseline {
  label: string;
  annualCost: number;
}

interface Props {
  nem12: Nem12Data;
  spotPrices: SpotPriceInterval[];
  planA: FixedRateConfig;
  planB?: FixedRateConfig;
  wholesale: WholesaleConfig;
  baselines: PlanBaseline[];
}

export function BatteryModel({ nem12, spotPrices, planA, planB, wholesale, baselines }: Props) {
  const [maxKw, setMaxKw]           = useState(5);
  const [effPct, setEffPct]         = useState(90);       // stored as 0–100 integer
  const [costPerKwh, setCostPerKwh] = useState(800);      // $/kWh installed
  const [selectedSize, setSelectedSize] = useState(10);
  const [activePlan, setActivePlan] = useState(0);

  // Run all sizes in one memo — cost is negligible for typical NEM12 datasets
  const allResults = useMemo(() =>
    SIZES.map(sizeKwh => ({
      sizeKwh,
      planResults: simulateBattery(
        nem12, planA, wholesale, spotPrices,
        { capacityKwh: sizeKwh, maxKw, efficiency: effPct / 100 },
        planB,
      ),
    })),
    [nem12, planA, planB, wholesale, spotPrices, maxKw, effPct],
  );

  const planLabels = allResults[0].planResults.map(r => r.planLabel);

  // Chart: saving vs battery size for the active plan
  const chartData = allResults.map(({ sizeKwh, planResults }) => {
    const pr = planResults[activePlan];
    return {
      size: `${sizeKwh} kWh`,
      Pessimistic: pr ? Math.round(pr.pessimistic.annualSaving) : 0,
      Optimistic:  pr ? Math.round(pr.optimistic.annualSaving)  : 0,
    };
  });

  // Summary cards for the selected battery size
  const selectedResults = allResults.find(r => r.sizeKwh === selectedSize) ?? allResults[1];
  const batteryCost = selectedSize * costPerKwh;

  function payback(saving: number): string {
    if (saving <= 0) return '—';
    const yrs = batteryCost / saving;
    return yrs > 30 ? '>30 yrs' : `${yrs.toFixed(1)} yrs`;
  }

  const scenarios = [
    { key: 'pessimistic' as const, label: 'Pessimistic', desc: 'Solar self-consumption only — no grid charging, no price awareness' },
    { key: 'optimistic'  as const, label: 'Optimistic',  desc: 'Smart time-of-use — charges from solar + cheapest ⅓ of grid intervals, discharges at most expensive ⅓ · best realistic case' },
  ];

  return (
    <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid #e2e8f0' }}>
      <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#475569', marginBottom: '0.1rem' }}>
        Battery modelling
      </h3>
      <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.4rem' }}>
        Calculated from all {nem12.intervals.length} days of data · seasonal effects included automatically
      </p>
      <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '1rem' }}>
        Assumes you have solar and do not already have a battery — this models adding a first battery, not upgrading an existing one.
      </p>

      {/* Parameters */}
      <div className="field-row" style={{ marginBottom: '1rem' }}>
        <div className="field">
          <label>Max charge/discharge (kW)</label>
          <input
            type="number" value={maxKw} min={1} max={20} step={0.5}
            onChange={e => setMaxKw(Math.max(0.5, Number(e.target.value)))}
          />
        </div>
        <div className="field">
          <label>Round-trip efficiency (%)</label>
          <input
            type="number" value={effPct} min={70} max={99} step={1}
            onChange={e => setEffPct(Math.min(99, Math.max(70, Number(e.target.value))))}
          />
        </div>
        <div className="field">
          <label>Installed cost ($/kWh capacity)</label>
          <input
            type="number" value={costPerKwh} min={100} max={3000} step={50}
            onChange={e => setCostPerKwh(Math.max(100, Number(e.target.value)))}
          />
        </div>
      </div>

      {/* Plan selector */}
      {planLabels.length > 1 && (
        <div className="view-toggle" style={{ marginBottom: '0.75rem' }}>
          {planLabels.map((label, i) => (
            <button
              key={label}
              className={`view-btn${activePlan === i ? ' active' : ''}`}
              onClick={() => setActivePlan(i)}
            >{label}</button>
          ))}
        </div>
      )}

      {/* Saving vs battery size chart */}
      <div style={{ marginBottom: '1.25rem' }}>
        <div className="chart-header">
          <h3>Annual saving vs battery size</h3>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{planLabels[activePlan]}</span>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="size" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${v}`} />
            <Tooltip formatter={(v) => typeof v === 'number' ? `$${v.toFixed(0)}/yr` : v} />
            <Legend />
            {Object.entries(SCENARIO_COLORS).map(([name, color]) => (
              <Line
                key={name}
                type="monotone"
                dataKey={name}
                stroke={color}
                strokeWidth={2}
                dot={{ r: 4 }}
                strokeDasharray={name === 'Pessimistic' ? '4 3' : undefined}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Size selector for summary cards */}
      <div style={{ marginBottom: '0.75rem' }}>
        <p style={{ fontSize: '0.8rem', fontWeight: 500, color: '#475569', marginBottom: '0.4rem' }}>
          Show $ summary for:
        </p>
        <div className="view-toggle">
          {SIZES.map(s => (
            <button
              key={s}
              className={`view-btn${selectedSize === s ? ' active' : ''}`}
              onClick={() => setSelectedSize(s)}
            >{s} kWh</button>
          ))}
        </div>
      </div>

      {/* Summary: one row per scenario, one card per plan */}
      {scenarios.map(({ key, label, desc }) => (
        <div key={key} style={{ marginBottom: '1rem' }}>
          <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.1rem' }}>
            {label}
          </p>
          <p style={{ fontSize: '0.72rem', color: '#94a3b8', marginBottom: '0.4rem' }}>{desc}</p>
          <div className="summary-grid">
            {selectedResults.planResults.map(pr => {
              const res = pr[key];
              const saving = Math.round(res.annualSaving);
              const baseline = baselines.find(b => b.label === pr.planLabel);
              const beforeCost = baseline ? Math.round(baseline.annualCost) : null;
              const afterCost = beforeCost !== null && saving > 0 ? beforeCost - saving : null;
              return (
                <div key={pr.planLabel} className="summary-box">
                  <div className="summary-label">{pr.planLabel}</div>
                  {beforeCost !== null && (
                    <div className="summary-value" style={{ fontSize: '1.1rem' }}>
                      ${beforeCost.toLocaleString()}{afterCost !== null
                        ? <> → <span style={{ color: '#10b981' }}>${afterCost.toLocaleString()}</span></>
                        : null}/yr
                    </div>
                  )}
                  <div className="summary-sub">
                    {saving > 0 ? `Battery saves $${saving}/yr` : 'No saving from battery'}
                  </div>
                  <div className="summary-sub">
                    Payback: {payback(res.annualSaving)}
                  </div>
                  <div className="summary-sub">
                    {Math.round(res.kwhCycled).toLocaleString()} kWh/yr cycled
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Energy flow breakdown — sanity check for the selected plan */}
      {(() => {
        const pr = selectedResults.planResults[activePlan];
        if (!pr) return null;
        const fmt = (n: number) => Math.round(n).toLocaleString();
        const rows: { label: string; pess: string; opt: string }[] = [
          {
            label: 'Solar → battery',
            pess: `${fmt(pr.pessimistic.solarCharged)} kWh/yr`,
            opt:  `${fmt(pr.optimistic.solarCharged)} kWh/yr`,
          },
          {
            label: 'Grid → battery',
            pess: '—',
            opt:  `${fmt(pr.optimistic.gridCharged)} kWh/yr`,
          },
          {
            label: 'Delivered to home',
            pess: `${fmt(pr.pessimistic.kwhCycled)} kWh/yr`,
            opt:  `${fmt(pr.optimistic.kwhCycled)} kWh/yr`,
          },
          {
            label: 'Efficiency loss',
            pess: `${fmt(pr.pessimistic.efficiencyLoss)} kWh/yr`,
            opt:  `${fmt(pr.optimistic.efficiencyLoss)} kWh/yr`,
          },
        ];
        return (
          <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0' }}>
            <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.6rem' }}>
              Energy flow — {selectedSize} kWh battery · {pr.planLabel}
            </p>
            <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', color: '#94a3b8', fontWeight: 500, paddingBottom: '0.3rem' }}></th>
                  <th style={{ textAlign: 'right', color: '#94a3b8', fontWeight: 500, paddingBottom: '0.3rem' }}>Pessimistic</th>
                  <th style={{ textAlign: 'right', color: '#10b981', fontWeight: 500, paddingBottom: '0.3rem' }}>Optimistic</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.label} style={{ borderTop: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.25rem 0', color: '#475569' }}>{r.label}</td>
                    <td style={{ textAlign: 'right', padding: '0.25rem 0 0.25rem 1rem', color: '#64748b' }}>{r.pess}</td>
                    <td style={{ textAlign: 'right', padding: '0.25rem 0 0.25rem 1rem', color: '#64748b' }}>{r.opt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })()}

      <p className="results-caveat" style={{ marginTop: '0.75rem' }}>
        Battery cost: {selectedSize} kWh × ${costPerKwh}/kWh = ${batteryCost.toLocaleString()} installed.
        SOC carries over day-to-day. Savings are annualised from {nem12.intervals.length} days of actual data.
      </p>
    </div>
  );
}
