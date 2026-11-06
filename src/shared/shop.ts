// The show's shop, read when you open it. Buy-it-now listings and named one-off auctions are kept.
// Giveaways, sold listings, and template auctions are skipped. A $1 auction price is the pre-bid
// opener, not a price you pay, so it is not scored. A hit is a price under melt or under sales
// you've watched, a watchlist match, a missing set date, or a known key date. Nothing here buys.
import { quickRead, type AppraisalItem, type AuctionSummary } from './appraisal';
import type { PerPieceShopRow } from './casePack';
import { compareToCollection, type CollectionSettings } from './collection';
import { DEFAULT_FEE_PERCENT, allInPrice, flipProfit, shippingOwed, type ShippingRules } from './costs';
import { readAmountText, toUsd } from './currency';
import { specLine } from './deviceSpecs';
import {
  electronicsWantMatches,
  isGenericDeviceClass,
  isPartsCondition,
  isPullBucket,
  isSpecificDevice,
  missingAccessory,
} from './electronics';
import { isTemplate } from './estate';
import { matchWatch, matchWishlist, type WatchItem, type WishlistItem } from './buyer';
import { keyDateCallouts, keyDatePrice } from './keyDates';
import { formatMoney, moneyCurrency } from './money';
import { prizeMelt } from './prizeValue';
import type { RefPrice } from './refPrice';
import { findComps, summarizeComps, type SoldItem } from './soldHistory';
import type { ShowType } from './showType';
import { toolsLine } from './tools';

export interface ShopListing {
  id: string;
  title: string;
  subtitle?: string | null;
  price: number;
  quantity: number;
  mode?: 'bin' | 'auction';
  currency?: string | null;
  usdPrice?: number | null;
}

export type ShopHitKind = 'steal' | 'deal' | 'must';
export type ShopFilterMode = 'all' | 'bin' | 'wishlist';

export interface ShopHit {
  id: string;
  title: string;
  price: number;
  quantity: number;
  kind: ShopHitKind;
  reason: string;
  mode?: 'bin' | 'auction';
  onWishlist?: boolean;
  wishlistCeiling?: number | null;
}

export interface ShopScan {
  status: 'ready' | 'error' | 'scanning';
  binCount: number;
  auctionCount?: number;
  hits: ShopHit[];
  perPieceRows?: PerPieceShopRow[];
  filter?: ShopFilterMode;
  coupons?: string[];
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

const listingIdOf = (o: Record<string, unknown>, title?: string | null, price?: number | null): string | null =>
  str(o.id ?? o.uuid ?? o.listingId ?? o.productId) ?? (title && price != null ? `${title}|${price}` : null);

const explicitQuantityOf = (o: Record<string, unknown>): number | null =>
  num(o.quantity ?? o.inventory ?? obj(o.inventoryLevel)?.quantity ?? obj(o.inventoryLevel)?.available ?? obj(o.inventory)?.quantity);

const readListing = (o: Record<string, unknown>): ShopListing | null => {
  const type = str(
    o.transactionType ??
      o.transaction_type ??
      o.listingType ??
      o.type ??
      obj(o.listing)?.transactionType ??
      obj(o.listing)?.listingType ??
      obj(o.listing)?.type ??
      obj(o.product)?.transactionType ??
      obj(o.product)?.listingType ??
      obj(o.product)?.type,
  );
  if (type && GIVEAWAY_TYPE.test(type)) return null;
  const auction = type ? AUCTION_TYPE.test(type) : false;
  if (type && !auction && !BIN_TYPE.test(type)) return null;
  if (!type && money(o.buyNowPrice) == null && money(o.binPrice) == null && money(o.buyItNowPrice) == null && o.isBuyNow !== true) {
    return null;
  }
  const status = str(o.status ?? o.publicStatus ?? o.state ?? o.listingStatus ?? obj(o.listing)?.status);
  if (status && SOLD_STATUS.test(status)) return null;
  const explicitQty = explicitQuantityOf(o);
  if (explicitQty !== null && explicitQty <= 0) return null;
  const title = str(o.title ?? o.name ?? o.productName ?? obj(o.product)?.title ?? obj(o.listing)?.title ?? obj(o.product)?.name);
  if (!title || title.length < 2) return null;
  const price =
    money(o.price) ??
    money(o.buyNowPrice) ??
    money(o.binPrice) ??
    money(o.buyItNowPrice) ??
    money(obj(o.listing)?.price) ??
    money(obj(o.product)?.price) ??
    money(o.priceCents, true) ??
    money(o.buyNowPriceCents, true) ??
    money(o.buyItNowPriceCents, true);
  if (price === null || price <= 0) return null;
  const rawQty = explicitQty ?? 1;
  const quantity = Math.max(1, Math.min(999, Math.round(rawQty)));
  const id = listingIdOf(o, title, price)!;
  const subtitle = str(o.subtitle ?? o.subTitle ?? o.condition ?? obj(o.product)?.subtitle ?? obj(o.listing)?.subtitle);
  let currency =
    moneyCurrency(o.price) ??
    moneyCurrency(o.buyNowPrice) ??
    moneyCurrency(o.binPrice) ??
    str(o.currency ?? o.currencyCode)?.toUpperCase() ??
    null;
  let usdPrice: number | null = num(o.usdPrice);
  const priceTextCandidates = [
    str(o.priceText),
    str(o.formattedPrice),
    str(obj(o.price)?.formatted),
    str(obj(o.price)?.display),
    subtitle,
    str(o.description),
  ];
  for (const candidate of priceTextCandidates) {
    if (!candidate) continue;
    const parsed = readAmountText(candidate);
    if (parsed && parsed.code !== 'USD') {
      currency = currency ?? parsed.code;
      if (parsed.usd !== null && usdPrice === null) usdPrice = parsed.usd;
    }
  }
  return {
    id,
    title: title.slice(0, 160),
    ...(subtitle ? { subtitle } : {}),
    price,
    quantity,
    mode: auction ? 'auction' : 'bin',
    ...(currency && currency !== 'USD' ? { currency } : {}),
    ...(usdPrice !== null ? { usdPrice } : {}),
  };
};

export const MAX_LISTINGS = 3000;

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

export const readRemovedShopIds = (body: unknown): Set<string> => {
  const removed = new Set<string>();
  const walk = (node: unknown, depth: number) => {
    if (depth > 8 || removed.size >= MAX_LISTINGS) return;
    if (Array.isArray(node)) {
      for (const n of node) walk(n, depth + 1);
      return;
    }
    const o = obj(node);
    if (!o) return;
    const type = str(o.transactionType ?? o.transaction_type ?? obj(o.listing)?.transactionType ?? obj(o.product)?.transactionType);
    if (type && !GIVEAWAY_TYPE.test(type) && (AUCTION_TYPE.test(type) || BIN_TYPE.test(type))) {
      const status = str(o.status ?? o.publicStatus ?? o.state ?? o.listingStatus);
      const explicitQty = explicitQuantityOf(o);
      if ((status && SOLD_STATUS.test(status)) || (explicitQty !== null && explicitQty <= 0)) {
        const title = str(o.title ?? o.name ?? o.productName ?? obj(o.product)?.title ?? obj(o.listing)?.title);
        const price = money(o.price) ?? money(o.buyNowPrice) ?? money(o.binPrice);
        const id = listingIdOf(o, title, price);
        if (id) removed.add(id);
      }
    }
    for (const v of Object.values(o)) if (v && typeof v === 'object') walk(v, depth + 1);
  };
  walk(body, 0);
  return removed;
};

export const mergeShopListings = (
  current: ShopListing[],
  incoming: ShopListing[],
  removedIds: Iterable<string> = [],
): ShopListing[] => {
  const removed = new Set(removedIds);
  const byId = new Map<string, ShopListing>();
  for (const item of current) {
    if (!removed.has(item.id)) byId.set(item.id, item);
  }
  for (const item of incoming) {
    if (removed.has(item.id)) continue;
    if (byId.has(item.id) || byId.size < MAX_LISTINGS) {
      byId.set(item.id, item);
    }
  }
  return [...byId.values()];
};

const normSaleTitle = (s: string | null | undefined) =>
  (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

export const applySaleToShopListings = (
  listings: ShopListing[],
  sale: { id?: string | null; productId?: string | null; title?: string | null; kind?: string | null },
): ShopListing[] => {
  if (!listings.length || sale.kind === 'giveaway') return listings;
  const candidateIds = [sale.productId, sale.id].filter((x): x is string => Boolean(x && x.trim()));
  let idx = candidateIds.length ? listings.findIndex((l) => candidateIds.includes(l.id)) : -1;
  if (idx < 0 && sale.title) {
    const want = normSaleTitle(sale.title);
    if (want) {
      idx = listings.findIndex((l) => (l.mode ?? 'bin') === 'bin' && normSaleTitle(l.title) === want);
    }
  }
  if (idx < 0) return listings;
  const hit = listings[idx]!;
  if (hit.mode === 'auction' || hit.quantity <= 1) {
    return listings.filter((_, i) => i !== idx);
  }
  return listings.map((l, i) => (i === idx ? { ...l, quantity: l.quantity - 1 } : l));
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

  export const readShopPage = (
    body: unknown,
  ): { listings: ShopListing[]; cursor: string | null; error: boolean; removedIds: string[] } => {
    const listings = parseShopListings(body);
    const removedIds = [...readRemovedShopIds(body)];
    const errors = Array.isArray((body as { errors?: unknown })?.errors) && ((body as { errors: unknown[] }).errors?.length ?? 0) > 0;
    return {
      listings,
      cursor: errors && !listings.length ? null : shopCursor(body),
      error: errors && listings.length === 0,
      removedIds,
    };
  };

  const KIND_RANK: Record<ShopHitKind, number> = { steal: 0, deal: 1, must: 2 };
  const STEAL_RATIO = 0.6;
  export const MAX_SHOP_HITS = 8;

  // Every must-have carries a market price. Until one is known it says so instead of staying silent.
  export const NO_MARKET_LINE = 'Market: no price yet';
  // Melt is deliberately absent: it is a floor, not what the item sells for.
  const PRICE_LINE_RE =
    /(?:^|\.\s)(?:Market|Guide|AI est\.|Under AI est\.|Prints|Discogs listed from)\s+\$/;

  export const hasPriceLine = (reason: string): boolean => PRICE_LINE_RE.test(reason);

  const joinNotes = (parts: (string | null | undefined)[]): string =>
    parts
      .filter((s): s is string => Boolean(s && s.trim()))
      .join('. ')
      .replace(/\.\./g, '.');

  export const stripNoMarket = (reason: string): string =>
    !reason.includes(NO_MARKET_LINE)
      ? reason
      : joinNotes(reason.split(/\.\s+/).filter((p) => p.trim().replace(/\.$/, '') !== NO_MARKET_LINE));

  // Puts a price line first on a hit's reason, replacing the "no price yet" placeholder.
  export const withPriceLine = (reason: string, line: string): string => {
    const rest = stripNoMarket(reason);
    return rest.includes(line) ? rest : joinNotes([line, rest]);
  };

  // A must-have with no price line gets the placeholder so the gap is visible.
  export const ensureMustPrice = <T extends Pick<ShopHit, 'kind' | 'reason'>>(hit: T): T => {
    if (hit.kind !== 'must' || hasPriceLine(hit.reason)) {
      const reason = stripNoMarket(hit.reason);
      return reason === hit.reason ? hit : { ...hit, reason };
    }
    return hit.reason.startsWith(NO_MARKET_LINE) ? hit : { ...hit, reason: joinNotes([NO_MARKET_LINE, hit.reason]) };
  };

  export interface ShopScoreInput {
    listings: ShopListing[];
    sold: SoldItem[];
    showType?: ShowType;
    watchlist: WatchItem[];
    wishlist?: WishlistItem[];
    maxBidPercent: number;
    meltOf: (listing: ShopListing) => number | null;
    now: number;
    currencyRate?: number | null;
    shipping?: number | null;
    shippingRules?: ShippingRules | null;
    hasWinThisShow?: boolean;
    taxPercent?: number;
    feePercent?: number;
    coupons?: string[];
    collection?: CollectionSettings | null;
    ownedTitles?: string[];
    chatWants?: string[];
    limit?: number;
  }

  const shopOpenerPrice = (listings: ShopListing[]): number => {
    const auctions = listings.filter((l) => l.mode === 'auction');
    if (!auctions.length) return 1;
    const counts = new Map<number, number>();
    let modePrice = 1;
    let modeCount = 0;
    for (const a of auctions) {
      const c = (counts.get(a.price) ?? 0) + 1;
      counts.set(a.price, c);
      if (c > modeCount) {
        modeCount = c;
        modePrice = a.price;
      }
    }
    if (modePrice <= 5 && modeCount * 2 >= auctions.length) {
      return Math.max(1, modePrice);
    }
    return 1;
  };

    export const scoreShop = ({
      listings,
      sold,
      showType,
      watchlist,
      wishlist,
      maxBidPercent,
      meltOf,
      now,
      currencyRate,
      shipping,
      shippingRules,
      hasWinThisShow,
      taxPercent,
      feePercent,
      coupons,
      collection,
      ownedTitles,
      chatWants,
      limit = MAX_SHOP_HITS,
    }: ShopScoreInput): ShopHit[] => {
      const openerPrice = shopOpenerPrice(listings);
      const hasCostContext =
        (shipping !== undefined && shipping !== null) ||
        Boolean(hasWinThisShow) ||
        (taxPercent !== undefined && taxPercent > 0) ||
        Boolean(shippingRules);
      const ownedPool = [...(collection?.owned ?? []), ...(ownedTitles ?? [])];
      const hasCollection = ownedPool.length > 0 || (collection?.sets.length ?? 0) > 0;
      const hits: (ShopHit & { edge: number })[] = [];

      for (const item of listings) {
        if (item.quantity <= 0) continue;
        if (isTemplate(item.title) || isPullBucket(item.title) || isGenericDeviceClass(item.title)) continue;
        if (/\b(?:giveaway|givvy|givy)\b/i.test(item.title)) continue;
        const code = (item.currency ?? 'USD').toUpperCase();
        const effectivePrice =
          code === 'USD'
            ? item.price
            : (item.usdPrice ?? toUsd(item.price, code, currencyRate ?? null));
        if (effectivePrice === null || !Number.isFinite(effectivePrice) || effectivePrice <= 0) continue;
        if (effectivePrice >= 10_000 && item.quantity >= 20) continue;
        if (item.quantity >= 20 && !isSpecificDevice(item.title)) continue;
        // Whatnot's Pre-bid button is an auction that has not started. $1 (or the shared low start
        // across at least half the shop's auctions at $5 or less) is the opener, not a price you can pay.
        if (item.mode === 'auction' && item.price <= openerPrice) continue;
        const parts = isPartsCondition(item.subtitle, item.title);
        const fullText = item.subtitle ? `${item.title} ${item.subtitle}` : item.title;
        const compQueries = item.subtitle ? [fullText, item.title] : [item.title];
        const comps = summarizeComps(findComps(compQueries, sold, now, 8, showType));
        const median = comps && comps.count >= 2 ? comps.median : null;
        const melt = meltOf(item);
        const isBin = (item.mode ?? 'bin') === 'bin';
        const watch = matchWatch(item.title, watchlist) ?? (item.subtitle ? matchWatch(fullText, watchlist) : null);
        const wish = isBin && wishlist?.length
          ? (matchWishlist(item.title, wishlist) ?? (item.subtitle ? matchWishlist(fullText, wishlist) : null))
          : null;
        const keys = keyDateCallouts({ text: fullText }).filter((c) => c.kind !== 'check');

        const owed = hasCostContext
          ? shippingOwed({
            rules: shippingRules ?? null,
            lotTitle: item.title,
            pageShipping: shipping ?? null,
            hasWinThisShow: Boolean(hasWinThisShow),
          })
          : null;
        const allIn = owed ? allInPrice(effectivePrice, owed, taxPercent ?? 0) : null;
        const landedPrice = allIn ? allIn.total : effectivePrice;

        const underMelt = !parts && melt !== null && landedPrice < melt;
        const stealComps = !parts && median !== null && landedPrice <= median * STEAL_RATIO;
        const max = median !== null ? (median * maxBidPercent) / 100 : null;
        const dealComps = !parts && max !== null && landedPrice <= max && !stealComps;
        const watchDeal = !parts && watch?.max != null && landedPrice <= watch.max;
        const wishDeal = !parts && wish?.max != null && landedPrice <= wish.max;
        const pricedFair = median !== null && landedPrice > median;
        const keyMust = keys.length > 0 && !pricedFair;

        const coll = hasCollection ? compareToCollection({ name: fullText }, ownedPool, collection?.sets ?? []) : null;
        const setNeeded = Boolean(!parts && !pricedFair && coll?.set && !coll.set.have);
        const wantHit = Boolean(
          !parts && chatWants?.length && chatWants.some((w) => electronicsWantMatches(w, item.title, item.subtitle)),
        );

        let kind: ShopHitKind | null = null;
        if (underMelt || stealComps) kind = 'steal';
        else if (dealComps || watchDeal || wishDeal) kind = 'deal';
        else if ((watch && watch.max == null) || (wish && (wish.max == null || landedPrice > wish.max)) || keyMust || setNeeded) kind = 'must';
        if (!kind) continue;

        const notes: string[] = [];
        if (kind === 'must') {
          if (median !== null && comps) notes.push(`Market ${formatMoney(median)} (median of ${comps.count} sales)`);
          else notes.push(NO_MARKET_LINE);
          // Melt is a floor, not a market price, so it never stands in for one.
          if (melt !== null && melt > 0) notes.push(`Melt ${formatMoney(melt)}`);
        }
        if (underMelt && melt !== null) notes.push(`Under melt (${formatMoney(melt)})`);
        if (stealComps && median !== null && comps) notes.push(`Under ${formatMoney(median)} median of ${comps.count} sales`);
        if (kind === 'deal' && dealComps && max !== null && comps) {
          notes.push(`Under your max ${formatMoney(max)} (${comps.count} sales around ${formatMoney(median)})`);
        }
        if (wish?.max != null && landedPrice <= wish.max && kind !== 'steal') {
          notes.push(`Under wishlist max ${formatMoney(wish.max)}`);
        } else if (wish) {
          notes.push('On your wishlist');
        }
        if (watch?.max != null && landedPrice <= watch.max && kind !== 'steal' && !wishDeal) {
          notes.push(`At your watchlist max ${formatMoney(watch.max)}`);
        } else if (watch && !wish) {
          notes.push('On your watchlist');
        }
        if (keys[0] && (kind === 'must' || kind === 'steal' || kind === 'deal')) notes.push(keys[0].text);
        if (coll?.set) {
          notes.push(
            coll.set.have
              ? `Already in your set: ${coll.set.text}`
              : `Needed for your set: ${coll.set.text} (you have ${coll.set.dates} dates)`,
          );
        } else if (coll && coll.similar > 0) {
          notes.push(`You own ${coll.similar} like this`);
        }

        const tLine = toolsLine(item.title, item.subtitle);
        const sLine = !tLine ? specLine(item.title, item.subtitle) : null;
        const missAcc = missingAccessory(item.title, item.subtitle);
        if (tLine) notes.push(tLine);
        else if (sLine) notes.push(sLine);
        if (missAcc) notes.push(missAcc);
        if (wantHit) notes.push('Matches chat want');

        const reference = Math.max(melt ?? 0, median ?? 0);
        if (hasCostContext && allIn && (kind === 'steal' || kind === 'deal')) {
          if (allIn.shippingPaid) notes.push('Combined shipping');
          else if (landedPrice > effectivePrice) notes.push(`All-in ${formatMoney(landedPrice)}`);
          if (reference > 0) {
            const flip = flipProfit(reference, landedPrice, feePercent ?? DEFAULT_FEE_PERCENT);
            if (flip.profit >= 1) notes.push(`Flip +${formatMoney(flip.profit)} after fees`);
          }
        }
        if (coupons?.length && (kind === 'steal' || kind === 'deal')) {
          notes.push(`Coupon ${coupons[0]}`);
        }

        const edgeRef = reference > 0 ? (reference - landedPrice) / reference : (wish?.max != null && landedPrice < wish.max ? (wish.max - landedPrice) / wish.max : 0);
        hits.push({
          id: item.id,
          title: item.title,
          price: effectivePrice,
          quantity: item.quantity,
          kind,
          mode: item.mode ?? 'bin',
          reason: notes.filter((n, i) => notes.indexOf(n) === i).join('. '),
          edge: edgeRef,
          onWishlist: Boolean(wish),
          wishlistCeiling: wish?.max ?? null,
        });
      }
      return hits
        .sort(
          (a, b) =>
            KIND_RANK[a.kind] - KIND_RANK[b.kind] ||
            (b.onWishlist ? 1 : 0) - (a.onWishlist ? 1 : 0) ||
            b.edge - a.edge ||
            a.price - b.price,
        )
        .slice(0, Math.max(1, limit))
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

      export const shopSummary = (scan: Pick<ShopScan, 'status' | 'binCount' | 'auctionCount' | 'coupons'>): string => {
        if (scan.status === 'error') return "Couldn't read this show's shop.";
        if (scan.status === 'scanning') {
          const noun = scan.auctionCount ? 'items' : 'buy-it-now items';
          return `Scanning shop… ${scan.binCount} ${noun} checked.`;
        }
        if (!scan.binCount) return scan.auctionCount ? 'No shop items.' : 'No buy-it-now items in this shop.';
        const noun = scan.auctionCount ? 'shop' : 'buy-it-now';
        const base = `Checked ${scan.binCount} ${noun} item${scan.binCount === 1 ? '' : 's'}.`;
        return scan.coupons?.length ? `${base} Coupon ${scan.coupons[0]} in show notes.` : base;
      };

          export interface ApplyShopWorthOptions {
            maxBidPercent?: number;
            watchlist?: WatchItem[];
          }

          export const applyShopWorth = (
            hits: ShopHit[],
            lines: ReadonlyMap<string, string>,
            options?: ApplyShopWorthOptions,
          ): ShopHit[] => {
            const maxPct = options?.maxBidPercent ?? 80;
            let reordered = false;
            const out: { hit: ShopHit; edge: number }[] = [];

            for (const h of hits) {
              if (h.kind !== 'must') {
                out.push({ hit: h, edge: 0 });
                continue;
              }
              const spec = keyDatePrice(h.title);
              if (!spec) {
                out.push({ hit: h, edge: 0 });
                continue;
              }
              const line = lines.get(`${spec.pcgs}:${spec.grade.gradeNo}`);
      if (!line) {
        out.push({ hit: h, edge: 0 });
        continue;
      }
      const marketMatch = line.match(/^Market\s+\$([\d,]+(?:\.\d+)?)/i);
      const guideMatch = line.match(/^Guide\s+\$([\d,]+(?:\.\d+)?)/i);
      const marketVal = marketMatch?.[1] ? parseFloat(marketMatch[1].replace(/,/g, '')) : null;
      const guideVal = guideMatch?.[1] ? parseFloat(guideMatch[1].replace(/,/g, '')) : null;
      const onWatch = Boolean(options?.watchlist?.length && matchWatch(h.title, options.watchlist));

      let nextKind: ShopHitKind = h.kind;
      let edge = 0;
      if (marketVal !== null && marketVal > 0) {
        if (h.price > marketVal * 1.25 && !onWatch) {
          reordered = true;
          continue;
        }
        if (h.price <= marketVal * STEAL_RATIO) nextKind = 'steal';
        else if (h.price <= (marketVal * maxPct) / 100) nextKind = 'deal';
        edge = (marketVal - h.price) / marketVal;
        if (nextKind !== h.kind) reordered = true;
      } else if (guideVal !== null && guideVal > 0) {
        if (h.price > guideVal * 1.5 && !onWatch) {
          reordered = true;
          continue;
        }
      }

      const reason = withPriceLine(h.reason, line);
      if (reason === h.reason && nextKind === h.kind) {
        out.push({ hit: h, edge });
      } else {
        out.push({ hit: { ...h, kind: nextKind, reason }, edge });
      }
    }

    if (reordered) {
      out.sort((a, b) => KIND_RANK[a.hit.kind] - KIND_RANK[b.hit.kind] || b.edge - a.edge || a.hit.price - b.hit.price);
    }
    return out.map((x) => x.hit);
  };

  // --- Card, PSA cert, and vinyl reference lookup helpers ---

  const CARD_SETS_RE =
    /\b(base\s+set(?:\s+2)?|jungle|fossil|team\s+rocket|gym\s+heroes|gym\s+challenge|neo\s+\w+|evolving\s+skies|crown\s+zenith|paldean\s+fates|prismatic\s+evolutions|surging\s+sparks|obsidian\s+flames|twilight\s+masquerade|stellar\s+crown|151|shining\s+fates|hidden\s+fates|vivid\s+voltage|champions\s+path|fusion\s+strike|brilliant\s+stars|astral\s+radiance|lost\s+origin|silver\s+tempest|scarlet\s+&?\s*violet|alpha|beta|unlimited|revised|arabian\s+nights|antiquities|legends|the\s+dark|modern\s+horizons(?:\s+[23])?|commander(?:\s+masters)?|lob|mrd|srl|psv|lon|lod|pgd|mfc|dcr|ioc|ast|sod|rds|fet|tlm|crv|een|soi|eoJ|potd|cdip|ston|fotb|taev|glax|ptdn|lodt|tdgs|csoc|crms|rgbt|anpr|sovr|abpf|tshd|drev|stbl|stor|exvc|genf|phsw|orcs|gaov|redu|abyr|cblz|ltgy|jotl|shsp|lval|prio|duea|nech|sece|cros|core|docs|bosh|shvi|tdil|inov|rate|macr|cotd|cibr|exfo|flod|cyho|sofu|sast|dane|rira|chim|igAS|etco|rotd|phra|blvo|liov|dama|bode|bach|difo|pote|dabl|phhy|cyac|dune|agov|phni|lede|info|rota)\b/i;

  const YGO_CODE_RE = /\b([A-Z]{3,4}-(?:EN|AE|DE|FR|IT|SP|PT|JP)?\d{3})\b/;
  const PRINTED_CARD_NUM_RE = /(?<![\d/])#?(\d{1,3}\/([1-9]\d{1,2}))\b(?![\d/])/;
  const PSA_CERT_RE = /\b(?:cert(?:ificate)?(?:\s*#|\s+no\.?)?\s*|psa\s+(?:10|9|8|7|6|5|4|3|2|1(?:\.5)?)\s+(?:gem\s+mint\s+|mint\s+)?#?|(?:psa|cert)\s*#)(\d{7,9})\b/i;
  const SLAB_RE = /\b(?:psa|bgs|cgc|sgc)\s+\d+(?:\.\d+)?\b|\bslab(?:bed)?\b/i;

  export const extractShopRefQuery = (listing: ShopListing, showType?: ShowType): Partial<AppraisalItem> | null => {
    if (isTemplate(listing.title) || isPullBucket(listing.title) || isGenericDeviceClass(listing.title)) return null;
    if (isPartsCondition(listing.subtitle, listing.title)) return null;
    const fullText = [listing.title, listing.subtitle].filter(Boolean).join(' ');

    // 1. Stated PSA cert number (7 to 9 digits explicitly written in the listing)
    if (/\bpsa\b/i.test(fullText)) {
      const certMatch = fullText.match(PSA_CERT_RE);
      if (certMatch?.[1]) {
        const yearMatch = fullText.match(/\b(19\d{2}|20\d{2})\b/);
        return {
          item_name: listing.title,
          item_type: 'trading_card',
          is_slabbed: true,
          grading_service: 'PSA',
          cert_number: certMatch[1],
          year: yearMatch?.[1] ? parseInt(yearMatch[1], 10) : null,
        };
      }
    }

    // 2. Trading cards with printed number (N/M where M >= 10) or Yu-Gi-Oh set code
    const ygoMatch = fullText.match(YGO_CODE_RE);
    const numMatch = fullText.match(PRINTED_CARD_NUM_RE);
    if (ygoMatch || numMatch) {
      let game: 'pokemon' | 'magic' | 'yugioh' | null = null;
      if (/\b(?:mtg|magic\s+the\s+gathering)\b/i.test(fullText)) game = 'magic';
      else if (/\b(?:yugioh|yu-gi-oh)\b/i.test(fullText) || (ygoMatch && (showType === 'cards' || /\b(?:holo|rare|ultra|secret|1st\s+ed|edition|konami|card)\b/i.test(fullText)))) {
        game = 'yugioh';
      } else if (
        /\b(?:pokemon|pokémon|pikachu|charizard|umbreon|mewtwo|lugia|rayquaza|eevee|blastoise|venusaur|gengar|gyarados|alakazam|dragonite|snorlax|mew\b|tcg|vmax|vstar|gx\b|ex\b|full\s+art|base\s+set|1st\s+ed(?:ition)?|holo(?:foil)?|reverse\s+holo)\b/i.test(
          fullText,
        ) ||
        (showType === 'cards' && numMatch)
      ) {
        game = 'pokemon';
      }
      if (game) {
        const number = ygoMatch?.[1] ?? numMatch?.[1] ?? null;
        const setMatch = fullText.match(CARD_SETS_RE);
        const set = setMatch?.[1]?.trim() ?? null;
        const cleanName = listing.title
          .replace(PRINTED_CARD_NUM_RE, ' ')
          .replace(YGO_CODE_RE, ' ')
          .replace(CARD_SETS_RE, ' ')
          .replace(/\b(?:psa|bgs|cgc|sgc)\s+\d+(?:\.\d+)?\b/gi, ' ')
          .replace(/\b(?:19\d{2}|20\d{2})\b/g, ' ')
          .replace(
            /\b(?:pokemon|pokémon|mtg|magic\s+the\s+gathering|yugioh|yu-gi-oh|tcg|card|cards|holo|holofoil|reverse\s+holo|foil|1st\s+edition|1st\s+ed|unlimited|shadowless|nm|near\s+mint|mint|lp|lightly\s+played|mp|hp|raw|pack\s+fresh|gem\s+mint)\b/gi,
            ' ',
          )
          .replace(/[#()[\]•·—–-]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (cleanName.length >= 2) {
          return {
            item_name: listing.title,
            item_type: 'trading_card',
            is_slabbed: SLAB_RE.test(fullText),
            card: { game, name: cleanName, set, number },
          };
        }
      }
    }

    // 3. Vinyl records
    if (/\b(?:vinyl|lp\b|12"\s*record|33\s*rpm|45\s*rpm)\b/i.test(fullText)) {
      return {
        item_name: listing.title,
        item_type: 'vinyl_media',
      };
    }

    return null;
  };

  export interface ApplyShopRefsOptions {
    maxBidPercent?: number;
    currencyRate?: number | null;
    limit?: number;
  }

  export const applyShopRefs = (
    listings: ShopListing[],
    hits: ShopHit[],
    refsById: ReadonlyMap<string, RefPrice[]>,
    options?: ApplyShopRefsOptions,
  ): ShopHit[] => {
    if (!refsById.size) return hits;
    const maxPct = options?.maxBidPercent ?? 80;
    const limit = options?.limit ?? MAX_SHOP_HITS;
    const listingById = new Map(listings.map((l) => [l.id, l]));
    const updated: (ShopHit & { edge: number })[] = [];
    const handledIds = new Set<string>();

    for (const hit of hits) {
      handledIds.add(hit.id);
      const refs = refsById.get(hit.id);
      if (!refs?.length) {
        updated.push({ ...hit, edge: 0 });
        continue;
      }
      const listing = listingById.get(hit.id);
      const fullText = [listing?.title ?? hit.title, listing?.subtitle].filter(Boolean).join(' ');
      const slabbed = SLAB_RE.test(fullText);

      let kind: ShopHitKind = hit.kind;
      let edge = 0;
      const notes: string[] = [];

      for (const ref of refs) {
        if (ref.source === 'psa') {
          if (ref.mismatch) {
            notes.push(`⚠ PSA cert mismatch (${ref.name})`);
            if (kind === 'steal' || kind === 'deal') kind = 'must';
          } else {
            notes.push(`PSA verified: ${ref.detail || ref.name}`);
          }
        } else if (ref.kind === 'market' && ref.value && ref.value > 0) {
          const line = `Market ${formatMoney(ref.value)} (${ref.source})`;
          notes.push(line);
          if (!slabbed) {
            if (hit.price <= ref.value * STEAL_RATIO) kind = 'steal';
            else if (hit.price <= (ref.value * maxPct) / 100 && kind === 'must') kind = 'deal';
            edge = Math.max(edge, (ref.value - hit.price) / ref.value);
          }
        } else if (ref.kind === 'range' && ref.value && ref.high) {
          notes.push(`Prints ${formatMoney(ref.value)}–${formatMoney(ref.high)} (${ref.source})`);
        } else if (ref.kind === 'listed' && ref.value) {
          notes.push(`Discogs listed from ${formatMoney(ref.value)}`);
        }
      }

      const combined = joinNotes([...notes.filter((n) => !hit.reason.includes(n)), stripNoMarket(hit.reason)]);
      updated.push(ensureMustPrice({ ...hit, kind, reason: combined, edge }));
    }

    for (const item of listings) {
      if (handledIds.has(item.id)) continue;
      const refs = refsById.get(item.id);
      if (!refs?.length) continue;
      const fullText = [item.title, item.subtitle].filter(Boolean).join(' ');
      const slabbed = SLAB_RE.test(fullText);
      const effectivePrice = listingUsdPrice(item, options?.currencyRate);
      if (effectivePrice === null || effectivePrice <= 0) continue;

      const psaMismatch = refs.find((r) => r.source === 'psa' && r.mismatch);
      if (psaMismatch) {
        updated.push({
          id: item.id,
          title: item.title,
          price: effectivePrice,
          quantity: item.quantity,
          kind: 'must',
          mode: item.mode ?? 'bin',
          reason: `${NO_MARKET_LINE}. ⚠ PSA cert mismatch (${psaMismatch.name})`,
          edge: 0,
        });
        continue;
      }

      const marketRef = !slabbed ? refs.find((r) => r.kind === 'market' && r.value && r.value > 0) : undefined;
      if (marketRef?.value) {
        const mVal = marketRef.value;
        let kind: ShopHitKind | null = null;
        if (effectivePrice <= mVal * STEAL_RATIO) kind = 'steal';
        else if (effectivePrice <= (mVal * maxPct) / 100) kind = 'deal';
        if (kind) {
          updated.push({
            id: item.id,
            title: item.title,
            price: effectivePrice,
            quantity: item.quantity,
            kind,
            mode: item.mode ?? 'bin',
            reason: `Market ${formatMoney(mVal)} (${marketRef.source})`,
            edge: (mVal - effectivePrice) / mVal,
          });
        }
      }
    }

    return updated
      .sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || b.edge - a.edge || a.price - b.price)
      .slice(0, Math.max(1, limit))
      .map(({ edge: _edge, ...hit }) => hit);
  };

  export const monitorShopBadge = (
    shop: Pick<ShopScan, 'status' | 'hits'> | null | undefined,
  ): { text: string; kind: 'steal' | 'deal' } | null => {
    if (!shop || (shop.status !== 'ready' && shop.status !== 'scanning') || !shop.hits.length) return null;
    const steals = shop.hits.filter((h) => h.kind === 'steal');
    if (steals.length === 1) {
      return { kind: 'steal', text: `Shop steal: ${steals[0]!.title} ${formatMoney(steals[0]!.price)}` };
    }
    if (steals.length > 1) {
      const min = Math.min(...steals.map((h) => h.price));
      return { kind: 'steal', text: `${steals.length} shop steals (from ${formatMoney(min)})` };
    }
    const deals = shop.hits.filter((h) => h.kind === 'deal');
    if (deals.length === 1) {
      return { kind: 'deal', text: `Shop deal: ${deals[0]!.title} ${formatMoney(deals[0]!.price)}` };
    }
    if (deals.length > 1) {
      const min = Math.min(...deals.map((h) => h.price));
      return { kind: 'deal', text: `${deals.length} shop deals (from ${formatMoney(min)})` };
    }
    return null;
  };

  export interface ShopAiInputItem {
    id: string;
    title: string;
    subtitle?: string | null;
    price: number;
  }

  export interface ShopAiEstimate {
    id: string;
    low: number;
    high: number;
    info: string;
  }

  export const MAX_SHOP_AI_ITEMS = 20;

  export const SHOP_AI_INSTRUCTIONS = [
    'You evaluate Whatnot live-show shop listings in the background.',
    'For each numbered listing, give the per-item US price range (low, high) where recent SOLD copies land (eBay sold or Whatnot sold), not asking or retail prices.',
    'info: at most 10 words of helpful collector context (key date, semi-key, variety, silver/gold content, grade note, or notable model detail), or "" if ordinary. Never invent mintage or population numbers.',
    'Be conservative: if unsure, lean low. Keep high at most 2x low. Use 0 for low and high when the listing does not name a specific priceable item.',
  ].join('\n');

  export const SHOP_AI_SCHEMA = {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            i: { type: 'integer' },
            low: { type: 'number' },
            high: { type: 'number' },
            info: { type: 'string' },
          },
          required: ['i', 'low', 'high', 'info'],
          additionalProperties: false,
        },
      },
    },
    required: ['items'],
    additionalProperties: false,
  };

  export const SHOP_AI_SCHEMA_GEMINI = {
    type: 'OBJECT',
    properties: {
      items: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            i: { type: 'INTEGER' },
            low: { type: 'NUMBER' },
            high: { type: 'NUMBER' },
            info: { type: 'STRING' },
          },
          required: ['i', 'low', 'high', 'info'],
        },
      },
    },
    required: ['items'],
  };

  const listingUsdPrice = (item: ShopListing, currencyRate?: number | null): number | null => {
    const code = (item.currency ?? 'USD').toUpperCase();
    return code === 'USD' ? item.price : (item.usdPrice ?? toUsd(item.price, code, currencyRate ?? null));
  };

  // Picks unpriced must-haves (key dates, semi-keys, varieties, watchlist items) first, then specific
  // shop listings that weren't already scored as steals or deals.
  export const selectShopAiItems = (
    listings: ShopListing[],
    hits: ShopHit[],
    currencyRate?: number | null,
  ): ShopAiInputItem[] => {
    const openerPrice = shopOpenerPrice(listings);
    const hitById = new Map(hits.map((h) => [h.id, h]));
    const mustFirst: ShopAiInputItem[] = [];
    const rest: ShopAiInputItem[] = [];
    for (const item of listings) {
      if (item.quantity <= 0) continue;
      if (isTemplate(item.title) || isPullBucket(item.title) || isGenericDeviceClass(item.title)) continue;
      if (/\b(?:giveaway|givvy|givy)\b/i.test(item.title)) continue;
      const effectivePrice = listingUsdPrice(item, currencyRate);
      if (effectivePrice === null || !Number.isFinite(effectivePrice) || effectivePrice <= 0) continue;
      if (effectivePrice >= 10_000 && item.quantity >= 20) continue;
      if (item.quantity >= 20 && !isSpecificDevice(item.title)) continue;
      if (item.mode === 'auction' && item.price <= openerPrice) continue;
      if (isPartsCondition(item.subtitle, item.title)) continue;
      const existing = hitById.get(item.id);
      const entry: ShopAiInputItem = {
        id: item.id,
        title: item.title,
        ...(item.subtitle ? { subtitle: item.subtitle } : {}),
        price: effectivePrice,
      };
      if (existing) {
        if (existing.kind === 'must' && !hasPriceLine(existing.reason)) {
          mustFirst.push(entry);
        }
        continue;
      }
      rest.push(entry);
    }
    return [...mustFirst, ...rest].slice(0, MAX_SHOP_AI_ITEMS);
  };

  export const shopAiPrompt = (items: ShopAiInputItem[], showTitle?: string | null, showType?: ShowType): string =>
    [
      showTitle ? `Show: ${showTitle}` : '',
      showType && showType !== 'general' ? `Category: ${showType}` : '',
      'Shop listings:',
      ...items.map((item, i) => `${i + 1}. ${item.title}${item.subtitle ? ` (${item.subtitle})` : ''} — listed at ${formatMoney(item.price)}`),
    ]
      .filter(Boolean)
      .join('\n');

  export const parseShopAiAnswer = (text: string, items: ShopAiInputItem[]): ShopAiEstimate[] => {
    let rows: unknown;
    try {
      rows = (JSON.parse(text) as { items?: unknown }).items;
    } catch {
      return [];
    }
    if (!Array.isArray(rows)) return [];
    const seen = new Set<number>();
    const out: ShopAiEstimate[] = [];
    for (const row of rows) {
      const r = row as { i?: unknown; low?: unknown; high?: unknown; info?: unknown };
      const idx = typeof r.i === 'number' ? r.i - 1 : -1;
      if (idx < 0 || idx >= items.length || seen.has(idx)) continue;
      const nums = [r.low, r.high].filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0);
      const info = typeof r.info === 'string' ? r.info.trim().replace(/\s+/g, ' ').slice(0, 80) : '';
      if (!nums.length && !info) continue;
      seen.add(idx);
      out.push({
        id: items[idx]!.id,
        low: nums.length ? Math.min(...nums) : 0,
        high: nums.length ? Math.max(...nums) : 0,
        info,
      });
    }
    return out;
  };

  const formatAiRange = (low: number, high: number): string | null => {
    if (!(low > 0)) return null;
    return high > low ? `AI est. ${formatMoney(low)}–${formatMoney(high)}` : `AI est. ${formatMoney(low)}`;
  };

  // Merges local AI estimates and collector/key-date notes into shop hits, and surfaces unscored
  // shop listings priced at or below 60% of the local AI's conservative low-end sold estimate.
  export const applyShopAi = (
    listings: ShopListing[],
    hits: ShopHit[],
    estimates: ShopAiEstimate[],
    currencyRate?: number | null,
    limit = MAX_SHOP_HITS,
  ): ShopHit[] => {
    if (!estimates.length) return hits;
    const byId = new Map(estimates.map((e) => [e.id, e]));
    const updated: (ShopHit & { edge: number })[] = hits.map((hit) => {
      const est = byId.get(hit.id);
      if (!est) return { ...hit, edge: 0 };
      const underAiDeal = hit.kind === 'must' && est.low > 0 && hit.price <= est.low * STEAL_RATIO;
      const rangeLine = underAiDeal
        ? `Under AI est. ${formatMoney(est.low)}${est.high > est.low ? `–${formatMoney(est.high)}` : ''}`
        : formatAiRange(est.low, est.high);
      const info = est.info && !hit.reason.toLowerCase().includes(est.info.toLowerCase()) ? est.info : '';
      const priced = hasPriceLine(hit.reason);
      const parts = [
        hit.kind === 'must' && rangeLine && (underAiDeal || !priced) ? rangeLine : null,
        stripNoMarket(hit.reason),
        info || null,
      ].filter((s): s is string => Boolean(s));
      const reason = parts.join('. ').replace(/\.\./g, '.');
      const ref = est.low > 0 ? est.low : 0;
      return ensureMustPrice({
        ...hit,
        kind: underAiDeal ? 'deal' : hit.kind,
        reason,
        edge: ref > 0 ? (ref - hit.price) / ref : 0,
      });
    });

    const existingIds = new Set(hits.map((h) => h.id));
    for (const item of listings) {
      if (existingIds.has(item.id)) continue;
      const est = byId.get(item.id);
      if (!est || !(est.low > 0)) continue;
      if (isPartsCondition(item.subtitle, item.title)) continue;
      const effectivePrice = listingUsdPrice(item, currencyRate);
      if (effectivePrice === null || effectivePrice <= 0) continue;
      if (effectivePrice <= est.low * STEAL_RATIO) {
        const rangeLine = `Under AI est. ${formatMoney(est.low)}${est.high > est.low ? `–${formatMoney(est.high)}` : ''}`;
        const reason = [rangeLine, est.info || null].filter(Boolean).join('. ');
        updated.push({
          id: item.id,
          title: item.title,
          price: effectivePrice,
          quantity: item.quantity,
          kind: 'deal',
          mode: item.mode ?? 'bin',
          reason,
          edge: (est.low - effectivePrice) / est.low,
        });
      }
    }

    return updated
      .sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || b.edge - a.edge || a.price - b.price)
      .slice(0, Math.max(1, limit))
      .map(({ edge: _edge, ...hit }) => hit);
  };

  // Melt for one buy-it-now price. Whatnot's quantity is how many are left in stock, not how many
  // pieces that price buys, so only a count written in the title ("x10", "10 coins") multiplies it.
  export const shopMelt = (listing: ShopListing, spot: { gold: number | null; silver: number | null }): number | null => {
    const fullText = listing.subtitle ? `${listing.title} ${listing.subtitle}` : listing.title;
    if (/\b(?:plated|filled|gf|rgp|gp|vermeil|gilt|gilded|layered|clad|tone)\b/i.test(fullText)) return null;
    const titleHasWeight = /(?<![\d/.])(?:\d+\/\d+|\d+(?:\.\d+)?)\s*(?:st|nd|rd|th)?\s*(?:troy\s*)?(?:ozt?|grams?|gr?|kilos?|kg)\b/i.test(
      listing.title,
    );
    const sub =
      !titleHasWeight &&
      listing.subtitle &&
      !(/\bgold\b/i.test(listing.subtitle) && /\bsilver\b/i.test(listing.subtitle))
        ? listing.subtitle
        : null;
    const titleRead = quickRead(listing.title).read;
    const subRead = !titleRead && sub ? quickRead(sub).read : null;
    const read = titleRead ?? subRead;
    if (read && (read.metal === 'gold' || read.metal === 'silver')) {
      const price = read.metal === 'gold' ? spot.gold : spot.silver;
      return price ? price * read.oz * read.quantity : null;
    }
    const pm = prizeMelt(listing.title) ?? (sub ? prizeMelt(sub) : null);
    if (pm && (pm.metal === 'gold' || pm.metal === 'silver')) {
      const price = pm.metal === 'gold' ? spot.gold : spot.silver;
      return price ? price * pm.oz * pm.purity : null;
    }
    return null;
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
