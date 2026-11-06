// On entering a show, read its shop and surface buy-it-now steals, deals, and must-haves.
import { matchWishlist, type WatchItem, type WishlistItem } from '../shared/buyer';
import { perPieceShopRows } from '../shared/casePack';
import { parseShippingInfo, shippingRules } from '../shared/costs';
import { toUsd } from '../shared/currency';
import { HOOK_SOURCE, type HookToContent } from '../shared/hookProtocol';
import { keyDatePrice } from '../shared/keyDates';
import { formatMoney } from '../shared/money';
import type { RefPrice } from '../shared/refPrice';
import {
  applySaleToShopListings,
  applyShopAi,
  applyShopRefs,
  applyShopWorth,
  extractShopRefQuery,
  hasPriceLine,
  isShopOperation,
  MAX_LISTINGS,
  MAX_SHOP_HITS,
  mergeShopListings,
  readShopPage,
  scoreShop,
  selectShopAiItems,
  shopMelt,
  shopSummary,
  shopWorthLine,
  type ListingAppraisal,
  type ShopAiEstimate,
  type ShopFilterMode,
  type ShopHit,
  type ShopListing,
  type ShopScan,
} from '../shared/shop';
import { getBuyerSettings, getCollection, getGuardSettings, getItem, onItemChanged } from '../shared/storage';
import { send } from '../shared/messages';
import { clickLikeUser, setReactValue, waitFor } from './dom';
import {
  isShareWorker,
  liveSession,
  onLive,
  publishShop,
  postToHook,
  rememberCurrencyPair,
  rememberRunnerGiveawayStems,
} from './live';
import { overlay, type ShopView } from './overlay';
import { findShippingText, findShopSearchInput, findShopTabButton, liveIdFromPath } from './selectors';
import { currentShowType } from './showType';

const MAX_EXTRA_PAGES = 100;
const MAX_REF_LOOKUPS = 16;
const POOL_LIMIT = 100;
const MAX_PANEL_HITS = 24;
const QUIET_MS = 12_000;
const QUICK_MS = 600;
const PAGE_FETCH_DELAY_MS = 120;

let listening = false;
let liveId: string | null = null;
let listings: ShopListing[] = [];
let scoredHits: ShopHit[] = [];
let currentPerPieceRows: NonNullable<ShopScan['perPieceRows']> = [];
let dismissedIds = new Set<string>();
let filterMode: ShopFilterMode = 'all';
let worthCache = new Map<string, string>();
let refCache = new Map<string, RefPrice[]>();
let sessionAppraisals = new Map<string, ListingAppraisal>();
let aiCache: ShopAiEstimate[] = [];
let seenCursor = new Set<string>();
let pages = 0;
let sawSuccess = false;
let noted = '';
let gen = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let pending: { operation: string; body: string; at: number }[] = [];
let sessionInventory = new Map<string, number>();
let initialScanComplete = false;
let audioContext: AudioContext | undefined;

const beepWishlist = () => {
  try {
    audioContext ??= new AudioContext();
    void audioContext.resume();
    let t = audioContext.currentTime;
    for (const f of [880, 1175]) {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      osc.connect(gain).connect(audioContext.destination);
      osc.start(t);
      osc.stop(t + 0.15);
      t += 0.17;
    }
  } catch {
    // Autoplay blocked or unsupported
  }
};

export interface WishlistDetectionResult {
  kind: 'drop' | 'restock';
  item: ShopListing;
}

export const detectWishlistDrops = (
  incoming: ShopListing[],
  knownInventory: Map<string, number>,
  wishlist: WishlistItem[],
  initialDone: boolean,
): WishlistDetectionResult[] => {
  if (!initialDone || !wishlist.length) return [];
  const results: WishlistDetectionResult[] = [];
  for (const item of incoming) {
    if ((item.mode ?? 'bin') !== 'bin' || item.quantity <= 0) continue;
    const fullText = item.subtitle ? `${item.title} ${item.subtitle}` : item.title;
    const matches = matchWishlist(item.title, wishlist) ?? (item.subtitle ? matchWishlist(fullText, wishlist) : null);
    if (!matches) continue;

    const prevQty = knownInventory.get(item.id);
    if (prevQty === undefined) {
      results.push({ kind: 'drop', item });
    } else if (prevQty === 0 && item.quantity > 0) {
      results.push({ kind: 'restock', item });
    } else if (item.quantity > prevQty) {
      results.push({ kind: 'restock', item });
    }
  }
  return results;
};

export const alertWishlistHit = (
  item: ShopListing,
  kind: 'drop' | 'restock',
  sound = true,
) => {
  const notice =
    kind === 'drop'
      ? `Wishlist drop: ${item.title} at ${formatMoney(item.price)}`
      : `Wishlist restock: ${item.title} (${item.quantity} in stock)`;
  const detail =
    kind === 'drop'
      ? `Newly listed in shop at ${formatMoney(item.price)}`
      : `Restocked in shop at ${formatMoney(item.price)}`;
  if (sound) beepWishlist();
  overlay.notice(notice, 8000);
  overlay.flash();
  if (document.hidden) {
    void send('BUYER_ALERT', {
      id: `wishlist:${item.id}:${Date.now()}`,
      title: notice,
      message: detail,
    }).catch(() => undefined);
  }
};

const hitLabel = (h: ShopHit) => {
  const kind = h.kind === 'steal' ? 'Steal' : h.kind === 'deal' ? 'Deal' : 'Must-have';
  return h.mode === 'auction' ? `Auction ${kind}` : kind;
};

const viewOf = (scan: ShopScan): ShopView => ({
  summary: shopSummary(scan),
  hits: scan.hits.slice(0, MAX_SHOP_HITS).map((h) => ({
    id: h.id,
    title: h.title,
    quantity: h.quantity,
    mode: h.mode ?? 'bin',
    kind: h.kind,
    label: hitLabel(h),
    text: `${h.title} — ${formatMoney(h.price)}. ${h.reason}`,
    onWishlist: h.onWishlist,
    appraisal: sessionAppraisals.get(h.id) ?? h.appraisal,
  })),
  ...(scan.perPieceRows?.length ? { perPieceRows: scan.perPieceRows.map((r) => `${r.title} — ${r.label}`) } : {}),
  filter: scan.filter ?? 'all',
  hasAuctions: Boolean(scan.auctionCount && scan.auctionCount > 0),
  ...(scan.coupons?.length ? { coupons: scan.coupons } : {}),
});

const visibleFromPool = (pool: ShopHit[], limit = MAX_PANEL_HITS): ShopHit[] =>
  pool
    .filter((h) => {
      if (dismissedIds.has(h.id)) return false;
      if (filterMode === 'bin') return (h.mode ?? 'bin') === 'bin';
      if (filterMode === 'wishlist') return Boolean(h.onWishlist);
      return true;
    })
    .slice(0, limit);

const publishCurrent = (isScanning = false) => {
  if (!liveId || isShareWorker() || !sawSuccess) return;
  const visible = visibleFromPool(scoredHits, MAX_PANEL_HITS);
  const auctionCount = listings.filter((l) => l.mode === 'auction').length;
  const coupons = liveSession()?.show.note?.coupons;
  const scan: ShopScan = {
    status: isScanning ? 'scanning' : 'ready',
    binCount: listings.length,
    auctionCount,
    hits: visible.map((h) => ({
      ...h,
      appraisal: sessionAppraisals.get(h.id) ?? h.appraisal,
    })),
    ...(currentPerPieceRows.length ? { perPieceRows: currentPerPieceRows } : {}),
    filter: filterMode,
    ...(coupons?.length ? { coupons } : {}),
    appraisals: Object.fromEntries(sessionAppraisals.entries()),
  };
  publishShop(scan);
  overlay.setShop(viewOf(scan));
};

const arm = (ms: number) => {
  const g = ++gen;
  clearTimeout(timer);
  timer = setTimeout(() => void finish(g), ms);
};

const runFastScorePass = async (id: string, g: number) => {
  if (g !== gen || liveId !== id || isShareWorker() || !listings.length) return;
  const [sold, guard, spot, buyer, purchases, collection] = await Promise.all([
    getItem('soldHistory').catch(() => []),
    getGuardSettings().catch(() => null),
    send('SPOT_GET', {}).catch(() => ({ gold: null, silver: null })),
    getBuyerSettings().catch(() => null),
    getItem('purchases').catch(() => []),
    getCollection().catch(() => null),
  ]);
  if (g !== gen || liveId !== id || isShareWorker()) return;
  const session = liveSession();
  const showType = currentShowType();
  const currencyRate = session?.currency?.rate ?? null;
  const maxBidPercent = guard?.maxBidPercent ?? 80;
  const watchlist = buyer?.watchlist ?? [];
  const wishlist = buyer?.wishlist ?? [];
  const shipInfo = parseShippingInfo(findShippingText());
  const shipping = shipInfo.shipping ?? session?.shippingQuote ?? null;
  const rules = shippingRules({
    notes: session?.show.note?.text,
    showTitle: session?.show.title,
  });
  const hasWinThisShow = Boolean(
    session &&
    (session.runnerGiveawayShippingWon || (purchases ?? []).some((p) => p.liveId === session.show.liveId)),
  );
  const coupons = session?.show.note?.coupons ?? [];
  const chatWants = [...(session?.electronicsWants ?? []), ...(session?.estateWants ?? [])];
  const ownedTitles = (purchases ?? []).map((p) => p.title).filter(Boolean);

  let pool = scoreShop({
    listings,
    sold: sold ?? [],
    showType,
    watchlist,
    wishlist,
    maxBidPercent,
    meltOf: (item) => shopMelt(item, spot),
    now: Date.now(),
    currencyRate,
    shipping,
    shippingRules: rules,
    hasWinThisShow,
    taxPercent: buyer?.taxPercent ?? 0,
    feePercent: buyer?.feePercent,
    coupons,
    collection,
    ownedTitles,
    chatWants,
    limit: POOL_LIMIT,
  });

  if (worthCache.size) {
    pool = applyShopWorth(pool, worthCache, { maxBidPercent, watchlist });
  }
  if (refCache.size) {
    pool = applyShopRefs(listings, pool, refCache, { maxBidPercent, currencyRate, limit: POOL_LIMIT });
  }

  scoredHits = pool;
  publishCurrent(true);
};

const checkWishlistDrops = async (incoming: ShopListing[]) => {
  const buyer = await getBuyerSettings().catch(() => null);
  const wishlist = buyer?.wishlist ?? [];
  const drops = detectWishlistDrops(incoming, sessionInventory, wishlist, initialScanComplete);
  for (const d of drops) {
    alertWishlistHit(d.item, d.kind, buyer?.sound ?? true);
  }
  for (const item of incoming) {
    sessionInventory.set(item.id, item.quantity);
  }
};

const ingest = (operation: string, raw: string) => {
  if (!liveId || isShareWorker()) return;
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return;
  }
  rememberRunnerGiveawayStems(body);
  const id = liveId;
  const read = readShopPage(body);
  if (!read.listings.length && !read.removedIds.length && !isShopOperation(operation)) return;
  if (!read.error) sawSuccess = true;
  for (const item of read.listings) {
    if (item.currency && item.currency !== 'USD' && item.usdPrice != null) {
      rememberCurrencyPair({ amount: item.price, code: item.currency, usd: item.usdPrice });
    }
  }
  if (initialScanComplete) {
    void checkWishlistDrops(read.listings);
  } else {
    for (const item of read.listings) {
      sessionInventory.set(item.id, item.quantity);
    }
  }
  listings = mergeShopListings(listings, read.listings, read.removedIds);
  const hasMore =
    isShopOperation(operation) &&
    Boolean(read.cursor && !seenCursor.has(read.cursor) && pages < MAX_EXTRA_PAGES && listings.length < MAX_LISTINGS);

  if (hasMore && read.cursor) {
    seenCursor.add(read.cursor);
    pages += 1;
    const nextCursor = read.cursor;
    setTimeout(() => {
      if (liveId === id) {
        postToHook({ kind: 'fetch_shop', id, after: nextCursor });
      }
    }, PAGE_FETCH_DELAY_MS);
    publishCurrent(true);
    void runFastScorePass(id, gen);
    arm(8_000);
    return;
  }
  arm(sawSuccess ? QUICK_MS : QUIET_MS);
};

const finish = async (g: number) => {
  if (g !== gen || !liveId || isShareWorker()) return;
  const id = liveId;
  if (!sawSuccess) {
    const scan: ShopScan = { status: 'error', binCount: 0, hits: [] };
    publishShop(scan);
    overlay.setShop(viewOf(scan));
    return;
  }
  const [sold, guard, spot, buyer, purchases, collection] = await Promise.all([
    getItem('soldHistory').catch(() => []),
    getGuardSettings().catch(() => null),
    send('SPOT_GET', {}).catch(() => ({ gold: null, silver: null })),
    getBuyerSettings().catch(() => null),
    getItem('purchases').catch(() => []),
    getCollection().catch(() => null),
  ]);
  if (g !== gen || liveId !== id || isShareWorker()) return;
  const session = liveSession();
  const showType = currentShowType();
    const currencyRate = session?.currency?.rate ?? null;
    const maxBidPercent = guard?.maxBidPercent ?? 80;
    const watchlist = buyer?.watchlist ?? [];
    const wishlist = buyer?.wishlist ?? [];
    const shipInfo = parseShippingInfo(findShippingText());
    const shipping = shipInfo.shipping ?? session?.shippingQuote ?? null;
    const rules = shippingRules({
      notes: session?.show.note?.text,
      showTitle: session?.show.title,
    });
    const hasWinThisShow = Boolean(
      session &&
      (session.runnerGiveawayShippingWon || (purchases ?? []).some((p) => p.liveId === session.show.liveId)),
    );
    const coupons = session?.show.note?.coupons ?? [];
    const chatWants = [...(session?.electronicsWants ?? []), ...(session?.estateWants ?? [])];
    const ownedTitles = (purchases ?? []).map((p) => p.title).filter(Boolean);

    let pool = scoreShop({
      listings,
      sold: sold ?? [],
      showType,
      watchlist,
      wishlist,
      maxBidPercent,
      meltOf: (item) => shopMelt(item, spot),
      now: Date.now(),
      currencyRate,
      shipping,
      shippingRules: rules,
      hasWinThisShow,
      taxPercent: buyer?.taxPercent ?? 0,
      feePercent: buyer?.feePercent,
      coupons,
      collection,
      ownedTitles,
      chatWants,
      limit: POOL_LIMIT,
    });

  if(worthCache.size) {
      pool = applyShopWorth(pool, worthCache, { maxBidPercent, watchlist });
}
if (refCache.size) {
  pool = applyShopRefs(listings, pool, refCache, { maxBidPercent, currencyRate, limit: POOL_LIMIT });
}
if (aiCache.length) {
  pool = applyShopAi(listings, pool, aiCache, currencyRate, POOL_LIMIT);
}

currentPerPieceRows =
  showType === 'wholesale'
    ? perPieceShopRows(
      listings.map((l) => ({
        ...l,
        usdPrice:
          l.usdPrice ??
          (l.currency && l.currency !== 'USD' ? toUsd(l.price, l.currency, currencyRate) : l.price),
      })),
    )
    : [];
scoredHits = pool;
publishCurrent();
announce(id, visibleFromPool(scoredHits));
initialScanComplete = true;
for (const item of listings) {
  sessionInventory.set(item.id, item.quantity);
}

const priced = await priceMustHaves(scoredHits, maxBidPercent, watchlist);
if (g !== gen || liveId !== id || isShareWorker()) return;
  if (priced !== scoredHits) {
    scoredHits = priced;
    publishCurrent();
    announce(id, visibleFromPool(scoredHits));
  }

  const refEnriched = await priceShopRefs(scoredHits, showType, maxBidPercent, currencyRate);
  if (g !== gen || liveId !== id || isShareWorker()) return;
  if (refEnriched !== scoredHits) {
    scoredHits = refEnriched;
    publishCurrent();
    announce(id, visibleFromPool(scoredHits));
  }

  const aiItems = selectShopAiItems(listings, scoredHits, currencyRate).filter(
    (item) => !aiCache.some((e) => e.id === item.id),
  );
  if (!aiItems.length) return;
  const aiRes = await send('SHOP_AI', {
    items: aiItems,
    showTitle: session?.show.title ?? null,
    showType,
  }).catch(() => null);
  if (g !== gen || liveId !== id || isShareWorker() || !aiRes?.ok || !aiRes.estimates.length) return;
  const mergedAi = new Map(aiCache.map((e) => [e.id, e]));
  for (const est of aiRes.estimates) mergedAi.set(est.id, est);
  aiCache = [...mergedAi.values()];
  scoredHits = applyShopAi(listings, scoredHits, aiCache, currencyRate, POOL_LIMIT);
  publishCurrent();
  announce(id, visibleFromPool(scoredHits));
};

// Must-haves often have no watched sales. The grade in the title prices the key date at PCGS.
  const priceMustHaves = async (
    hits: ShopHit[],
    maxBidPercent: number,
    watchlist: WatchItem[],
  ): Promise<ShopHit[]> => {
    const wanted = new Map<string, ReturnType<typeof keyDatePrice>>();
    for (const h of hits) {
      if (h.kind !== 'must') continue;
      const spec = keyDatePrice(h.title);
      if (!spec) continue;
      const key = `${spec.pcgs}:${spec.grade.gradeNo}`;
      if (!worthCache.has(key)) wanted.set(key, spec);
    }
    if (!wanted.size) return hits;
    await Promise.all(
      [...wanted.entries()].map(async ([key, spec]) => {
        if (!spec) return;
        const res = await send('GRADE_GUIDE', {
          pcgsNo: spec.pcgs,
          gradeNo: spec.grade.gradeNo,
          year: spec.year,
          mint: spec.mint,
          denom: spec.denom,
        }).catch(() => null);
        if (!res?.ok) return;
        const line = shopWorthLine(spec.grade.label, res.guide, res.auctions);
        if (line) worthCache.set(key, line);
      }),
    );
    return worthCache.size ? applyShopWorth(hits, worthCache, { maxBidPercent, watchlist }) : hits;
  };

  const priceShopRefs = async (
    hits: ShopHit[],
    showType: ReturnType<typeof currentShowType>,
    maxBidPercent: number,
    currencyRate: number | null,
  ): Promise<ShopHit[]> => {
    const listingById = new Map(listings.map((l) => [l.id, l]));
    const ordered: ShopListing[] = [];
    const seen = new Set<string>();
    // Must-haves without a market price go first so the lookup budget fills their gap.
    const unpricedMust = hits.filter((h) => h.kind === 'must' && !hasPriceLine(h.reason));
    for (const h of [...unpricedMust, ...hits]) {
      const l = listingById.get(h.id);
      if (l && !seen.has(l.id)) {
        seen.add(l.id);
        ordered.push(l);
      }
    }
    for (const l of listings) {
      if (!seen.has(l.id)) {
        seen.add(l.id);
        ordered.push(l);
      }
    }
    const todo: { id: string; query: NonNullable<ReturnType<typeof extractShopRefQuery>> }[] = [];
    for (const item of ordered) {
      if (todo.length >= MAX_REF_LOOKUPS) break;
      if (refCache.has(item.id)) continue;
      const query = extractShopRefQuery(item, showType);
      if (query) todo.push({ id: item.id, query });
    }
    if (!todo.length) return hits;
    let added = false;
    await Promise.all(
      todo.map(async ({ id, query }) => {
        const res = await send('REF_LOOKUP', { item: query }).catch(() => null);
        if (res?.refs?.length) {
          refCache.set(id, res.refs);
          added = true;
        } else {
          refCache.set(id, []);
        }
      }),
    );
    return added ? applyShopRefs(listings, hits, refCache, { maxBidPercent, currencyRate, limit: POOL_LIMIT }) : hits;
  };

  const announce = (id: string, hits: ShopHit[]) => {
    const steals = hits.filter((h) => h.kind === 'steal');
    const deals = hits.filter((h) => h.kind === 'deal');
    const top = steals[0] ?? deals[0];
    const mark = `${id}:${top?.id ?? ''}`;
    if (!top || noted === mark) return;
    noted = mark;
    const mixed = hits.some((h) => h.mode === 'auction');
    const notice = steals.length
      ? steals.length === 1
        ? `Shop steal: ${steals[0]!.title} at ${formatMoney(steals[0]!.price)}`
        : `${steals.length} ${mixed ? 'shop' : 'buy-it-now'} steals in the shop`
      : deals.length === 1
        ? `Shop deal: ${deals[0]!.title} at ${formatMoney(deals[0]!.price)}`
        : `${deals.length} ${mixed ? 'shop' : 'buy-it-now'} deals in the shop`;
    overlay.notice(notice, 8000);
    overlay.flash();
    if (document.hidden) void send('BUYER_ALERT', { id: `shop:${id}`, title: notice, message: top.reason }).catch(() => undefined);
  };

  const onHook = (e: MessageEvent) => {
    if (e.source !== window || e.data?.source !== HOOK_SOURCE) return;
    const msg = e.data as HookToContent;
    if (msg.kind !== 'graphql' || (!isShopOperation(msg.operation) && msg.operation !== 'LiveStream')) return;
    if (!liveId) {
      pending.push({ operation: msg.operation, body: msg.body, at: Date.now() });
      if (pending.length > 8) pending.shift();
      return;
    }
    ingest(msg.operation, msg.body);
  };

  export const ensureShopListener = () => {
    if (listening) return;
    listening = true;
    window.addEventListener('message', onHook);
    onLive((_session, signals) => {
      if (!liveId || !listings.length || isShareWorker()) return;
      let next = listings;
      for (const sig of signals) {
        if (sig.kind === 'sale') {
          next = applySaleToShopListings(next, sig.sale);
        }
      }
      if (next !== listings) {
        listings = next;
        for (const item of listings) {
          sessionInventory.set(item.id, item.quantity);
        }
        arm(200);
      }
    });
    onItemChanged('purchases', () => {
      if (liveId && sawSuccess && !isShareWorker()) arm(200);
    });
    onItemChanged('collection', () => {
      if (liveId && sawSuccess && !isShareWorker()) arm(200);
    });
    onItemChanged('buyerSettings', () => {
      if (liveId && sawSuccess && !isShareWorker()) arm(200);
    });
  };

  export const rescanShop = () => {
    if (!liveId || isShareWorker()) return;
    seenCursor = new Set();
    pages = 0;
    dismissedIds = new Set();
    publishCurrent(true);
    postToHook({ kind: 'fetch_shop', id: liveId, after: null });
    arm(sawSuccess ? QUICK_MS : QUIET_MS);
  };

  export const dismissShopHit = (id: string) => {
    if (!id) return;
    dismissedIds.add(id);
    publishCurrent();
  };

  export const setShopFilter = (mode: ShopFilterMode) => {
    filterMode = mode === 'bin' || mode === 'wishlist' ? mode : 'all';
    publishCurrent();
  };

  export const focusShopHit = async (title: string): Promise<void> => {
    const query = title.trim().slice(0, 80);
    if (!query) return;
    let input = findShopSearchInput();
    let openedTab = false;
    if (!input) {
      const tab = findShopTabButton();
      if (tab) {
        clickLikeUser(tab);
        openedTab = true;
        input = await waitFor(findShopSearchInput, 1500);
      }
    }
    if (input) {
      setReactValue(input, query);
      input.focus();
      overlay.notice(`Filtered shop for "${query.slice(0, 36)}".`, 4000);
      return;
    }
    if (openedTab) {
      overlay.notice('Opened the shop tab.', 3000);
      return;
    }
    overlay.notice("Open Whatnot's Shop tab to search for this item.", 4000);
  };

  export const startShopWatch = () => {
    ensureShopListener();
    if (isShareWorker()) return;
    const id = liveIdFromPath();
    if (!id || id === liveId) return;
    liveId = id;
    listings = [];
    scoredHits = [];
    currentPerPieceRows = [];
    dismissedIds = new Set();
    sessionInventory.clear();
    initialScanComplete = false;
    filterMode = 'all';
    worthCache = new Map();
    refCache = new Map();
    aiCache = [];
    seenCursor = new Set();
    pages = 0;
    sawSuccess = false;
    overlay.setShop(null);
    const queued = pending.splice(0).filter((p) => Date.now() - p.at < 5_000);
    for (const p of queued) ingest(p.operation, p.body);
    postToHook({ kind: 'fetch_shop', id, after: null });
    arm(QUIET_MS);
  };

  export const resetShop = () => {
    liveId = null;
    listings = [];
    scoredHits = [];
    currentPerPieceRows = [];
    dismissedIds = new Set();
    sessionInventory.clear();
    initialScanComplete = false;
    filterMode = 'all';
    worthCache = new Map();
    refCache = new Map();
    sessionAppraisals = new Map();
    aiCache = [];
    pending = [];
    gen += 1;
    clearTimeout(timer);
    overlay.setShop(null);
  };

  export const appraiseShopListing = async (id: string): Promise<ListingAppraisal | null> => {
    if (sessionAppraisals.has(id)) return sessionAppraisals.get(id)!;
    const listing = listings.find((l) => l.id === id);
    if (!listing) return null;
    const res = await send('APPRAISE_SHOP_LISTING', {
      id: listing.id,
      title: listing.title,
      subtitle: listing.subtitle,
      price: listing.price,
    }).catch(() => null);
    if (res?.ok && res.appraisal) {
      sessionAppraisals.set(id, res.appraisal);
      publishCurrent();
      return res.appraisal;
    }
    return null;
  };
