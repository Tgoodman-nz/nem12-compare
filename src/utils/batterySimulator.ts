import type { Nem12Data, FixedRateConfig, WholesaleConfig, SpotPriceInterval } from '../types';

const GST = 1.1;

export interface BatteryConfig {
  capacityKwh: number;
  maxKw: number;        // max charge/discharge rate
  efficiency: number;   // round-trip, e.g. 0.90
}

export interface ScenarioResult {
  annualSaving: number;    // $/year (annualised from actual data)
  kwhCycled: number;       // kWh/yr discharged to home
  solarCharged: number;    // kWh/yr diverted from solar export into battery
  gridCharged: number;     // kWh/yr bought from grid specifically to charge battery
  efficiencyLoss: number;  // kWh/yr lost to round-trip inefficiency = (solar+grid charged) × (1−eff)
}

export interface BatteryPlanResult {
  planLabel: string;
  pessimistic: ScenarioResult;
  optimistic:  ScenarioResult;
}

type Scenario = 'pessimistic' | 'optimistic';

interface PricePoint {
  importCents: number;  // c/kWh inc. GST — cost to import
  exportCents: number;  // c/kWh inc. GST — value of exporting
}

// ── Helpers (mirrors calculator.ts logic) ────────────────────────────────────

function parseMins(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function isOffPeak(startMins: number, fromMins: number, toMins: number): boolean {
  return fromMins <= toMins
    ? startMins >= fromMins && startMins < toMins
    : startMins >= fromMins || startMins < toMins;
}

function toGst(cents: number, inclusive: boolean): number {
  return inclusive ? cents : cents * GST;
}

function buildFixedPrices(intervalLength: number, count: number, plan: FixedRateConfig): PricePoint[] {
  const peakRate    = toGst(plan.ratePerKwh, plan.gstInclusive);
  const offPeakRate = plan.hasOffPeak ? toGst(plan.offPeakRate, plan.gstInclusive) : peakRate;
  const exportCents = toGst(plan.feedInRate, plan.gstInclusive);
  const fromMins    = parseMins(plan.offPeakFrom);
  const toMins      = parseMins(plan.offPeakTo);

  return Array.from({ length: count }, (_, i) => ({
    importCents: plan.hasOffPeak && isOffPeak(i * intervalLength, fromMins, toMins)
      ? offPeakRate : peakRate,
    exportCents,
  }));
}

function buildWholesalePrices(
  date: string,
  intervalLength: number,
  count: number,
  cfg: WholesaleConfig,
  spotIndex: Map<string, number>,
): PricePoint[] {
  const fallbackFit    = cfg.feedInRate * GST;
  const fallbackImport = (cfg.networkRatePerKwh + cfg.retailerMargin) * GST;

  return Array.from({ length: count }, (_, i) => {
    // Match the key format used by calculator.ts
    const endMins = (i + 1) * intervalLength;
    const h = Math.floor(endMins / 60) % 24;
    const m = endMins % 60;
    const key = `${date}-${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    const rrp = spotIndex.get(key);
    return rrp !== undefined
      ? {
          importCents: (rrp / 10 + cfg.networkRatePerKwh + cfg.retailerMargin) * GST,
          exportCents: (rrp / 10) * GST,
        }
      : { importCents: fallbackImport, exportCents: fallbackFit };
  });
}

// ── Per-day simulation ────────────────────────────────────────────────────────
//
// Charging convention:
//   - Charge C kWh from grid/solar → SOC += C * efficiency  (losses on charge)
//   - Discharge D kWh to house    → SOC -= D                (lossless on discharge)
// Round trip: store 1 kWh → SOC += 0.9 kWh → deliver 0.9 kWh back  ✓
//
// Three scenarios:
//   pessimistic — solar self-consumption only; no grid charging, no price awareness
//   optimistic  — solar + cheapest 1/3 of grid intervals; discharge at most expensive 1/3
//   bestCase    — solar + cheapest 1/2 of grid intervals; discharge at most expensive 1/2

function runDay(
  intervals: number[],
  prices: PricePoint[],
  battery: BatteryConfig,
  maxKwhPerInterval: number,
  scenario: Scenario,
  startSoc: number,
): { saving: number; kwhDischarged: number; endSoc: number; solarCharged: number; gridCharged: number } {
  const { efficiency: eff, capacityKwh: cap } = battery;
  const revised = [...intervals];
  let soc = startSoc;
  let kwhDischarged = 0;
  let solarCharged  = 0;
  let gridCharged   = 0;

  if (scenario === 'pessimistic') {
    for (let i = 0; i < revised.length; i++) {
      const kwh = revised[i];
      if (kwh < 0) {
        // Solar export → charge battery
        const charge = Math.min(-kwh, maxKwhPerInterval, (cap - soc) / eff);
        if (charge > 0) { soc += charge * eff; revised[i] += charge; solarCharged += charge; }
      } else if (kwh > 0) {
        // Grid import → discharge battery first
        const discharge = Math.min(kwh, soc, maxKwhPerInterval);
        if (discharge > 0) { soc -= discharge; kwhDischarged += discharge; revised[i] -= discharge; }
      }
    }
  } else {
    // Three-pass approach:
    //   Pass 1 — solar priority: absorb all solar before any grid decisions
    //   Pass 2 — grid charge at cheap intervals (if profitable vs avg expensive price)
    //   Pass 3 — discharge at ALL import intervals, most expensive first, capped at
    //             original consumption so grid-charged energy stays in battery
    //
    // Processing pass 3 in price-descending order with a shared cap guarantees
    // best case ≥ optimistic: best case has more SOC (more grid charging) → discharges
    // more at the same expensive intervals → strictly higher savings.
    // On flat-rate plans all prices are equal so the profitability condition is never met
    // and all three scenarios reduce to identical pessimistic behaviour.
    const chargeFraction = scenario === 'optimistic' ? 1 / 3 : 1 / 2;
    const importsSorted = intervals
      .map((kwh, i) => ({ i, kwh, price: prices[i].importCents }))
      .filter(x => x.kwh > 0)
      .sort((a, b) => a.price - b.price);

    const n = importsSorted.length;
    const chargeSet = new Set(importsSorted.slice(0, Math.ceil(n * chargeFraction)).map(x => x.i));

    // Profitability bar: fixed at average of the most expensive 1/3 (same for both scenarios)
    const topN = Math.ceil(n / 3);
    const avgTopPrice = topN > 0 && n > 0
      ? importsSorted.slice(n - topN).reduce((s, x) => s + x.price, 0) / topN
      : 0;

    // Pass 1: solar first — ensures grid charging never crowds out solar
    for (let i = 0; i < revised.length; i++) {
      if (intervals[i] < 0) {
        const charge = Math.min(-intervals[i], maxKwhPerInterval, (cap - soc) / eff);
        if (charge > 0) { soc += charge * eff; revised[i] += charge; solarCharged += charge; }
      }
    }

    // Pass 2: grid charge at cheap profitable intervals (battery has space after solar)
    if (avgTopPrice > 0) {
      for (let i = 0; i < revised.length; i++) {
        if (intervals[i] > 0 && chargeSet.has(i) && prices[i].importCents < avgTopPrice * eff) {
          const charge = Math.min(maxKwhPerInterval, (cap - soc) / eff);
          if (charge > 0) { soc += charge * eff; revised[i] += charge; gridCharged += charge; }
        }
      }
    }

    // Pass 3: discharge at all import intervals, most expensive first.
    // Cap at intervals[i] (original consumption) — not revised[i] — so grid-charged energy
    // stays in the battery for future discharge rather than being immediately cancelled.
    const byPriceDesc = intervals
      .map((kwh, i) => ({ i, kwh, price: prices[i].importCents }))
      .filter(x => x.kwh > 0)
      .sort((a, b) => b.price - a.price);

    for (const { i } of byPriceDesc) {
      if (soc <= 0) break;
      const discharge = Math.min(intervals[i], soc, maxKwhPerInterval);
      if (discharge > 0) { soc -= discharge; kwhDischarged += discharge; revised[i] -= discharge; }
    }
  }

  // saving = original usage cost − revised usage cost (supply charges cancel)
  let saving = 0;
  for (let i = 0; i < intervals.length; i++) {
    const orig = intervals[i];
    const rev  = revised[i];
    if (orig > 0) saving += (orig * prices[i].importCents) / 100;
    if (orig < 0) saving -= (-orig * prices[i].exportCents) / 100;
    if (rev  > 0) saving -= (rev  * prices[i].importCents) / 100;
    if (rev  < 0) saving += (-rev  * prices[i].exportCents) / 100;
  }

  return { saving, kwhDischarged, endSoc: soc, solarCharged, gridCharged };
}

// ── Public API ────────────────────────────────────────────────────────────────

export function simulateBattery(
  nem12: Nem12Data,
  planA: FixedRateConfig,
  wholesale: WholesaleConfig,
  spotPrices: SpotPriceInterval[],
  battery: BatteryConfig,
  planB?: FixedRateConfig,
): BatteryPlanResult[] {
  const maxKwhPerInterval = battery.maxKw * nem12.intervalLength / 60;
  const spotIndex   = new Map<string, number>(spotPrices.map(s => [s.datetime, s.rrp]));
  const datesWithSpot = new Set<string>(spotPrices.map(s => s.datetime.slice(0, 8)));

  const scenarios: Scenario[] = ['pessimistic', 'optimistic'];
  const fixedPlans = planB ? [planA, planB] : [planA];
  const totalDays  = nem12.intervals.length;
  const spotDays   = datesWithSpot.size;

  type Acc = { saving: number; kwhDischarged: number; solarCharged: number; gridCharged: number };
  const zero = (): Acc => ({ saving: 0, kwhDischarged: 0, solarCharged: 0, gridCharged: 0 });
  const fixedAcc: Acc[][] = fixedPlans.map(() => scenarios.map(zero));
  const spotAcc:  Acc[]   = scenarios.map(zero);

  // SOC carries over day-to-day for realism
  const fixedSoc: number[][] = fixedPlans.map(() => scenarios.map(() => 0));
  const spotSoc:  number[]   = scenarios.map(() => 0);

  for (const day of nem12.intervals) {
    const { intervals, date } = day;
    const count = intervals.length;

    fixedPlans.forEach((plan, pi) => {
      const prices = buildFixedPrices(nem12.intervalLength, count, plan);
      scenarios.forEach((sc, si) => {
        const r = runDay(intervals, prices, battery, maxKwhPerInterval, sc, fixedSoc[pi][si]);
        fixedAcc[pi][si].saving        += r.saving;
        fixedAcc[pi][si].kwhDischarged += r.kwhDischarged;
        fixedAcc[pi][si].solarCharged  += r.solarCharged;
        fixedAcc[pi][si].gridCharged   += r.gridCharged;
        fixedSoc[pi][si]                = r.endSoc;
      });
    });

    if (datesWithSpot.has(date)) {
      const prices = buildWholesalePrices(date, nem12.intervalLength, count, wholesale, spotIndex);
      scenarios.forEach((sc, si) => {
        const r = runDay(intervals, prices, battery, maxKwhPerInterval, sc, spotSoc[si]);
        spotAcc[si].saving        += r.saving;
        spotAcc[si].kwhDischarged += r.kwhDischarged;
        spotAcc[si].solarCharged  += r.solarCharged;
        spotAcc[si].gridCharged   += r.gridCharged;
        spotSoc[si]                = r.endSoc;
      });
    }
  }

  const ann = (v: number, days: number) => days > 0 ? v * (365.25 / days) : 0;

  function toScenario(a: Acc, days: number, eff: number): ScenarioResult {
    const sc = ann(a.solarCharged, days);
    const gc = ann(a.gridCharged, days);
    return {
      annualSaving:   ann(a.saving, days),
      kwhCycled:      ann(a.kwhDischarged, days),
      solarCharged:   sc,
      gridCharged:    gc,
      efficiencyLoss: (sc + gc) * (1 - eff),
    };
  }

  const eff = battery.efficiency;
  const results: BatteryPlanResult[] = fixedPlans.map((plan, pi) => ({
    planLabel:   plan.label,
    pessimistic: toScenario(fixedAcc[pi][0], totalDays, eff),
    optimistic:  toScenario(fixedAcc[pi][1], totalDays, eff),
  }));

  if (spotDays > 0) {
    results.push({
      planLabel:   wholesale.label || 'Wholesale / spot',
      pessimistic: toScenario(spotAcc[0], spotDays, eff),
      optimistic:  toScenario(spotAcc[1], spotDays, eff),
    });
  }

  return results;
}
