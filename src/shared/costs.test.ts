import { describe, expect, it } from 'vitest';
import { allInLine, allInPrice, flipLine, flipProfit, parseShipping, portfolioValue } from './costs';
import type { Purchase } from './purchases';

const buy = (p: Partial<Purchase>): Purchase => ({
  key: Math.random().toString(),
  at: 0,
  liveId: null,
  showTitle: null,
  host: null,
  title: 'x',
  price: 10,
  kind: 'auction',
  appraisedValue: null,
  meltValue: null,
  appraisalId: null,
  source: 'auto',
  ...p,
});

describe('all-in price', () => {
  it("reads Whatnot's shipping line", () => {
    expect(parseShipping('Shipping is $4.85 + Taxes')).toBe(4.85);
    expect(parseShipping('Free Shipping')).toBe(0);
    expect(parseShipping('Taxes apply')).toBeNull();
    expect(parseShipping(null)).toBeNull();
  });

  it('adds shipping once per show and your tax on the bid', () => {
    const a = allInPrice(40, 4.85, 6, false);
    expect(a.total).toBe(47.25);
    expect(allInLine(a, 6)).toBe('All-in $47.25 (ship $4.85 + tax $2.40)');
    expect(allInLine(allInPrice(40, 4.85, 0, true), 0)).toBe('All-in $40 (shipping already paid this show)');
    expect(allInLine(allInPrice(40, null, 0, false), 0)).toBe('All-in $40 (shipping unknown)');
  });
});

describe('flip', () => {
  it("takes Whatnot's fees off the resale", () => {
    const f = flipProfit(100, 70);
    expect(f).toMatchObject({ fees: 11.2, net: 88.8, profit: 18.8, margin: 27 });
    expect(flipLine(f)).toBe('Resell ~$100, keep $88.80 after fees: +$18.80 (27%) on $70');
    expect(flipProfit(50, 60).profit).toBe(-15.75);
  });
});

describe('portfolio', () => {
  it('values items at the higher of appraisal and metal at today’s spot, and skips unvalued ones', () => {
    const list = [
      buy({ price: 30, appraisedValue: 35, metal: 'silver', oz: 0.7734 }),
      buy({ price: 20, appraisedValue: 25 }),
      buy({ price: 5 }),
    ];
    const p = portfolioValue(list, { silver: 50 });
    expect(p).toMatchObject({ count: 3, valued: 2, cost: 55, valuedCost: 50, value: 63.67, gain: 13.67 });
  });
});
