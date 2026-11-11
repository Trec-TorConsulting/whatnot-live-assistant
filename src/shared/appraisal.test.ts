import { describe, expect, it } from 'vitest';
import {
  APPRAISAL_INSTRUCTIONS,
  FOCUS_INSTRUCTION,
  ITEM_TYPES,
  ITEM_TYPE_LABEL,
  appraisalContext,
  basisDetail,
  capFineOz,
  bidHeadline,
  coinNamesAgree,
  computeValue,
  estimateOf,
  guardAppraisal,
  hallmarkPurity,
  hasPremiumSlabAttributes,
  isPcgsPriceable,
  jewelryFineOz,
  lotRollup,
  matchesCoin,
  meltFor,
  parseOthers,
  quickRead,
  reconcileCount,
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

  it('uses the electronics hint on pull buckets, omits the estate hint, and labels stated MSRP as a claim', () => {
    const asShown = appraisalContext({
      pageText: 'ELECTRONIC AS SHOWN #150',
      showTitle: 'Everyday Electronics Blowout',
      lotTitle: 'ELECTRONIC AS SHOWN #150',
      categories: ['Everyday Electronics'],
      showType: 'electronics',
    });
    expect(asShown).toContain('Electronics show:');
    expect(asShown).not.toContain('maker marks');
    expect(asShown).not.toContain('ELECTRONIC AS SHOWN');
    expect(asShown).toContain('lot 150');

    const smallPull = appraisalContext({
      pageText: 'SMALL Random Item #202\nBid $3',
      showTitle: 'Pallet Pulls',
      lotTitle: 'SMALL Random Item #202',
      categories: ['Everyday Electronics', 'Pallet Pulls'],
      showType: 'electronics',
    });
    expect(smallPull).toContain('lot 202');
    expect(smallPull).toContain('tier small');
    expect(smallPull).not.toContain('SMALL Random Item');

    const msrpLot = appraisalContext({
      pageText: '($200 Retail) Viaim Black RecDot AI Voice Recorder Earbuds',
      showTitle: 'Tech Show',
      lotTitle: '($200 Retail) Viaim Black RecDot AI Voice Recorder Earbuds',
      showType: 'electronics',
    });
    expect(msrpLot).toContain('claim, not a sold price');
    expect(msrpLot).toContain('Viaim Black RecDot AI Voice Recorder Earbuds');

    const toolsLot = appraisalContext({
      pageText: 'Milwaukee M12 Fuel Hammer Drill #3',
      showTitle: 'Milwaukee Tool Blowout',
      lotTitle: 'Milwaukee M12 Fuel Hammer Drill #3',
      categories: ['Tools', 'Milwaukee Tools'],
      showType: 'tools',
      showNotes: 'Some devices may have a password — just use “revolt”\nUse my code 83QT8R https://whatnot.com/invite/tools\nAll tools tested.',
    });
    expect(toolsLot).toContain('Tools show:');
    expect(toolsLot).not.toContain('Electronics show:');
    expect(toolsLot).not.toContain('maker marks');
    expect(toolsLot).not.toContain('revolt');
    expect(toolsLot).not.toContain('83QT8R');
    expect(toolsLot).toContain('All tools tested.');

    const longRunnerNotes = [
      `${'Welcome to our weekly outdoor flea walk! '.repeat(20)}\nPut in R for Run and P for Pass.`,
      'Vendor price $1 will run for $6, $2 for $7, $3 for $8, $4 for $9, anything $5 and up will be doubled.',
      'No cancellations, no refunds, no returns. Everything sold as-is, untested, not cleaned. /coupon SAVE10',
    ].join('\n');
    const runnerCtx = appraisalContext({
      pageText: 'Cannons As seen',
      showTitle: 'Deal Hunting at Leesport',
      lotTitle: 'Cannons As seen',
      showType: 'flea',
      showNotes: longRunnerNotes,
    });
    expect(runnerCtx).toContain('Current lot title: Cannons');
    expect(runnerCtx).not.toContain('Cannons As seen');
    expect(runnerCtx).not.toContain('shipping bucket');
    expect(runnerCtx).toContain('anything $5 and up will be doubled');
    expect(runnerCtx).toContain('No cancellations, no refunds, no returns');
    expect(runnerCtx).not.toContain('SAVE10');

    const longOrdinaryNotes = [
      'Welcome to our vintage show! '.repeat(30),
      'No cancellations or returns on any lot.',
    ].join('\n');
    const ordinaryCtx = appraisalContext({
      pageText: 'Vintage lamp',
      showTitle: 'Vintage Show',
      lotTitle: 'Vintage lamp',
      showType: 'flea',
      showNotes: longOrdinaryNotes,
    });
    expect(ordinaryCtx).not.toContain('No cancellations or returns on any lot.');

    const wholesaleJewelry = appraisalContext({
      pageText: '12/$12 Dozens #4',
      showTitle: 'Jewelry Dozens Wholesale',
      lotTitle: '12/$12 Dozens #4',
      categories: ['Fashion Jewelry', 'Wholesale/Lots'],
      showType: 'wholesale',
      showNotes: 'Sold by the dozen unless otherwise stated. /coupon DOZEN10',
    });
    expect(wholesaleJewelry).toContain('Wholesale / case-pack show:');
    expect(wholesaleJewelry).not.toContain('hallmark');
    expect(wholesaleJewelry).not.toContain('DOZEN10');

    const bundleAsSeen = appraisalContext({
      pageText: 'Case Pack or Bundle as Seen #335',
      showTitle: 'Case Packs Live',
      lotTitle: 'Case Pack or Bundle as Seen #335',
      categories: ['Case Packs & Bundles'],
      showType: 'wholesale',
    });
    expect(bundleAsSeen).toContain('Wholesale / case-pack show:');
    expect(bundleAsSeen).not.toContain('maker marks');
    expect(bundleAsSeen).not.toContain('shipping bucket');

    const pinkTag = appraisalContext({
      pageText: 'Clothing Case Pack - Pink Tag #66\nBid $21',
      showTitle: 'Apparel Case Packs',
      lotTitle: 'Clothing Case Pack - Pink Tag #66',
      categories: ['Case Packs & Bundles'],
      showType: 'wholesale',
      casePack: { pin: 'Hats- 10' },
    });
    expect(pinkTag).toContain('lot 66');
    expect(pinkTag).toContain('10 pieces stated by a mod');
    expect(pinkTag).toContain('Hats- 10');
    expect(pinkTag).not.toContain('Clothing Case Pack - Pink Tag #66');
  });

  it('reconciles stated pack counts with model quantity and scales value and suggested max accordingly', () => {
    const est = { low: 5, high: 8 };
    const r1 = reconcileCount(12, 1);
    expect(r1).toEqual({ quantity: 12, countNote: '12 stated' });
    const v1 = computeValue({ quantity: r1.quantity, melt: null, price: null, estimate: est });
    expect(v1).toMatchObject({ marketValue: 78, suggestedMax: 60 });

    const r2 = reconcileCount(12, 10);
    expect(r2).toEqual({ quantity: 10, countNote: '10 counted · 12 stated' });
    const v2 = computeValue({ quantity: r2.quantity, melt: null, price: null, estimate: est });
    expect(v2).toMatchObject({ marketValue: 65, suggestedMax: 50 });

    const r3 = reconcileCount(null, 3);
    expect(r3).toEqual({ quantity: 3, countNote: null });
    const v3 = computeValue({ quantity: r3.quantity, melt: null, price: null, estimate: est });
    expect(v3).toMatchObject({ marketValue: 19.5, suggestedMax: 15 });
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
  it('caps a gram bar or fractional coin the model weighed in ounces and leaves real answers alone', () => {
    expect(capFineOz('1 g Gold Bar', 1)).toBeCloseTo(0.03215, 5);
    expect(capFineOz('5 gram Silver Bar', 0.1607)).toBe(0.1607);
    expect(capFineOz('10g 14k Gold Chain', 0.1875)).toBe(0.1875);
    expect(capFineOz('1 oz Gold Eagle', 1)).toBe(1);
    expect(capFineOz('1/10th oz Gold Eagle MS70 2022', 1)).toBe(0.1);
    expect(capFineOz('1/10 oz Gold Maple Leaf', 1)).toBe(0.1);
    expect(capFineOz('1921 Morgan Dollar', 0.7734)).toBe(0.7734);
    expect(capFineOz('1 g Gold Bar', null)).toBeNull();
  });
});

describe('quickRead', () => {
  it('reads a known series with quantity and slab grade', () => {
    const r = quickRead('chat line\n1921 Morgan Dollar PCGS MS 63 x3\nmore chat');
    expect(r.read).toMatchObject({ name: 'Morgan Dollar', metal: 'silver', oz: 0.7734, quantity: 3, grade: 'PCGS MS 63' });
  });

  it('reads generic bullion weights, including fractions and ordinal suffixes', () => {
    expect(quickRead('1/10 oz Gold Panda 2024').read).toMatchObject({ metal: 'gold', oz: 0.1 });
    expect(quickRead('1/10th oz gold eagle ms70 2022').read).toMatchObject({ name: '1/10 oz Gold Eagle', metal: 'gold', oz: 0.1 });
    expect(quickRead('1/4th oz gold eagle 2023').read).toMatchObject({ name: '1/4 oz Gold Eagle', metal: 'gold', oz: 0.25 });
    expect(quickRead('1/2 oz gold eagle 2023').read).toMatchObject({ name: '1/2 oz Gold Eagle', metal: 'gold', oz: 0.5 });
    expect(quickRead('1/10th oz gold Maple Leaf 2024').read).toMatchObject({ metal: 'gold', oz: 0.1 });
    expect(quickRead('1/4 oz gold Buffalo 2008').read).toMatchObject({ metal: 'gold', oz: 0.25 });
    expect(quickRead('Silver round 2 oz').read).toMatchObject({ metal: 'silver', oz: 2 });
    expect(quickRead('1/1000 oz 24K Gold 250th Anniversary Collectiable Gold Card').read).toMatchObject({ metal: 'gold', oz: 0.001 });
  });

  it('reads 1 oz world bullion but leaves other sizes to the generic match', () => {
    expect(quickRead('2024 South Africa Krugerrand').read).toMatchObject({ name: '1 oz Krugerrand', metal: 'gold', oz: 1 });
    expect(quickRead('2023 Gold Britannia BU').read).toMatchObject({ metal: 'gold', oz: 1 });
    expect(quickRead('2023 Britannia BU').read).toMatchObject({ metal: 'silver', oz: 1 });
    expect(quickRead('2024 Libertad 1 oz silver').read).toMatchObject({ name: '1 oz Silver Libertad', oz: 1 });
    expect(quickRead('1 onza dragon libertad copper 1 oz').read).toBeNull();
    expect(quickRead('2024 1 onza libertad cobre').read).toBeNull();
    expect(quickRead('2024 Libertad 5 oz silver').read).toMatchObject({ metal: 'silver', oz: 5 });
    expect(quickRead('1/10 oz gold Krugerrand 2020').read).toMatchObject({ metal: 'gold', oz: 0.1 });
    expect(quickRead('2022 1 kilo silver kangaroo').read?.name).not.toBe('1 oz Silver Kangaroo');
  });

  it('recognizes 1 oz silver Krugerrands and rejects unweighted multi-coin sets', () => {
    expect(quickRead('2021 South Africa 1 oz Silver Krugerrand BU').read).toMatchObject({
      name: '1 oz Silver Krugerrand',
      metal: 'silver',
      oz: 1,
    });
    expect(
      quickRead('2007 Gold Krugerrand Investment Coin Set 3 Coins Limited Edition of 5000 Display Case & Booklet').read,
    ).toBeNull();
  });

  it('correctly reads NORFED silver dollars as silver and distinguishes $20 gold double eagles', () => {
    const norfed = quickRead('2009 NORFED $20 Liberty Dollar – 1 oz .999 Silver – Cali Evergreen RCO Stamp( mintage 250)');
    expect(norfed.read).toMatchObject({
      metal: 'silver',
      oz: 1,
    });
    expect(norfed.read?.metal).not.toBe('gold');

    const doubleEagle = quickRead('1908 $20 Saint-Gaudens Gold Double Eagle');
    expect(doubleEagle.read).toMatchObject({
      name: '$20 Gold Double Eagle',
      metal: 'gold',
      oz: 0.9675,
    });

    const libHead = quickRead('1904 $20 Liberty Head Double Eagle');
    expect(libHead.read).toMatchObject({
      name: '$20 Gold Double Eagle',
      metal: 'gold',
      oz: 0.9675,
    });
  });

  it('finds a PCGS cert but not prices or dates', () => {
    const pcgs = quickRead('PCGS 12345678 1881-S Morgan');
    expect(pcgs.cert).toBe('12345678');
    expect(pcgs.gradingService).toBe('PCGS');
    expect(quickRead('PCGS MS65 $1,250,000 2024').cert).toBeNull();
  });

  it('finds an NGC cert with hyphen or 10 digits', () => {
    const ngcHyphen = quickRead('1881-S Morgan NGC MS65 6066357-002');
    expect(ngcHyphen.cert).toBe('6066357-002');
    expect(ngcHyphen.gradingService).toBe('NGC');

    const ngcDigits = quickRead('2024 Silver Eagle NGC MS70 6066357002');
    expect(ngcDigits.cert).toBe('6066357002');
    expect(ngcDigits.gradingService).toBe('NGC');
  });

  it('finds PMG, CGC, CACG, ANACS, and BGS certs in listing text', () => {
    const pmg = quickRead('1928 $10 Gold Certificate PMG 64 EPQ 2517345-003');
    expect(pmg.cert).toBe('2517345-003');
    expect(pmg.gradingService).toBe('PMG');

    const cgc = quickRead('1999 Pokemon Base Set Charizard CGC 9 1401022941001');
    expect(cgc.cert).toBe('1401022941001');
    expect(cgc.gradingService).toBe('CGC');

    const cacg = quickRead('1921 Peace Dollar CACG MS64 10012345');
    expect(cacg.cert).toBe('10012345');
    expect(cacg.gradingService).toBe('CACG');

    const anacs = quickRead('1881-S Morgan Dollar ANACS MS63 5432109');
    expect(anacs.cert).toBe('5432109');
    expect(anacs.gradingService).toBe('ANACS');

    const bgs = quickRead('2000 Tom Brady Rookie BGS 9.5 0012345678');
    expect(bgs.cert).toBe('0012345678');
    expect(bgs.gradingService).toBe('BGS');
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

  it('detects premium slab attributes accurately', () => {
    expect(
      hasPremiumSlabAttributes({
        is_slabbed: true,
        item_name: '2017-W American Silver Eagle Burnished',
        grade: 'MS 70',
        special: 'Burnished finish, First Day of Issue, Elizabeth Jones signature label',
      }),
    ).toBe(true);

    expect(
      hasPremiumSlabAttributes({
        is_slabbed: true,
        item_name: '1928 $1 Silver Certificate',
        grade: '64 EPQ',
        paper_quality: 'epq',
      }),
    ).toBe(true);

    expect(
      hasPremiumSlabAttributes({
        is_slabbed: true,
        item_name: '1881-S Morgan Silver Dollar',
        grade: 'MS 65',
        cac: 'green',
      }),
    ).toBe(true);

    expect(
      hasPremiumSlabAttributes({
        is_slabbed: false,
        item_name: '1881-S Morgan Silver Dollar',
        grade: 'MS 65',
      }),
    ).toBe(false);

    expect(
      hasPremiumSlabAttributes({
        is_slabbed: true,
        item_name: '2022 American Silver Eagle',
        grade: 'MS 70',
      }),
    ).toBe(false);
  });

  it('preserves premium slab value against generic common-date bullion market guide', () => {
    // 2017-W Burnished Eagle MS 70 with Elizabeth Jones signature:
    // AI estimated $160-$190 (midpoint $175), but generic bullion FMV is $75.
    const res = computeValue({
      quantity: 1,
      melt: null,
      price: null,
      market: 75,
      estimate: { low: 160, high: 190 },
      isPremiumSlab: true,
    });
    expect(res.marketValue).toBe(175);
    expect(res.basis).toBe('estimate');
    expect(res.suggestedMax).toBe(140);

    // If an exact realized eBay comp exists at $185, it prefers the exact comp
    const withExactComp = computeValue({
      quantity: 1,
      melt: null,
      price: null,
      market: 185,
      estimate: { low: 160, high: 190 },
      isPremiumSlab: true,
    });
    expect(withExactComp.marketValue).toBe(185);
    expect(withExactComp.basis).toBe('market');
  });

  it('renders context-sensitive basis detail labels', () => {
    expect(
      basisDetail('market', [{ source: 'fmv', kind: 'market', value: 75, name: 'ASE', detail: null, link: null }]),
    ).toBe('NumisMedia FMV retail guide');

    expect(
      basisDetail('market', [{ source: 'ebay', kind: 'market', value: 175, name: 'Comps', detail: null, link: null }]),
    ).toBe('eBay sold comps');

    expect(
      basisDetail('market', [{ source: 'greysheet', kind: 'market', value: 120, name: 'CPG', detail: null, link: null }]),
    ).toBe('Greysheet CPG retail guide');

    expect(
      basisDetail('market', [{ source: 'scryfall', kind: 'market', value: 20, name: 'Card', detail: null, link: null }]),
    ).toBe('TCGplayer market price');

    expect(basisDetail('estimate', [], { low: 160, high: 190 })).toBe('AI guess $160–$190 each');
  });
});
