import { useState } from 'react';
import type { FixedRateConfig, WholesaleConfig, NemRegion } from '../types';
import { DEV_REGION, DEV_PLAN_A, DEV_PLAN_B, DEV_WHOLESALE } from '../devDefaults';

const REGIONS: { value: NemRegion; label: string }[] = [
  { value: 'VIC1', label: 'Victoria' },
  { value: 'NSW1', label: 'New South Wales / ACT' },
  { value: 'QLD1', label: 'Queensland' },
  { value: 'SA1',  label: 'South Australia' },
  { value: 'TAS1', label: 'Tasmania' },
];

interface PlanState {
  label: string;
  rate: string;
  supply: string;
  hasOffPeak: boolean;
  offPeakRate: string;
  offPeakFrom: string;
  offPeakTo: string;
  feedIn: string;
  gst: boolean;
}

function PencilIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  );
}

function LegendInput({ value, onChange, disabled, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  placeholder: string;
}) {
  return (
    <span className="legend-pill">
      <span className="legend-pill-icon"><PencilIcon /></span>
      <input
        className="legend-input"
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
      />
    </span>
  );
}

function defaultPlan(label: string): PlanState {
  return {
    label,
    rate: '',
    supply: '',
    hasOffPeak: false,
    offPeakRate: '',
    offPeakFrom: '22:00',
    offPeakTo: '07:00',
    feedIn: '0',
    gst: true,
  };
}

function planIsValid(p: PlanState): boolean {
  if (!p.rate || isNaN(parseFloat(p.rate))) return false;
  if (!p.supply || isNaN(parseFloat(p.supply))) return false;
  if (p.hasOffPeak && (!p.offPeakRate || isNaN(parseFloat(p.offPeakRate)))) return false;
  return true;
}

function planToConfig(p: PlanState): FixedRateConfig {
  return {
    label: p.label,
    ratePerKwh: parseFloat(p.rate),
    hasOffPeak: p.hasOffPeak,
    offPeakRate: p.hasOffPeak ? parseFloat(p.offPeakRate) : parseFloat(p.rate),
    offPeakFrom: p.offPeakFrom,
    offPeakTo: p.offPeakTo,
    dailySupplyCharge: parseFloat(p.supply),
    feedInRate: parseFloat(p.feedIn) || 0,
    gstInclusive: p.gst,
  };
}

interface PlanFieldsProps {
  values: PlanState;
  onChange: (next: PlanState) => void;
  disabled: boolean;
}

function PlanFields({ values: v, onChange, disabled }: PlanFieldsProps) {
  const set = (patch: Partial<PlanState>) => onChange({ ...v, ...patch });

  return (
    <>
      <div className="field-row">
        <div className="field">
          <label>Peak / flat rate (c/kWh)</label>
          <input
            type="number" step="0.001" min="0" placeholder="e.g. 28.5"
            value={v.rate} onChange={e => set({ rate: e.target.value })}
            disabled={disabled} required
          />
        </div>
        <div className="field">
          <label>Daily supply charge (c/day)</label>
          <input
            type="number" step="0.01" min="0" placeholder="e.g. 110"
            value={v.supply} onChange={e => set({ supply: e.target.value })}
            disabled={disabled} required
          />
        </div>
      </div>

      <label className="checkbox">
        <input
          type="checkbox" checked={v.hasOffPeak}
          onChange={e => set({ hasOffPeak: e.target.checked })}
          disabled={disabled}
        />
        This plan has off-peak hours
      </label>

      {v.hasOffPeak && (
        <div className="offpeak-row">
          <div className="field">
            <label>Off-peak rate (c/kWh)</label>
            <input
              type="number" step="0.001" min="0" placeholder="e.g. 15"
              value={v.offPeakRate} onChange={e => set({ offPeakRate: e.target.value })}
              disabled={disabled} required
            />
          </div>
          <div className="field">
            <label>Off-peak from</label>
            <input
              type="time"
              value={v.offPeakFrom} onChange={e => set({ offPeakFrom: e.target.value })}
              disabled={disabled}
            />
          </div>
          <div className="field">
            <label>to</label>
            <input
              type="time"
              value={v.offPeakTo} onChange={e => set({ offPeakTo: e.target.value })}
              disabled={disabled}
            />
          </div>
        </div>
      )}

      <div className="field-row">
        <div className="field">
          <label>Feed-in tariff (c/kWh)</label>
          <input
            type="number" step="0.001" min="0" placeholder="0 if no solar"
            value={v.feedIn} onChange={e => set({ feedIn: e.target.value })}
            disabled={disabled}
          />
          <span className="hint">Credit for solar export — 0 if not applicable</span>
        </div>
      </div>

      <label className="checkbox">
        <input
          type="checkbox" checked={v.gst}
          onChange={e => set({ gst: e.target.checked })}
          disabled={disabled}
        />
        Rates already include GST
      </label>
    </>
  );
}

interface Props {
  onConfig: (
    region: NemRegion,
    planA: FixedRateConfig,
    wholesale: WholesaleConfig,
    planB?: FixedRateConfig,
  ) => void;
  disabled: boolean;
}

export function RateConfig({ onConfig, disabled }: Props) {
  const [region, setRegion] = useState<NemRegion>(DEV_REGION);

  const [planA, setPlanA] = useState<PlanState>({ ...defaultPlan('Plan A'), ...DEV_PLAN_A });
  const [hasPlanB, setHasPlanB] = useState(false);
  const [planB, setPlanB] = useState<PlanState>({ ...defaultPlan('Plan B'), ...DEV_PLAN_B });

  const [wholesaleLabel, setWholesaleLabel] = useState(DEV_WHOLESALE.label);
  const [margin, setMargin] = useState(DEV_WHOLESALE.margin);
  const [networkRate, setNetworkRate] = useState(DEV_WHOLESALE.networkRate);
  const [networkSupply, setNetworkSupply] = useState(DEV_WHOLESALE.networkSupply);
  const [subscription, setSubscription] = useState(DEV_WHOLESALE.subscription);
  const [wholesaleFeedIn, setWholesaleFeedIn] = useState(DEV_WHOLESALE.feedIn);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const wholesale: WholesaleConfig = {
      label:                    wholesaleLabel || 'Wholesale / spot',
      retailerMargin:           parseFloat(margin) || 0,
      networkRatePerKwh:        parseFloat(networkRate) || 0,
      dailyNetworkSupplyCharge: parseFloat(networkSupply) || 0,
      dailySubscription:        parseFloat(subscription) || 0,
      feedInRate:               parseFloat(wholesaleFeedIn) || 0,
    };
    onConfig(
      region,
      planToConfig(planA),
      wholesale,
      hasPlanB ? planToConfig(planB) : undefined,
    );
  }

  const valid =
    planIsValid(planA) &&
    (!hasPlanB || planIsValid(planB));

  return (
    <form className={`card${disabled ? ' disabled' : ''}`} onSubmit={handleSubmit}>
      <h2>Step 2 — Configure rates</h2>

      <div className="field">
        <label>NEM region</label>
        <select value={region} onChange={e => setRegion(e.target.value as NemRegion)} disabled={disabled}>
          {REGIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <span className="hint">Used to fetch the correct wholesale spot prices</span>
      </div>

      {/* Plan A */}
      <fieldset>
        <legend>
          <LegendInput value={planA.label} onChange={v => setPlanA(p => ({ ...p, label: v }))} disabled={disabled} placeholder="Plan A name" />
        </legend>
        <PlanFields values={planA} onChange={setPlanA} disabled={disabled} />
      </fieldset>

      {/* Wholesale */}
      <fieldset>
        <legend>
          <LegendInput value={wholesaleLabel} onChange={setWholesaleLabel} disabled={disabled} placeholder="Wholesale plan name" />
        </legend>
        <div className="field-row">
          <div className="field">
            <label>Network/distribution rate (c/kWh)</label>
            <input
              type="number" step="0.01" min="0" placeholder="e.g. 9"
              value={networkRate} onChange={e => setNetworkRate(e.target.value)}
              disabled={disabled}
            />
            <span className="hint">Passed through from your network distributor. Check your bill — VIC ≈ 9 c/kWh</span>
          </div>
          <div className="field">
            <label>Retailer margin (c/kWh)</label>
            <input
              type="number" step="0.001" min="0" placeholder="e.g. 0"
              value={margin} onChange={e => setMargin(e.target.value)}
              disabled={disabled}
            />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>Daily network supply charge (c/day)</label>
            <input
              type="number" step="0.01" min="0" placeholder="e.g. 168"
              value={networkSupply} onChange={e => setNetworkSupply(e.target.value)}
              disabled={disabled}
            />
            <span className="hint">Daily standing charge from your distributor — check your bill. VIC ≈ 80–170 c/day excl. GST.</span>
          </div>
          <div className="field">
            <label>Daily retailer subscription (c/day)</label>
            <input
              type="number" step="0.01" min="0" placeholder="e.g. 82.19"
              value={subscription} onChange={e => setSubscription(e.target.value)}
              disabled={disabled}
            />
            <span className="hint">Amber ≈ 82.19 c/day ($25/month inc. GST) — enter as inc. GST</span>
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>Feed-in tariff (c/kWh)</label>
            <input
              type="number" step="0.001" min="0" placeholder="0 if no solar"
              value={wholesaleFeedIn} onChange={e => setWholesaleFeedIn(e.target.value)}
              disabled={disabled}
            />
            <span className="hint">Credit for solar export — 0 if not applicable</span>
          </div>
        </div>
        <p className="hint">
          Network and margin rates are entered excl. GST — GST is added automatically.
          Subscription is entered as the inc. GST amount (as quoted by Amber).
        </p>
      </fieldset>

      {/* Plan B toggle */}
      <label className="checkbox plan-b-toggle">
        <input
          type="checkbox" checked={hasPlanB}
          onChange={e => setHasPlanB(e.target.checked)}
          disabled={disabled}
        />
        Compare to a second fixed plan
      </label>

      {hasPlanB && (
        <fieldset>
          <legend>
            <LegendInput value={planB.label} onChange={v => setPlanB(p => ({ ...p, label: v }))} disabled={disabled} placeholder="Plan B name" />
          </legend>
          <PlanFields values={planB} onChange={setPlanB} disabled={disabled} />
        </fieldset>
      )}

      <button type="submit" disabled={disabled || !valid} className="btn-primary">
        Fetch spot prices &amp; calculate
      </button>
    </form>
  );
}
