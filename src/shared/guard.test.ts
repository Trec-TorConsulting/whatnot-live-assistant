import { describe, expect, it } from 'vitest';
import { DEFAULT_GUARD_SETTINGS, guardStatus, parseBidButton, sanitizeGuardSettings, type GuardSettings } from './guard';

const settings = (patch: Partial<GuardSettings> = {}): GuardSettings => ({ ...DEFAULT_GUARD_SETTINGS, ...patch });

describe('guardStatus', () => {
  it('is quiet with no ceilings', () => {
    expect(guardStatus({ bid: 500, lot: null, settings: settings(), spentThisShow: 0, appraisal: null })).toMatchObject({ level: 'ok', ceiling: null });
  });

  it('uses the per-lot max over the default', () => {
    const s = settings({ defaultMaxBid: 100, lotMax: { p1: 40 } });
    expect(guardStatus({ bid: 50, lot: { id: 'p1' }, settings: s, spentThisShow: 0, appraisal: null })).toMatchObject({ level: 'over', ceiling: 40, ceilingSource: 'lot' });
    expect(guardStatus({ bid: 50, lot: { id: 'p2' }, settings: s, spentThisShow: 0, appraisal: null })).toMatchObject({ level: 'ok', ceiling: 100 });
  });

  it('warns when near the ceiling', () => {
    expect(guardStatus({ bid: 95, lot: null, settings: settings({ defaultMaxBid: 100 }), spentThisShow: 0, appraisal: null }).level).toBe('near');
  });

  it('caps by what is left of the show budget', () => {
    const r = guardStatus({ bid: 60, lot: null, settings: settings({ defaultMaxBid: 100, showBudget: 200 }), spentThisShow: 150, appraisal: null });
    expect(r).toMatchObject({ level: 'over', ceiling: 50, ceilingSource: 'budget' });
  });

  it('uses the appraisal suggested max and flags bids above market', () => {
    const appraisal = { marketValue: 120, suggestedMax: 96 };
    expect(guardStatus({ bid: 100, lot: null, settings: settings(), spentThisShow: 0, appraisal })).toMatchObject({ level: 'over', ceilingSource: 'appraisal' });
    const over = guardStatus({ bid: 130, lot: null, settings: settings({ defaultMaxBid: 500 }), spentThisShow: 0, appraisal });
    expect(over.level).toBe('over');
    expect(over.reasons.some((r) => /market value/.test(r))).toBe(true);
  });

  it("caps by what's left of the day, week, and month budgets", () => {
    const s = settings({ dailyBudget: 100, weeklyBudget: 300, monthlyBudget: 1000 });
    const r = guardStatus({ bid: 40, lot: null, settings: s, spentThisShow: 0, spentByPeriod: { day: 20, week: 270, month: 500 }, appraisal: null });
    expect(r).toMatchObject({ level: 'over', ceiling: 30, ceilingSource: 'weekly' });
    expect(r.reasons[0]).toBe("$40 is over what's left of this week's budget ($30)");
  });

  it('uses a watchlist max like a lot max: over the default and the suggested max, under an explicit lot max', () => {
    const appraisal = { marketValue: 120, suggestedMax: 96 };
    const s = settings({ defaultMaxBid: 50, lotMax: { p1: 20 } });
    expect(guardStatus({ bid: 60, lot: { id: 'p2' }, settings: s, spentThisShow: 0, watchMax: 70, appraisal })).toMatchObject({ level: 'ok', ceiling: 70, ceilingSource: 'watch' });
    expect(guardStatus({ bid: 60, lot: { id: 'p1' }, settings: s, spentThisShow: 0, watchMax: 70, appraisal })).toMatchObject({ ceiling: 20, ceilingSource: 'lot' });
  });

  it('converts a CA$40 bid against a $25 lot max as over, and gives no over/near verdict when there is no rate', () => {
    const s = settings({ lotMax: { lot1: 25 } });
    const withRate = guardStatus({
      bid: 40,
      lot: { id: 'lot1', currency: 'CAD' },
      settings: s,
      spentThisShow: 0,
      appraisal: null,
      currency: 'CAD',
      rate: 0.7168,
    });
    expect(withRate.level).toBe('over');
    expect(withRate.reasons[0]).toContain('$28.67');

    const withoutRate = guardStatus({
      bid: 40,
      lot: { id: 'lot1', currency: 'CAD' },
      settings: s,
      spentThisShow: 0,
      appraisal: null,
      currency: 'CAD',
      rate: null,
    });
    expect(withoutRate.level).toBe('ok');
    expect(withoutRate.reasons[0]).toContain('not converted');
  });
});

describe('parseBidButton', () => {
  it.each([
    ['Bid $25', 25],
    ['$1,200', 1200],
    ['Place bid: $7.50', 7.5],
    ['Bid', null],
    ['Buy Now $25', null],
  ])('%j -> %j', (label, expected) => {
    expect(parseBidButton(label)).toBe(expected);
  });
});

describe('sanitizeGuardSettings', () => {
  it('drops bad values', () => {
    expect(sanitizeGuardSettings({ defaultMaxBid: -5, lotMax: { a: 10, b: 'x', c: 0 }, maxBidPercent: 500 })).toMatchObject({
      defaultMaxBid: 0,
      lotMax: { a: 10 },
      maxBidPercent: 100,
    });
  });
});
