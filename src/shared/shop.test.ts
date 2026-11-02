import { describe, expect, it } from 'vitest';
import { parseWatchLine } from './buyer';
import type { SoldItem } from './soldHistory';
import {
  applyShopWorth,
  extractShopQuery,
  isShopOperation,
  parseShopListings,
  readShopPage,
  scoreShop,
  shopCursor,
  shopMelt,
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

  it('keeps buy-it-now and skips auctions, giveaways, sold, and pre-bids', () => {
    expect(parseShopListings(body)).toEqual([{ id: '1 oz silver round', title: '1 oz silver round', price: 25, quantity: 1 }]);
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

  it('treats 1/1000 oz as a thousandth of an ounce', () => {
    const spot = { gold: 3964.2, silver: null };
    const title = '1/1000 oz 24K Gold 250th Anniversary Collectiable Gold Card';
    expect(shopMelt(list(title, 36), spot)).toBeCloseTo(3.9642);
    expect(score([list(title, 36)], { meltOf: (item) => shopMelt(item, spot) })).toEqual([]);
    expect(score([list(title, 1)], { meltOf: (item) => shopMelt(item, spot) })[0]).toMatchObject({ kind: 'steal', price: 1 });
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

  it('flags a watchlist price as a deal and a key date as a must-have', () => {
    const watch = score([list('1921 Morgan dollar', 25)], {
      watchlist: [parseWatchLine('morgan $30')!],
      meltOf: () => null,
    });
    expect(watch[0]).toMatchObject({ kind: 'deal' });
    const key = score([list('1909-S VDB Lincoln cent', 40)], { meltOf: () => null });
    expect(key[0]).toMatchObject({ kind: 'must' });
    expect(key[0]!.reason).toContain('Key date');
    const overMax = score([list('1921 Morgan dollar', 80)], {
      watchlist: [parseWatchLine('morgan $30')!],
      meltOf: () => null,
    });
    expect(overMax).toEqual([]);
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

  it('does not call a key date a must-have when watched sales are cheaper', () => {
    const sales = [sold('1909-S VDB Lincoln cent', 30), sold('1909-S VDB Lincoln cent', 32, 2)];
    expect(score([list('1909-S VDB Lincoln cent', 80)], { sold: sales, meltOf: () => null })).toEqual([]);
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
});
