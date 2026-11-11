// Paid sales seen in shows you watched, kept as real Whatnot comps for appraisals. Buyers aren't
// stored; giveaways and $0 sales are dropped since they say nothing about value.
import { quickRead } from './appraisal';
import { isGenericCaseLot, packCount } from './casePack';
import { toUsd } from './currency';
import { specsConflict } from './deviceSpecs';
import { isGenericDeviceClass, isPullBucket, stripMsrp } from './electronics';
import { isTemplate } from './estate';
import type { Sale } from './live';
import { titleTokens } from './purchases';
import type { ShowType } from './showType';
import { DAY } from './time';

export interface SoldItem {
  key: string;
  at: number;
  liveId: string;
  showTitle: string | null;
  title: string;
  price: number;
  // The lot's id (same as an appraisal's lotId), so an appraisal can be checked against its sale.
  productId?: string | null;
  showType?: ShowType;
  // The show's host, so a seller's closes can be compared with everyone else's.
  host?: string | null;
}

// Shows that sell one kind of thing. A "Morgan" sold on a card show is a different item than one
// sold on a coin show; flea-market and general shows sell anything, so they match every type.
const SPECIALTY = new Set<ShowType>(['coins', 'cards', 'jewelry', 'collectibles', 'electronics', 'tools', 'wholesale']);
const sameKind = (a: ShowType | undefined, b: ShowType | undefined) => !a || !b || a === b || !SPECIALTY.has(a) || !SPECIALTY.has(b);

export const MAX_SOLD = 5000;
const COMP_MAX_AGE_MS = 180 * DAY;
// Words sellers sprinkle on every title; matching on them would pair unrelated items.
const NOISE = new Set(['vintage', 'rare', 'nice', 'new', 'used', 'great', 'old', 'antique', 'nib', 'mint', 'look', 'wow', 'set', 'item']);

export const soldFromSale = (
  sale: Sale,
  liveId: string,
  showTitle: string | null,
  showType?: ShowType,
  host?: string | null,
  currencyRate?: number | null,
): SoldItem | null => {
  if (sale.kind === 'giveaway' || !sale.title || !sale.price || sale.price <= 0) return null;
  const code = (sale.currency ?? 'USD').toUpperCase();
  const usdPrice = code === 'USD' ? sale.price : toUsd(sale.price, code, currencyRate ?? null);
  if (usdPrice === null || usdPrice <= 0) return null;
  return {
    key: sale.key,
    at: sale.at,
    liveId,
    showTitle,
    title: sale.title.slice(0, 160),
    price: usdPrice,
    productId: sale.productId,
    showType,
    ...(host ? { host } : {}),
  };
};

export const addSold = (list: SoldItem[], items: SoldItem[]): SoldItem[] => {
  const seen = new Set(list.map((s) => s.key));
  const fresh = items.filter((s) => !seen.has(s.key) && seen.add(s.key));
  if (!fresh.length) return list;
  const next = [...list, ...fresh].sort((a, b) => a.at - b.at);
  return next.length > MAX_SOLD ? next.slice(next.length - MAX_SOLD) : next;
};

const isYear = (t: string) => /^(1[6-9]\d\d|20\d\d)$/.test(t);
const meaningful = (s: string) => new Set([...titleTokens(s)].filter((t) => !NOISE.has(t)));

const GRAMS_PER_OZ = 31.1035;
const GRAINS_PER_OZ = 480;
const LBS_PER_OZ = 14.5833;

const OZ_FRACTION_RE = /(?<![\d/.])(\d+)\/(\d+)(?:st|nd|rd|th)?\s*(?:troy\s*)?ozt?\b/i;
const OZ_WORD_RE = /\b(tenth|quarter|half)\s*(?:troy\s*)?ozt?\b/i;
const OZ_DECIMAL_RE = /(?<![\d/.])(\d+(?:\.\d+)?|\.\d+)(?:st|nd|rd|th)?\s*(?:troy\s*)?(?:oz|ozt|ounces?)\b/i;
const KILO_RE = /(?<![\d/.])(\d+(?:\.\d+)?|\.\d+)\s*(?:kilos?|kg|kilograms?)\b/i;
const GRAM_RE = /(?<![\d/.])(\d+(?:\.\d+)?|\.\d+)\s*(?:grams?|g)\b(?!\s*(?:cellular|lte|uwb|network|wifi|phone\b))/i;
const GRAIN_RE = /(?<![\d/.])(\d+(?:\.\d+)?|\.\d+)\s*(?:grains?|gr)\b/i;
const LB_RE = /(?<![\d/.])(\d+(?:\.\d+)?|\.\d+)\s*(?:lbs?|pounds?)\b/i;

export const explicitBullionWeight = (text: string): number | null => {
  const wordMatch = text.match(OZ_WORD_RE);
  if (wordMatch) {
    const w = wordMatch[1]!.toLowerCase();
    return w === 'tenth' ? 0.1 : w === 'quarter' ? 0.25 : 0.5;
  }
  const fracMatch = text.match(OZ_FRACTION_RE);
  if (fracMatch) {
    const den = Number(fracMatch[2]);
    if (den > 0) return Number(fracMatch[1]) / den;
  }
  const ozMatch = text.match(OZ_DECIMAL_RE);
  if (ozMatch) {
    const val = parseFloat(ozMatch[1]!);
    if (Number.isFinite(val) && val > 0) return val;
  }
  const kiloMatch = text.match(KILO_RE);
  if (kiloMatch) {
    const val = parseFloat(kiloMatch[1]!);
    if (Number.isFinite(val) && val > 0) return (val * 1000) / GRAMS_PER_OZ;
  }
  const gramMatch = text.match(GRAM_RE);
  if (gramMatch) {
    const val = parseFloat(gramMatch[1]!);
    if (Number.isFinite(val) && val > 0) return val / GRAMS_PER_OZ;
  }
  const grainMatch = text.match(GRAIN_RE);
  if (grainMatch) {
    const val = parseFloat(grainMatch[1]!);
    if (Number.isFinite(val) && val > 0) return val / GRAINS_PER_OZ;
  }
  const lbMatch = text.match(LB_RE);
  if (lbMatch) {
    const val = parseFloat(lbMatch[1]!);
    if (Number.isFinite(val) && val > 0) return val * LBS_PER_OZ;
  }
  return null;
};

export const extractBullionWeight = (text: string): number | null => {
  return explicitBullionWeight(text) ?? quickRead(text).read?.oz ?? null;
};

export const metalsOf = (text: string): Set<string> => {
  const set = new Set<string>();
  const qrMetal = quickRead(text).read?.metal;
  if (qrMetal) set.add(qrMetal);
  if (/\bgold\b/i.test(text)) set.add('gold');
  if (/\bsilver\b/i.test(text)) set.add('silver');
  if (/\bplatinum\b/i.test(text)) set.add('platinum');
  if (/\bpalladium\b/i.test(text)) set.add('palladium');
  if (/\brhodium\b/i.test(text)) set.add('rhodium');
  if (/\b(?:copper|cobre)\b/i.test(text)) set.add('copper');
  if (/\bbrass\b/i.test(text)) set.add('brass');
  if (/\bbronze\b/i.test(text)) set.add('bronze');
  if (/\b(?:clad|plated|gilt)\b/i.test(text)) set.add('clad');
  return set;
};

export const metalsConflict = (aText: string, bText: string): boolean => {
  const a = metalsOf(aText);
  const b = metalsOf(bText);
  if (!a.size || !b.size) return false;
  for (const m of a) {
    if (b.has(m)) return false;
  }
  return true;
};

const isNonStandardWeight = (oz: number | null): boolean => oz !== null && (oz < 0.8 || oz > 1.2);

// Share of the wanted words found in a sale title. Conflicting years, precious metals, device specs, pack counts, or bullion weights rule a sale out;
// a title with a missing spec can still match, since sellers often leave it off.
const matchScore = (wantText: string, want: Set<string>, title: string) => {
  if (specsConflict(wantText, title)) return 0;
  if (metalsConflict(wantText, title)) return 0;
  const wantPack = packCount(wantText).count ?? 1;
  const havePack = packCount(title).count ?? 1;
  if (wantPack !== havePack) return 0;

  const wantExplicit = explicitBullionWeight(wantText);
  const haveExplicit = explicitBullionWeight(title);
  const wantOz = wantExplicit ?? quickRead(wantText).read?.oz ?? null;
  const haveOz = haveExplicit ?? quickRead(title).read?.oz ?? null;

  if (wantOz !== null && haveOz !== null) {
    const max = Math.max(wantOz, haveOz);
    if (max > 0 && Math.abs(wantOz - haveOz) / max > 0.05) return 0;
  }
  if ((isNonStandardWeight(wantExplicit) && haveOz === null) || (isNonStandardWeight(haveExplicit) && wantOz === null)) {
    return 0;
  }

  const have = meaningful(title);
  const wantYears = [...want].filter(isYear);
  const haveYears = [...have].filter(isYear);
  if (wantYears.length && haveYears.length && !wantYears.some((y) => have.has(y))) return 0;
  const overlap = [...want].filter((t) => have.has(t)).length;
  if (overlap < 2) return 0;
  return overlap / want.size;
};

// Names with fewer than two meaningful words ("Lot #12") would match almost anything.
export const findComps = (names: (string | null | undefined)[], list: SoldItem[], now: number, limit = 8, showType?: ShowType): SoldItem[] => {
  const wants = names
    .filter((n): n is string => Boolean(n))
    .map((n) => stripMsrp(n))
    .filter((n) => Boolean(n) && !isTemplate(n) && !isPullBucket(n) && !isGenericDeviceClass(n) && !isGenericCaseLot(n))
    .map((text) => ({ text, tokens: meaningful(text) }))
    .filter((w) => w.tokens.size >= 2);
  if (!wants.length) return [];
  return list
    .filter(
      (s) =>
        !isTemplate(s.title) &&
        !isPullBucket(s.title) &&
        !isGenericDeviceClass(s.title) &&
        !isGenericCaseLot(s.title) &&
        now - s.at < COMP_MAX_AGE_MS &&
        sameKind(showType, s.showType),
    )
    .map((s) => {
      const cleanTitle = stripMsrp(s.title);
      return { s, score: Math.max(...wants.map((w) => matchScore(w.text, w.tokens, cleanTitle))) };
    })
    .filter((x) => x.score >= 0.6)
    .sort((a, b) => b.score - a.score || b.s.at - a.s.at)
    .slice(0, limit)
    .map((x) => x.s);
};

export interface CompSummary {
  count: number;
  median: number;
  low: number;
  high: number;
  examples: { title: string; price: number; at: number }[];
}

export const summarizeComps = (comps: SoldItem[]): CompSummary | null => {
  if (!comps.length) return null;
  const prices = comps.map((c) => c.price).sort((a, b) => a - b);
  const mid = Math.floor(prices.length / 2);
  return {
    count: prices.length,
    median: prices.length % 2 ? prices[mid]! : (prices[mid - 1]! + prices[mid]!) / 2,
    low: prices[0]!,
    high: prices[prices.length - 1]!,
    examples: comps.slice(0, 3).map(({ title, price, at }) => ({ title, price, at })),
  };
};
