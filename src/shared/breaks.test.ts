import { describe, expect, it } from 'vitest';
import {
  isHiddenPrize,
  isHiddenSpot,
  mergeWheel,
  prizeStem,
  soldHiddenCount,
  parseBreakResponse,
  pendingSpins,
  prizeDetail,
  prizeKey,
  prizeQuantity,
  prizeValueKey,
  spotsLeft,
  wheelTitleKey,
  wheelValueKey,
} from './breaks';
import { decodePhoenixFrame, emptySession, reduceGraphql, reduceSocket } from './live';

// Trimmed from a live Mystery break (nvcoin, Oct 2026).
const option = (id: string, title: string, description: string, available = true) => ({ node: { id, title, available, description } });
const breakBody = (hasNextPage = false) => ({
  data: {
    getBreak: {
      id: '5921155',
      title: 'MORNING GOLD RUSH! NUGGETS AND OTHER GOLD HITS',
      format: 'MYSTERY',
      status: 'filling',
      soldSpotCount: 25,
      totalBreakSpots: 500,
      paginatedSpotOptions: {
        pageInfo: { hasNextPage },
        edges: [
          option('356360580', 'INDIAN HEAD CENT GENUINE ICG CERT', 'FAIR\nQty: 311'),
          option('356362856', 'COSMIC VAULT SERIES 9 LUCKYRIPS RIP/SHIP', 'Qty: 8'),
          option('356363978', '1.51 GRAMS GOLD NUGGETS UNVAULTED', 'FAIR'),
          option('356360700', 'INDIAN HEAD CENT GENUINE ICG CERT', 'FAIR', false),
        ],
      },
    },
  },
});

const auctionEnded = JSON.stringify([
  '6',
  null,
  'commerce:show1',
  'auction_ended',
  {
    product: {
      listingId: '2500258702',
      breakInfo: { breakFormat: 'MYSTERY', breakId: 5921155, breakSpotId: 224131733 },
      nextBidCents: 9900,
      nextBidPrice: { amount: 9900, currency: 'USD' },
      bidCount: 0,
      name: 'MORNING GOLD RUSH! NUGGETS AND OTHER GOLD HITS - #26',
      status: 'ACTIVE',
      isBreakSpot: true,
      auctionEndTime: 1793127856160,
      productId: '648076394',
    },
  },
]);

describe('hidden prizes', () => {
  it('spots prizes named only by an envelope or bag number', () => {
    // From a live envelope wheel (jesusmac09032, Oct 2026).
    for (const t of ['ENVELOPE #2', 'Envelope 12', 'ENVELOPES', 'LOPE 3', 'lopes #4', 'ENV #5', 'MYSTERY ENVELOPE #1', 'Gold Envelope A', 'MYSTERY BAG #1', 'Top Prize 2', 'BIG WIN #1']) {
      expect(isHiddenPrize(t), t).toBe(true);
    }
    for (const t of ['BUFFALO NICKEL RANDOM YEAR ', 'VAULTBOX SELECT BOX RIP/SHIP', 'NOAHS ARK 1OZ GOLD CHASE BREAKMINT RIP/SHIP', '1 Kilo Silver Bar', 'Envelope of Wheat Pennies', 'Proof Quarter', 'Family Pack #7']) {
      expect(isHiddenPrize(t), t).toBe(false);
    }
  });

  it('treats a prize as hidden when the detail is the envelope, and matches sold hits by stem', () => {
    expect(isHiddenSpot({ title: 'Family Pack #7', detail: 'Envelope' })).toBe(true);
    expect(isHiddenSpot({ title: 'Proof Quarter', detail: '' })).toBe(false);
    expect(prizeStem('🔥 Family Pack #3')).toBe(prizeStem('Family Pack #7'));
    expect(prizeStem('ENVELOPE #12')).toBe('envelope');
    const b = parseBreakResponse(breakBody(), 1000)!;
    const hidden = {
      ...b,
      prizes: [
        { id: '1', title: 'Family Pack #7', detail: 'Envelope', left: 2 },
        { id: '2', title: 'Proof Quarter', detail: '', left: 1 },
      ],
      hits: [
        { spotId: 's1', title: '🎉 Family Pack #1', buyer: 'a', price: 9, pending: false, seenAt: 1 },
        { spotId: 's2', title: 'Proof Quarter', buyer: 'b', price: 8, pending: false, seenAt: 1 },
      ],
      soldHasMore: false,
    };
    expect(soldHiddenCount(hidden)).toBe(1);
    expect(soldHiddenCount({ ...hidden, soldHasMore: true })).toBeNull();
  });

  it('keys hidden prizes to their wheel and leaves named prizes shared across shows', () => {
    expect(wheelValueKey('b1', { title: 'ENVELOPE #2', detail: 'GOOD' })).toBe('b1#envelope #2 | good');
    expect(wheelTitleKey('b1', 'ENVELOPE #2')).toBe('b1#envelope #2');
    expect(wheelValueKey('b1', { title: 'Wheat Penny', detail: '' })).toBe('wheat penny');
    expect(wheelTitleKey('b1', 'Wheat Penny')).toBe('wheat penny');
  });
});

describe('parseBreakResponse', () => {
  it('reads available prizes and their remaining counts', () => {
    const b = parseBreakResponse(breakBody(), 1000);
    expect(b).toMatchObject({ id: '5921155', format: 'MYSTERY', sold: 25, total: 500, complete: true, fetchedAt: 1000 });
    expect(b?.prizes).toEqual([
      { id: '356360580', title: 'INDIAN HEAD CENT GENUINE ICG CERT', detail: 'FAIR', left: 311 },
      { id: '356362856', title: 'COSMIC VAULT SERIES 9 LUCKYRIPS RIP/SHIP', detail: '', left: 8 },
      { id: '356363978', title: '1.51 GRAMS GOLD NUGGETS UNVAULTED', detail: 'FAIR', left: 1 },
    ]);
    expect(spotsLeft(b!)).toBe(475);
  });

  it('flags a partial prize list and ignores responses without one', () => {
    expect(parseBreakResponse(breakBody(true))?.complete).toBe(false);
    expect(parseBreakResponse({ data: { getBreak: { id: '5921155', paginatedSpots: { edges: [] } } } })).toBeNull();
    expect(parseBreakResponse({ data: { getBreak: null } })).toBeNull();
  });

  it('parses quantities and normalizes prize keys', () => {
    expect(prizeQuantity('FAIR\nQty: 19')).toBe(19);
    expect(prizeQuantity(null)).toBe(1);
    expect(prizeKey('  Indian Head   CENT ')).toBe('indian head cent');
  });
});

describe('spin history', () => {
  const withSold = (nodes: { id: string; title: string; buyer: string; cents: number }[], endCursor: string | null, hasNextPage = false) => {
    const body = breakBody();
    return {
      data: {
        getBreak: {
          ...body.data.getBreak,
          soldSpots: {
            pageInfo: { hasNextPage, endCursor },
            edges: nodes.map((n) => ({ node: { id: n.id, title: n.title, buyer: { username: n.buyer }, listing: { price: { amount: n.cents } } } })),
          },
        },
      },
    };
  };

  it('reads each spin and appends only new ones on refresh', () => {
    const first = parseBreakResponse(
      withSold(
        [
          { id: 's1', title: 'INDIAN HEAD CENT GENUINE ICG CERT', buyer: 'rome4buds', cents: 9405 },
          { id: 's2', title: 'COSMIC VAULT SERIES 9 LUCKYRIPS RIP/SHIP', buyer: 'rome4buds', cents: 9405 },
        ],
        'YXJyYXljb25uZWN0aW9uOjE=',
        true,
      ),
      1,
    )!;
    expect(first.hits).toEqual([
      { spotId: 's1', title: 'INDIAN HEAD CENT GENUINE ICG CERT', buyer: 'rome4buds', price: 94.05, pending: false, seenAt: 1 },
      { spotId: 's2', title: 'COSMIC VAULT SERIES 9 LUCKYRIPS RIP/SHIP', buyer: 'rome4buds', price: 94.05, pending: false, seenAt: 1 },
    ]);
    expect(first).toMatchObject({ soldCursor: 'YXJyYXljb25uZWN0aW9uOjE=', soldHasMore: true });

    const later = parseBreakResponse(withSold([{ id: 's3', title: 'INDIAN HEAD CENT GENUINE ICG CERT', buyer: 'jamesauag', cents: 9900 }], null), 2)!;
    const merged = mergeWheel(mergeWheel(null, first), later);
    expect(merged.hits?.map((h) => h.spotId)).toEqual(['s1', 's2', 's3']);
    expect(merged.soldCursor).toBe('YXJyYXljb25uZWN0aW9uOjE=');
    expect(merged.soldHasMore).toBe(false);
  });

  it('rereads a spin that sold before it was randomized, then fills in its prize', () => {
    const cursor = (i: number) => btoa(`arrayconnection:${i}`);
    const first = mergeWheel(
      null,
      parseBreakResponse(
        withSold(
          [
            { id: 's1', title: 'INDIAN HEAD CENT GENUINE ICG CERT', buyer: 'a', cents: 9900 },
            { id: 's2', title: '#28', buyer: 'b', cents: 9900 },
          ],
          cursor(1),
        ),
        1,
      )!,
    );
    expect(first.hits?.[1]).toMatchObject({ pending: true });
    expect(pendingSpins(first)).toBe(1);
    // The next read starts right after s1 so s2 comes back.
    expect(first.soldCursor).toBe(cursor(0));
    const resolved = mergeWheel(first, parseBreakResponse(withSold([{ id: 's2', title: 'COSMIC VAULT SERIES 9 LUCKYRIPS RIP/SHIP', buyer: 'b', cents: 9900 }], cursor(1)), 2)!);
    expect(resolved.hits?.map((h) => [h.spotId, h.title, h.pending, h.seenAt])).toEqual([
      ['s1', 'INDIAN HEAD CENT GENUINE ICG CERT', false, 1],
      ['s2', 'COSMIC VAULT SERIES 9 LUCKYRIPS RIP/SHIP', false, 1],
    ]);
    expect(resolved.soldCursor).toBe(cursor(1));
  });

  it('keeps condition separate from quantity and remembers every condition a title had', () => {
    expect(prizeDetail('Good - Extremely Fine\nQty: 50')).toBe('Good - Extremely Fine');
    expect(prizeDetail('Qty: 8')).toBe('');
    expect(prizeValueKey({ title: 'Morgan Dollar', detail: 'Uncirculated - Mint' })).toBe('morgan dollar | uncirculated - mint');
    const body = breakBody();
    body.data.getBreak.paginatedSpotOptions.edges = [option('1', 'Morgan Dollar', 'Good - Extremely Fine\nQty: 50'), option('2', 'Morgan Dollar', 'Uncirculated - Mint\nQty: 5')];
    const w = mergeWheel(null, parseBreakResponse(body)!);
    expect(w.titleKeys['morgan dollar']).toEqual(['morgan dollar | good - extremely fine', 'morgan dollar | uncirculated - mint']);
  });

  it('keeps known spins when a response has no sold spots, and starts over for a new wheel', () => {
    const known = mergeWheel(null, parseBreakResponse(withSold([{ id: 's1', title: 'A', buyer: 'x', cents: 100 }], 'c1'))!);
    expect(mergeWheel(known, parseBreakResponse(breakBody())!).hits).toHaveLength(1);
    const other = parseBreakResponse({ data: { getBreak: { ...withSold([], null).data.getBreak, id: '999' } } })!;
    expect(mergeWheel(known, other).hits).toEqual([]);
  });
});

describe('wheel in the live session', () => {
  it('picks up the break and spin price from the auction socket', () => {
    const { session } = reduceSocket(emptySession('show1'), decodePhoenixFrame(auctionEnded)!, 5);
    expect(session.breakId).toBe('5921155');
    expect(session.lot).toMatchObject({ breakId: '5921155', nextBid: 99, title: 'MORNING GOLD RUSH! NUGGETS AND OTHER GOLD HITS - #26' });
  });

  it('stores a full prize list but never lets a partial page replace it', () => {
    const base = { ...emptySession('show1'), breakId: '5921155' };
    const full = reduceGraphql(base, 'QueryBreak', breakBody(), 1);
    expect(full.wheel?.prizes).toHaveLength(3);
    const partial = reduceGraphql(full, 'QueryBreak', breakBody(true), 2);
    expect(partial.wheel?.fetchedAt).toBe(1);
    expect(reduceGraphql({ ...base, breakId: '999' }, 'QueryBreak', breakBody(), 3).wheel).toBeNull();
  });

  it('appends the next prize page from our own fetch and clears the partial warning', () => {
    const page = (titles: string[], hasNextPage: boolean, endCursor: string | null) => {
      const body = breakBody(hasNextPage);
      const info = body.data.getBreak.paginatedSpotOptions.pageInfo as { hasNextPage: boolean; endCursor?: string | null };
      info.hasNextPage = hasNextPage;
      info.endCursor = endCursor;
      body.data.getBreak.paginatedSpotOptions.edges = titles.map((title) => option(title, title, 'Qty: 1'));
      return body;
    };
    const base = { ...emptySession('show1'), breakId: '5921155' };
    const first = reduceGraphql(base, 'QueryBreak', page(['Family Pack #1', 'Family Pack #2'], true, 'cursor-1'), 1, null);
    expect(first.wheel?.complete).toBe(false);
    expect(first.wheel?.prizesCursor).toBe('cursor-1');
    const second = reduceGraphql(first, 'QueryBreak', page(['Family Pack #3'], false, 'cursor-2'), 2, 'cursor-1');
    expect(second.wheel?.prizes.map((p) => p.title)).toEqual(['Family Pack #1', 'Family Pack #2', 'Family Pack #3']);
    expect(second.wheel?.complete).toBe(true);
  });
});
