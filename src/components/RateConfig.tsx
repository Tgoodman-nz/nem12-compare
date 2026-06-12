import { useState } from 'react';
import type { FixedRateConfig, WholesaleConfig, NemRegion } from '../types';

const REGIONS: { value: NemRegion; label: string }[] = [
  { value: 'VIC1', label: 'Victoria' },
  { value: 'NSW1', label: 'New South Wales / ACT' },
  { value: 'QLD1', label: 'Queensland' },
  { value: 'SA1',  label: 'South Australia' },
  { value: 'TAS1', label: 'Tasmania' },
];

interface Props {
  onConfig: (region: NemRegion, fixed: FixedRateConfig, wholesale: WholesaleConfig) => void;
  disabled: boolean;
}

export function RateConfig({ onConfig, disabled }: Props) {
  const [region, setRegion] = useState<NemRegion>('VIC1');
  const [fixedRate, setFixedRate] = useState('');
  const [fixedSupply, setFixedSupply] = useState('');
  const [fixedGst, setFixedGst] = useState(true);
  const [margin, setMargin] = useState('6');
  const [subscription, setSubscription] = useState('0');
  const [wholesaleGst, setWholesaleGst] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onConfig(
      region,
      {
        ratePerKwh: parseFloat(fixedRate),
        dailySupplyCharge: parseFloat(fixedSupply),
        gstInclusive: fixedGst,
      },
      {
        retailerMargin: parseFloat(margin),
        dailySubscription: parseFloat(subscription),
        gstInclusive: wholesaleGst,
      }
    );
  }

  const valid = fixedRate !== '' && fixedSupply !== '' && !isNaN(parseFloat(fixedRate)) && !isNaN(parseFloat(fixedSupply));

  return (
    <form className={`card${disabled ? ' disabled' : ''}`} onSubmit={handleSubmit}>
      <h2>Step 2 — Enter your rates</h2>

      <div className="field">
        <label>NEM region</label>
        <select value={region} onChange={e => setRegion(e.target.value as NemRegion)} disabled={disabled}>
          {REGIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <span className="hint">Used to fetch the correct wholesale spot prices</span>
      </div>

      <fieldset>
        <legend>Fixed rate plan</legend>
        <div className="field-row">
          <div className="field">
            <label>Usage rate (c/kWh)</label>
            <input
              type="number" step="0.001" min="0" placeholder="e.g. 28.5"
              value={fixedRate} onChange={e => setFixedRate(e.target.value)}
              disabled={disabled} required
            />
          </div>
          <div className="field">
            <label>Daily supply charge (c/day)</label>
            <input
              type="number" step="0.01" min="0" placeholder="e.g. 110"
              value={fixedSupply} onChange={e => setFixedSupply(e.target.value)}
              disabled={disabled} required
            />
          </div>
        </div>
        <label className="checkbox">
          <input type="checkbox" checked={fixedGst} onChange={e => setFixedGst(e.target.checked)} disabled={disabled} />
          Rates already include GST
        </label>
      </fieldset>

      <fieldset>
        <legend>Wholesale / spot plan</legend>
        <div className="field-row">
          <div className="field">
            <label>Retailer margin (c/kWh)</label>
            <input
              type="number" step="0.001" min="0" placeholder="e.g. 6"
              value={margin} onChange={e => setMargin(e.target.value)}
              disabled={disabled}
            />
          </div>
          <div className="field">
            <label>Daily subscription (c/day)</label>
            <input
              type="number" step="0.01" min="0" placeholder="e.g. 0"
              value={subscription} onChange={e => setSubscription(e.target.value)}
              disabled={disabled}
            />
          </div>
        </div>
        <label className="checkbox">
          <input type="checkbox" checked={wholesaleGst} onChange={e => setWholesaleGst(e.target.checked)} disabled={disabled} />
          Margin already includes GST
        </label>
        <p className="hint">Spot prices from AEMO are ex-GST. Your retailer margin may or may not include GST — check your plan terms.</p>
      </fieldset>

      <button type="submit" disabled={disabled || !valid} className="btn-primary">
        Fetch spot prices &amp; calculate
      </button>
    </form>
  );
}
