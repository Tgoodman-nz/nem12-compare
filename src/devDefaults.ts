// DEV ONLY — pre-filled form values for faster testing. Delete before shipping.
import type { NemRegion } from './types';

export const DEV_REGION: NemRegion = 'VIC1';

export const DEV_PLAN_A = {
  label: 'Flexi Saver',
  rate: '33.86',
  supply: '156.67',
  hasOffPeak: false,
  offPeakRate: '',
  offPeakFrom: '22:00',
  offPeakTo: '07:00',
  feedIn: '5.4',
  gst: true,
};

export const DEV_PLAN_B = {
  label: 'Plan B',
  rate: '29.381',
  supply: '94.6',
  hasOffPeak: true,
  offPeakRate: '4.5',
  offPeakFrom: '00:00',
  offPeakTo: '06:00',
  feedIn: '1',
  gst: true,
};

export const DEV_WHOLESALE = {
  label: 'Amber',
  margin: '0',
  networkRate: '9',
  networkSupply: '168', // c/day excl. GST — check your bill (Python default: $1.68/day)
  subscription: '82.19', // c/day inc. GST — Amber $25/month
  feedIn: '0',
};
