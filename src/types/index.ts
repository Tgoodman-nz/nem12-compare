export type NemRegion = 'QLD1' | 'NSW1' | 'VIC1' | 'SA1' | 'TAS1';

export interface IntervalRecord {
  date: string; // YYYYMMDD
  intervals: number[]; // kWh per interval (negative = export)
  qualityMethod: string;
}

export interface Nem12Data {
  nmi: string;
  intervalLength: number;
  dateFrom: string; // YYYYMMDD
  dateTo: string;   // YYYYMMDD
  intervals: IntervalRecord[];
  totalKwh: number;
}

export interface FixedRateConfig {
  label: string;
  ratePerKwh: number;        // peak / flat rate, cents/kWh
  hasOffPeak: boolean;
  offPeakRate: number;       // cents/kWh (used only when hasOffPeak)
  offPeakFrom: string;       // "HH:MM" AEST, e.g. "22:00"
  offPeakTo: string;         // "HH:MM" AEST, e.g. "07:00"
  dailySupplyCharge: number; // cents/day
  feedInRate: number;        // cents/kWh credit for export (0 = no FiT)
  gstInclusive: boolean;
}

export interface WholesaleConfig {
  label: string;
  retailerMargin: number;           // cents/kWh added to spot (Amber = 0), excl. GST
  networkRatePerKwh: number;        // cents/kWh network/distribution passthrough, excl. GST
  dailyNetworkSupplyCharge: number; // cents/day network standing charge, excl. GST
  dailySubscription: number;        // cents/day retailer plan fee, inc. GST
  feedInRate: number;               // cents/kWh credit for export, excl. GST
}

export interface SpotPriceInterval {
  datetime: string; // NEM-time block-end key "YYYYMMDD-HH:MM" (AEST, no DST)
  rrp: number;      // $/MWh — average of 5-min dispatch prices in the block
}

export interface PlanTotal {
  label: string;
  total: number;       // dollars inc GST (net of FiT credits)
  usageCost: number;   // dollars — import usage charges
  supplyCost: number;  // dollars — daily supply / subscription
  fitCredit: number;   // dollars — feed-in tariff credits (positive = savings)
}

export interface DailyCost {
  date: string;         // "YYYY-MM-DD"
  costs: number[];      // one entry per plan, same order as ComparisonResult.plans
}

export interface ComparisonResult {
  plans: PlanTotal[];   // [planA, planB (if enabled), wholesale (if spot data available)]
  dailySeries: DailyCost[];
  periodDays: number;        // days actually compared
  totalFileDays: number;     // total days in NEM12 file
  totalKwh: number;          // import kWh
  totalExportKwh: number;
  spotDataAvailable: boolean;
}
