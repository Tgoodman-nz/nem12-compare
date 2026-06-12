import type {
  Nem12Data,
  IntervalRecord,
  FixedRateConfig,
  WholesaleConfig,
  SpotPriceInterval,
  ComparisonResult,
  DailyCost,
  PlanTotal,
} from '../types';

const GST = 1.1;

function toGst(cents: number, alreadyInclusive: boolean): number {
  return alreadyInclusive ? cents : cents * GST;
}

// "HH:MM" → minutes from midnight
function parseMins(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

// Is intervalStartMins within the off-peak window [fromMins, toMins)?
// Handles windows that wrap midnight (e.g. 22:00–07:00).
function isOffPeak(startMins: number, fromMins: number, toMins: number): boolean {
  return fromMins <= toMins
    ? startMins >= fromMins && startMins < toMins
    : startMins >= fromMins || startMins < toMins;
}

function calcFixedDay(
  day: IntervalRecord,
  intervalLength: number,
  cfg: FixedRateConfig,
): { usageCost: number; fitCredit: number; supplyCost: number } {
  const peakRate    = toGst(cfg.ratePerKwh, cfg.gstInclusive);
  const offPeakRate = cfg.hasOffPeak ? toGst(cfg.offPeakRate, cfg.gstInclusive) : peakRate;
  const fitRate     = toGst(cfg.feedInRate, cfg.gstInclusive);
  const supplyCost  = toGst(cfg.dailySupplyCharge, cfg.gstInclusive) / 100;

  const fromMins = parseMins(cfg.offPeakFrom);
  const toMins   = parseMins(cfg.offPeakTo);

  let usageCost = 0;
  let fitCredit = 0;

  for (let i = 0; i < day.intervals.length; i++) {
    const kwh = day.intervals[i];
    if (kwh === 0) continue;

    if (kwh < 0) {
      // Export interval — apply FiT credit
      if (cfg.feedInRate > 0) fitCredit += (-kwh * fitRate) / 100;
    } else {
      const startMins = i * intervalLength;
      const rate = cfg.hasOffPeak && isOffPeak(startMins, fromMins, toMins)
        ? offPeakRate
        : peakRate;
      usageCost += (kwh * rate) / 100;
    }
  }

  return { usageCost, fitCredit, supplyCost };
}

function calcWholesaleDay(
  day: IntervalRecord,
  intervalLength: number,
  cfg: WholesaleConfig,
  spotIndex: Map<string, number>,
): { usageCost: number; fitCredit: number; supplyCost: number } {
  // All per-kWh rates are entered excl. GST → multiply by 1.1.
  // Subscription is entered inc. GST (how retailers quote it) → used as-is.
  const fitRate    = cfg.feedInRate * GST;
  const supplyCost = (cfg.dailyNetworkSupplyCharge * GST + cfg.dailySubscription) / 100;

  let usageCost = 0;
  let fitCredit = 0;

  for (let i = 0; i < day.intervals.length; i++) {
    const kwh = day.intervals[i];
    if (kwh === 0) continue;

    if (kwh < 0) {
      if (cfg.feedInRate > 0) fitCredit += (-kwh * fitRate) / 100;
    } else {
      // Map interval index to NEM block-end key "YYYYMMDD-HH:MM"
      const endMins = i * intervalLength + intervalLength;
      const h = Math.floor(endMins / 60) % 24;
      const m = endMins % 60;
      const key = `${day.date}-${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

      const rrp = spotIndex.get(key); // $/MWh
      if (rrp !== undefined) {
        // spot ($/MWh ÷ 10 = c/kWh) + network passthrough + retailer margin → excl. GST → ×1.1
        const spotCentsPerKwh = (rrp / 10 + cfg.networkRatePerKwh + cfg.retailerMargin) * GST;
        usageCost += (kwh * spotCentsPerKwh) / 100;
      } else {
        const fallbackCents = (cfg.networkRatePerKwh + cfg.retailerMargin) * GST;
        usageCost += (kwh * fallbackCents) / 100;
      }
    }
  }

  return { usageCost, fitCredit, supplyCost };
}

export function calculateComparison(
  nem12: Nem12Data,
  planA: FixedRateConfig,
  wholesale: WholesaleConfig,
  spotPrices: SpotPriceInterval[],
  planB?: FixedRateConfig,
): ComparisonResult {
  const spotIndex = new Map<string, number>();
  for (const s of spotPrices) spotIndex.set(s.datetime, s.rrp);

  // Only compare days where spot data exists — skipping days without it keeps
  // both plans on equal footing rather than crediting wholesale with $0 usage.
  const datesWithSpot = new Set<string>();
  for (const key of spotIndex.keys()) datesWithSpot.add(key.slice(0, 8));

  const fixedPlans = planB ? [planA, planB] : [planA];

  // Accumulators: one per fixed plan + wholesale at the end
  const planCount = fixedPlans.length + 1; // +1 for wholesale
  const acc: { usageCost: number; supplyCost: number; fitCredit: number; total: number }[] =
    Array.from({ length: planCount }, () => ({ usageCost: 0, supplyCost: 0, fitCredit: 0, total: 0 }));

  const hasSpotData = datesWithSpot.size > 0;

  const dailySeries: DailyCost[] = [];
  let totalKwh = 0;
  let totalExportKwh = 0;
  let processedDays = 0;

  for (const day of nem12.intervals) {
    // When spot data exists, only compare days covered by both datasets.
    // When no spot data at all, process every NEM12 day so fixed plan costs still show.
    if (hasSpotData && !datesWithSpot.has(day.date)) continue;
    processedDays++;

    const [y, mo, d] = [day.date.slice(0, 4), day.date.slice(4, 6), day.date.slice(6, 8)];
    const dateLabel = `${y}-${mo}-${d}`;
    const dayCosts: number[] = [];

    // Fixed plans
    fixedPlans.forEach((cfg, idx) => {
      const { usageCost, fitCredit, supplyCost } = calcFixedDay(day, nem12.intervalLength, cfg);
      const net = supplyCost + usageCost - fitCredit;
      acc[idx].usageCost  += usageCost;
      acc[idx].supplyCost += supplyCost;
      acc[idx].fitCredit  += fitCredit;
      acc[idx].total      += net;
      dayCosts.push(round2(net));
    });

    // Wholesale — only meaningful when spot data exists
    if (hasSpotData) {
      const wi = fixedPlans.length;
      const { usageCost, fitCredit, supplyCost } = calcWholesaleDay(day, nem12.intervalLength, wholesale, spotIndex);
      const wNet = supplyCost + usageCost - fitCredit;
      acc[wi].usageCost  += usageCost;
      acc[wi].supplyCost += supplyCost;
      acc[wi].fitCredit  += fitCredit;
      acc[wi].total      += wNet;
      dayCosts.push(round2(wNet));
    }

    dailySeries.push({ date: dateLabel, costs: dayCosts });

    for (const kwh of day.intervals) {
      if (kwh > 0) totalKwh += kwh;
      else if (kwh < 0) totalExportKwh += -kwh;
    }
  }

  const fixedPlanTotals: PlanTotal[] = fixedPlans.map((cfg, idx) => ({
    label:      cfg.label,
    total:      round2(acc[idx].total),
    usageCost:  round2(acc[idx].usageCost),
    supplyCost: round2(acc[idx].supplyCost),
    fitCredit:  round2(acc[idx].fitCredit),
  }));

  const wholesalePlan: PlanTotal | null = hasSpotData
    ? {
        label:      wholesale.label || 'Wholesale / spot',
        total:      round2(acc[fixedPlans.length].total),
        usageCost:  round2(acc[fixedPlans.length].usageCost),
        supplyCost: round2(acc[fixedPlans.length].supplyCost),
        fitCredit:  round2(acc[fixedPlans.length].fitCredit),
      }
    : null;

  return {
    plans:           wholesalePlan ? [...fixedPlanTotals, wholesalePlan] : fixedPlanTotals,
    dailySeries,
    periodDays:      processedDays,
    totalFileDays:   nem12.intervals.length,
    totalKwh:        round2(totalKwh),
    totalExportKwh:  round2(totalExportKwh),
    spotDataAvailable: hasSpotData,
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
