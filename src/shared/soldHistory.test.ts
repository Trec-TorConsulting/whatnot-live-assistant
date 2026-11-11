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

  it('converts a foreign sale when a rate is known and drops a CA$35 sale with no rate', () => {
    expect(soldFromSale({ ...sale, price: 35, currency: 'CAD' }, 's', null, 'wholesale', 'host', null)).toBeNull();
    const converted = soldFromSale({ ...sale, price: 35, currency: 'CAD' }, 's', null, 'wholesale', 'host', 0.7168);
    expect(converted?.price).toBe(25.09);
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

  it('rejects conflicting storage, variant suffix, and part-number suffix while keeping sales with a missing spec', () => {
    const specSales = [
      sold('2019 Apple Macbook Pro i5 8GB 500GB 13"', 350, { key: 'mb500a', showType: 'electronics' }),
      sold('2019 Apple Macbook Pro i5 8GB 500GB 13"', 370, { key: 'mb500b', showType: 'electronics' }),
      sold('Audien Atom Pro Hearing Aids', 90, { key: 'atom1a', showType: 'electronics' }),
      sold('Audien Atom Pro Hearing Aids', 95, { key: 'atom1b', showType: 'electronics' }),
      sold('Milwaukee M18 FUEL Grinder 2886-22 Kit', 220, { key: 'm2886kit1', showType: 'tools' }),
      sold('Milwaukee M18 FUEL Grinder 2886-22', 240, { key: 'm2886kit2', showType: 'tools' }),
      sold('2022 Apple Macbook Air M2 500GB', 620, { key: 'm2a', showType: 'electronics' }),
      sold('2022 Apple Macbook Air M2 500GB Laptop', 650, { key: 'm2b', showType: 'electronics' }),
    ];

    expect(findComps(['2019 Apple Macbook Pro i5 8GB 250GB 13"'], specSales, now, 8, 'electronics')).toEqual([]);
    expect(findComps(['Audien Atom Pro 2'], specSales, now, 8, 'electronics')).toEqual([]);
    expect(findComps(['Milwaukee M18 FUEL Grinder 2886-20'], specSales, now, 8, 'tools')).toEqual([]);

    const m2Comps = summarizeComps(findComps(['2022 Apple Macbook Air M2 8GB 500GB'], specSales, now, 8, 'electronics'));
    expect(m2Comps?.count).toBe(2);
    expect(computeValue({ quantity: 1, melt: null, price: null, comps: m2Comps }).basis).toBe('whatnot');
  });

  it('rejects generic case-pack titles and pairs whose pack counts disagree, while matching same-count packs', () => {
    const caseSales = [
      sold('Clothing Case Pack - Pink Tag #64', 18, { key: 'cp64', showType: 'wholesale' }),
      sold('Clothing Case Pack - Pink Tag #65', 22, { key: 'cp65', showType: 'wholesale' }),
      sold('12 pairs Christmas socks 31079 size 9-11', 15, { key: 'socks12a', showType: 'wholesale' }),
      sold('12 pairs Christmas socks 31079 size 9-11', 18, { key: 'socks12b', showType: 'wholesale' }),
      sold('Joggers Casepack size LARGE (12 pairs)', 36, { key: 'jog12a', showType: 'wholesale' }),
      sold('Joggers Casepack size LARGE (12 pairs)', 40, { key: 'jog12b', showType: 'wholesale' }),
    ];

    expect(findComps(['Clothing Case Pack - Pink Tag #66'], caseSales, now, 8, 'wholesale')).toEqual([]);
    expect(findComps(['Christmas socks 31079 size 9-11'], caseSales, now, 8, 'wholesale')).toEqual([]);

    const joggerComps = summarizeComps(
      findComps(['Joggers Casepack size LARGE (12 pairs)'], caseSales, now, 8, 'wholesale'),
    );
    expect(joggerComps?.count).toBe(2);
    expect(joggerComps?.median).toBe(38);
  });

  it('does not match a 1/10th oz gold eagle against 1 oz gold eagle sales, while matching 1/10 oz sales', () => {
    const eagleSales = [
      sold('1 oz gold eagle ms70 2022', 4300, { key: 'ge1a', showType: 'coins' }),
      sold('2022 gold eagle ms70', 4350, { key: 'ge1b', showType: 'coins' }),
      sold('1/10 oz gold eagle ms70 2022', 310, { key: 'ge10a', showType: 'coins' }),
    ];
    expect(findComps(['1/10th oz gold eagle ms70 2022'], eagleSales, now, 8, 'coins').map((c) => c.price)).toEqual([310]);
  });

  it('rejects silver bullion matches against gold sales and different bullion weights', () => {
    const mixedSales = [
      sold('2026 PAMP Coca-Cola Holiday Polar Bear 5 Gram Gold Bar', 760, { key: 'coke-gold-1', showType: 'coins' }),
      sold('2026 Coca Cola polar bear gold', 750, { key: 'coke-gold-2', showType: 'coins' }),
      sold('2026 Coca Cola polar bear 1 oz silver', 130, { key: 'coke-silver-1', showType: 'coins' }),
      sold('Valcambi 1 oz Silver Bar', 30.5, { key: 'val-1oz-1', showType: 'coins' }),
      sold('Valcambi 1 oz Silver', 31, { key: 'val-1oz-2', showType: 'coins' }),
      sold('Valcambi Silver Bar', 30, { key: 'val-unweighted', showType: 'coins' }),
      sold('Valcambi 1g Silver Bar', 9, { key: 'val-1g-1', showType: 'coins' }),
    ];

    // Coca Cola 1 oz silver must not match the 5g gold bar sales (~$760)
    const cokeComps = findComps(['1 oz silver 2026 Coca Cola polar bear'], mixedSales, now, 8, 'coins');
    expect(cokeComps.map((c) => c.price)).toEqual([130]);

    // Valcambi 1g silver must not match 1 oz silver bars (~$30.50) or unweighted silver bars
    const valComps = findComps(['Valcambi 1g Silver'], mixedSales, now, 8, 'coins');
    expect(valComps.map((c) => c.price)).toEqual([9]);
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
