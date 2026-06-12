export type NemRegion = 'QLD1' | 'NSW1' | 'VIC1' | 'SA1' | 'TAS1';

export interface NmiRecord {
  nmi: string;
  registerId: string;
  intervalLength: number; // minutes
  unit: string;
}

export interface IntervalRecord {
  date: string; // YYYYMMDD
  intervals: number[]; // kWh per interval
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
  ratePerKwh: number;      // cents/kWh
  dailySupplyCharge: number; // cents/day
  gstInclusive: boolean;
}

export interface WholesaleConfig {
  retailerMargin: number;   // cents/kWh added to spot price
  dailySubscription: number; // cents/day
  gstInclusive: boolean;
}

export interface SpotPriceInterval {
  datetime: string; // ISO string, 30-min settlement period end
  rrp: number;      // $/MWh
}

export interface ComparisonResult {
  fixedTotal: number;     // dollars inc GST
  wholesaleTotal: number; // dollars inc GST
  difference: number;     // positive = fixed more expensive
  dailySeries: DailyCost[];
  periodDays: number;
  totalKwh: number;
}

export interface DailyCost {
  date: string;       // YYYY-MM-DD
  fixedCost: number;  // dollars
  wholesaleCost: number;
}
