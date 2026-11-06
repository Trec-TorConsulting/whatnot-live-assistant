import { describe, expect, it } from 'vitest';
import { parseWatchLine, parseWishLine, parseWishlist } from './buyer';
import { parseSetLine } from './collection';
import type { RefPrice } from './refPrice';
import { giveawayMatchesStem, giveawayShippingStems } from './runner';
import type { SoldItem } from './soldHistory';
import {
  applySaleToShopListings,
  applyShopAi,
  applyShopRefs,
  applyShopWorth,
  ensureMustPrice,
  evaluateListingSpread,
  extractShopQuery,
  extractShopRefQuery,
  formatListingSpread,
  hasPriceLine,
  isShopOperation,
  MAX_LISTINGS,
  mergeShopListings,
  monitorShopBadge,
  NO_MARKET_LINE,
  parseShopAiAnswer,
  parseShopListings,
  readRemovedShopIds,
  readShopPage,
  scoreShop,
  selectShopAiItems,
  shopCursor,
  shopMelt,
  shopSummary,
  shopVariables,
  shopVariablesFrom,
  shopWorthLine,
  type ShopListing,
} from './shop';

const bin = (title: string, amount: number, extra: Record<string, unknown> = {}) => ({
  id: title,
  title,
  transactionType: 'BUY_IT_NOW',
  status: 'ACTIVE',
  quantity: 1,
  price: { amount, currency: 'USD' },
  ...extra,
});

const sold = (title: string, price: number, at = 1_000): SoldItem => ({
  key: `${title}|${price}|${at}`,
  at,
  liveId: 'show',
  showTitle: null,
  title,
  price,
  showType: 'coins',
});

describe('parseShopListings', () => {
  const body = {
    data: {
      liveShop: {
        pageInfo: { hasNextPage: true, endCursor: 'cursor-2' },
        edges: [
          { node: bin('1 oz silver round', 2500) },
          { node: { ...bin('Morgan pre-bid', 100), transactionType: 'AUCTION', isPreBid: true } },
          { node: { title: 'Giveaway coin', transactionType: 'GIVEAWAY', price: { amount: 100 } } },
          { node: { ...bin('Sold eagle', 3000), status: 'SOLD' } },
          { node: { ...bin('Pre-bid bin', 1500), isPreBid: true } },
        ],
      },
    },
  };

  it('keeps buy-it-now and named auctions, including ones that can be pre-bid', () => {
    expect(parseShopListings(body)).toEqual([
      { id: '1 oz silver round', title: '1 oz silver round', price: 25, quantity: 1, mode: 'bin' },
      { id: 'Morgan pre-bid', title: 'Morgan pre-bid', price: 1, quantity: 1, mode: 'auction' },
      { id: 'Pre-bid bin', title: 'Pre-bid bin', price: 15, quantity: 1, mode: 'bin' },
    ]);
  });

  it('reads the shop cursor, not a deeper one', () => {
    const nested = {
      data: {
        liveShop: {
          pageInfo: { hasNextPage: true, endCursor: 'shop' },
          edges: [{ node: { ...bin('Round', 1000), images: { pageInfo: { hasNextPage: true, endCursor: 'image' } } } }],
        },
      },
    };
    expect(shopCursor(nested)).toBe('shop');
    expect(readShopPage(body).cursor).toBe('cursor-2');
  });

  it('treats a response with errors and no listings as a failed read', () => {
    expect(readShopPage({ errors: [{ message: 'nope' }], data: null })).toMatchObject({ listings: [], cursor: null, error: true });
  });

  it('records a shipping giveaway stem from the shop body while parseShopListings drops giveaways', () => {
    const shopBody = {
      data: {
        liveShop: {
          edges: [
            {
              node: {
                id: 'givvy-1',
                title: 'Follower Giveaway #1',
                description: 'Seller pays shipping for the winner!',
                transactionType: 'GIVEAWAY',
                status: 'ACTIVE',
                price: { amount: 0, currency: 'USD' },
              },
            },
            { node: bin('1 oz silver round', 2500) },
          ],
        },
      },
    };
    const stems = giveawayShippingStems(shopBody);
    expect(stems).toEqual(['follower giveaway']);
    expect(giveawayMatchesStem('Follower Giveaway #4', stems)).toBe(true);
    expect(parseShopListings(shopBody).map((l) => l.title)).toEqual(['1 oz silver round']);
  });

  it('rejects zero-quantity listings, collects removedIds, merges updates, and decrements live sales', () => {
    const pageBody = {
      data: {
        liveShop: {
          edges: [
            { node: { ...bin('Active round', 2800), id: 'r1', quantity: 2 } },
            { node: { ...bin('Zero stock round', 2500), id: 'r2', quantity: 0 } },
            { node: { ...bin('Sold out round', 2500), id: 'r3', status: 'SOLD_OUT' } },
          ],
        },
      },
    };
    expect(parseShopListings(pageBody)).toEqual([
      { id: 'r1', title: 'Active round', price: 28, quantity: 2, mode: 'bin' },
    ]);
    expect([...readRemovedShopIds(pageBody)].sort()).toEqual(['r2', 'r3']);
    const page = readShopPage(pageBody);
    expect(page.removedIds.sort()).toEqual(['r2', 'r3']);

    const current: ShopListing[] = [
      { id: 'r1', title: 'Active round', price: 32, quantity: 5, mode: 'bin' },
      { id: 'r2', title: 'Zero stock round', price: 25, quantity: 1, mode: 'bin' },
      { id: 'r4', title: 'Untouched round', price: 30, quantity: 1, mode: 'bin' },
    ];
    const merged = mergeShopListings(current, page.listings, page.removedIds);
    expect(merged).toEqual([
      { id: 'r1', title: 'Active round', price: 28, quantity: 2, mode: 'bin' },
      { id: 'r4', title: 'Untouched round', price: 30, quantity: 1, mode: 'bin' },
    ]);

    const afterFirstSale = applySaleToShopListings(merged, { id: 'r1', title: 'Active round' });
    expect(afterFirstSale.find((l) => l.id === 'r1')?.quantity).toBe(1);
    const afterTitleSale = applySaleToShopListings(afterFirstSale, { title: 'Active round' });
    expect(afterTitleSale.map((l) => l.id)).toEqual(['r4']);
    const afterGivvy = applySaleToShopListings(afterTitleSale, { id: 'r4', title: 'Untouched round', kind: 'giveaway' });
    expect(afterGivvy.map((l) => l.id)).toEqual(['r4']);
  });
});

describe('scoreShop', () => {
  const now = 10_000;
  const list = (title: string, price: number, quantity = 1): ShopListing => ({ id: title, title, price, quantity });
  const score = (listings: ShopListing[], extra: Partial<Parameters<typeof scoreShop>[0]> = {}) =>
    scoreShop({
      listings,
      sold: [],
      watchlist: [],
      maxBidPercent: 80,
      meltOf: (item) => shopMelt(item, { gold: null, silver: 30 }),
      now,
      showType: 'coins',
      ...extra,
    });

  it('compares the buy-it-now price to one piece, not the number left in stock', () => {
    const spot = { gold: null, silver: 50.99 };
    const stock = list('1 oz silver', 80, 29);
    expect(shopMelt(stock, spot)).toBeCloseTo(50.99);
    expect(score([stock, list('1995 libertad ms68', 280, 25), list('1995 libertad top pop ms69', 380, 12)], { meltOf: (item) => shopMelt(item, spot) })).toEqual([]);
    const lot = list('1 oz silver x10', 400, 3);
    expect(shopMelt(lot, spot)).toBeCloseTo(509.9);
    expect(score([lot], { meltOf: (item) => shopMelt(item, spot) })[0]).toMatchObject({ kind: 'steal', price: 400 });
  });

  it('treats 1/1000 oz as a thousandth of an ounce and 1/10th oz gold eagle as a tenth of an ounce', () => {
    const spot = { gold: 3964.2, silver: null };
    const title = '1/1000 oz 24K Gold 250th Anniversary Collectiable Gold Card';
    expect(shopMelt(list(title, 36), spot)).toBeCloseTo(3.9642);
    expect(score([list(title, 36)], { meltOf: (item) => shopMelt(item, spot) })).toEqual([]);
    expect(score([list(title, 1)], { meltOf: (item) => shopMelt(item, spot) })[0]).toMatchObject({ kind: 'steal', price: 1 });

    const tenthEagle = list('1/10th oz gold eagle ms70 2022', 525);
    expect(shopMelt(tenthEagle, { gold: 4130, silver: null })).toBeCloseTo(413);
    expect(score([tenthEagle], { meltOf: (item) => shopMelt(item, { gold: 4130, silver: null }) })).toEqual([]);
    expect(score([list('1/10th oz gold eagle ms70 2022', 350)], { meltOf: (item) => shopMelt(item, { gold: 4130, silver: null }) })[0]).toMatchObject({
      kind: 'steal',
      price: 350,
    });
  });

  it('leaves a $1 pre-bid out and still flags a $1 buy-it-now under melt', () => {
    const title = '2023 1OZ .999 SILVER LIBERTAD';
    const spot = { gold: null, silver: 49.81 };
    const hits = score(
      [
        { ...list(title, 1), mode: 'auction' },
        { ...list(`${title} bin`, 1), mode: 'bin' },
      ],
      { meltOf: (item) => shopMelt(item, spot) },
    );
    expect(hits.map((h) => h.title)).toEqual([`${title} bin`]);
    expect(hits[0]).toMatchObject({ kind: 'steal', mode: 'bin', price: 1 });
    expect(hits[0]!.reason).toContain('Under melt');
  });

  it('does not price a copper libertad off silver melt', () => {
    const title = '1 onza dragon libertad copper 1 oz';
    const spot = { gold: null, silver: 51.9 };
    expect(shopMelt(list(title, 5), spot)).toBeNull();
    expect(score([list(title, 5)], { meltOf: (item) => shopMelt(item, spot) })).toEqual([]);
  });

  it('prices a 10 oz Armenia Noahs Ark off silver melt and never splices a title weight with a Gold subtitle', () => {
    const spot = { gold: 4127.6, silver: 51.2 };
    const noahsArk: ShopListing = {
      id: 'ark-10oz',
      title: '10 oz 2026 Armenia noahs ark PROOF LIKE',
      subtitle: 'Gold & Silver Bullion',
      price: 1200,
      quantity: 16,
      mode: 'bin',
    };
    expect(shopMelt(noahsArk, spot)).toBeCloseTo(512);
    expect(score([noahsArk], { meltOf: (item) => shopMelt(item, spot) })).toEqual([]);

    const mysteryWithGoldSub: ShopListing = {
      id: 'mystery-10oz',
      title: '10 oz 2026 Commemorative Medallion PROOF LIKE',
      subtitle: 'Gold',
      price: 1200,
      quantity: 16,
      mode: 'bin',
    };
    expect(shopMelt(mysteryWithGoldSub, spot)).toBeNull();
  });

  it('calls a price under melt a steal and ignores a price at melt', () => {
    const hits = score([list('1 oz silver round', 20), list('1 oz silver round #2', 30)]);
    expect(hits.map((h) => h.title)).toEqual(['1 oz silver round']);
    expect(hits[0]).toMatchObject({ kind: 'steal', price: 20 });
    expect(hits[0]!.reason).toContain('Under melt');
  });

  it('uses two watched sales for a steal, and one sale for nothing', () => {
    const sales = [sold('1921 Morgan dollar', 40), sold('1921 Morgan dollar', 50, 2)];
    const under = score([list('1921 Morgan dollar', 20)], { sold: sales, meltOf: () => null });
    expect(under[0]).toMatchObject({ kind: 'steal' });
    const lone = score([list('1921 Morgan dollar', 20)], { sold: [sales[0]!], meltOf: () => null });
    expect(lone).toEqual([]);
  });

  it('flags a watchlist price as a deal and a key date, semi-key, or named variety as a must-have', () => {
    const watch = score([list('1921 Morgan dollar', 25)], {
      watchlist: [parseWatchLine('morgan $30')!],
      meltOf: () => null,
    });
    expect(watch[0]).toMatchObject({ kind: 'deal' });
    const key = score([list('1909-S VDB Lincoln cent', 40)], { meltOf: () => null });
    expect(key[0]).toMatchObject({ kind: 'must' });
    expect(key[0]!.reason).toContain('Key date');
    const semi = score([list('1879-CC Morgan dollar', 240)], { meltOf: () => null });
    expect(semi[0]).toMatchObject({ kind: 'must' });
    expect(semi[0]!.reason).toContain('Semi-key date');
    const variety = score([list('1955 Doubled Die Lincoln cent', 500)], { meltOf: () => null });
    expect(variety[0]).toMatchObject({ kind: 'must' });
    expect(variety[0]!.reason).toContain('Valuable variety');
    const overMax = score([list('1921 Morgan dollar', 80)], {
      watchlist: [parseWatchLine('morgan $30')!],
      meltOf: () => null,
    });
    expect(overMax).toEqual([]);
  });

  it('matches wishlist keywords, selecting the longest match, badging hits, and evaluating price ceilings', () => {
    const wishlist = parseWishlist([
      'charizard base',
      'morgan',
      '1881-s morgan $45',
      'milwaukee m18 fuel $120',
      'silver eagle 2021 $35',
    ].join('\n'));

    const items = [
      list('1999 Pokémon Charizard Base Set Holo', 150),
      list('1881-S Morgan Dollar BU', 40),
      list('Milwaukee M18 FUEL Impact Driver', 99),
      list('2021 American Silver Eagle BU', 45),
      list('Unrelated Random Item', 20),
    ];

    const hits = score(items, { wishlist, meltOf: () => null });
    expect(hits.map((h) => h.title)).toEqual([
      'Milwaukee M18 FUEL Impact Driver',
      '1881-S Morgan Dollar BU',
      '2021 American Silver Eagle BU',
      '1999 Pokémon Charizard Base Set Holo',
    ]);

    // 1881-s morgan under $45 ceiling -> deal
    const morgan = hits.find((h) => h.title === '1881-S Morgan Dollar BU')!;
    expect(morgan).toMatchObject({
      kind: 'deal',
      onWishlist: true,
      wishlistCeiling: 45,
    });
    expect(morgan.reason).toContain('Under wishlist max $45');

    // Milwaukee under $120 ceiling -> deal
    const tool = hits.find((h) => h.title === 'Milwaukee M18 FUEL Impact Driver')!;
    expect(tool).toMatchObject({
      kind: 'deal',
      onWishlist: true,
      wishlistCeiling: 120,
    });
    expect(tool.reason).toContain('Under wishlist max $120');

    // Charizard with no ceiling -> must, badged onWishlist
    const zard = hits.find((h) => h.title === '1999 Pokémon Charizard Base Set Holo')!;
    expect(zard).toMatchObject({
      kind: 'must',
      onWishlist: true,
      wishlistCeiling: null,
    });
    expect(zard.reason).toContain('On your wishlist');

    // Silver eagle above $35 ceiling -> retained on wishlist as must, NOT promoted to deal
    const ase = hits.find((h) => h.title === '2021 American Silver Eagle BU')!;
    expect(ase).toMatchObject({
      kind: 'must',
      onWishlist: true,
      wishlistCeiling: 35,
    });
    expect(ase.reason).toContain('On your wishlist');
    expect(ase.reason).not.toContain('Under wishlist max');
  });

  it('enriches must-have key dates with local AI estimates and info, and surfaces underpriced shop items', () => {
    const items = [
      list('1879-CC Morgan dollar', 240),
      list('1883 No Cents Liberty V Nickel BU', 8),
      list('1 oz silver round', 20),
    ];
    const initial = score(items);
    const toAsk = selectShopAiItems(items, initial);
    expect(toAsk.map((i) => i.title)).toEqual(['1879-CC Morgan dollar', '1883 No Cents Liberty V Nickel BU']);
    const estimates = parseShopAiAnswer(
      JSON.stringify({
        items: [
          { i: 1, low: 220, high: 350, info: 'Carson City semi-key issue' },
          { i: 2, low: 20, high: 30, info: 'First-year Racketeer nickel type' },
        ],
      }),
      toAsk,
    );
    const enriched = applyShopAi(items, initial, estimates);
    const cc = enriched.find((h) => h.title === '1879-CC Morgan dollar')!;
    expect(cc).toMatchObject({ kind: 'must', price: 240 });
    expect(cc.reason).toContain('AI est. $220–$350');
    expect(cc.reason).toContain('Carson City semi-key issue');
    const nick = enriched.find((h) => h.title === '1883 No Cents Liberty V Nickel BU')!;
    expect(nick).toMatchObject({ kind: 'deal', price: 8 });
    expect(nick.reason).toContain('Under AI est. $20–$30');
    expect(nick.reason).toContain('First-year Racketeer nickel type');
  });

  it('puts a PCGS grade value on a must-have and leaves a steal alone', () => {
    expect(shopWorthLine('VG-8', 140, { count: 3, median: 125 })).toBe('Market $125 (PCGS VG-8)');
    expect(shopWorthLine('G-4', 110, { count: 1, median: 90 })).toBe('Guide $110 (PCGS G-4)');
    expect(shopWorthLine('G-4', null, null)).toBeNull();
    const hits = score([list('1932 S Washington Silver Quarter Coin Key Date 408k MINTED~! (A) Good!', 79)]);
    expect(hits[0]).toMatchObject({ kind: 'must' });
    const priced = applyShopWorth(hits, new Map([['5792:4', 'Guide $110 (PCGS G-4)']]));
    expect(priced[0]!.reason).toContain('Guide $110 (PCGS G-4)');
    expect(priced[0]!.reason).toContain('Key date');
    const steal = score([list('1 oz silver round', 20)])[0]!;
    expect(applyShopWorth([steal], new Map([['5792:4', 'Guide $110 (PCGS G-4)']]))[0]).toBe(steal);
  });

  it('lists a named auction under its comps and leaves templates and giveaways out', () => {
    const body = {
      data: {
        edges: [
          { node: bin('1 oz silver round', 2000) },
          { node: { ...bin('Better Homes & Gardens Cookbook 1953', 1000), transactionType: 'AUCTION', quantity: 1 } },
          { node: { ...bin('*z - Category - Coins', 100), transactionType: 'AUCTION', quantity: 400 } },
          { node: { title: 'Giveaway coin', transactionType: 'GIVEAWAY', price: { amount: 100 } } },
        ],
      },
    };
    const listings = parseShopListings(body);
    expect(listings.map((l) => l.title)).not.toContain('Giveaway coin');
    const hits = score(listings, {
      sold: [sold('Better Homes & Gardens Cookbook 1953', 40), sold('Better Homes Gardens Cookbook 1953 edition', 50, 2)],
      meltOf: (item) => shopMelt(item, { gold: null, silver: 30 }),
    });
    expect(hits.map((h) => h.title).sort()).toEqual(['1 oz silver round', 'Better Homes & Gardens Cookbook 1953']);
    expect(hits.find((h) => h.title.includes('Cookbook'))?.mode).toBe('auction');
    expect(hits.map((h) => h.title)).not.toContain('*z - Category - Coins');
  });

  it('does not call a key date a must-have when watched sales are cheaper', () => {
    const sales = [sold('1909-S VDB Lincoln cent', 30), sold('1909-S VDB Lincoln cent', 32, 2)];
    expect(score([list('1909-S VDB Lincoln cent', 80)], { sold: sales, meltOf: () => null })).toEqual([]);
  });

  it('scores a stocked specific model, skips generic classes and joke giveaway rows, and does not score parts as a steal', () => {
    const eSold = [
      { ...sold('XGIMI MoGo Pro+ 1080P Portable Projector', 250), showType: 'electronics' as const },
      { ...sold('XGIMI MoGo Pro+ Portable Projector', 270, 2), showType: 'electronics' as const },
    ];
    const items: ShopListing[] = [
      { id: 'xgimi', title: 'XGIMI MoGo Pro+ 1080P Portable Projector', price: 110, quantity: 26, mode: 'bin', subtitle: 'Open-box' },
      { id: 'ipad', title: 'APPLE IPAD', price: 25, quantity: 250, mode: 'auction' },
      { id: 'givvy', title: 'GIVEAWAY NOW! DO NOT BUY', price: 999999, quantity: 999, mode: 'bin' },
      {
        id: 'parts',
        title: 'XGIMI MoGo Pro+ 1080P Portable Projector',
        subtitle: 'For parts, not fully functioning, or untested',
        price: 40,
        quantity: 1,
        mode: 'bin',
      },
    ];
    const hits = score(items, { sold: eSold, showType: 'electronics', meltOf: () => null });
    expect(hits.map((h) => h.id)).toEqual(['xgimi']);
    expect(hits[0]).toMatchObject({ kind: 'steal', price: 110, quantity: 26 });
  });

  it('treats a shared $2 auction start across at least half the shop as the opener, while scoring a real $169 start above it', () => {
    const toolSold: SoldItem[] = [
      { ...sold('2457-21 3/8-in Cordless M12 Lithium-Ion Ratchet Kit', 220), showType: 'tools' },
      { ...sold('2457-21 M12 Ratchet Kit', 240, 2), showType: 'tools' },
      { ...sold('2021 Apple iPad (9th Gen) 64GB', 180, 3), showType: 'electronics' },
      { ...sold('2021 Apple iPad (9th Gen) 64GB Wi-Fi', 195, 4), showType: 'electronics' },
    ];
    const twoDollarShop: ShopListing[] = Array.from({ length: 23 }, (_, i) => ({
      id: `lot-${i + 1}`,
      title: i === 0 ? '2021 Apple iPad (9th Gen) 64GB' : `Device Lot Model X${i + 100}`,
      price: 2,
      quantity: 1,
      mode: 'auction',
    }));
    twoDollarShop.push({
      id: 'lot-24',
      title: 'Another Device Z900',
      price: 15,
      quantity: 1,
      mode: 'auction',
    });
    expect(score(twoDollarShop, { sold: toolSold, showType: 'electronics', meltOf: () => null })).toEqual([]);

    const toolsShop: ShopListing[] = [
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `open-${i}`,
        title: `Milwaukee Tool ${i + 1}`,
        price: 2,
        quantity: 1,
        mode: 'auction' as const,
      })),
      {
        id: 'ratchet-kit',
        title: '2457-21 M12 Ratchet Kit',
        price: 169,
        quantity: 1,
        mode: 'auction',
      },
    ];
    const toolHits = score(toolsShop, { sold: toolSold, showType: 'tools', meltOf: () => null });
    expect(toolHits.map((h) => h.id)).toEqual(['ratchet-kit']);
    expect(toolHits[0]).toMatchObject({ kind: 'deal', price: 169, mode: 'auction' });
  });

  it('converts a CA$20 row with est. $14.34 at $14.34 and skips a CAD row with no rate', () => {
    const sales = [sold('1921 Morgan dollar', 30), sold('1921 Morgan dollar', 32, 2)];
    const parsed = parseShopListings({
      data: {
        liveShop: {
          edges: [
            {
              node: {
                id: 'cad-with-est',
                title: '1921 Morgan dollar',
                transactionType: 'BUY_IT_NOW',
                status: 'ACTIVE',
                quantity: 1,
                price: { amount: 2000, currency: 'CAD' },
                priceText: 'CA$20.00 (est. $14.34)',
              },
            },
            {
              node: {
                id: 'cad-no-rate',
                title: '1921 Morgan dollar',
                transactionType: 'BUY_IT_NOW',
                status: 'ACTIVE',
                quantity: 1,
                price: { amount: 1500, currency: 'CAD' },
              },
            },
          ],
        },
      },
    });
    expect(parsed[0]).toMatchObject({ id: 'cad-with-est', price: 20, currency: 'CAD', usdPrice: 14.34 });
    expect(parsed[1]).toMatchObject({ id: 'cad-no-rate', price: 15, currency: 'CAD' });

    const hits = score(parsed, { sold: sales, meltOf: () => null, currencyRate: null });
    expect(hits.map((h) => h.id)).toEqual(['cad-with-est']);
    expect(hits[0]).toMatchObject({ id: 'cad-with-est', kind: 'steal', price: 14.34 });
  });

  it('inspects subtitles for melt, watchlist, comps, key dates, and device/tool notes, and tags chat wants', () => {
    const ring: ShopListing = {
      id: 'ring-1',
      title: 'Vintage Estate Ring',
      subtitle: '14K Yellow Gold 5.2 grams',
      price: 150,
      quantity: 1,
      mode: 'bin',
    };
    const ringMelt = shopMelt(ring, { gold: 3110.35, silver: null });
    expect(ringMelt).toBeGreaterThan(250);
    const ringHits = score([ring], { meltOf: (item) => shopMelt(item, { gold: 3110.35, silver: null }) });
    expect(ringHits[0]).toMatchObject({ id: 'ring-1', kind: 'steal' });

    const subKey: ShopListing = {
      id: 'coin-sub',
      title: 'Slabbed Silver Dollar Lot #4',
      subtitle: '1879-CC Morgan Dollar NGC VF25',
      price: 250,
      quantity: 1,
      mode: 'bin',
    };
    const keyHits = score([subKey], { meltOf: () => null });
    expect(keyHits[0]).toMatchObject({ id: 'coin-sub', kind: 'must' });
    expect(keyHits[0]!.reason).toContain('Semi-key date');

    const toolListing: ShopListing = {
      id: 'tool-1',
      title: 'Milwaukee 2767-20 M18 Fuel High Torque Impact Wrench',
      subtitle: 'Bare tool only, no battery or charger included',
      price: 95,
      quantity: 1,
      mode: 'bin',
    };
    const toolSales: SoldItem[] = [
      { ...sold('Milwaukee 2767-20 M18 Fuel Impact Wrench', 180), showType: 'tools' },
      { ...sold('Milwaukee 2767-20 High Torque Impact Wrench', 190, 2), showType: 'tools' },
    ];
    const toolHits = score([toolListing], {
      sold: toolSales,
      showType: 'tools',
      meltOf: () => null,
      chatWants: ['any 2767-20 impact?'],
    });
    expect(toolHits[0]).toMatchObject({ id: 'tool-1', kind: 'steal' });
    expect(toolHits[0]!.reason).toContain('tool-only');
    expect(toolHits[0]!.reason).toContain('Matches chat want');
  });

  it('re-scores must hits when PCGS returns an auction median and keeps Guide-only hits as must', () => {
    const keyQuarter = list('1932 S Washington Silver Quarter Coin Key Date (A) Good!', 60);
    const initial = score([keyQuarter], { meltOf: () => null });
    expect(initial[0]).toMatchObject({ kind: 'must', price: 60 });

    // Auction median $120 -> $60 <= $72 (60%) promotes to steal
    const stealPromoted = applyShopWorth(initial, new Map([['5792:4', 'Market $120 (PCGS G-4)']]), { maxBidPercent: 80 });
    expect(stealPromoted[0]).toMatchObject({ kind: 'steal', price: 60 });
    expect(stealPromoted[0]!.reason).toContain('Market $120 (PCGS G-4)');

    // Auction median $80 -> $60 <= $64 (80% maxBidPercent) promotes to deal
    const dealPromoted = applyShopWorth(initial, new Map([['5792:4', 'Market $80 (PCGS G-4)']]), { maxBidPercent: 80 });
    expect(dealPromoted[0]).toMatchObject({ kind: 'deal', price: 60 });
    expect(dealPromoted[0]!.reason).toContain('Market $80 (PCGS G-4)');

    // Guide $120 alone does not promote to steal/deal
    const guideKept = applyShopWorth(initial, new Map([['5792:4', 'Guide $120 (PCGS G-4)']]), { maxBidPercent: 80 });
    expect(guideKept[0]).toMatchObject({ kind: 'must', price: 60 });
    expect(guideKept[0]!.reason).toContain('Guide $120 (PCGS G-4)');

    // Overpriced (> 1.25x Market) non-watchlist must hit is dropped, unless watched
    const overpriced = score([list('1932 S Washington Silver Quarter Coin Key Date (A) Good!', 160)], { meltOf: () => null });
    expect(applyShopWorth(overpriced, new Map([['5792:4', 'Market $120 (PCGS G-4)']]), { maxBidPercent: 80 })).toEqual([]);
    const watchedKeep = applyShopWorth(overpriced, new Map([['5792:4', 'Market $120 (PCGS G-4)']]), {
      maxBidPercent: 80,
      watchlist: [parseWatchLine('1932 s washington')!],
    });
    expect(watchedKeep).toHaveLength(1);
  });

  it('scores against all-in landed cost and appends shipping, flip profit, and coupon callouts', () => {
    const round = list('1 oz silver round', 26);
    // Melt is $30. Without shipping ($26 < $30) it is a steal.
    // With $5 shipping and no prior win, landed cost is $31 > $30, so NOT a steal!
    const withUnpaidShipping = score([round], {
      shipping: 5,
      hasWinThisShow: false,
    });
    expect(withUnpaidShipping).toEqual([]);

    // Once the buyer has a win in this show, incremental shipping is $0 (Combined shipping) -> steal!
    const withCombinedShipping = score([round], {
      shipping: 5,
      hasWinThisShow: true,
    });
    expect(withCombinedShipping).toHaveLength(1);
    expect(withCombinedShipping[0]).toMatchObject({ kind: 'steal', price: 26 });
    expect(withCombinedShipping[0]!.reason).toContain('Combined shipping');

    // Deeper discount ($15 + $4 shipping = $19 landed vs $30 melt) -> steal with All-in $19, Flip +$X, and Coupon
    const deepSteal = score([list('1 oz silver round', 15)], {
      shipping: 4,
      hasWinThisShow: false,
      feePercent: 11,
      coupons: ['SILVER5'],
    });
    expect(deepSteal[0]).toMatchObject({ kind: 'steal', price: 15 });
    expect(deepSteal[0]!.reason).toContain('All-in $19');
    expect(deepSteal[0]!.reason).toContain('Flip +$');
    expect(deepSteal[0]!.reason).toContain('Coupon SILVER5');
  });

  it('surfaces missing set coins from collection as must-haves and tags owned items', () => {
    const collection = {
      owned: ['1921 Peace Dollar'],
      sets: [parseSetLine('peace dollar 1921-1935')!],
    };
    const needed = list('1926-S Peace Silver Dollar BU', 45);
    const owned = list('1 oz silver round', 20);
    const hits = score([needed, owned], {
      collection,
      ownedTitles: ['1 oz silver round'],
    });
    const neededHit = hits.find((h) => h.title.includes('1926-S'))!;
    expect(neededHit).toMatchObject({ kind: 'must', price: 45 });
    expect(neededHit.reason).toContain('Needed for your set: peace dollar 1921-1935 (you have 1 dates)');

    const ownedHit = hits.find((h) => h.title === '1 oz silver round')!;
    expect(ownedHit).toMatchObject({ kind: 'steal', price: 20 });
    expect(ownedHit.reason).toContain('You own 1 like this');
  });

  it('extracts and applies TCG card, stated PSA cert, and vinyl reference prices without guessing certs', () => {
    const zard: ShopListing = { id: 'zard', title: 'Charizard 4/102 Base Set Holo', price: 120, quantity: 1, mode: 'bin' };
    const pikachuRange: ShopListing = { id: 'pika', title: 'Pikachu 58/102 Base Set', price: 5, quantity: 1, mode: 'bin' };
    const psaSlab: ShopListing = { id: 'psa', title: '1986 Fleer Michael Jordan PSA 9 Cert #12345678', price: 500, quantity: 1, mode: 'bin' };
    const vinyl: ShopListing = { id: 'lp', title: 'Fleetwood Mac - Rumours LP Vinyl 1977', price: 18, quantity: 1, mode: 'bin' };
    const plainCoin: ShopListing = { id: 'coin', title: '1921 Morgan Silver Dollar', price: 30, quantity: 1, mode: 'bin' };

    expect(extractShopRefQuery(zard, 'cards')).toEqual({
      item_name: zard.title,
      item_type: 'trading_card',
      is_slabbed: false,
      card: { game: 'pokemon', name: 'Charizard', number: '4/102', set: 'Base Set' },
    });
    expect(extractShopRefQuery(psaSlab, 'cards')).toEqual({
      item_name: psaSlab.title,
      item_type: 'trading_card',
      is_slabbed: true,
      grading_service: 'PSA',
      cert_number: '12345678',
      year: 1986,
    });
    expect(extractShopRefQuery(vinyl, 'general')).toEqual({
      item_name: vinyl.title,
      item_type: 'vinyl_media',
    });
    expect(extractShopRefQuery(plainCoin, 'coins')).toBeNull();

    const refs = new Map<string, RefPrice[]>([
      ['zard', [{ source: 'pokemontcg', name: 'Charizard 4/102', value: 250, kind: 'market', detail: 'Holofoil', link: null }]],
      ['pika', [{ source: 'pokemontcg', name: 'Pikachu 58/102', value: 2, high: 18, kind: 'range', detail: '3 printings', link: null }]],
      ['psa', [{ source: 'psa', name: '1986 Fleer Jordan PSA 8', value: null, kind: 'verified', detail: 'PSA 8', link: null, mismatch: true }]],
      ['lp', [{ source: 'discogs', name: 'Fleetwood Mac - Rumours', value: 25, kind: 'listed', detail: '1977 US LP', link: null }]],
    ]);

    // Pre-existing hit for pikachu and lp so we can verify note attachment without false promotion
    const baseHits = [
      { id: 'pika', title: pikachuRange.title, price: 5, quantity: 1, mode: 'bin' as const, kind: 'must' as const, reason: 'Watchlist' },
      { id: 'lp', title: vinyl.title, price: 18, quantity: 1, mode: 'bin' as const, kind: 'deal' as const, reason: 'Watchlist max $20' },
    ];
    const enriched = applyShopRefs([zard, pikachuRange, psaSlab, vinyl], baseHits, refs, { maxBidPercent: 80 });
    const zardHit = enriched.find((h) => h.id === 'zard')!;
    expect(zardHit).toMatchObject({ kind: 'steal', price: 120 });
    expect(zardHit.reason).toContain('Market $250 (pokemontcg)');

    const pikaHit = enriched.find((h) => h.id === 'pika')!;
    expect(pikaHit.kind).toBe('must');
    expect(pikaHit.reason).toContain('Prints $2–$18 (pokemontcg)');

    const psaHit = enriched.find((h) => h.id === 'psa')!;
    expect(psaHit.kind).toBe('must');
    expect(psaHit.reason).toContain('PSA cert mismatch');

    const lpHit = enriched.find((h) => h.id === 'lp')!;
    expect(lpHit.reason).toContain('Discogs listed from $25');
  });

  it('always leads a must-have with a market price, or says none is known yet', () => {
    // No sales, no melt: the gap is shown, not hidden.
    const bare = score([list('1909-S VDB Lincoln cent', 40)], { meltOf: () => null })[0]!;
    expect(bare.kind).toBe('must');
    expect(bare.reason.startsWith(`${NO_MARKET_LINE}.`)).toBe(true);
    expect(hasPriceLine(bare.reason)).toBe(false);

    // Two watched sales above the price: their median is the market price.
    const sales = [sold('1909-S VDB Lincoln cent', 50), sold('1909-S VDB Lincoln cent', 60, 2)];
    const comped = score([list('1909-S VDB Lincoln cent', 48)], { sold: sales, meltOf: () => null })[0]!;
    expect(comped.kind).toBe('must');
    expect(comped.reason.startsWith('Market $55 (median of 2 sales)')).toBe(true);
    expect(comped.reason).not.toContain(NO_MARKET_LINE);

    // Melt is a floor, not a market price: shown next to the placeholder, never instead of it.
    const silver = score([list('1879-CC Morgan dollar', 240)])[0]!;
    expect(silver.kind).toBe('must');
    expect(silver.reason.startsWith(`${NO_MARKET_LINE}. Melt $`)).toBe(true);

    // PCGS guide replaces the placeholder.
    const quarter = score([list('1932 S Washington Silver Quarter Coin Key Date 408k MINTED~! (A) Good!', 79)]);
    const worth = applyShopWorth(quarter, new Map([['5792:4', 'Guide $110 (PCGS G-4)']]));
    expect(worth[0]!.reason.startsWith('Guide $110 (PCGS G-4).')).toBe(true);
    expect(worth[0]!.reason).not.toContain(NO_MARKET_LINE);

    // A local AI range replaces the placeholder.
    const items = [list('1879-CC Morgan dollar', 240)];
    const initial = score(items);
    const ai = applyShopAi(items, initial, [{ id: '1879-CC Morgan dollar', low: 220, high: 350, info: '' }]);
    expect(ai[0]!.reason.startsWith('AI est. $220–$350.')).toBe(true);
    expect(ai[0]!.reason).not.toContain(NO_MARKET_LINE);

    // A card market price replaces it; a range is a price; a PSA check alone is not.
    const card: ShopListing = { id: 'zard', title: 'Charizard 4/102 Base Set Holo', price: 240, quantity: 1, mode: 'bin' };
    const mustCard = { id: 'zard', title: card.title, price: 240, quantity: 1, mode: 'bin' as const, kind: 'must' as const, reason: `${NO_MARKET_LINE}. On your watchlist` };
    const market = applyShopRefs([card], [mustCard], new Map<string, RefPrice[]>([
      ['zard', [{ source: 'pokemontcg', name: 'Charizard 4/102', value: 250, kind: 'market', detail: 'Holofoil', link: null }]],
    ]));
    expect(market[0]).toMatchObject({ kind: 'must' });
    expect(market[0]!.reason).toBe('Market $250 (pokemontcg). On your watchlist');
    const verified = applyShopRefs([card], [mustCard], new Map<string, RefPrice[]>([
      ['zard', [{ source: 'psa', name: 'Charizard PSA 9', value: null, kind: 'verified', detail: 'PSA 9', link: null }]],
    ]));
    expect(verified[0]!.reason.startsWith(`${NO_MARKET_LINE}. PSA verified`)).toBe(true);

    // Steals and deals never carry the placeholder.
    const steal = score([list('1 oz silver round', 20)])[0]!;
    expect(steal.kind).toBe('steal');
    expect(steal.reason).not.toContain(NO_MARKET_LINE);
    expect(ensureMustPrice(steal)).toBe(steal);
  });

  it('computes monitor shop badges for steals and deals', () => {
    expect(
      monitorShopBadge({
        status: 'ready',
        hits: [
          { id: '1', title: 'Round', price: 20, quantity: 1, kind: 'steal', reason: 'Under melt' },
          { id: '2', title: 'Bar', price: 22, quantity: 1, kind: 'steal', reason: 'Under melt' },
          { id: '3', title: 'Eagle', price: 25, quantity: 1, kind: 'deal', reason: 'Under comps' },
        ],
      }),
    ).toEqual({ text: '2 shop steals (from $20)', kind: 'steal' });
    expect(
      monitorShopBadge({
        status: 'ready',
        hits: [{ id: '3', title: 'Eagle', price: 25, quantity: 1, kind: 'deal', reason: 'Under comps' }],
      }),
    ).toEqual({ text: 'Shop deal: Eagle $25', kind: 'deal' });
    expect(
      monitorShopBadge({
        status: 'ready',
        hits: [{ id: '4', title: 'Key date', price: 75, quantity: 1, kind: 'must', reason: 'Key date' }],
      }),
    ).toBeNull();
    expect(monitorShopBadge(undefined)).toBeNull();
  });
});

describe('shop query text', () => {
  const source = `var q="query ProfileShop($id:ID!){shop{title}}";query LiveShopFeed($livestreamId:ID!,$first:Int,$after:String){liveShop(livestreamId:$livestreamId){edges{node{id title transactionType price{amount}}}}}`;

  it('picks the live shop query and skips the profile shop', () => {
    const found = extractShopQuery(source);
    expect(found?.operation).toBe('LiveShopFeed');
    expect(found?.query).toContain('transactionType');
    expect(isShopOperation('LiveShopFeed')).toBe(true);
    expect(isShopOperation('ProfileShop')).toBe(false);
  });

  it('fills the live id and cursor and keeps the page size it already used', () => {
    const query = extractShopQuery(source)!.query;
    expect(shopVariables(query, 'show-1', 'c2')).toMatchObject({ livestreamId: 'show-1', first: 24, after: 'c2' });
    expect(shopVariablesFrom(query, { first: 10, filters: null }, 'show-1', null)).toMatchObject({
      livestreamId: 'show-1',
      first: 10,
      after: null,
      filters: null,
    });
  });

  it('supports progressive scanning status and formats shop summary', () => {
    expect(shopSummary({ status: 'scanning', binCount: 150, auctionCount: 0 })).toBe(
      'Scanning shop… 150 buy-it-now items checked.',
    );
    expect(shopSummary({ status: 'scanning', binCount: 220, auctionCount: 10 })).toBe(
      'Scanning shop… 220 items checked.',
    );
    expect(shopSummary({ status: 'ready', binCount: 1500, auctionCount: 0 })).toBe(
      'Checked 1500 buy-it-now items.',
    );
  });

  it('parses large shop inventories beyond 400 listings and handles fallback buyNowPrice', () => {
    const manyListings = Array.from({ length: 600 }, (_, i) => ({
      node: {
        id: `item-${i}`,
        title: `Silver Coin #${i}`,
        buyNowPrice: 25,
        quantity: 1,
      },
    }));
    const parsed = parseShopListings({ data: { liveShop: { edges: manyListings } } });
    expect(parsed.length).toBe(600);
    expect(parsed[0]).toMatchObject({ id: 'item-0', title: 'Silver Coin #0', price: 25, mode: 'bin' });
    expect(MAX_LISTINGS).toBeGreaterThanOrEqual(3000);
  });

  it('evaluates listing spread and flags deals and overpriced listings', () => {
    // Deal: asking $40, market $65 -> delta +$25 (+63% deal)
    const deal = evaluateListingSpread('item-1', 40, 65, 'fmv');
    expect(deal.delta).toBe(25);
    expect(deal.marginPercent).toBe(63);
    expect(deal.isDeal).toBe(true);
    expect(deal.isOverpriced).toBe(false);
    expect(formatListingSpread(deal)).toContain('Val: $65');
    expect(formatListingSpread(deal)).toContain('+$25 (+63% Deal)');

    // Overpriced: asking $50, market $28 -> delta -$22 (-44% overpriced)
    const overpriced = evaluateListingSpread('item-2', 50, 28, 'ebay');
    expect(overpriced.delta).toBe(-22);
    expect(overpriced.marginPercent).toBe(-44);
    expect(overpriced.isDeal).toBe(false);
    expect(overpriced.isOverpriced).toBe(true);
    expect(formatListingSpread(overpriced)).toContain('-$22 (-44% Overpriced)');

    // Fair: asking $50, market $52 -> +$2 (+4%), neither deal nor overpriced
    const fair = evaluateListingSpread('item-3', 50, 52, 'melt');
    expect(fair.isDeal).toBe(false);
    expect(fair.isOverpriced).toBe(false);
  });
});
