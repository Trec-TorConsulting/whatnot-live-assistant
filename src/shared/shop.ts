// The show's shop, read when you open it. Buy-it-now listings and named one-off auctions are kept.
// Giveaways, sold listings, and template auctions are skipped. A $1 auction price is the pre-bid
// opener, not a price you pay, so it is not scored. A hit is a price under melt or under sales
// you've watched, a watchlist match, or a known key date. Nothing here buys.
import { quickRead, type AuctionSummary } from './appraisal';
import { isTemplate } from './estate';
import { matchWatch, type WatchItem } from './buyer';
import { keyDateCallouts, keyDatePrice } from './keyDates';
import { formatMoney } from './money';
import { findComps, summarizeComps, type SoldItem } from './soldHistory';
import type { ShowType } from './showType';

export interface ShopListing {
  id: string;
  title: string;
  price: number;
  quantity: number;
  mode?: 'bin' | 'auction';
}

export type ShopHitKind = 'steal' | 'deal' | 'must';

export interface ShopHit {
  id: string;
  title: string;
  price: number;
  quantity: number;
  kind: ShopHitKind;
  reason: string;
  mode?: 'bin' | 'auction';
}

export interface ShopScan {
  status: 'ready' | 'error';
  binCount: number;
  auctionCount?: number;
  hits: ShopHit[];
}

const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// Profile shop is the seller's marketplace, not this show.
export const isShopOperation = (name: string) => /shop/i.test(name) && !/profile/i.test(name);

const SOLD_STATUS = /sold|ended|inactive|deleted|removed|cancel|unavailable|expired/i;
const BIN_TYPE = /buy[_ ]?it[_ ]?now|^bin$|buy[_ ]?now/i;
const AUCTION_TYPE = /auction/i;
const GIVEAWAY_TYPE = /giveaway/i;

const money = (v: unknown, cents = false): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return cents ? v / 100 : v;
  const o = obj(v);
  if (!o) return null;
  const minor = num(o.amount ?? o.amountSafe ?? o.amountCents ?? o.cents);
  if (minor !== null) return minor / 100;
  const major = num(o.value ?? o.dollars);
  return major;
};

const readListing = (o: Record<string, unknown>): ShopListing | null => {
  const type = str(o.transactionType ?? o.transaction_type ?? obj(o.listing)?.transactionType ?? obj(o.product)?.transactionType);
  if (!type || GIVEAWAY_TYPE.test(type)) return null;
  const auction = AUCTION_TYPE.test(type);
  if (!auction && !BIN_TYPE.test(type)) return null;
  const status = str(o.status ?? o.publicStatus ?? o.state ?? o.listingStatus);
  if (status && SOLD_STATUS.test(status)) return null;
  const title = str(o.title ?? o.name ?? o.productName ?? obj(o.product)?.title ?? obj(o.listing)?.title);
  if (!title || title.length < 2) return null;
  const price =
    money(o.price) ??
    money(o.buyNowPrice) ??
    money(o.binPrice) ??
    money(o.priceCents, true) ??
    money(o.buyNowPriceCents, true);
  if (price === null || price <= 0) return null;
  const rawQty = num(o.quantity ?? o.inventory ?? obj(o.inventoryLevel)?.quantity) ?? 1;
  const quantity = Math.max(1, Math.min(999, Math.round(rawQty)));
  const id = str(o.id ?? o.uuid ?? o.listingId ?? o.productId) ?? `${title}|${price}`;
  return { id, title: title.slice(0, 160), price, quantity, mode: auction ? 'auction' : 'bin' };
};

const MAX_LISTINGS = 400;

export const parseShopListings = (body: unknown): ShopListing[] => {
  const found = new Map<string, ShopListing>();
  const walk = (node: unknown, depth: number) => {
    if (depth > 8 || found.size >= MAX_LISTINGS) return;
    if (Array.isArray(node)) {
      for (const n of node) walk(n, depth + 1);
      return;
    }
    const o = obj(node);
    if (!o) return;
    const listing = readListing(o);
    if (listing && !found.has(listing.id)) found.set(listing.id, listing);
    for (const v of Object.values(o)) if (v && typeof v === 'object') walk(v, depth + 1);
  };
  walk(body, 0);
  return [...found.values()];
};

// The shop connection's pageInfo sits above each listing's own connections, so the shallowest
// "more pages" cursor is the one that turns the page.
export const shopCursor = (body: unknown): string | null => {
  const best: { depth: number; cursor: string }[] = [];
  const walk = (node: unknown, depth: number) => {
    if (depth > 8) return;
    if (Array.isArray(node)) {
      for (const n of node) walk(n, depth + 1);
      return;
    }
    const o = obj(node);
    if (!o) return;
    if (o.hasNextPage === true && typeof o.endCursor === 'string' && o.endCursor.length > 0 && o.endCursor.length < 200) {
      const current = best[0];
      if (!current || depth < current.depth) best[0] = { depth, cursor: o.endCursor };
    }
    for (const v of Object.values(o)) if (v && typeof v === 'object') walk(v, depth + 1);
  };
  walk(body, 0);
  return best[0]?.cursor ?? null;
};

export const readShopPage = (body: unknown): { listings: ShopListing[]; cursor: string | null; error: boolean } => {
  const listings = parseShopListings(body);
  const errors = Array.isArray((body as { errors?: unknown })?.errors) && ((body as { errors: unknown[] }).errors?.length ?? 0) > 0;
  return { listings, cursor: errors && !listings.length ? null : shopCursor(body), error: errors && listings.length === 0 };
};

const KIND_RANK: Record<ShopHitKind, number> = { steal: 0, deal: 1, must: 2 };
const STEAL_RATIO = 0.6;
export const MAX_SHOP_HITS = 8;

export interface ShopScoreInput {
  listings: ShopListing[];
  sold: SoldItem[];
  showType?: ShowType;
  watchlist: WatchItem[];
  maxBidPercent: number;
  meltOf: (listing: ShopListing) => number | null;
  now: number;
}

export const scoreShop = ({ listings, sold, showType, watchlist, maxBidPercent, meltOf, now }: ShopScoreInput): ShopHit[] => {
  const hits: (ShopHit & { edge: number })[] = [];
  for (const item of listings) {
    if (isTemplate(item.title) || item.quantity >= 20) continue;
    // Whatnot's Pre-bid button is an auction that has not started. $1 is the opener, so it is
    // under melt for every ounce of silver and is not a price you can pay.
    if (item.mode === 'auction' && item.price <= 1) continue;
    const comps = summarizeComps(findComps([item.title], sold, now, 8, showType));
    const median = comps && comps.count >= 2 ? comps.median : null;
    const melt = meltOf(item);
    const watch = matchWatch(item.title, watchlist);
    const keys = keyDateCallouts({ text: item.title }).filter((c) => c.kind === 'key');
    const underMelt = melt !== null && item.price < melt;
    const stealComps = median !== null && item.price <= median * STEAL_RATIO;
    const max = median !== null ? (median * maxBidPercent) / 100 : null;
    const dealComps = max !== null && item.price <= max && !stealComps;
    const watchDeal = watch?.max != null && item.price <= watch.max;
    const pricedFair = median !== null && item.price > median;
    const keyMust = keys.length > 0 && !pricedFair;
    let kind: ShopHitKind | null = null;
    if (underMelt || stealComps) kind = 'steal';
    else if (dealComps || watchDeal) kind = 'deal';
    else if ((watch && watch.max == null) || keyMust) kind = 'must';
    if (!kind) continue;
    const notes: string[] = [];
    if (underMelt && melt !== null) notes.push(`Under melt (${formatMoney(melt)})`);
    if (stealComps && median !== null && comps) notes.push(`Under ${formatMoney(median)} median of ${comps.count} sales`);
    if (kind === 'deal' && dealComps && max !== null && comps) notes.push(`Under your max ${formatMoney(max)} (${comps.count} sales around ${formatMoney(median)})`);
    if (watch?.max != null && item.price <= watch.max && kind !== 'steal') notes.push(`At your watchlist max ${formatMoney(watch.max)}`);
    else if (watch) notes.push('On your watchlist');
    if (keys[0] && (kind === 'must' || kind === 'steal' || kind === 'deal')) notes.push(keys[0].text);
    const reference = Math.max(melt ?? 0, median ?? 0);
    hits.push({
      id: item.id,
      title: item.title,
      price: item.price,
      quantity: item.quantity,
      kind,
      mode: item.mode ?? 'bin',
      reason: notes.filter((n, i) => notes.indexOf(n) === i).join('. '),
      edge: reference > 0 ? (reference - item.price) / reference : 0,
    });
  }
  return hits
    .sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || b.edge - a.edge || a.price - b.price)
    .slice(0, MAX_SHOP_HITS)
    .map(({ edge: _edge, ...hit }) => hit);
};

// Auction median when two recent sales exist; otherwise the PCGS price guide for that grade.
export const shopWorthLine = (
  grade: string,
  guide: number | null,
  auctions: Pick<AuctionSummary, 'count' | 'median'> | null,
): string | null => {
  const median = auctions && auctions.count >= 2 && auctions.median && auctions.median > 0 ? auctions.median : null;
  if (median) return `Market ${formatMoney(median)} (PCGS ${grade})`;
  if (guide && guide > 0) return `Guide ${formatMoney(guide)} (PCGS ${grade})`;
  return null;
};

export const shopSummary = (scan: Pick<ShopScan, 'status' | 'binCount' | 'auctionCount'>): string => {
  if (scan.status === 'error') return "Couldn't read this show's shop.";
  if (!scan.binCount) return scan.auctionCount ? 'No shop items.' : 'No buy-it-now items in this shop.';
  const noun = scan.auctionCount ? 'shop' : 'buy-it-now';
  return `Checked ${scan.binCount} ${noun} item${scan.binCount === 1 ? '' : 's'}.`;
};

export const applyShopWorth = (hits: ShopHit[], lines: ReadonlyMap<string, string>): ShopHit[] =>
  hits.map((h) => {
    if (h.kind !== 'must') return h;
    const spec = keyDatePrice(h.title);
    if (!spec) return h;
    const line = lines.get(`${spec.pcgs}:${spec.grade.gradeNo}`);
    if (!line || h.reason.includes(line)) return h;
    return { ...h, reason: `${line}. ${h.reason}` };
  });

// Melt for one buy-it-now price. Whatnot's quantity is how many are left in stock, not how many
// pieces that price buys, so only a count written in the title ("x10", "10 coins") multiplies it.
export const shopMelt = (listing: ShopListing, spot: { gold: number | null; silver: number | null }): number | null => {
  const read = quickRead(listing.title).read;
  if (!read || (read.metal !== 'gold' && read.metal !== 'silver')) return null;
  const price = read.metal === 'gold' ? spot.gold : spot.silver;
  if (!price) return null;
  return price * read.oz * read.quantity;
};

const matchingBrace = (source: string, open: number): number => {
  let depth = 0;
  let quote: '"' | "'" | '`' | null = null;
  const end = Math.min(source.length, open + 12_000);
  for (let i = open; i < end; i++) {
    const c = source[i]!;
    if (quote) {
      if (c === '\\') {
        i += 1;
        continue;
      }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c;
      continue;
    }
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
};

// Pull a shop query out of a page script. The page's own text is what we send back, so a renamed
// field still matches whatever Whatnot shipped.
export const extractShopQuery = (source: string): { operation: string; query: string } | null => {
  const re = /query\s+([A-Za-z0-9_]*Shop[A-Za-z0-9_]*)\s*\(/g;
  let best: { operation: string; query: string; score: number } | null = null;
  for (const m of source.matchAll(re)) {
    const operation = m[1]!;
    if (/profile/i.test(operation)) continue;
    const brace = source.indexOf('{', m.index!);
    if (brace < 0 || brace - m.index! > 800) continue;
    const end = matchingBrace(source, brace);
    if (end < 0) continue;
    const query = source.slice(m.index!, end + 1);
    if (!/transactionType|transaction_type|\bprice\b/.test(query)) continue;
    let score = 0;
    if (/live/i.test(operation)) score += 3;
    if (/feed|bin/i.test(operation)) score += 2;
    if (/livestreamId|liveStreamId|liveId/.test(query)) score += 2;
    if (!best || score > best.score) best = { operation, query, score };
  }
  return best ? { operation: best.operation, query: best.query } : null;
};

// Variables the shop query declares. A live id is sent only for an id argument; extra names stay null.
export const shopVariables = (query: string, liveId: string, after: string | null): Record<string, unknown> | null => {
  const headerEnd = query.indexOf(')');
  const header = headerEnd > 0 ? query.slice(0, headerEnd) : '';
  const decls = [...header.matchAll(/\$(\w+)\s*:\s*([^,$)]+)/g)];
  if (!decls.length) return null;
  const vars: Record<string, unknown> = {};
  let sawLiveId = false;
  for (const m of decls) {
    const name = m[1]!;
    const type = (m[2] ?? '').replace(/\s/g, '');
    if (/after|cursor/i.test(name)) vars[name] = after;
    else if (/^Int!?$/.test(type) && /first|limit|size|count/i.test(name)) vars[name] = 24;
    else if (/^ID!?$/.test(type) && /live|stream|show|^id$/i.test(name)) {
      vars[name] = liveId;
      sawLiveId = true;
    } else if (/^Boolean!$/.test(type)) vars[name] = false;
    else vars[name] = null;
  }
  return sawLiveId ? vars : null;
};

// Keep filters and page size from a query the page already ran; the cursor and show id are ours.
export const shopVariablesFrom = (
  query: string,
  base: Record<string, unknown>,
  liveId: string,
  after: string | null,
): Record<string, unknown> | null => {
  const fresh = shopVariables(query, liveId, after);
  if (!fresh) return null;
  const merged: Record<string, unknown> = { ...fresh, ...base };
  for (const [k, v] of Object.entries(fresh)) {
    if (/after|cursor/i.test(k) || /live|stream|show|^id$/i.test(k)) merged[k] = v;
  }
  return merged;
};

// Used only when the page hasn't already shown us its shop query.
export const SHOP_FALLBACKS: { operation: string; query: string }[] = [
  {
    operation: 'LiveShopFeed',
    query: `query LiveShopFeed($livestreamId: ID!, $first: Int, $after: String) {
      liveShop(livestreamId: $livestreamId, first: $first, after: $after) {
        pageInfo { hasNextPage endCursor }
        edges { node { id title transactionType status quantity price { amount currency } } }
      }
    }`,
  },
  {
    operation: 'LivestreamShop',
    query: `query LivestreamShop($id: ID!, $first: Int, $after: String) {
      liveStream(id: $id) {
        id
        shop(first: $first, after: $after) {
          pageInfo { hasNextPage endCursor }
          edges { node { id title transactionType status quantity price { amount currency } } }
        }
      }
    }`,
  },
];
