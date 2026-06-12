import { useState } from 'react';
import type { Nem12Data, FixedRateConfig, WholesaleConfig, NemRegion, ComparisonResult, SpotPriceInterval } from './types';
import { calculateComparison } from './utils/calculator';
import { FileUpload } from './components/FileUpload';
import { RateConfig } from './components/RateConfig';
import { Results } from './components/Results';
import './App.css';

type AppState = 'idle' | 'fetching' | 'done' | 'error';

export default function App() {
  const [nem12, setNem12] = useState<Nem12Data | null>(null);
  const [state, setState] = useState<AppState>('idle');
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  async function handleConfig(region: NemRegion, fixed: FixedRateConfig, wholesale: WholesaleConfig) {
    if (!nem12) return;
    setState('fetching');
    setFetchError(null);

    try {
      const spotPrices = await fetchSpotPrices(region, nem12.dateFrom, nem12.dateTo);
      const comparison = calculateComparison(nem12, fixed, wholesale, spotPrices);
      setResult(comparison);
      setState('done');
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to fetch spot prices.');
      setState('error');
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>NEM12 Rate Comparer</h1>
        <p>Compare what you paid on a fixed rate vs what you&apos;d have paid on wholesale spot pricing.</p>
      </header>

      <main className="app-main">
        <FileUpload onParsed={setNem12} />
        <RateConfig onConfig={handleConfig} disabled={nem12 === null} />

        {state === 'fetching' && (
          <div className="card status-card">
            <div className="spinner" />
            <p>Fetching AEMO spot prices…</p>
          </div>
        )}

        {state === 'error' && (
          <div className="card error-card">
            <p className="error">{fetchError}</p>
            <p className="hint">Spot price data may not be available for this date range yet. AEMO typically publishes data within a few days.</p>
          </div>
        )}

        {state === 'done' && result && <Results result={result} />}
      </main>

      <footer className="app-footer">
        <p>All calculations are indicative only. Spot prices sourced from AEMO. Your data stays on your device — nothing is uploaded.</p>
      </footer>
    </div>
  );
}

async function fetchSpotPrices(region: NemRegion, dateFrom: string, dateTo: string): Promise<SpotPriceInterval[]> {
  const params = new URLSearchParams({ region, dateFrom, dateTo });
  const res = await fetch(`/api/spot?${params}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `HTTP ${res.status}`);
  }
  return res.json() as Promise<SpotPriceInterval[]>;
}
