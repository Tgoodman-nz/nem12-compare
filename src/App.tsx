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
  const [spotPrices, setSpotPrices] = useState<SpotPriceInterval[]>([]);
  const [planConfigs, setPlanConfigs] = useState<{
    planA: FixedRateConfig;
    planB?: FixedRateConfig;
    wholesale: WholesaleConfig;
  } | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetchProgress, setFetchProgress] = useState<{ done: number; total: number } | null>(null);

  async function handleConfig(
    region: NemRegion,
    planA: FixedRateConfig,
    wholesale: WholesaleConfig,
    planB?: FixedRateConfig,
  ) {
    if (!nem12) return;
    setState('fetching');
    setFetchError(null);
    setFetchProgress(null);

    try {
      const fetched = await fetchSpotPrices(
        region, nem12.dateFrom, nem12.dateTo,
        (done, total) => setFetchProgress({ done, total }),
      );
      const comparison = calculateComparison(nem12, planA, wholesale, fetched, planB);
      setSpotPrices(fetched);
      setResult(comparison);
      setPlanConfigs({ planA, planB, wholesale });
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
        <p>Upload your electricity meter data and see what you&apos;d have paid under different plans — including wholesale spot pricing.</p>
        <div className="header-trust">
          <span>No account · no data collection · your file never leaves your device</span>
          <span className="header-trust-sep">·</span>
          <span>We don&apos;t promote any retailer — use local Facebook groups and get quotes for your address to find the best deal</span>
        </div>
      </header>

      <main className="app-main">
        <FileUpload onParsed={setNem12} />
        <RateConfig onConfig={handleConfig} disabled={nem12 === null} />

        {state === 'fetching' && (
          <div className="card status-card">
            <div className="spinner" />
            <p>
              Fetching AEMO spot prices…
              {fetchProgress && ` (${fetchProgress.done} / ${fetchProgress.total} weeks)`}
            </p>
          </div>
        )}

        {state === 'error' && (
          <div className="card error-card">
            <p className="error">{fetchError}</p>
            <p className="hint">Spot price data may not be available for this date range yet. AEMO typically publishes data within a few days.</p>
          </div>
        )}

        {state === 'done' && result && nem12 && planConfigs && (
          <Results
            result={result}
            nem12={nem12}
            spotPrices={spotPrices}
            planA={planConfigs.planA}
            planB={planConfigs.planB}
            wholesale={planConfigs.wholesale}
          />
        )}
      </main>

      <footer className="app-footer">
        <p>All calculations are indicative only. Spot prices sourced from AEMO via OpenElectricity. Your data stays on your device — nothing is uploaded.</p>
      </footer>
    </div>
  );
}

const OE_BASE = 'https://api.openelectricity.org.au';

const CHUNK_DAYS = 7;
const BATCH_SIZE = 10; // concurrent requests per batch

async function fetchSpotPrices(
  region: NemRegion,
  dateFrom: string,
  dateTo: string,
  onProgress?: (done: number, total: number) => void,
): Promise<SpotPriceInterval[]> {
  const apiKey = import.meta.env.VITE_OE_API_KEY as string;
  if (!apiKey) throw new Error('No API key — add VITE_OE_API_KEY to .env.local and restart the dev server.');

  // API limit: 8 days per request for 5m interval. Batch to avoid rate limiting.
  // Chunks that fall outside the API's 730-day history window are silently skipped.
  const chunks = dateChunks(dateFrom, addOneDay(dateTo), CHUNK_DAYS);
  const total = chunks.length;
  let done = 0;

  const allRows: Array<[string, number | null]>[] = [];
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map(([s, e]) => fetchChunk(region, s, e, apiKey)));
    allRows.push(...results);
    done += batch.length;
    onProgress?.(done, total);
  }

  // Aggregate 5-min dispatch prices into 30-min NEM block averages.
  // Keys are "YYYYMMDD-HH:MM" in AEST (NEM time, UTC+10, no DST).
  const blocks = new Map<string, { sum: number; n: number }>();
  for (const rows of allRows) {
    for (const [ts, rrp] of rows) {
      if (rrp === null) continue;
      const key = nemBlockKey(ts);
      const b = blocks.get(key) ?? { sum: 0, n: 0 };
      b.sum += rrp;
      b.n++;
      blocks.set(key, b);
    }
  }

  const prices = Array.from(blocks.entries()).map(([datetime, { sum, n }]) => ({
    datetime,
    rrp: sum / n,
  }));

  console.log(`[spot] fetched ${prices.length} 30-min blocks across ${chunks.length} API chunks`);
  if (prices.length > 0) {
    const sorted = [...prices].sort((a, b) => a.datetime.localeCompare(b.datetime));
    console.log(`[spot] date range: ${sorted[0].datetime} → ${sorted[sorted.length - 1].datetime}`);
    console.log(`[spot] sample keys:`, sorted.slice(0, 3).map(p => p.datetime));
  }

  return prices;
}

async function fetchChunk(
  region: NemRegion,
  start: string,
  end: string,
  apiKey: string,
): Promise<Array<[string, number | null]>> {
  const params = new URLSearchParams({
    interval: '5m',
    date_start: nemDateToIso(start),
    date_end: nemDateToIso(end),
    network_region: region,
  });
  params.append('metrics', 'price');

  const res = await fetch(`${OE_BASE}/v4/market/network/NEM?${params}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    if (res.status === 400 && msg.includes('too far in the past')) return [];
    console.warn(`[spot] chunk ${start}→${end} error ${res.status}:`, msg.slice(0, 300));
    throw new Error(`OpenElectricity API error ${res.status}${msg ? ': ' + msg : ''}`);
  }

  const json = await res.json();

  // Try both known response shapes for the OE v4 API
  const rows: Array<[string, number | null]> =
    json.data?.results?.[0]?.data ??       // shape A: { data: { results: [...] } }
    json.data?.[0]?.results?.[0]?.data ??  // shape B: { data: [{ results: [...] }] }
    [];

  if (rows.length === 0) {
    console.log(`[spot] chunk ${start}→${end}: 0 rows. Full response (800 chars):`,
      JSON.stringify(json).slice(0, 800));
  }
  return rows;
}

// Split [from, to) into chunks of chunkDays days, returning YYYYMMDD pairs.
function dateChunks(from: string, to: string, chunkDays: number): [string, string][] {
  const chunks: [string, string][] = [];
  let cur = from;
  while (cur < to) {
    const next = addDays(cur, chunkDays);
    chunks.push([cur, next < to ? next : to]);
    cur = next < to ? next : to;
  }
  return chunks;
}

function addDays(yyyymmdd: string, days: number): string {
  const d = new Date(`${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

// YYYYMMDD → "YYYY-MM-DDT00:00:00" (timezone-naive, network local time) for OE API
function nemDateToIso(yyyymmdd: string): string {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}T00:00:00`;
}

// Advance a YYYYMMDD string by one calendar day
function addOneDay(yyyymmdd: string): string {
  const d = new Date(`${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

// Map a 5-min period-start OE timestamp (AEST) to its NEM 30-min block-end key "YYYYMMDD-HH:MM".
// NEM12 convention: block ending at midnight uses the current day's date ("YYYYMMDD-00:00").
function nemBlockKey(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):/);
  if (!m) throw new Error(`Unexpected OE timestamp format: ${iso}`);
  const date = m[1] + m[2] + m[3];
  const hh = parseInt(m[4], 10);
  const mm = parseInt(m[5], 10);
  const endH = mm < 30 ? hh : (hh + 1) % 24;
  const endM = mm < 30 ? 30 : 0;
  return `${date}-${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
}
