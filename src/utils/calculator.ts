import type {
  Nem12Data,
  FixedRateConfig,
  WholesaleConfig,
  SpotPriceInterval,
  ComparisonResult,
  DailyCost,
} from '../types';

const GST = 1.1;

function toGst(cents: number, alreadyInclusive: boolean): number {
  return alreadyInclusive ? cents : cents * GST;
}

export function calculateComparison(
  nem12: Nem12Data,
  fixed: FixedRateConfig,
  wholesale: WholesaleConfig,
  spotPrices: SpotPriceInterval[]
): ComparisonResult {
  // Index spot prices by 30-min settlement period: "YYYYMMDD-HH:MM"
  const spotIndex = new Map<string, number>();
  for (const s of spotPrices) {
    const d = new Date(s.datetime);
    const key = spotKey(d);
    spotIndex.set(key, s.rrp);
  }

  const fixedRateCents = toGst(fixed.ratePerKwh, fixed.gstInclusive);
  const fixedDailyCents = toGst(fixed.dailySupplyCharge, fixed.gstInclusive);
  const wholesaleMarginCents = toGst(wholesale.retailerMargin, wholesale.gstInclusive);
  const wholesaleDailyCents = toGst(wholesale.dailySubscription, wholesale.gstInclusive);

  const dailySeries: DailyCost[] = [];
  let fixedTotal = 0;
  let wholesaleTotal = 0;

  for (const day of nem12.intervals) {
    const { year, month, dayNum } = parseDate(day.date);
    const dateLabel = `${year}-${month}-${dayNum}`;

    const fixedDayCost = fixedDailyCents / 100; // supply charge in dollars
    let wholesaleDayCost = wholesaleDailyCents / 100;
    let fixedUsageCost = 0;
    let wholesaleUsageCost = 0;

    const intervalsPerDay = day.intervals.length;
    const minutesPerInterval = nem12.intervalLength;

    for (let i = 0; i < intervalsPerDay; i++) {
      const kwh = day.intervals[i];
      if (kwh <= 0) continue;

      fixedUsageCost += (kwh * fixedRateCents) / 100;

      // Map interval index to settlement period datetime
      const intervalMinutes = i * minutesPerInterval + minutesPerInterval;
      const h = Math.floor(intervalMinutes / 60) % 24;
      const m = intervalMinutes % 60;
      const key = `${day.date}-${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

      const rrp = spotIndex.get(key); // $/MWh
      if (rrp !== undefined) {
        // Convert $/MWh to cents/kWh: divide by 10
        const spotCentsPerKwh = toGst((rrp / 10) + wholesale.retailerMargin, wholesale.gstInclusive);
        wholesaleUsageCost += (kwh * spotCentsPerKwh) / 100;
      } else {
        // Fallback: use margin only (no spot price for this interval)
        wholesaleUsageCost += (kwh * wholesaleMarginCents) / 100;
      }
    }

    const dayFixed = fixedDayCost + fixedUsageCost;
    const dayWholesale = wholesaleDayCost + wholesaleUsageCost;

    dailySeries.push({ date: dateLabel, fixedCost: round2(dayFixed), wholesaleCost: round2(dayWholesale) });
    fixedTotal += dayFixed;
    wholesaleTotal += dayWholesale;
  }

  return {
    fixedTotal: round2(fixedTotal),
    wholesaleTotal: round2(wholesaleTotal),
    difference: round2(fixedTotal - wholesaleTotal),
    dailySeries,
    periodDays: nem12.intervals.length,
    totalKwh: nem12.totalKwh,
  };
}

function parseDate(yyyymmdd: string) {
  return {
    year: yyyymmdd.slice(0, 4),
    month: yyyymmdd.slice(4, 6),
    dayNum: yyyymmdd.slice(6, 8),
  };
}

function spotKey(d: Date): string {
  const date = d.toISOString().slice(0, 10).replace(/-/g, '');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${date}-${hh}:${mm}`;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
