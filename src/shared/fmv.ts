// NumisMedia Fair Market Value (FMV) guide calculations for US collector coins.
// Free retail market pricing benchmark across Sheldon grades for US coin series.

import { hasPremiumSlabAttributes, type AppraisalItem } from './appraisal';
import { statedGrade } from './keyDates';
import type { RefPrice } from './refPrice';

export type FmvSeries =
  | 'morgan_dollar'
  | 'peace_dollar'
  | 'silver_eagle'
  | 'walking_liberty_half'
  | 'franklin_half'
  | 'kennedy_half'
  | 'standing_liberty_quarter'
  | 'washington_quarter'
  | 'mercury_dime'
  | 'roosevelt_dime'
  | 'buffalo_nickel'
  | 'jefferson_nickel'
  | 'indian_cent'
  | 'lincoln_cent'
  | 'us_silver_cert_1'
  | 'us_red_seal_2'
  | 'us_silver_cert_5'
  | 'us_red_seal_5';

interface SeriesMatcher {
  series: FmvSeries;
  label: string;
  test: (text: string) => boolean;
}

const CENT = /\b(cent|cents|penny|pennies|1c|1¢)\b/i;
const NICKEL = /\b(nickel|nickels|5c|5¢)\b/i;
const DIME = /\b(dime|dimes|10c|10¢)\b/i;
const QUARTER = /\b(quarter|quarters|25c|25¢)\b/i;
const HALF = /\b(half|halves|50c|50¢)\b/i;

const MATCHERS: SeriesMatcher[] = [
  { series: 'silver_eagle', label: 'American Silver Eagle', test: (t) => /\bsilver\s*eagle\b/i.test(t) || /\bASE\b/.test(t) },
  { series: 'morgan_dollar', label: 'Morgan Dollar', test: (t) => /\bmorgan\b/i.test(t) },
  { series: 'peace_dollar', label: 'Peace Dollar', test: (t) => /\bpeace\b/i.test(t) && (/\bdollar\b|\$1\b/i.test(t) || /\b192[1-9]|193[45]\b/.test(t)) },
  { series: 'walking_liberty_half', label: 'Walking Liberty Half', test: (t) => /\bwalking\s*liberty\b/i.test(t) && HALF.test(t) },
  { series: 'franklin_half', label: 'Franklin Half', test: (t) => /\bfranklin\b/i.test(t) && HALF.test(t) },
  { series: 'kennedy_half', label: 'Kennedy Half', test: (t) => /\bkennedy\b/i.test(t) && HALF.test(t) },
  { series: 'standing_liberty_quarter', label: 'Standing Liberty Quarter', test: (t) => /\bstanding\s*liberty\b/i.test(t) && QUARTER.test(t) },
  { series: 'washington_quarter', label: 'Washington Quarter', test: (t) => /\bwashington\b/i.test(t) && QUARTER.test(t) },
  { series: 'mercury_dime', label: 'Mercury Dime', test: (t) => (/\bmercury\b/i.test(t) || /\bwinged\s*liberty\b/i.test(t)) && DIME.test(t) },
  { series: 'roosevelt_dime', label: 'Roosevelt Dime', test: (t) => /\broosevelt\b/i.test(t) && DIME.test(t) },
  { series: 'buffalo_nickel', label: 'Buffalo Nickel', test: (t) => (/\bbuffalo\b/i.test(t) || /\bindian\s*head\b/i.test(t)) && NICKEL.test(t) },
  { series: 'jefferson_nickel', label: 'Jefferson Nickel', test: (t) => /\bjefferson\b/i.test(t) && NICKEL.test(t) },
  { series: 'indian_cent', label: 'Indian Head Cent', test: (t) => /\bindian\b/i.test(t) && CENT.test(t) },
  { series: 'lincoln_cent', label: 'Lincoln Cent', test: (t) => (/\blincoln\b/i.test(t) || /\bwheat\b/i.test(t)) && CENT.test(t) },
  {
    series: 'us_silver_cert_1',
    label: '$1 Silver Certificate',
    test: (t) => (/\$1\b|\bone\s*dollar\b/i.test(t) || /\bFr\.?\s*(?:16\d\d|230\d)\b/i.test(t)) && /silver\s*cert/i.test(t),
  },
  {
    series: 'us_red_seal_2',
    label: '$2 Red Seal Note',
    test: (t) => (/\$2\b|\btwo\s*dollar\b/i.test(t) || /\bFr\.?\s*150\d\b/i.test(t)) && /(?:red\s*seal|legal\s*tender|united\s*states\s*note)/i.test(t),
  },
  {
    series: 'us_silver_cert_5',
    label: '$5 Silver Certificate',
    test: (t) => (/\$5\b|\bfive\s*dollar\b/i.test(t)) && /silver\s*cert/i.test(t),
  },
  {
    series: 'us_red_seal_5',
    label: '$5 Red Seal Note',
    test: (t) => (/\$5\b|\bfive\s*dollar\b/i.test(t)) && /(?:red\s*seal|legal\s*tender|united\s*states\s*note)/i.test(t),
  },
];

export interface GradeTierValues {
  G4: number;
  VG8: number;
  F12: number;
  VF20: number;
  XF40: number;
  AU50: number;
  AU58: number;
  MS60: number;
  MS63: number;
  MS64: number;
  MS65: number;
  MS66: number;
  MS67: number;
}

// Common-date retail Fair Market Values (FMV) benchmarks across grades:
const COMMON_FMV: Record<FmvSeries, GradeTierValues> = {
  morgan_dollar: { G4: 32, VG8: 34, F12: 36, VF20: 38, XF40: 42, AU50: 48, AU58: 55, MS60: 62, MS63: 78, MS64: 95, MS65: 210, MS66: 450, MS67: 1200 },
  peace_dollar: { G4: 28, VG8: 30, F12: 32, VF20: 34, XF40: 36, AU50: 40, AU58: 45, MS60: 50, MS63: 60, MS64: 80, MS65: 165, MS66: 420, MS67: 1100 },
  silver_eagle: { G4: 34, VG8: 34, F12: 35, VF20: 36, XF40: 38, AU50: 40, AU58: 42, MS60: 44, MS63: 45, MS64: 48, MS65: 52, MS66: 58, MS67: 75 },
  walking_liberty_half: { G4: 14, VG8: 15, F12: 16, VF20: 18, XF40: 22, AU50: 32, AU58: 44, MS60: 55, MS63: 85, MS64: 125, MS65: 220, MS66: 480, MS67: 1100 },
  franklin_half: { G4: 12, VG8: 12, F12: 12, VF20: 13, XF40: 14, AU50: 16, AU58: 20, MS60: 22, MS63: 26, MS64: 32, MS65: 55, MS66: 140, MS67: 550 },
  kennedy_half: { G4: 12, VG8: 12, F12: 12, VF20: 12, XF40: 13, AU50: 14, AU58: 15, MS60: 16, MS63: 18, MS64: 22, MS65: 35, MS66: 80, MS67: 280 },
  standing_liberty_quarter: { G4: 9, VG8: 11, F12: 14, VF20: 18, XF40: 28, AU50: 55, AU58: 95, MS60: 120, MS63: 160, MS64: 220, MS65: 340, MS66: 650, MS67: 1400 },
  washington_quarter: { G4: 6, VG8: 6.5, F12: 7, VF20: 7.5, XF40: 8.5, AU50: 11, AU58: 14, MS60: 15, MS63: 18, MS64: 25, MS65: 42, MS66: 95, MS67: 320 },
  mercury_dime: { G4: 3, VG8: 3.25, F12: 3.5, VF20: 4, XF40: 5, AU50: 8, AU58: 14, MS60: 16, MS63: 22, MS64: 28, MS65: 45, MS66: 70, MS67: 180 },
  roosevelt_dime: { G4: 2.5, VG8: 2.5, F12: 2.5, VF20: 2.75, XF40: 3, AU50: 3.5, AU58: 4.5, MS60: 5, MS63: 7, MS64: 10, MS65: 16, MS66: 30, MS67: 75 },
  buffalo_nickel: { G4: 2.5, VG8: 3, F12: 4, VF20: 6, XF40: 10, AU50: 20, AU58: 32, MS60: 38, MS63: 45, MS64: 60, MS65: 95, MS66: 220, MS67: 650 },
  jefferson_nickel: { G4: 1, VG8: 1, F12: 1.25, VF20: 1.5, XF40: 2, AU50: 3, AU58: 4, MS60: 5, MS63: 8, MS64: 12, MS65: 22, MS66: 45, MS67: 140 },
  indian_cent: { G4: 2.5, VG8: 3.5, F12: 5, VF20: 7, XF40: 12, AU50: 24, AU58: 38, MS60: 50, MS63: 65, MS64: 95, MS65: 150, MS66: 350, MS67: 900 },
  lincoln_cent: { G4: 0.25, VG8: 0.35, F12: 0.5, VF20: 0.75, XF40: 1.25, AU50: 2, AU58: 3, MS60: 4, MS63: 6, MS64: 10, MS65: 18, MS66: 38, MS67: 110 },
  us_silver_cert_1: { G4: 4, VG8: 5, F12: 6, VF20: 8, XF40: 12, AU50: 16, AU58: 20, MS60: 25, MS63: 32, MS64: 42, MS65: 65, MS66: 110, MS67: 220 },
  us_red_seal_2: { G4: 5, VG8: 6, F12: 8, VF20: 10, XF40: 14, AU50: 18, AU58: 24, MS60: 32, MS63: 42, MS64: 55, MS65: 85, MS66: 150, MS67: 320 },
  us_silver_cert_5: { G4: 10, VG8: 12, F12: 15, VF20: 20, XF40: 28, AU50: 38, AU58: 50, MS60: 68, MS63: 88, MS64: 120, MS65: 180, MS66: 320, MS67: 650 },
  us_red_seal_5: { G4: 12, VG8: 15, F12: 18, VF20: 24, XF40: 32, AU50: 44, AU58: 58, MS60: 78, MS63: 98, MS64: 135, MS65: 210, MS66: 380, MS67: 750 },
};

// Key and semi-key date specific FMV overrides/multipliers for renowned dates:
interface KeyDateFmv {
  series: FmvSeries;
  year: number;
  mint?: string;
  factor: number;
}

const KEY_FMV: KeyDateFmv[] = [
  { series: 'morgan_dollar', year: 1889, mint: 'CC', factor: 20 },
  { series: 'morgan_dollar', year: 1893, mint: 'S', factor: 80 },
  { series: 'morgan_dollar', year: 1893, mint: 'CC', factor: 10 },
  { series: 'morgan_dollar', year: 1894, mint: '', factor: 15 },
  { series: 'morgan_dollar', year: 1895, factor: 70 },
  { series: 'morgan_dollar', year: 1879, mint: 'CC', factor: 5 },
  { series: 'morgan_dollar', year: 1881, mint: 'CC', factor: 4 },
  { series: 'morgan_dollar', year: 1885, mint: 'CC', factor: 4 },
  { series: 'peace_dollar', year: 1921, factor: 3.5 },
  { series: 'peace_dollar', year: 1928, factor: 6 },
  { series: 'peace_dollar', year: 1934, mint: 'S', factor: 2.5 },
  { series: 'lincoln_cent', year: 1909, factor: 12 }, // 1909-S / VDB
  { series: 'lincoln_cent', year: 1914, mint: 'D', factor: 25 },
  { series: 'lincoln_cent', year: 1931, mint: 'S', factor: 15 },
  { series: 'mercury_dime', year: 1916, mint: 'D', factor: 60 },
  { series: 'mercury_dime', year: 1921, factor: 12 },
  { series: 'standing_liberty_quarter', year: 1916, factor: 80 },
  { series: 'washington_quarter', year: 1932, mint: 'D', factor: 15 },
  { series: 'washington_quarter', year: 1932, mint: 'S', factor: 14 },
  { series: 'walking_liberty_half', year: 1921, factor: 16 },
  { series: 'walking_liberty_half', year: 1938, mint: 'D', factor: 4 },
  { series: 'buffalo_nickel', year: 1913, mint: 'S', factor: 5 },
  { series: 'buffalo_nickel', year: 1921, mint: 'S', factor: 8 },
  { series: 'buffalo_nickel', year: 1926, mint: 'S', factor: 10 },
];

export const gradeToSheldon = (grade: string | null | undefined): number | null => {
  if (!grade) return null;
  const num = parseInt(grade.replace(/\D/g, ''), 10);
  if (num >= 1 && num <= 70) return num;
  const parsed = statedGrade(grade);
  return parsed?.gradeNo ?? null;
};

export const sheldonToTier = (num: number): keyof GradeTierValues => {
  if (num >= 67) return 'MS67';
  if (num >= 66) return 'MS66';
  if (num >= 65) return 'MS65';
  if (num >= 64) return 'MS64';
  if (num >= 63) return 'MS63';
  if (num >= 60) return 'MS60';
  if (num >= 58) return 'AU58';
  if (num >= 50) return 'AU50';
  if (num >= 40) return 'XF40';
  if (num >= 20) return 'VF20';
  if (num >= 12) return 'F12';
  if (num >= 8) return 'VG8';
  return 'G4';
};

export const detectSeries = (text: string): { series: FmvSeries; label: string } | null => {
  for (const m of MATCHERS) {
    if (m.test(text)) return { series: m.series, label: m.label };
  }
  return null;
};

export const fmvLookup = (item: Partial<AppraisalItem>): RefPrice | null => {
  const text = [item.item_name, item.special].filter(Boolean).join(' ');
  const matched = detectSeries(text);
  if (!matched) return null;

  const rawGrade = item.grade ?? (typeof item.grade_number === 'number' ? `MS-${item.grade_number}` : null) ?? item.grade_estimate;
  const gradeNo = typeof item.grade_number === 'number' && item.grade_number > 0
    ? item.grade_number
    : gradeToSheldon(rawGrade);

  const tier = sheldonToTier(gradeNo ?? 50); // Default to AU50 if no grade specified
  const baseTable = COMMON_FMV[matched.series];
  if (!baseTable) return null;

  let basePrice = baseTable[tier];

  // Apply key date multiplier if applicable
  const year = typeof item.year === 'number' ? item.year : parseInt(String(text.match(/\b(18\d\d|19\d\d|20\d\d)\b/)?.[1] ?? ''), 10);
  const mint = (item.mint_mark ?? text.match(/\b(?:18\d\d|19\d\d|20\d\d)\s*-\s*([A-Z]{1,2})\b/i)?.[1] ?? '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .replace(/^P$/, '');

  if (year) {
    const keyHit = KEY_FMV.find(
      (k) => k.series === matched.series && k.year === year && (k.mint === undefined || k.mint === mint),
    );
    if (keyHit) {
      basePrice = Math.round(basePrice * keyHit.factor);
    }
  }

  const isPaper = matched.series.startsWith('us_');
  const isEpq =
    item.paper_quality === 'epq' ||
    item.paper_quality === 'ppq' ||
    /\b(epq|ppq|exceptional\s*paper|premium\s*paper)\b/i.test([item.grade, text].filter(Boolean).join(' '));
  const isStar =
    Boolean(item.star_note) ||
    /\b(star\s*note|replacement\s*note|★|\*)\b/i.test([item.grade, text].filter(Boolean).join(' '));

  if (isPaper) {
    if (isEpq && (gradeNo ?? 50) >= 64) {
      basePrice = Math.round(basePrice * 1.35);
    }
    if (isStar) {
      basePrice = Math.round(basePrice * 2.5);
    }
  }

  const isPremiumSlab = hasPremiumSlabAttributes(item);
  let detail = isPaper ? 'NumisMedia FMV / Paper Guide' : 'NumisMedia FMV retail guide';
  if (isPremiumSlab && !isPaper) {
    detail = 'NumisMedia FMV retail guide (common-date bullion baseline)';
  }

  const gradeSuffix = [isEpq ? 'EPQ' : '', isStar ? '★' : ''].filter(Boolean).join(' ');
  const baseGradeLabel = gradeNo ? `grade ${gradeNo}` : tier.replace(/^([A-Z]+)(\d+)$/, '$1-$2');
  const gradeLabel = [baseGradeLabel, gradeSuffix].filter(Boolean).join(' ');
  const coinTitle = [year, mint ? `-${mint}` : '', matched.label].filter(Boolean).join('').replace(/--/, '-');

  return {
    source: 'fmv',
    kind: 'market',
    value: Math.round(basePrice * 100) / 100,
    name: `${coinTitle} (${gradeLabel})`,
    detail,
    link: 'https://www.numismedia.com/fmv.html',
  };
};

