import { describe, expect, it } from 'vitest';
import type { Lot } from './live';
import {
  BidTracker,
  askSeller,
  matchWatch,
  matchWishlist,
  mentionsUser,
  parseWatchlist,
  parseWatchLine,
  parseWishlist,
  parseWishLine,
  periodStarts,
  sanitizeBuyerSettings,
  sanitizeSellerNotes,
  sellerHistory,
  sellerLine,
  spentByPeriod,
  wishLine,
} from './buyer';
import type { Purchase } from './purchases';
import { DAY } from './time';

const buy = (p: Partial<Purchase>): Purchase => ({
  key: Math.random().toString(),
  at: Date.now(),
  liveId: 'show1',
  showTitle: null,
  host: 'coin_queen',
  title: 'Morgan',
  price: 10,
  kind: 'auction',
  appraisedValue: null,
  meltValue: null,
  appraisalId: null,
  source: 'auto',
  ...p,
});

describe('watchlist', () => {
  it('reads words and an optional max from each line', () => {
    expect(parseWatchLine('1921 Morgan $45')).toEqual({ words: ['1921', 'morgan'], max: 45, text: '1921 Morgan $45' });
    expect(parseWatchLine('  walking   liberty ')).toEqual({ words: ['walking', 'liberty'], max: null, text: 'walking liberty' });
    expect(parseWatchLine('$40')).toBeNull();
    expect(parseWatchlist('a $1\n\nsilver eagle $1,200.50')).toHaveLength(2);
    expect(parseWatchlist('silver eagle $1,200.50')[0]!.max).toBe(1200.5);
  });

  it('matches when every word is in the title, preferring the most specific entry', () => {
    const list = parseWatchlist('morgan $30\n1921 morgan $45\nsilver eagle');
    expect(matchWatch('1921-D Morgan Dollar VF', list)?.max).toBe(45);
    expect(matchWatch('1885 Morgan Dollar.', list)?.max).toBe(30);
    expect(matchWatch('2021 American Silver Eagle', list)?.text).toBe('silver eagle');
    expect(matchWatch('Peace Dollar', list)).toBeNull();
    expect(matchWatch(null, list)).toBeNull();
  });

  it('survives a round trip through storage', () => {
    const s = sanitizeBuyerSettings({ watchlist: parseWatchlist('1921 morgan $45'), wishlist: parseWishlist('charizard base $120\n1881-s morgan $45'), lastSeconds: 99, tiltLosses: -3, chatTemplates: ['  hi  ', ''] });
    expect(s.watchlist[0]!.max).toBe(45);
    expect(s.wishlist).toHaveLength(2);
    expect(s.wishlist[0]).toEqual({ keywords: ['charizard', 'base'], max: 120, text: 'charizard base $120' });
    expect(s.wishlist[1]!.max).toBe(45);
    expect(s.lastSeconds).toBe(30);
    expect(s.tiltLosses).toBe(0);
    expect(s.chatTemplates).toEqual(['hi']);
    expect(sanitizeBuyerSettings(undefined).outbid).toBe(true);
    expect(sanitizeBuyerSettings(undefined).wishlist).toEqual([]);
  });
});

describe('wishlist', () => {
  it('reads keywords and an optional price ceiling from each line', () => {
    expect(parseWishLine('charizard base holo')).toEqual({
      keywords: ['charizard', 'base', 'holo'],
      max: null,
      text: 'charizard base holo',
    });
    expect(parseWishLine('milwaukee m18 fuel $120')).toEqual({
      keywords: ['milwaukee', 'm18', 'fuel'],
      max: 120,
      text: 'milwaukee m18 fuel $120',
    });
    expect(parseWishLine('   $50   ')).toBeNull();
    expect(parseWishLine('')).toBeNull();

    const list = parseWishlist('1881-s morgan $45\n\ncharizard base holo\nsilver eagle 2021 $35');
    expect(list).toHaveLength(3);
    expect(list.map(wishLine)).toEqual([
      '1881-s morgan $45',
      'charizard base holo',
      'silver eagle 2021 $35',
    ]);
  });

  it('matches title and subtitle, preferring the most specific keyword entry', () => {
    const list = parseWishlist('morgan\n1881-s morgan $45\ncharizard base');
    expect(matchWishlist('1999 Pokémon Charizard Base Set Holo', list)?.text).toBe('charizard base');
    expect(matchWishlist('1881-S Morgan Dollar', list)?.text).toBe('1881-s morgan $45');
    expect(matchWishlist('1921 Morgan Silver Dollar', list)?.text).toBe('morgan');
    expect(matchWishlist('Peace Dollar BU', list)).toBeNull();
    expect(matchWishlist(null, list)).toBeNull();
  });
});

describe('BidTracker', () => {
  const lot = (p: Partial<Lot>): Lot => ({
    id: 'p1',
    title: '1921 Morgan',
    currentBid: 10,
    bidCount: 1,
    leader: null,
    endsAt: null,
    status: 'active',
    nextBid: null,
    breakId: null,
    updatedAt: 0,
    ...p,
  });
  const sale = (buyer: string, productId = 'p1') => ({ productId, title: '1921 Morgan', buyer, kind: 'auction' as const });

  it('says outbid only after you led, and not for updates without a leader', () => {
    const t = new BidTracker(() => 'Tobey');
    expect(t.lot(lot({ leader: 'bob' }))).toEqual([]);
    expect(t.lot(lot({ leader: 'tobey', currentBid: 12 }))).toEqual([]);
    expect(t.you(lot({ leader: 'tobey' }))).toBe('leading');
    expect(t.lot(lot({ leader: null, currentBid: 13 }))).toEqual([]);
    expect(t.lot(lot({ leader: 'amy', currentBid: 14 }))).toEqual([{ kind: 'outbid', key: 'p1', by: 'amy', bid: 14, title: '1921 Morgan' }]);
    expect(t.you(lot({ leader: 'amy' }))).toBe('outbid');
    expect(t.lot(lot({ leader: 'amy', currentBid: 15 }))).toEqual([]);
  });

  it('counts losses on lots you led, resets on a win, and warns at the streak', () => {
    const t = new BidTracker(() => 'tobey');
    for (const id of ['a', 'b']) t.lot(lot({ id, leader: 'tobey' }));
    expect(t.sale(sale('bob', 'a'), 2)).toEqual([]);
    expect(t.sale(sale('bob', 'zzz'), 2)).toEqual([]);
    expect(t.sale(sale('bob', 'b'), 2)).toEqual([{ kind: 'loss_streak', losses: 2 }]);
    t.lot(lot({ id: 'c', leader: 'tobey' }));
    expect(t.sale(sale('tobey', 'c'), 2)).toEqual([]);
    t.lot(lot({ id: 'd', leader: 'tobey' }));
    expect(t.sale(sale('bob', 'd'), 2)).toEqual([]);
  });

  it('alerts once per close for lots you are in or watching, again after a soft-close extension', () => {
    const t = new BidTracker(() => 'tobey');
    const now = 1_000_000;
    const closing = lot({ leader: 'tobey', endsAt: now + 4000 });
    t.lot(closing);
    expect(t.closing(closing, now - 5000, 5, false)).toBeNull();
    expect(t.closing(closing, now, 5, false)).toMatchObject({ secondsLeft: 4, state: 'leading' });
    expect(t.closing(closing, now + 250, 5, false)).toBeNull();
    const extended = { ...closing, endsAt: now + 15_000 };
    expect(t.closing(extended, now + 11_000, 5, false)).toMatchObject({ secondsLeft: 4 });
    const other = lot({ id: 'p2', leader: 'bob', endsAt: now + 3000 });
    expect(t.closing(other, now, 5, false)).toBeNull();
    expect(t.closing(other, now, 5, true)).toMatchObject({ state: 'watch' });
    expect(t.closing(lot({ id: 'p3', leader: 'tobey', endsAt: now + 3000 }), now, 0, true)).toBeNull();
  });
});

describe('spending by period', () => {
  it('starts weeks on Monday and counts day, week, and month', () => {
    const wed = new Date(2026, 9, 28, 15).getTime();
    const s = periodStarts(wed);
    expect(new Date(s.week).getDay()).toBe(1);
    expect(new Date(s.week).getDate()).toBe(26);
    expect(new Date(s.month).getDate()).toBe(1);
    const list = [buy({ at: wed - 60_000, price: 5 }), buy({ at: wed - 2 * DAY, price: 7 }), buy({ at: wed - 20 * DAY, price: 11 })];
    expect(spentByPeriod(list, wed)).toEqual({ day: 5, week: 12, month: 23 });
  });
});

describe('sellers', () => {
  it('sums your wins from a host, without giveaways, and counts this show', () => {
    const now = Date.now();
    const list = [
      buy({ price: 20, appraisedValue: 40, at: now - 3 * DAY }),
      buy({ price: 10, liveId: 'show2', host: '@Coin_Queen' }),
      buy({ price: 0, kind: 'giveaway' }),
      buy({ host: 'other' }),
    ];
    const h = sellerHistory(list, 'coin_queen', 'show2');
    expect(h).toMatchObject({ wins: 2, total: 30, average: 15, appraisedPaid: 20, appraisedValue: 40, thisShow: 1 });
    expect(sellerLine(h, now)).toBe("You've won 2 from them ($30, avg $15), last today · paid 50% of appraised");
    expect(sellerLine(sellerHistory([], 'x', null), now)).toBeNull();
  });

  it('keeps only notes with something in them, keyed by lowercase username', () => {
    expect(sanitizeSellerNotes({ '@Bob': { note: ' slow ', blocked: false }, amy: { note: '', blocked: false } })).toEqual({
      bob: { note: 'slow', blocked: false, at: 0 },
    });
  });
});

describe('chat', () => {
  it('spots an @mention of you, not of a longer name', () => {
    expect(mentionsUser('hey @Tobey nice pull', 'tobey')).toBe(true);
    expect(mentionsUser('@tobey!', 'tobey')).toBe(true);
    expect(mentionsUser('@tobey_2 hi', 'tobey')).toBe(false);
    expect(mentionsUser('tobey hi', 'tobey')).toBe(false);
    expect(mentionsUser('@tobey', '')).toBe(false);
  });

  it('asks the seller about what the appraisal is unsure of', () => {
    expect(askSeller(['Key dates are often faked or altered; raw ones are a risk.'], null)).toMatch(/date and mint mark/);
    expect(askSeller(['The PSA cert is for X, not what was read. Check the slab.'], null)).toMatch(/cert number/);
    expect(askSeller([], 'Coin · low confidence')).toMatch(/closer/);
    expect(askSeller([], 'Coin')).toBeNull();
  });
});
