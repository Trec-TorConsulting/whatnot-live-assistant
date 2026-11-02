// AI guesses run high or low in ways that depend on the kind of show: flea-market goods often go
// for less than eBay suggests, coins sometimes for more. Your own history says by how much: each
// appraisal saved the AI's range, and the lot's sale was seen in the same show. The median of
// sold / guessed for this show type scales the next guess.
import type { AppraisalRecord, Estimate } from './appraisal';
import type { ShowType } from './showType';
import type { SoldItem } from './soldHistory';
import { HOUR } from './time';

// Fewer pairs than this and one odd sale would swing every guess.
export const MIN_CALIBRATION_SAMPLES = 5;
const MAX_SAMPLES = 50;
// A sale this long after the appraisal is probably a relisted lot, not the one appraised.
const MAX_SALE_DELAY_MS = 2 * HOUR;
// One wildly wrong guess (a misidentified item) shouldn't count as a trend.
const MIN_RATIO = 0.2;
const MAX_RATIO = 5;
// The factor itself stays modest: the AI's guess still anchors the value.
const MIN_FACTOR = 0.4;
const MAX_FACTOR = 2;

export interface Calibration {
  factor: number;
  samples: number;
  showType: ShowType;
}

const median = (nums: number[]) => {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};

// The guess the model made, before any earlier correction, so factors never compound.
const guessOf = (r: AppraisalRecord) => r.rawEstimate ?? r.estimate ?? null;

export const calibrationFor = (showType: ShowType, appraisals: AppraisalRecord[], sold: SoldItem[]): Calibration | null => {
  const sales = new Map<string, SoldItem[]>();
  for (const s of sold) {
    if (!s.productId) continue;
    const key = `${s.liveId}|${s.productId}`;
    sales.set(key, [...(sales.get(key) ?? []), s]);
  }
  const ratios: number[] = [];
  for (const r of [...appraisals].sort((a, b) => b.at - a.at)) {
    if ((r.showType ?? 'general') !== showType || r.confidence === 'quick' || !r.liveId || !r.lotId) continue;
    const guess = guessOf(r);
    if (!guess) continue;
    const sale = sales.get(`${r.liveId}|${r.lotId}`)?.find((s) => s.at >= r.at && s.at - r.at <= MAX_SALE_DELAY_MS);
    if (!sale) continue;
    const guessed = ((guess.low + guess.high) / 2) * Math.max(1, r.quantity || 1);
    const ratio = sale.price / guessed;
    if (ratio >= MIN_RATIO && ratio <= MAX_RATIO) ratios.push(ratio);
    if (ratios.length >= MAX_SAMPLES) break;
  }
  if (ratios.length < MIN_CALIBRATION_SAMPLES) return null;
  const factor = Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, median(ratios)));
  return { factor: Math.round(factor * 100) / 100, samples: ratios.length, showType };
};

export const calibrated = (estimate: Estimate, c: Calibration | null): Estimate =>
  c ? { low: Math.round(estimate.low * c.factor * 100) / 100, high: Math.round(estimate.high * c.factor * 100) / 100 } : estimate;
