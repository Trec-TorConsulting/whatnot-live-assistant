import { describe, expect, it } from 'vitest';
import {
  decodePhoenixFrame,
  emptySession,
  isNewLot,
  noteElectronicsName,
  noteEstateName,
  readCategories,
  readCommerce,
  reduceGraphql,
  reduceSocket,
  saleFromChat,
  sessionForPath,
  summarizeSales,
  type LiveSession,
  type Sale,
} from './live';
import { buildEstateView } from './estate';
import { moneyValue, parseMoneyText } from './money';

const LIVE = '0711ec47-add7-47f6-8480-048764724c9e';
const frame = (topic: string, event: string, payload: unknown) => JSON.stringify([null, null, topic, event, payload]);

const chatMsg = (id: string, username: string, message: string, extra: Record<string, unknown> = {}) => ({
  id,
  message,
  properties: {},
  taggedUsers: [],
  topic: `chat:${LIVE}`,
  type: null,
  user: { id: '1', isHost: false, isModerator: false, username },
  ...extra,
});

const apply = (session: LiveSession, raw: string, now = 1000) => {
  const msg = decodePhoenixFrame(raw);
  if (!msg) throw new Error('undecodable');
  return reduceSocket(session, msg, now);
};

describe('decodePhoenixFrame', () => {
  it('decodes v2 array frames', () => {
    expect(decodePhoenixFrame(frame(`chat:${LIVE}`, 'new_msg', { a: 1 }))).toEqual({
      topic: `chat:${LIVE}`,
      event: 'new_msg',
      payload: { a: 1 },
    });
  });

  it('decodes v1 object frames', () => {
    expect(decodePhoenixFrame(JSON.stringify({ topic: 'commerce:x', event: 'bid', payload: {}, ref: null }))?.event).toBe('bid');
  });

  it('drops heartbeats, replies, and junk', () => {
    expect(decodePhoenixFrame('[null,"7","phoenix","heartbeat",{}]')).toBeNull();
    expect(decodePhoenixFrame(frame(`chat:${LIVE}`, 'phx_reply', {}))).toBeNull();
    expect(decodePhoenixFrame('{"_type":"ping"}')).toBeNull();
    expect(decodePhoenixFrame('not json')).toBeNull();
  });
});

describe('reduceSocket: chat channel', () => {
  it('adds chat messages and signals only live ones', () => {
    let s = emptySession(LIVE);
    const backlog = apply(s, frame(`chat:${LIVE}`, 'latest_messages', { messages: [chatMsg('a', 'u1', 'hi'), chatMsg('b', 'u2', 'yo')] }));
    s = backlog.session;
    expect(s.chat.map((m) => m.text)).toEqual(['hi', 'yo']);
    expect(backlog.signals).toEqual([]);

    const live = apply(s, frame(`chat:${LIVE}`, 'new_msg', chatMsg('c', 'hedging_against_inflation', 'Hahahahha')));
    expect(live.signals).toEqual([{ kind: 'chat', message: expect.objectContaining({ user: 'hedging_against_inflation', text: 'Hahahahha' }) }]);
    expect(apply(live.session, frame(`chat:${LIVE}`, 'new_msg', chatMsg('c', 'x', 'dup'))).session.chat).toHaveLength(3);
  });

  it('leaves the wheel unchanged when chat says Unlocked Second cousin', () => {
    const s = emptySession(LIVE);
    const r = apply(s, frame(`chat:${LIVE}`, 'new_msg', chatMsg('u', 'host', 'Unlocked Second cousin')));
    expect(r.session.wheel).toBe(s.wheel);
    expect(r.session.chat.map((m) => m.text)).toEqual(['Unlocked Second cousin']);
    expect(r.signals).toEqual([{ kind: 'chat', message: expect.objectContaining({ text: 'Unlocked Second cousin' }) }]);
  });

  it('tracks show state from livestream_update and signals new giveaways after the baseline', () => {
    const update = (patch: Record<string, unknown>) =>
      frame(`chat:${LIVE}`, 'livestream_update', {
        id: LIVE,
        status: 'PLAYING',
        title: 'Coins lookin like mihhhlk!',
        hostUsername: 'traderbea',
        activeViewers: 970,
        shareCounts: 41,
        activeGiveawayLiveProductId: 'cb408740',
        pinnedProductId: null,
        startTime: 1793044268517,
        ...patch,
      });
    const first = apply(emptySession(LIVE), update({}));
    expect(first.session.show).toMatchObject({ host: 'traderbea', viewers: 970, shareCount: 41, activeGiveawayId: 'cb408740', status: 'PLAYING' });
    expect(first.signals).toEqual([]);

    const same = apply(first.session, update({ activeViewers: 980 }));
    expect(same.signals).toEqual([]);
    expect(same.session.show.viewers).toBe(980);

    const next = apply(same.session, update({ activeGiveawayLiveProductId: 'new-one' }));
    expect(next.signals).toEqual([{ kind: 'giveaway_started', giveawayId: 'new-one' }]);
    expect(next.session.giveaways.map((g) => g.id)).toEqual(['cb408740', 'new-one']);
  });

  it('reads wins announced by system chat lines', () => {
    const r = apply(emptySession(LIVE), frame(`chat:${LIVE}`, 'new_msg', chatMsg('d', 'whatnot', 'bob won 1964 Kennedy Half for $12!', { type: 'auction_won' })));
    expect(r.session.sales).toEqual([expect.objectContaining({ buyer: 'bob', title: '1964 Kennedy Half', price: 12, kind: 'auction' })]);
  });

  it('ignores user chat that only looks like a win', () => {
    const m = { id: 'x', user: 'troll', text: 'bob won 1964 Kennedy Half for $12!', isHost: false, isModerator: false, type: null, at: 0 };
    expect(saleFromChat(m, LIVE)).toBeNull();
  });
});

describe('reduceSocket: commerce channel', () => {
  it('builds the current lot from bid updates', () => {
    let s = emptySession(LIVE);
    s = apply(s, frame(`commerce:${LIVE}`, 'product_update', {
      product: { id: 'p1', title: '1921 Morgan Dollar', currentBid: { amount: 2500, currency: 'USD' }, currentBidCount: 3, currentBidUser: { username: 'stacker' }, endTime: 1793046600000 },
    })).session;
    expect(s.lot).toMatchObject({ id: 'p1', title: '1921 Morgan Dollar', currentBid: 25, bidCount: 3, leader: 'stacker', endsAt: 1793046600000, status: 'active' });

    s = apply(s, frame(`commerce:${LIVE}`, 'bid_placed', { productId: 'p1', currentBid: 27 })).session;
    expect(s.lot).toMatchObject({ title: '1921 Morgan Dollar', currentBid: 27 });
  });

  it('records a sale once and summarizes it', () => {
    let s = emptySession(LIVE);
    const sold = frame(`commerce:${LIVE}`, 'product_sold', { productId: 'p1', title: '1921 Morgan', soldPrice: 31, buyer: { username: 'stacker' } });
    const r = apply(s, sold);
    expect(r.signals.some((x) => x.kind === 'sale')).toBe(true);
    s = apply(r.session, sold).session;
    expect(s.sales).toHaveLength(1);
    expect(s.sales[0]).toMatchObject({ buyer: 'stacker', price: 31, kind: 'auction' });
  });

  it('detects giveaways from commerce events', () => {
    const r = apply(emptySession(LIVE), frame(`commerce:${LIVE}`, 'giveaway_started', { liveProductId: 'g1', title: 'Silver round' }));
    expect(r.signals).toContainEqual({ kind: 'giveaway_started', giveawayId: 'g1' });
  });

  // Shapes below are trimmed from logged-in frames captured on a live show (Oct 2026).
  it('uses the live product id for a real giveaway_started, once', () => {
    const started = frame(`auction:${LIVE}`, 'giveaway_started', {
      id: 'ccb39d22',
      product: { id: 'ccb39d22', productId: '648107851', listingId: '2498295534', name: 'NVCOIN SILVER GIVEAWAY!!! #60', status: 'ACTIVE' },
    });
    const r = apply(emptySession(LIVE), started);
    expect(r.signals.filter((s) => s.kind === 'giveaway_started')).toEqual([{ kind: 'giveaway_started', giveawayId: 'ccb39d22' }]);
    expect(r.session.giveaways.map((g) => g.id)).toEqual(['ccb39d22']);
  });

  it('records the winner of a real giveaway_won', () => {
    const won = frame(`auction:${LIVE}`, 'giveaway_won', {
      giveaway: { entryCount: 30, productId: '750da2d6' },
      giveawayEntries: ['smalltown67420', 'luckyd1101'],
      product: {
        id: '750da2d6',
        productId: '648107851',
        name: 'NVCOIN SILVER GIVEAWAY!!! #59',
        status: 'SOLD',
        transactionType: 'GIVEAWAY',
        soldPrice: { amount: 0, currency: 'USD' },
        purchaserUser: { id: '62767929', username: 'luckyd1101' },
      },
    });
    expect(apply(emptySession(LIVE), won).session.sales[0]).toMatchObject({ buyer: 'luckyd1101', price: 0, kind: 'giveaway' });
  });

  it('reads the bid and leader from a real new_bid', () => {
    const bid = frame(`commerce:${LIVE}`, 'new_bid', {
      highestBidder: { id: '13772886', username: 'jamesauag' },
      product: {
        id: '40a6ac5f',
        productId: '648076394',
        name: 'MORNING GOLD RUSH! - #26',
        bidCount: 1,
        nextBidCents: 10400,
        nextBidPrice: { amount: 10400, currency: 'USD' },
        auctionMinimumCents: 9900,
        auctionEndTime: 1793128359000,
        highestBid: { price: { amount: 9900, currency: 'USD' }, priceCents: 9900, user: { id: '13772886', username: 'jamesauag' } },
        status: 'ACTIVE',
      },
    });
    expect(apply(emptySession(LIVE), bid).session.lot).toMatchObject({ currentBid: 99, leader: 'jamesauag', bidCount: 1, nextBid: 104 });
  });

  it('keeps the live next bid when the parent listing reports its $1 default', () => {
    const child = frame(`commerce:${LIVE}`, 'auction_started', {
      product: { id: 'c1', productId: '648076394', name: 'Spot #26', nextBidPrice: { amount: 9900 }, auctionMinimumCents: 9900, status: 'ACTIVE' },
    });
    const parent = frame(`commerce:${LIVE}`, 'product_updated', {
      product: { id: 'p1', productId: '648076394', name: 'Spot #26', nextBidCents: null, auctionMinimumPrice: { amount: 100 }, status: 'ACTIVE' },
    });
    const s = apply(apply(emptySession(LIVE), child).session, parent).session;
    expect(s.lot?.nextBid).toBe(99);
  });

  it('starts a fresh lot on auction_started, even when the listing id repeats', () => {
    const bid = frame(`commerce:${LIVE}`, 'new_bid', {
      product: { id: 'a26', productId: '648076394', name: 'Spot #26', highestBid: { priceCents: 9900, user: { username: 'bob' } }, bidCount: 1, status: 'ACTIVE' },
    });
    const next = frame(`commerce:${LIVE}`, 'auction_started', {
      product: { id: 'a27', productId: '648076394', name: 'Spot #27', nextBidPrice: { amount: 100 }, status: 'ACTIVE' },
    });
    const first = apply(emptySession(LIVE), bid);
    expect(first.signals).toContainEqual({ kind: 'lot', lot: expect.objectContaining({ currentBid: 99 }) });
    const r = apply(first.session, next);
    expect(r.signals).toContainEqual({ kind: 'lot', lot: expect.objectContaining({ title: 'Spot #27' }), started: true });
    expect(r.session.lot).toMatchObject({ title: 'Spot #27', currentBid: null, leader: null, bidCount: null, nextBid: 1 });
  });

  it('reads show state and share counts from the live socket without inventing a lot', () => {
    const update = frame(`auction:${LIVE}`, 'livestream_update', { id: LIVE, title: 'MORNING GOLD RUSH!', status: 'PLAYING', activeViewers: 51 });
    const s1 = apply(emptySession(LIVE), update).session;
    expect(s1.lot).toBeNull();
    expect(s1.show).toMatchObject({ title: 'MORNING GOLD RUSH!', viewers: 51 });
    expect(apply(s1, frame(`chat:${LIVE}`, 'livestream_shared', { shareCounts: 10, livestreamId: LIVE })).session.show.shareCount).toBe(10);
  });

  it('samples unknown events for diagnostics', () => {
    const r = apply(emptySession(LIVE), frame(`commerce:${LIVE}`, 'mystery_event', { foo: 1 }));
    expect(r.session.eventCounts['commerce:mystery_event']).toBe(1);
    expect(r.session.samples[0]).toMatchObject({ topic: 'commerce', event: 'mystery_event' });
  });

  it('reads remaining-seconds timers', () => {
    expect(readCommerce('timer', { productId: 'p', secondsRemaining: 12 }, 1000).lot?.endsAt).toBe(13_000);
  });
});

describe('reduceGraphql', () => {
  it('sets the baseline from the LiveStream query', () => {
    const s = reduceGraphql(emptySession(LIVE), 'LiveStream', {
      data: { liveStream: { id: LIVE, status: 'PLAYING', title: 'T', activeViewers: 960, user: { username: 'traderbea', isFollowing: false } } },
    });
    expect(s.show).toMatchObject({ host: 'traderbea', viewers: 960, isFollowingHost: false });
    expect(s.graphqlOps.LiveStream).toBe(1);
  });

  it('stores published show notes and drops them when the seller unposts', () => {
    const body = {
      data: {
        showNotes: [{ isPublished: true, liveUuid: LIVE, content: { text: 'Wheel is sudden death. /coupon SAVE10' } }],
      },
    };
    const s = reduceGraphql(emptySession(LIVE), 'GetShowNotes', body);
    expect(s.show.note?.coupons).toEqual(['SAVE10']);
    expect(s.show.note?.text).toContain('sudden death');
    const cleared = reduceGraphql(s, 'GetShowNotes', { data: { showNotes: [] } });
    expect(cleared.show.note).toBeNull();
    expect(reduceGraphql(s, 'LiveStream', { data: { liveStream: { id: LIVE, activeViewers: 3 } } }).show.note?.text).toContain('sudden death');
  });

  it('keeps the show categories, and later updates without them keep the old ones', () => {
    const s = reduceGraphql(emptySession(LIVE), 'LiveStream', {
      data: { liveStream: { id: LIVE, title: 'T', primaryCategory: { label: 'Vintage Clothing', parent: { name: 'Fashion' } } } },
    });
    expect(s.show.categories).toEqual(['Fashion', 'Vintage Clothing']);
    const next = reduceSocket(s, { topic: `chat:${LIVE}`, event: 'livestream_update', payload: { activeViewers: 10 } }).session;
    expect(next.show.categories).toEqual(['Fashion', 'Vintage Clothing']);
  });
});

describe('readCategories', () => {
  it('reads strings, label objects, and GraphQL edges without duplicates', () => {
    expect(readCategories({ category: 'Coins & Money', tags: ['Coins & Money', 'Silver'] })).toEqual(['Coins & Money', 'Silver']);
    expect(readCategories({ categories: { edges: [{ node: { label: 'Sports Cards' } }, { node: { name: 'Baseball' } }] } })).toEqual([
      'Sports Cards',
      'Baseball',
    ]);
    expect(readCategories({ title: 'no categories here' })).toEqual([]);
  });

  it('drops taxonomy ids and format flags and spells out tag slugs', () => {
    expect(
      readCategories({ categories: ['t__905'], tags: ['us_coins', 'numismatics', 'slabs', 'primary_show_format_auction'] }),
    ).toEqual(['us coins', 'numismatics', 'slabs']);
  });
});

describe('summarizeSales', () => {
  it('totals revenue, orders, giveaways, and ranks buyers', () => {
    const sale = (buyer: string, price: number, kind: Sale['kind'] = 'auction'): Sale => ({ key: `${buyer}${price}${kind}`, productId: null, title: null, price, buyer, kind, at: 0 });
    expect(summarizeSales([sale('a', 10), sale('b', 30), sale('a', 25), sale('c', 0, 'giveaway')])).toEqual({
      revenue: 65,
      orders: 3,
      giveaways: 1,
      topBuyers: [
        { user: 'a', spend: 35, orders: 2 },
        { user: 'b', spend: 30, orders: 1 },
      ],
    });
  });
});

describe('estate session', () => {
  const host = (id: string, text: string) =>
    chatMsg(id, 'seller', text, { user: { id: 'h', isHost: true, isModerator: false, username: 'seller' } });
  const lot = (id: string, title: string, cents: number) =>
    frame(`commerce:${LIVE}`, 'product_update', {
      product: { id, title, currentBid: { amount: cents, currency: 'USD' }, currentBidCount: 1 },
    });
  const sold = (id: string, title: string, price: number) =>
    frame(`commerce:${LIVE}`, 'product_sold', { productId: id, title, soldPrice: price, buyer: { username: 'buyer' } });

  it('keeps template hammers and the name pinned when that lot sold', () => {
    let s = emptySession(LIVE);
    s = apply(s, lot('p10', 'Junk bag #10', 300)).session;
    s = apply(s, frame(`chat:${LIVE}`, 'new_msg', host('pin', 'manganese toothpick holder'))).session;
    s = apply(s, frame(`chat:${LIVE}`, 'new_msg', host('ty', 'Ty!'))).session;
    s = noteEstateName(s, 'Manganese glass toothpick holder');
    s = apply(s, sold('p10', 'Junk bag #10', 20)).session;
    s = apply(s, lot('p40', 'Junk bag #40', 100)).session;
    s = apply(s, frame(`chat:${LIVE}`, 'new_msg', host('later', 'ceramic lion'))).session;
    s = apply(s, sold('p40', 'Junk bag #40', 36)).session;
    s = apply(s, frame(`commerce:${LIVE}`, 'giveaway_won', {
      product: { id: 'g1', name: 'Junk bag #11', transactionType: 'GIVEAWAY', soldPrice: { amount: 0 }, purchaserUser: { username: 'winner' } },
    })).session;
    s = apply(s, sold('p42', 'Junk bag #42', 1)).session;

    expect(s.estateRuns.map((r) => [r.number, r.name, r.price])).toEqual([
      [42, null, 1],
      [40, 'ceramic lion', 36],
      [10, 'Manganese glass toothpick holder', 20],
    ]);
    expect(s.estateRuns.some((r) => r.number === 11)).toBe(false);
    expect(s.estatePins['10']).toBe('Manganese glass toothpick holder');
  });

  it('does not pin a backlog line, and a new show starts clean', () => {
    let s = emptySession(LIVE);
    s = apply(s, lot('p10', 'Junk bag #10', 100)).session;
    s = apply(s, frame(`chat:${LIVE}`, 'latest_messages', { messages: [host('old', 'door knocker')] })).session;
    expect(s.estatePins).toEqual({});
    const next = sessionForPath(s, 'other-show');
    expect(next?.estateRuns).toEqual([]);
    expect(next?.estatePins).toEqual({});
    expect(next?.estateWants).toEqual([]);
  });

  it('keeps pull-bucket hammers and recognized names in electronics session, hides estate card on electronics pass, and drops giveaways', () => {
    let s = emptySession(LIVE);
    s = apply(s, lot('p46', 'SMALL Random Item #46', 300)).session;
    s = apply(s, frame(`chat:${LIVE}`, 'new_msg', host('pin46', ' Anker power bank '))).session;
    s = noteElectronicsName(s, 'Anker 737 Power Bank');
    s = apply(s, sold('p46', 'SMALL Random Item #46', 24)).session;
    s = apply(s, lot('p51', 'SMALL Random Item #51', 300)).session;
    s = apply(s, frame(`chat:${LIVE}`, 'new_msg', host('pin51', 'JBL Clip 4 speaker'))).session;
    s = apply(s, frame(`commerce:${LIVE}`, 'giveaway_won', {
      product: { id: 'g2', name: 'SMALL Random Item #47', transactionType: 'GIVEAWAY', soldPrice: { amount: 0 }, purchaserUser: { username: 'winner' } },
    })).session;
    s = apply(s, sold('p51', 'SMALL Random Item #51', 31)).session;

    expect(s.electronicsRuns.map((r) => [r.number, r.name, r.price])).toEqual([
      [51, 'JBL Clip 4 speaker', 31],
      [46, 'Anker 737 Power Bank', 24],
    ]);
    expect(s.electronicsPins['46']).toBe('Anker 737 Power Bank');
    expect(s.electronicsRuns.some((r) => r.number === 47)).toBe(false);
    expect(buildEstateView({ lotTitle: 'ELECTRONIC AS SHOWN #150', categories: ['Everyday Electronics'] })).toBeNull();
    const next = sessionForPath(s, 'other-show');
    expect(next?.electronicsRuns).toEqual([]);
    expect(next?.electronicsPins).toEqual({});
    expect(next?.electronicsWants).toEqual([]);
  });
});

describe('isNewLot', () => {
  it('goes by id when both have one, and by title otherwise', () => {
    expect(isNewLot(null, { id: 'a', title: 'Morgan' })).toBe(true);
    expect(isNewLot({ id: 'a', title: 'Morgan' }, { id: 'b', title: 'Morgan' })).toBe(true);
    expect(isNewLot({ id: 'a', title: 'Morgan' }, { id: 'a', title: 'Morgan 1921' })).toBe(false);
    expect(isNewLot({ id: null, title: 'Morgan' }, { id: 'a', title: 'Morgan' })).toBe(false);
    expect(isNewLot({ id: null, title: 'Morgan' }, { id: null, title: 'Peace' })).toBe(true);
    expect(isNewLot({ id: 'a', title: 'Morgan' }, { id: null, title: null })).toBe(false);
  });
});

describe('money', () => {
  it('reads Whatnot money objects as minor units', () => {
    expect(moneyValue({ amount: 11900, currency: 'USD' })).toBe(119);
    expect(moneyValue(25)).toBe(25);
    expect(moneyValue(2500, 'priceCents')).toBe(25);
    expect(moneyValue('$1,250.50')).toBe(1250.5);
  });

  it('parses dollar text', () => {
    expect(parseMoneyText('Bid $1,250')).toBe(1250);
    expect(parseMoneyText('no price')).toBeNull();
  });
});
