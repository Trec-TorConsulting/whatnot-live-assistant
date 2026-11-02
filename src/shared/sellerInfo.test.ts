import { describe, expect, it } from 'vitest';
import { BidderWatch, closesLine, parseJoined, parseSellerProfile, profileCaution, profileLine, sellerCloses } from './sellerInfo';
import type { SoldItem } from './soldHistory';

// Shaped like the escaped RSC payload on whatnot.com/user/bidkdc (Oct 2026). The viewer's own
// account comes first with its own fields, which must not be read as the seller's.
const PAGE = String.raw`self.__next_f.push([1,"{\"username\":\"trec_tor_consulting\",\"createdAt\":\"Fri, 10 Apr 2026\",\"soldCount\":0}"])
self.__next_f.push([1,"{\"id\":\"UHVi\",\"averageShipDays\":1,\"bio\":\"Redefining coin auctions\",\"followerCount\":127515,\"followingCount\":299,\"isVerifiedSeller\":false,\"premierShopStatus\":{\"__typename\":\"PremierShopStatus\",\"isPremierShop\":false},\"sellerRating\":{\"__typename\":\"SellerRating\",\"overall\":4.9,\"numReviews\":43063},\"sellerSupportRating\":null,\"soldCount\":213254,\"tsActionState\":\"\",\"username\":\"bidkdc\",\"tsStanding\":null}"])`;

const sale = (p: Partial<SoldItem>): SoldItem => ({ key: Math.random().toString(), at: Date.now(), liveId: 's', showTitle: null, title: 'Morgan', price: 10, ...p });

describe('seller profile', () => {
  it("reads the seller's numbers, not the viewer's", () => {
    const p = parseSellerProfile(PAGE, 'BidKDC', 1000)!;
    expect(p).toMatchObject({ rating: 4.9, reviews: 43063, sold: 213254, shipDays: 1, followers: 127515, verified: false, premier: false, fetchedAt: 1000 });
    const now = Date.parse('Thu, 29 Oct 2026 12:00:00 GMT');
    const joinedAt = parseJoined('{"data":{"getUser":{"id":"UHVi","createdAt":"Thu, 23 Feb 2023 11:46:45 GMT"}}}');
    expect(joinedAt).toBe(Date.UTC(2023, 1, 23, 11, 46, 45));
    expect(profileLine({ ...p, joinedAt, firstSeen: 0 }, now)).toBe('★4.9 (43K reviews) · on Whatnot 3.7 years · 213K sold · ships in ~1 day');
    expect(profileCaution({ ...p, joinedAt, firstSeen: 0 }, now)).toBeNull();
    expect(parseSellerProfile(PAGE, 'someone_else', 0)).toBeNull();
    expect(parseJoined('{"data":{"getUser":null}}')).toBeNull();
    expect(parseJoined('not json')).toBeNull();
  });

  it('flags a new account, few reviews, a low rating, or slow shipping', () => {
    const base = { host: 'x', rating: 4.9, reviews: 500, sold: 1, shipDays: 2, followers: 1, verified: false, premier: false, joinedAt: null, fetchedAt: 0, firstSeen: 0 };
    expect(profileCaution({ ...base, joinedAt: 1000 }, 1000 + 20 * 86_400_000)).toBe('New account: on Whatnot 20 days.');
    expect(profileCaution({ ...base, reviews: 12 })).toMatch(/12 reviews/);
    expect(profileCaution({ ...base, rating: 4.2 })).toMatch(/4.2/);
    expect(profileCaution({ ...base, shipDays: 9 })).toMatch(/9 days/);
  });
});

describe('seller closes', () => {
  it('compares their sales to your appraisals or other sellers, only with enough of them', () => {
    const now = Date.now();
    const theirs = Array.from({ length: 5 }, (_, i) => sale({ host: 'bob', productId: `p${i}`, title: `1921 Morgan Silver Dollar #${i}`, price: 40 }));
    const appraisals = theirs.map((s) => ({ lotId: s.productId!, valuation: { marketValue: 50 } }));
    const c = sellerCloses(theirs, appraisals, '@Bob', now);
    expect(c).toMatchObject({ seen: 5, compared: 5, ratio: 0.8 });
    expect(closesLine(c)).toBe('Their lots close at ~80% of market (5 compared): often a deal');

    const others = Array.from({ length: 3 }, () => sale({ host: 'amy', title: 'Peace Silver Dollar 1923', price: 30 }));
    const few = sellerCloses([...others, sale({ host: 'bob', title: 'Peace Silver Dollar 1923', price: 36 })], [], 'bob', now);
    expect(few).toMatchObject({ seen: 1, compared: 1, ratio: null });
    expect(closesLine(few)).toBeNull();
  });
});

describe('BidderWatch', () => {
  const lot = (id: string, leader: string) => ({ id, title: id, leader });

  it('names the host or a moderator on top', () => {
    const w = new BidderWatch();
    expect(w.note('KDC', 'kdc', new Set())).toMatch(/host's own account/);
    expect(w.note('mod1', 'kdc', new Set(['mod1']))).toMatch(/moderator/);
    expect(w.note(null, 'kdc', new Set())).toBeNull();
  });

  it('mentions a bidder only after leading many lots across most of a show and winning none', () => {
    const w = new BidderWatch();
    for (let i = 0; i < 7; i++) {
      w.lot(lot(`l${i}`, 'pusher'));
      w.lot(lot(`l${i}`, `buyer${i}`));
      w.sale({ buyer: `buyer${i}`, kind: 'auction' });
    }
    expect(w.note('pusher', 'kdc', new Set())).toBeNull();
    w.lot(lot('l7', 'pusher'));
    w.sale({ buyer: 'buyer7', kind: 'auction' });
    expect(w.note('pusher', 'kdc', new Set())).toMatch(/led 8 lots here and won none\. Usually just a bidder/);
    w.sale({ buyer: 'pusher', kind: 'auction' });
    expect(w.note('pusher', 'kdc', new Set())).toBeNull();
    expect(w.note('buyer1', 'kdc', new Set())).toBeNull();
  });
});
