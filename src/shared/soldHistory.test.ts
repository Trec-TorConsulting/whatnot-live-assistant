import { describe, expect, it } from 'vitest';
import { computeValue } from './appraisal';
import type { Sale } from './live';
import { addSold, findComps, MAX_SOLD, soldFromSale, summarizeComps, type SoldItem } from './soldHistory';
import { DAY } from './time';

const now = Date.parse('2026-10-27');

const sold = (title: string, price: number, patch: Partial<SoldItem> = {}): SoldItem => ({
  key: `${title}|${price}`,
  at: now - DAY,
  liveId: 'show1',
  showTitle: 'Show',
  title,
  price,
  ...patch,
});

describe('soldFromSale', () => {
  const sale: Sale = { key: 'k', productId: null, title: 'Kinetic phone', price: 12, buyer: 'bob', kind: 'auction', at: now };
  it('keeps paid sales without the buyer', () => {
    const item = soldFromSale(sale, 'show1', 'Garage Sale', 'flea');
    expect(item).toEqual({
      key: 'k',
      at: now,
      liveId: 'show1',
      showTitle: 'Garage Sale',
      title: 'Kinetic phone',
      price: 12,
      productId: sale.productId,
      showType: 'flea',
    });
    expect(item).not.toHaveProperty('buyer');
  });

  it('drops giveaways, $0, and untitled sales', () => {
    expect(soldFromSale({ ...sale, kind: 'giveaway' }, 's', null)).toBeNull();
    expect(soldFromSale({ ...sale, price: 0 }, 's', null)).toBeNull();
    expect(soldFromSale({ ...sale, title: null }, 's', null)).toBeNull();
  });
});

describe('addSold', () => {
  it('dedupes by key and caps the list, oldest out first', () => {
    const a = sold('A thing', 5);
    expect(addSold([a], [a, { ...a }])).toHaveLength(1);
    const many = Array.from({ length: MAX_SOLD + 5 }, (_, i) => sold(`Item ${i}`, 1, { key: `k${i}`, at: i }));
    const capped = addSold([], many);
    expect(capped).toHaveLength(MAX_SOLD);
    expect(capped[0]!.key).toBe('k5');
  });
});

describe('findComps', () => {
  const list = [
    sold('Vintage Kinetic Portable Handsfree Phone NIB', 14),
    sold('Kinetic hands free telephone portable', 10),
    sold('Panasonic cordless telephone', 8),
    sold('1986 Fleer Michael Jordan #57 PSA 8', 9000),
    sold('1987 Fleer Michael Jordan #59', 300),
    sold('Kinetic Portable Handsfree Telephone', 20, { at: now - 400 * DAY }),
  ];

  it('matches on meaningful shared words, using the item name or the lot title', () => {
    const titles = findComps(['Kinetic Portable Handsfree Telephone'], list, now).map((c) => c.title);
    expect(titles).toEqual(['Vintage Kinetic Portable Handsfree Phone NIB', 'Kinetic hands free telephone portable']);
    expect(findComps(['Something else entirely', 'Kinetic portable handsfree phone'], list, now).map((c) => c.price)).toEqual([14]);
  });

  it('rules out a different year and ignores one-word names', () => {
    expect(findComps(['1986 Fleer Michael Jordan #57'], list, now).map((c) => c.price)).toEqual([9000]);
    expect(findComps(['Lot #12', 'telephone'], list, now)).toEqual([]);
  });

  it('keeps junk-bag hammers and does not use them as comps', () => {
    const bags = [sold('Junk bag #3', 3, { showType: 'flea' }), sold('Junk bag #50', 50, { key: 'bag50', showType: 'flea' })];
    const kept = addSold([], bags);
    expect(kept).toHaveLength(2);
    const morgan = sold('1921 Morgan dollar', 40, { key: 'morgan', showType: 'flea' });
    expect(findComps(['Junk bag #70'], [...kept, morgan], now, 8, 'flea')).toEqual([]);
    const one = summarizeComps(findComps(['1921 Morgan dollar'], [morgan], now, 8, 'flea'));
    expect(one?.count).toBe(1);
    expect(computeValue({ quantity: 1, melt: null, price: null, comps: one }).basis).not.toBe('whatnot');
  });

  it('rejects pull buckets and generic device classes as comps while matching specific devices and stripping MSRP', () => {
    const pullsAndGeneric = [
      sold('SMALL Random Item #201', 12, { key: 'sr1', showType: 'electronics' }),
      sold('SMALL Random Item #202', 18, { key: 'sr2', showType: 'electronics' }),
      sold('APPLE IPAD', 85, { key: 'ipad1', showType: 'electronics' }),
      sold('APPLE IPAD', 110, { key: 'ipad2', showType: 'electronics' }),
      sold('2020 Apple MacBook Air Laptop Apple M1 Chip (USED)', 410, { key: 'mb1', showType: 'electronics' }),
      sold('2020 Apple MacBook Air M1 Laptop', 430, { key: 'mb2', showType: 'electronics' }),
    ];
    expect(findComps(['SMALL Random Item #203'], pullsAndGeneric, now, 8, 'electronics')).toEqual([]);
    expect(findComps(['APPLE IPAD'], pullsAndGeneric, now, 8, 'electronics')).toEqual([]);

    const macComps = summarizeComps(findComps(['2020 Apple MacBook Air M1'], pullsAndGeneric, now, 8, 'electronics'));
    expect(macComps?.count).toBe(2);
    expect(computeValue({ quantity: 1, melt: null, price: null, comps: macComps }).basis).toBe('whatnot');

    // Stated MSRP alone does not set market value when no sold comps exist.
    const msrpOnly = summarizeComps(
      findComps(['($200 Retail) Viaim Black RecDot AI Voice Recorder Earbuds'], pullsAndGeneric, now, 8, 'electronics'),
    );
    expect(msrpOnly).toBeNull();
    expect(computeValue({ quantity: 1, melt: null, price: null, comps: msrpOnly }).marketValue).toBeNull();
  });
});

describe('summarizeComps', () => {
  it('gives count, median, range, and the first examples', () => {
    const s = summarizeComps([sold('a b', 10), sold('a c', 30), sold('a d', 14)]);
    expect(s).toMatchObject({ count: 3, median: 14, low: 10, high: 30 });
    expect(s?.examples).toHaveLength(3);
    expect(summarizeComps([sold('a b', 10), sold('a c', 20)])?.median).toBe(15);
    expect(summarizeComps([])).toBeNull();
  });
});

describe('findComps by show type', () => {
  it('keeps specialty shows apart but lets mixed shows match anything', () => {
    const now = Date.now();
    const sold = (title: string, price: number, showType?: SoldItem['showType']): SoldItem => ({ key: title + price, at: now, liveId: 'l', showTitle: null, title, price, showType });
    const list = [
      sold('1921 Morgan Dollar silver', 40, 'coins'),
      sold('1921 Morgan Dollar card Topps', 2, 'cards'),
      sold('1921 Morgan Dollar silver lot', 35, 'flea'),
      sold('1921 Morgan Dollar silver old', 38),
    ];
    const prices = (t?: SoldItem['showType']) => findComps(['1921 Morgan Dollar'], list, now, 8, t).map((c) => c.price).sort((a, b) => a - b);
    expect(prices('coins')).toEqual([35, 38, 40]);
    expect(prices('cards')).toEqual([2, 35, 38]);
    expect(prices('flea')).toEqual([2, 35, 38, 40]);
    expect(prices()).toEqual([2, 35, 38, 40]);
  });
});
