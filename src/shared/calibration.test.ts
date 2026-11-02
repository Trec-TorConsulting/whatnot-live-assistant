import { describe, expect, it } from 'vitest';
import type { AppraisalRecord } from './appraisal';
import { MIN_CALIBRATION_SAMPLES, calibrated, calibrationFor } from './calibration';
import type { SoldItem } from './soldHistory';
import { MINUTE } from './time';

const record = (i: number, low: number, high: number, over: Partial<AppraisalRecord> = {}): AppraisalRecord =>
  ({
    id: `a${i}`,
    at: i * 10 * MINUTE,
    liveId: 'show',
    showTitle: 'Yard sale',
    lotId: `lot${i}`,
    lotTitle: null,
    name: `Item ${i}`,
    grade: null,
    quantity: 1,
    confidence: 'medium',
    model: 'gemini',
    melt: null,
    price: null,
    priceNote: null,
    estimate: { low, high },
    valuation: { marketValue: null, meltValue: null, suggestedMax: null, basis: 'estimate' },
    showType: 'flea',
    notes: null,
    elapsedMs: 0,
    ...over,
  }) as AppraisalRecord;

const sale = (i: number, price: number, over: Partial<SoldItem> = {}): SoldItem => ({
  key: `s${i}`,
  at: i * 10 * MINUTE + MINUTE,
  liveId: 'show',
  showTitle: 'Yard sale',
  title: `Item ${i}`,
  price,
  productId: `lot${i}`,
  showType: 'flea',
  ...over,
});

describe('calibrationFor', () => {
  it('scales by the median of sold / guessed for the show type', () => {
    const appraisals = Array.from({ length: 6 }, (_, i) => record(i, 40, 60));
    const sold = [50, 30, 25, 35, 30, 400].map((p, i) => sale(i, p));
    // Ratios 1, .6, .5, .7, .6 (400/50 = 8 is a misread, dropped): median .6.
    expect(calibrationFor('flea', appraisals, sold)).toEqual({ factor: 0.6, samples: 5, showType: 'flea' });
    expect(calibrationFor('coins', appraisals, sold)).toBeNull();
  });

  it('needs enough sales, uses the raw guess, and ignores sales before or long after', () => {
    const few = Array.from({ length: MIN_CALIBRATION_SAMPLES - 1 }, (_, i) => record(i, 40, 60));
    expect(calibrationFor('flea', few, few.map((_, i) => sale(i, 25)))).toBeNull();

    const corrected = Array.from({ length: 5 }, (_, i) => record(i, 20, 30, { rawEstimate: { low: 40, high: 60 } }));
    expect(calibrationFor('flea', corrected, corrected.map((_, i) => sale(i, 25)))?.factor).toBe(0.5);

    const early = Array.from({ length: 5 }, (_, i) => record(i, 40, 60));
    expect(calibrationFor('flea', early, early.map((_, i) => sale(i, 25, { at: 0 })))).toBeNull();
  });

  it('applies the factor to both ends', () => {
    expect(calibrated({ low: 40, high: 60 }, { factor: 0.6, samples: 5, showType: 'flea' })).toEqual({ low: 24, high: 36 });
    expect(calibrated({ low: 40, high: 60 }, null)).toEqual({ low: 40, high: 60 });
  });
});
