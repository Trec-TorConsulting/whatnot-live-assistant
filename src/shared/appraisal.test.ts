import { describe, expect, it } from 'vitest';
import {
  APPRAISAL_INSTRUCTIONS,
  FOCUS_INSTRUCTION,
  ITEM_TYPES,
  ITEM_TYPE_LABEL,
  appraisalContext,
  capFineOz,
  bidHeadline,
  coinNamesAgree,
  computeValue,
  estimateOf,
  guardAppraisal,
  hallmarkPurity,
  isPcgsPriceable,
  jewelryFineOz,
  lotRollup,
  matchesCoin,
  meltFor,
  parseOthers,
  quickRead,
  summarizeAuctions,
} from './appraisal';
import type { ShowType } from './showType';

describe('item types', () => {
  it('labels every type and sends only coins to PCGS', () => {
    expect(ITEM_TYPES.every((t) => ITEM_TYPE_LABEL[t])).toBe(true);
    expect(ITEM_TYPES.filter(isPcgsPriceable)).toEqual(['coin', 'bullion', 'token_medal']);
    expect(isPcgsPriceable(undefined)).toBe(false);
  });
});

describe('appraisal prompt', () => {
  it('keeps per-request text out of the cacheable instructions', () => {
    const ctx = appraisalContext({ pageText: '1986 Fleer Jordan', showTitle: 'Card Break', lotTitle: 'Lot 4', categories: ['Sports Cards', 'Basketball'] });
    expect(ctx).toContain('Whatnot category: Sports Cards > Basketball');
    expect(ctx).toContain('Current lot title: Lot 4');
    expect(APPRAISAL_INSTRUCTIONS).not.toContain('Card Break');
    expect(APPRAISAL_INSTRUCTIONS).not.toMatch(/^Scan:/m);
    expect(APPRAISAL_INSTRUCTIONS).toMatch(/grade_number: the numeric 1-70 grade printed on the slab/);
    expect(APPRAISAL_INSTRUCTIONS).not.toMatch(/midpoint of grade_estimate/);
    expect(appraisalContext({ pageText: '', showTitle: '' })).not.toContain('Whatnot category');
    const noted = appraisalContext({ pageText: '', showTitle: 'S', showNotes: 'All raw Morgan dollars. /coupon SAVE10' });
    expect(noted).toContain('All raw Morgan dollars');
    expect(noted).not.toContain('SAVE10');
  });

  it('appraises only the presented item on every show type', () => {
    const ctx = (showType?: ShowType) => appraisalContext({ pageText: '', showTitle: 'S', showType });
    expect(APPRAISAL_INSTRUCTIONS).toContain(FOCUS_INSTRUCTION);
    expect(APPRAISAL_INSTRUCTIONS).not.toMatch(/most valuable item in the frame/i);
    expect(ctx('coins')).toMatch(/slab or holder label/);
    for (const t of ['general', 'flea', 'cards'] as const) expect(ctx(t)).not.toMatch(/^Scan:/m);
  });

  it('treats a template title as a shipping bucket', () => {
    const random = appraisalContext({
      pageText: 'E Random 1-2lb #10',
      showTitle: 'Glass',
      lotTitle: 'E Random 1-2lb #10',
      categories: ['Estate Sales'],
      showNotes: 'not washed. /coupon SAVE10',
    });
    expect(random).toMatch(/shipping bucket/);
    expect(random).toMatch(/maker marks/);
    expect(random).not.toMatch(/\bRandom\b/);
    expect(random).not.toContain('SAVE10');
    expect(random).toContain('lot 10');
    const screen = appraisalContext({
      pageText: '*c - 2 oz Item on screen #57',
      showTitle: 'Estate',
      lotTitle: '*c - 2 oz Item on screen #57',
    });
    expect(screen).not.toContain('Item on screen');
    expect(screen).toContain('lot 57');
    expect(screen).toContain('tier 2 oz');
  });
});

describe('jewelry melt', () => {
  it('reads purity from the stamp and refuses plated or filled pieces', () => {
    expect(hallmarkPurity('14K')).toEqual({ metal: 'gold', purity: 0.583 });
    expect(hallmarkPurity('585')).toEqual({ metal: 'gold', purity: 0.583 });
    expect(hallmarkPurity('925')).toEqual({ metal: 'silver', purity: 0.925 });
    expect(hallmarkPurity('PT950')).toEqual({ metal: 'platinum', purity: 0.95 });
    expect(hallmarkPurity('1/20 12K GF')).toBeNull();
    expect(hallmarkPurity('14K GP')).toBeNull();
    expect(hallmarkPurity('999', 'silver')).toEqual({ metal: 'silver', purity: 0.999 });
    expect(hallmarkPurity('999')).toBeNull();
    expect(hallmarkPurity(null)).toBeNull();
  });

  it('needs both the stamp and a weight', () => {
    expect(jewelryFineOz({ hallmark: '14K', gross_grams: 10, metal: 'gold' })?.oz).toBeCloseTo(0.1874, 3);
    expect(jewelryFineOz({ hallmark: '14K', gross_grams: null, metal: 'gold' })).toBeNull();
    expect(jewelryFineOz({ hallmark: null, gross_grams: 10, metal: 'gold' })).toBeNull();
  });
});

describe('market price', () => {
  it('prefers a card price over the guide and over Whatnot sales', () => {
    const comps = { count: 3, median: 20, low: 15, high: 25, examples: [] };
    expect(computeValue({ quantity: 1, melt: null, price: null, market: 12, comps, estimate: { low: 5, high: 8 } })).toMatchObject({
      marketValue: 12,
      basis: 'market',
    });
    expect(computeValue({ quantity: 1, melt: null, price: { guide: 30, auctions: null }, market: 12 }).basis).toBe('market');
    expect(computeValue({ quantity: 1, melt: null, price: null, market: null, comps }).basis).toBe('whatnot');
  });
});

describe('capFineOz', () => {
  it('caps a gram bar the model weighed in ounces and leaves real answers alone', () => {
    expect(capFineOz('1 g Gold Bar', 1)).toBeCloseTo(0.03215, 5);
    expect(capFineOz('5 gram Silver Bar', 0.1607)).toBe(0.1607);
    expect(capFineOz('10g 14k Gold Chain', 0.1875)).toBe(0.1875);
    expect(capFineOz('1 oz Gold Eagle', 1)).toBe(1);
    expect(capFineOz('1921 Morgan Dollar', 0.7734)).toBe(0.7734);
    expect(capFineOz('1 g Gold Bar', null)).toBeNull();
  });
});

describe('quickRead', () => {
  it('reads a known series with quantity and slab grade', () => {
    const r = quickRead('chat line\n1921 Morgan Dollar PCGS MS 63 x3\nmore chat');
    expect(r.read).toMatchObject({ name: 'Morgan Dollar', metal: 'silver', oz: 0.7734, quantity: 3, grade: 'PCGS MS 63' });
  });

  it('reads generic bullion weights, including fractions', () => {
    expect(quickRead('1/10 oz Gold Panda 2024').read).toMatchObject({ metal: 'gold', oz: 0.1 });
    expect(quickRead('Silver round 2 oz').read).toMatchObject({ metal: 'silver', oz: 2 });
    expect(quickRead('1/1000 oz 24K Gold 250th Anniversary Collectiable Gold Card').read).toMatchObject({ metal: 'gold', oz: 0.001 });
  });

  it('reads 1 oz world bullion but leaves other sizes to the generic match', () => {
    expect(quickRead('2024 South Africa Krugerrand').read).toMatchObject({ name: '1 oz Krugerrand', metal: 'gold', oz: 1 });
    expect(quickRead('2023 Gold Britannia BU').read).toMatchObject({ metal: 'gold', oz: 1 });
    expect(quickRead('2023 Britannia BU').read).toMatchObject({ metal: 'silver', oz: 1 });
    expect(quickRead('2024 Libertad 1 oz silver').read).toMatchObject({ name: '1 oz Silver Libertad', oz: 1 });
    expect(quickRead('2024 Libertad 5 oz silver').read).toMatchObject({ metal: 'silver', oz: 5 });
    expect(quickRead('1/10 oz gold Krugerrand 2020').read).toMatchObject({ metal: 'gold', oz: 0.1 });
    expect(quickRead('2022 1 kilo silver kangaroo').read?.name).not.toBe('1 oz Silver Kangaroo');
  });

  it('finds a PCGS cert but not prices or dates', () => {
    expect(quickRead('PCGS 12345678 1881-S Morgan').cert).toBe('12345678');
    expect(quickRead('PCGS MS65 $1,250,000 2024').cert).toBeNull();
  });

  it('returns nothing for chatter', () => {
    expect(quickRead('lol nice\nlet me get one').read).toBeNull();
  });
});

describe('summarizeAuctions', () => {
  const now = Date.parse('2026-10-26');
  it('takes the median of recent non-CAC sales', () => {
    const s = summarizeAuctions(
      [
        { Price: 100, Date: '2026-09-01' },
        { Price: 120, Date: '2026-08-01' },
        { Price: 300, Date: '2026-07-01', IsCAC: true },
        { Price: 90, Date: '2026-06-01' },
        { Price: 50, Date: '2015-01-01' },
      ],
      now,
    );
    expect(s).toMatchObject({ count: 3, median: 100, low: 90, high: 120, lastPrice: 100 });
  });

  it('reports only the last sale when nothing is recent', () => {
    expect(summarizeAuctions([{ Price: 50, Date: '2015-01-01' }], now)).toMatchObject({ count: 0, lastPrice: 50 });
    expect(summarizeAuctions([], now)).toBeNull();
  });
});

describe('matchesCoin', () => {
  const morgan = { year: 1881, mint_mark: 'S', item_name: '1881-S Morgan Dollar' };

  it('requires the year, the mint, and the same coin', () => {
    expect(matchesCoin({ Year: 1881, MintMark: 'S', Name: '1881-S Morgan Dollar' }, morgan)).toBe(true);
    expect(matchesCoin({ Name: '1881-S Morgan Dollar', MintMark: 'S' }, { ...morgan, year: 1882 })).toBe(false);
    expect(matchesCoin({ Year: 1881, MintMark: 'P', Name: '1881 Morgan Dollar' }, { ...morgan, mint_mark: '' })).toBe(true);
    expect(matchesCoin({ Year: 1881, MintMark: 'O', Name: '1881-O Morgan Dollar' }, morgan)).toBe(false);
    expect(matchesCoin({ Year: 1881, MintMark: 'S', Name: '1881-S Morgan Dollar' }, { ...morgan, mint_mark: null })).toBe(false);
    expect(matchesCoin({ Year: 1881, MintMark: 'S', Name: '1881-S Morgan Dollar' }, { year: 1881, mint_mark: 'S' })).toBe(false);
  });

  it('rejects a different issue that shares the year and mint', () => {
    expect(coinNamesAgree('1921 Peace Dollar', '1921 Morgan Dollar')).toBe(false);
    expect(coinNamesAgree('1921 Morgan Dollar', 'Morgan Dollar')).toBe(true);
    expect(coinNamesAgree('1908 $20 Saint-Gaudens', 'Double Eagle')).toBe(false);
    expect(coinNamesAgree('1908 $20 Saint-Gaudens', '1908 Saint-Gaudens Double Eagle')).toBe(true);
    expect(coinNamesAgree('$10 Indian', 'Double Eagle')).toBe(false);
    expect(coinNamesAgree('2010 Silver Eagle', '2010 Gold Eagle')).toBe(false);
    expect(matchesCoin({ Year: 1921, MintMark: '', Name: '1921 Peace Dollar' }, { year: 1921, mint_mark: '', item_name: '1921 Morgan Dollar' })).toBe(false);
  });

  it('lets a cert skip an unread mint, but not a mint that was read', () => {
    const data = { Year: 1881, MintMark: 'S', Name: '1881-S Morgan Dollar' };
    expect(matchesCoin(data, { year: 1881, mint_mark: null, item_name: '1881-S Morgan Dollar' }, false)).toBe(true);
    expect(matchesCoin(data, { year: 1881, mint_mark: 'O', item_name: '1881-O Morgan Dollar' }, false)).toBe(false);
  });
});

describe('estimateOf', () => {
  it('orders the range, fills a missing bound, and drops junk', () => {
    expect(estimateOf({ estimate_low_usd: 40, estimate_high_usd: 20 })).toEqual({ low: 20, high: 40 });
    expect(estimateOf({ estimate_low_usd: null, estimate_high_usd: 25 })).toEqual({ low: 25, high: 25 });
    expect(estimateOf({ estimate_low_usd: 0, estimate_high_usd: null })).toBeNull();
    expect(estimateOf({})).toBeNull();
  });
});

describe('lotRollup', () => {
  const caps = { item_name: 'Assorted caps', quantity: 12, estimate_low_usd: 2, estimate_high_usd: 4 };
  const boat = { name: 'Intex Explorer K2', quantity: 1, marketValue: 40, basis: 'estimate' as const };

  it('ranks a flea-market pile under the priciest item and totals the low end', () => {
    const lot = lotRollup(boat, [caps, { item_name: 'Red lantern', quantity: 1, estimate_low_usd: 8, estimate_high_usd: 5 }]);
    expect(lot).toEqual({
      total: 69,
      pieces: [
        { name: 'Intex Explorer K2', quantity: 1, total: 40, guess: true },
        { name: 'Assorted caps', quantity: 12, total: 24, guess: true },
        { name: 'Red lantern', quantity: 1, total: 5, guess: true },
      ],
    });
  });

  it('puts a pricier guess above the item that was fully checked', () => {
    const lot = lotRollup({ name: 'Wool cap', quantity: 1, marketValue: 12, basis: 'guide' }, [
      { item_name: 'Intex Explorer K2', quantity: 1, estimate_low_usd: 30, estimate_high_usd: 50 },
    ]);
    expect(lot?.pieces.map((p) => p.name)).toEqual(['Intex Explorer K2', 'Wool cap']);
    expect(lot?.pieces[1]?.guess).toBe(false);
  });

  it('drops duplicates, blank prices, and piles past two, and stays quiet for one item', () => {
    expect(parseOthers([caps, { item_name: '  ', estimate_low_usd: 5, estimate_high_usd: 6 }, { item_name: 'Pin', quantity: 80, estimate_low_usd: 1, estimate_high_usd: 1 }, { item_name: 'Extra', quantity: 1, estimate_low_usd: 9, estimate_high_usd: 9 }])).toEqual([
      caps,
      { item_name: 'Pin', quantity: 24, estimate_low_usd: 1, estimate_high_usd: 1 },
    ]);
    expect(lotRollup(boat, [{ item_name: 'Intex Explorer K2', quantity: 2, estimate_low_usd: 10, estimate_high_usd: 12 }])).toBeNull();
    expect(lotRollup(boat, null)).toBeNull();
  });
});

describe('computeValue', () => {
  const melt = meltFor('silver', 0.7734, 1, 30);

  it('prices numismatic coins from recent sales with an 80% walk-away', () => {
    const v = computeValue({ quantity: 1, melt, price: { guide: 150, auctions: { count: 3, median: 120, lastAt: 0, lastPrice: 120 } } });
    expect(v).toEqual({ marketValue: 120, meltValue: melt.total, suggestedMax: 96, basis: 'auctions' });
  });

  it('leaves a price guide out of the value and falls back to melt', () => {
    expect(computeValue({ quantity: 2, melt: null, price: { guide: 50, auctions: null } })).toEqual({
      marketValue: null,
      meltValue: null,
      suggestedMax: null,
      basis: 'none',
    });
    expect(computeValue({ quantity: 1, melt, price: null })).toMatchObject({ marketValue: 23.2, suggestedMax: 23.2, basis: 'melt' });
  });

  it('never values or caps below melt', () => {
    const v = computeValue({ quantity: 1, melt, price: { guide: 10, auctions: null } });
    expect(v.marketValue).toBeCloseTo(melt.total);
    expect(v.suggestedMax).toBeCloseTo(melt.total);
  });

  it('uses the AI estimate midpoint only when nothing real is known, still floored at melt', () => {
    const estimate = { low: 20, high: 40 };
    // 80% of the $60 midpoint is $48, but an AI-only max bid never goes above the $40 low end.
    expect(computeValue({ quantity: 2, melt: null, price: null, estimate })).toEqual({ marketValue: 60, meltValue: null, suggestedMax: 40, basis: 'estimate' });
    expect(computeValue({ quantity: 1, melt: null, price: null, estimate: { low: 20, high: 22 } })).toMatchObject({ suggestedMax: 16.8 });
    expect(computeValue({ quantity: 1, melt: null, price: { guide: 50, auctions: null }, estimate })).toMatchObject({ marketValue: 30, basis: 'estimate' });
    const low = computeValue({ quantity: 1, melt, price: null, estimate: { low: 5, high: 10 } });
    expect(low.marketValue).toBeCloseTo(melt.total);
    expect(low.suggestedMax).toBeCloseTo(melt.total);
  });

  it('prefers two or more Whatnot sales over the AI estimate and over the PCGS guide', () => {
    const comps = { count: 3, median: 15, low: 10, high: 20, examples: [] };
    const estimate = { low: 40, high: 80 };
    expect(computeValue({ quantity: 1, melt: null, price: null, estimate, comps })).toEqual({ marketValue: 15, meltValue: null, suggestedMax: 12, basis: 'whatnot' });
    expect(computeValue({ quantity: 1, melt: null, price: null, estimate, comps: { ...comps, count: 1 } }).basis).toBe('estimate');
    expect(computeValue({ quantity: 1, melt: null, price: { guide: 50, auctions: null }, comps }).basis).toBe('whatnot');
  });

  it('handles nothing known', () => {
    expect(computeValue({ quantity: 1, melt: null, price: null })).toEqual({ marketValue: null, meltValue: null, suggestedMax: null, basis: 'none' });
  });
});

describe('bid headline', () => {
  const auctions = { count: 3, median: 120, lastAt: 0, lastPrice: 120 };
  const realized = computeValue({ quantity: 1, melt: null, price: { guide: 200, auctions } });

  it('says max bid only for a realized sale', () => {
    expect(bidHeadline({ confidence: 'high', quantity: 1, price: { guide: 200, auctions }, valuation: realized })).toBe('Max bid $96');
    expect(bidHeadline({ confidence: 'low', quantity: 1, price: { guide: 200, auctions }, valuation: realized })).toBeNull();
    const melt = computeValue({ quantity: 1, melt: { metal: 'silver', spot: 30, oz: 1, perPiece: 30, total: 30 }, price: null });
    expect(bidHeadline({ confidence: 'quick', quantity: 1, price: null, valuation: melt })).toBe('Melt $30');
    const guess = computeValue({ quantity: 1, melt: null, price: null, estimate: { low: 20, high: 40 } });
    expect(bidHeadline({ confidence: 'medium', quantity: 1, price: null, valuation: guess })).toBe('Guess, low end $20');
    const guideOnly = computeValue({ quantity: 1, melt: null, price: { guide: 50, auctions: null } });
    expect(bidHeadline({ confidence: 'high', quantity: 1, price: { guide: 50, auctions: null }, valuation: guideOnly })).toBe('Guide $50');
  });

  it('does not let a low-confidence or guide-only value cap a bid', () => {
    expect(guardAppraisal({ confidence: 'low', valuation: realized })).toBeNull();
    expect(guardAppraisal({ confidence: 'high', valuation: realized })).toEqual({ marketValue: 120, suggestedMax: 96 });
    const guess = computeValue({ quantity: 1, melt: null, price: null, estimate: { low: 20, high: 40 } });
    expect(guardAppraisal({ confidence: 'high', valuation: guess })).toEqual({ marketValue: null, suggestedMax: 20 });
    expect(guardAppraisal({ confidence: 'high', valuation: computeValue({ quantity: 1, melt: null, price: { guide: 50, auctions: null } }) })).toBeNull();
    const melt = computeValue({ quantity: 1, melt: { metal: 'silver', spot: 30, oz: 1, perPiece: 30, total: 30 }, price: null });
    expect(guardAppraisal({ confidence: 'quick', valuation: melt })).toEqual({ marketValue: 30, suggestedMax: 30 });
  });
});
