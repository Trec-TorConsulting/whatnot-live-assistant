import { describe, expect, it } from 'vitest';
import { formatForeignWithUsd, toUsd } from './currency';
import { addPurchase, findSimilarPurchases, purchaseKey, purchasesCsv, spentInShow, summarizeSpend, type Purchase } from './purchases';
import { DAY } from './time';

const now = new Date(2026, 9, 26, 15, 0).getTime();

const p = (patch: Partial<Purchase>): Purchase => {
  const base = { at: now, liveId: 'show1', showTitle: 'Show 1', host: 'h', title: '1921 Morgan Dollar', price: 30, ...patch };
  return {
    kind: 'auction',
    appraisedValue: null,
    meltValue: null,
    appraisalId: null,
    source: 'auto',
    ...base,
    key: patch.key ?? purchaseKey(base),
  } as Purchase;
};

describe('addPurchase', () => {
  it('dedupes by event key', () => {
    let list: Purchase[] = [];
    list = addPurchase(list, p({})).list;
    const again = addPurchase(list, p({ at: now + 1000 }));
    expect(again.added).toBe(false);
    expect(addPurchase(list, p({ title: 'Peace Dollar' })).added).toBe(true);
  });
});

describe('summarizeSpend', () => {
  it('totals today, this month, per day and per show, and paid vs appraised', () => {
    const list = [
      p({ price: 30, appraisedValue: 40 }),
      p({ price: 20, at: now - DAY, title: 'b', liveId: 'show2', showTitle: 'Show 2' }),
      p({ price: 100, at: new Date(2026, 8, 30).getTime(), title: 'c' }),
    ];
    const s = summarizeSpend(list, now);
    expect(s).toMatchObject({ today: 30, thisMonth: 50, allTime: 150, count: 3, appraisedPaid: 30, appraisedValue: 40 });
    expect(s.days.at(-1)?.total).toBe(30);
    expect(s.days.at(-2)?.total).toBe(20);
    expect(s.shows[0]).toMatchObject({ liveId: 'show1', total: 130, count: 2 });
  });

  it('converts a CA$5 win at 0.7168 to $3.58 in show budget and SpendSummary, leaves out and counts a CA$5 win with no rate, and totals an old purchase with no currency as USD', () => {
    const cadConverted = p({
      key: 'cad-1',
      liveId: 'cad-show',
      title: 'Mystery Pull',
      price: 5,
      currency: 'CAD',
      priceUsd: toUsd(5, 'CAD', 0.7168),
    });
    expect(cadConverted.priceUsd).toBe(3.58);
    expect(formatForeignWithUsd(cadConverted.price, cadConverted.currency, cadConverted.priceUsd, 'usd')).toBe(
      'CA$5 (≈ $3.58)',
    );
    expect(spentInShow([cadConverted], 'cad-show')).toBe(3.58);

    const cadNoRate = p({
      key: 'cad-2',
      liveId: 'cad-show',
      title: 'Unconverted Pull',
      price: 5,
      currency: 'CAD',
      priceUsd: null,
    });
    const oldUsd = p({
      key: 'old-usd',
      liveId: 'usd-show',
      title: 'Old USD Purchase',
      price: 20,
    });

    const summary = summarizeSpend([cadConverted, cadNoRate, oldUsd], now);
    expect(summary.today).toBe(23.58);
    expect(summary.allTime).toBe(23.58);
    expect(summary.unconvertedCount).toBe(1);
    expect(spentInShow([cadConverted, cadNoRate], 'cad-show')).toBe(3.58);
  });
});

describe('findSimilarPurchases', () => {
  const list = [p({ title: '1921 Morgan Dollar VF' }), p({ title: '1964 Kennedy Half', price: 12 }), p({ title: '1922 Peace Dollar' })];

  it('matches on shared words and year', () => {
    expect(findSimilarPurchases('1921 Morgan Dollar', list).map((x) => x.title)).toEqual(['1921 Morgan Dollar VF']);
  });

  it('requires the year to match when one is given', () => {
    expect(findSimilarPurchases('1922 Morgan Dollar', list)).toEqual([]);
  });
});

describe('purchasesCsv', () => {
  it('escapes cells', () => {
    expect(purchasesCsv([p({ title: 'Lot, "nice"' })]).split('\n')[1]).toContain('"Lot, ""nice"""');
  });
});
