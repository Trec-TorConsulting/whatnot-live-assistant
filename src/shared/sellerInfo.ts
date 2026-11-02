// What's known about the host: their public profile numbers and join date, how their lots close
// against the market, and bidders worth a second look.
import { sellerKey } from './buyer';
import type { Lot, Sale } from './live';
import { formatMoney } from './money';
import { findComps, summarizeComps, type SoldItem } from './soldHistory';

export interface SellerProfile {
  host: string;
  rating: number | null;
  reviews: number | null;
  sold: number | null;
  shipDays: number | null;
  followers: number | null;
  verified: boolean;
  premier: boolean;
  // When the account was created (Whatnot's getUser createdAt); null if it couldn't be read.
  joinedAt: number | null;
  fetchedAt: number;
  // When this extension first saw the seller.
  firstSeen: number;
}

// getUser(username) is the query Whatnot's web app uses; its createdAt reads "Thu, 23 Feb 2023 11:46:45 GMT".
export const JOINED_OPERATION = 'GetUserJoined';
export const JOINED_QUERY = 'query GetUserJoined($username: String!) { getUser(username: $username) { id createdAt } }';

export const parseJoined = (body: string): number | null => {
  try {
    const raw = (JSON.parse(body) as { data?: { getUser?: { createdAt?: unknown } } })?.data?.getUser?.createdAt;
    const t = typeof raw === 'string' ? Date.parse(raw) : NaN;
    return Number.isFinite(t) ? t : null;
  } catch {
    return null;
  }
};

const DAY_MS = 24 * 60 * 60 * 1000;

export const tenure = (joinedAt: number, now: number) => {
  const days = Math.max(0, Math.floor((now - joinedAt) / DAY_MS));
  if (days < 60) return `${days} days`;
  if (days < 730) return `${Math.round(days / 30)} months`;
  return `${Math.round((days / 365) * 10) / 10} years`;
};

export const PROFILE_TTL_MS = 24 * 60 * 60 * 1000;
const PROFILE_WINDOW = 8000;

const num = (seg: string, re: RegExp) => {
  const m = seg.match(re);
  const n = m ? parseFloat(m[1]!) : NaN;
  return Number.isFinite(n) ? n : null;
};

// The profile page embeds the seller as escaped JSON. Their fields sit just before their username;
// the viewer's own account appears elsewhere on the page, so only the window ending at the
// seller's username is read.
export const parseSellerProfile = (html: string, host: string, now: number): Omit<SellerProfile, 'firstSeen' | 'joinedAt'> | null => {
  const text = html.replace(/\\+"/g, '"');
  const want = sellerKey(host);
  for (const m of text.matchAll(/"username":"([^"]+)"/g)) {
    if (m[1]!.toLowerCase() !== want) continue;
    const before = text.slice(Math.max(0, m.index! - PROFILE_WINDOW), m.index);
    const start = before.lastIndexOf('"averageShipDays"');
    if (start < 0 || !before.includes('"sellerRating"', start)) continue;
    const seg = before.slice(start);
    const rating = num(seg, /"sellerRating":\{[^}]*?"overall":([\d.]+)/);
    const sold = num(seg, /"soldCount":(\d+)/);
    if (rating === null && sold === null) continue;
    return {
      host,
      rating,
      reviews: num(seg, /"numReviews":(\d+)/),
      sold,
      shipDays: num(seg, /"averageShipDays":([\d.]+)/),
      followers: num(seg, /"followerCount":(\d+)/),
      verified: /"isVerifiedSeller":true/.test(seg),
      premier: /"isPremierShop":true/.test(seg),
      fetchedAt: now,
    };
  }
  return null;
};

const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}K` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n));

export const profileLine = (p: SellerProfile, now = Date.now()) =>
  [
    p.rating !== null ? `★${p.rating}${p.reviews !== null ? ` (${compact(p.reviews)} reviews)` : ''}` : null,
    p.joinedAt !== null ? `on Whatnot ${tenure(p.joinedAt, now)}` : null,
    p.sold !== null ? `${compact(p.sold)} sold` : null,
    p.shipDays !== null ? `ships in ~${p.shipDays} day${p.shipDays === 1 ? '' : 's'}` : null,
    p.verified ? 'verified' : null,
    p.premier ? 'premier shop' : null,
  ]
    .filter(Boolean)
    .join(' · ') || null;

// Worth knowing before you bid, not a verdict on the seller.
export const profileCaution = (p: SellerProfile, now = Date.now()): string | null => {
  if (p.joinedAt !== null && now - p.joinedAt < 90 * DAY_MS) return `New account: on Whatnot ${tenure(p.joinedAt, now)}.`;
  if (p.reviews !== null && p.reviews < 25) return `Only ${p.reviews} reviews: a new or small seller.`;
  if (p.rating !== null && p.rating < 4.5) return `Rated ${p.rating}: below most sellers.`;
  if (p.shipDays !== null && p.shipDays >= 7) return `Ships in ~${p.shipDays} days on average.`;
  return null;
};

// --- How their lots close ---

export interface SellerCloses {
  seen: number;
  compared: number;
  ratio: number | null;
  median: number | null;
}

const MIN_COMPARED = 5;
// Each check scans the whole sold history, so only the latest sales are compared.
const MAX_CHECKED = 30;

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};

// Each of their sales against your appraisal of that lot, or else the median of 3+ matching sales
// by other sellers. Fewer than 5 comparisons says nothing, so no ratio is given.
export const sellerCloses = (
  sold: SoldItem[],
  appraisals: { lotId: string | null; valuation: { marketValue: number | null } }[],
  host: string,
  now: number,
): SellerCloses => {
  const key = sellerKey(host);
  const theirs = sold.filter((s) => s.host && sellerKey(s.host) === key);
  const others = sold.filter((s) => !s.host || sellerKey(s.host) !== key);
  const marketByLot = new Map(appraisals.filter((a) => a.lotId && a.valuation.marketValue).map((a) => [a.lotId!, a.valuation.marketValue!]));
  const ratios: number[] = [];
  for (const s of theirs.slice(-MAX_CHECKED)) {
    let market = s.productId ? (marketByLot.get(s.productId) ?? null) : null;
    if (!market) {
      const comps = summarizeComps(findComps([s.title], others, now, 8, s.showType));
      market = comps && comps.count >= 3 ? comps.median : null;
    }
    if (market && market > 0) ratios.push(s.price / market);
  }
  const ratio = ratios.length >= MIN_COMPARED ? Math.round(median(ratios)! * 100) / 100 : null;
  return { seen: theirs.length, compared: ratios.length, ratio, median: median(theirs.map((s) => s.price)) };
};

export const closesLine = (c: SellerCloses): string | null => {
  if (c.ratio !== null) {
    const pct = Math.round(c.ratio * 100);
    const how = pct <= 90 ? 'often a deal' : pct >= 110 ? 'usually over market' : 'about market';
    return `Their lots close at ~${pct}% of market (${c.compared} compared): ${how}`;
  }
  if (c.seen >= 3 && c.median !== null) return `${c.seen} of their sales seen, median ${formatMoney(c.median)}; too few matches to compare to market`;
  return null;
};

// --- Bidders worth a second look ---

const lotKey = (lot: Pick<Lot, 'id' | 'title'>) => lot.id ?? lot.title ?? null;

// The feed shows the current leader, not every bid, so this counts lots each bidder was seen on
// top of. Leading a lot and losing it is what every outbid bidder does; only a long run of it,
// with no wins, across most of a show is mentioned, and gently.
export class BidderWatch {
  private ledLots = new Map<string, Set<string>>();
  private wins = new Map<string, number>();
  private sold = 0;

  lot(lot: Pick<Lot, 'id' | 'title' | 'leader'>) {
    const key = lotKey(lot);
    if (!key || !lot.leader) return;
    const u = lot.leader.toLowerCase();
    const set = this.ledLots.get(u) ?? new Set<string>();
    set.add(key);
    this.ledLots.set(u, set);
  }

  sale(sale: Pick<Sale, 'buyer' | 'kind'>) {
    if (sale.kind === 'giveaway' || !sale.buyer) return;
    this.sold += 1;
    const u = sale.buyer.toLowerCase();
    this.wins.set(u, (this.wins.get(u) ?? 0) + 1);
  }

  note(leader: string | null, host: string | null, moderators: Set<string>): string | null {
    if (!leader) return null;
    const u = leader.toLowerCase();
    if (host && u === host.toLowerCase()) return "The top bidder is the host's own account.";
    if (moderators.has(u)) return `The top bidder @${leader} is a moderator here.`;
    const led = this.ledLots.get(u)?.size ?? 0;
    const won = this.wins.get(u) ?? 0;
    if (this.sold >= 8 && led >= 6 && won === 0 && led >= this.sold * 0.4) {
      return `@${leader} has led ${led} lots here and won none. Usually just a bidder who stops early; bid to your own max.`;
    }
    return null;
  }

  reset() {
    this.ledLots.clear();
    this.wins.clear();
    this.sold = 0;
  }
}
