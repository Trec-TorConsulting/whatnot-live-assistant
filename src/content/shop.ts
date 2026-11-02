// On entering a show, read its shop and surface buy-it-now steals, deals, and must-haves.
import { HOOK_SOURCE, type HookToContent } from '../shared/hookProtocol';
import { keyDatePrice } from '../shared/keyDates';
import { formatMoney } from '../shared/money';
import { applyShopWorth, isShopOperation, readShopPage, scoreShop, shopMelt, shopWorthLine, type ShopHit, type ShopListing, type ShopScan } from '../shared/shop';
import { getBuyerSettings, getGuardSettings, getItem } from '../shared/storage';
import { send } from '../shared/messages';
import { isShareWorker, publishShop, postToHook } from './live';
import { overlay, type ShopView } from './overlay';
import { liveIdFromPath } from './selectors';
import { currentShowType } from './showType';

const MAX_EXTRA_PAGES = 4;
const QUIET_MS = 20_000;
const QUICK_MS = 600;

let listening = false;
let liveId: string | null = null;
let listings: ShopListing[] = [];
let seenCursor = new Set<string>();
let pages = 0;
let sawSuccess = false;
let noted = '';
let gen = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let pending: { operation: string; body: string; at: number }[] = [];

const viewOf = (scan: ShopScan): ShopView => {
  if (scan.status === 'error') return { summary: "Couldn't read this show's shop.", hits: [] };
  const summary = scan.binCount
    ? `Checked ${scan.binCount} buy-it-now item${scan.binCount === 1 ? '' : 's'}.`
    : 'No buy-it-now items in this shop.';
  return {
    summary,
    hits: scan.hits.map((h) => ({
      kind: h.kind,
      label: h.kind === 'steal' ? 'Steal' : h.kind === 'deal' ? 'Deal' : 'Must-have',
      text: `${h.title} — ${formatMoney(h.price)}. ${h.reason}`,
    })),
  };
};

const arm = (ms: number) => {
  const g = ++gen;
  clearTimeout(timer);
  timer = setTimeout(() => void finish(g), ms);
};

const ingest = (operation: string, raw: string) => {
  if (!liveId || isShareWorker()) return;
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return;
  }
  const id = liveId;
  const read = readShopPage(body);
  if (!read.listings.length && !isShopOperation(operation)) return;
  if (!read.error) sawSuccess = true;
  const seen = new Set(listings.map((l) => l.id));
  for (const item of read.listings) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    listings.push(item);
  }
  if (isShopOperation(operation) && read.cursor && !seenCursor.has(read.cursor) && pages < MAX_EXTRA_PAGES) {
    seenCursor.add(read.cursor);
    pages += 1;
    postToHook({ kind: 'fetch_shop', id, after: read.cursor });
    arm(QUIET_MS);
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
  const [sold, guard, spot, buyer] = await Promise.all([
    getItem('soldHistory').catch(() => []),
    getGuardSettings().catch(() => null),
    send('SPOT_GET', {}).catch(() => ({ gold: null, silver: null })),
    getBuyerSettings().catch(() => null),
  ]);
  if (g !== gen || liveId !== id || isShareWorker()) return;
  const hits = scoreShop({
    listings,
    sold: sold ?? [],
    showType: currentShowType(),
    watchlist: buyer?.watchlist ?? [],
    maxBidPercent: guard?.maxBidPercent ?? 80,
    meltOf: (item) => shopMelt(item, spot),
    now: Date.now(),
  });
  const scan: ShopScan = { status: 'ready', binCount: listings.length, hits };
  publishShop(scan);
  overlay.setShop(viewOf(scan));
  announce(id, hits);
  const priced = await priceMustHaves(hits);
  if (g !== gen || liveId !== id || isShareWorker() || priced === hits) return;
  const next: ShopScan = { status: 'ready', binCount: listings.length, hits: priced };
  publishShop(next);
  overlay.setShop(viewOf(next));
};

// Must-haves often have no watched sales. The grade in the title prices the key date at PCGS.
const priceMustHaves = async (hits: ShopHit[]): Promise<ShopHit[]> => {
  const wanted = new Map<string, ReturnType<typeof keyDatePrice>>();
  for (const h of hits) {
    if (h.kind !== 'must') continue;
    const spec = keyDatePrice(h.title);
    if (!spec) continue;
    wanted.set(`${spec.pcgs}:${spec.grade.gradeNo}`, spec);
  }
  if (!wanted.size) return hits;
  const lines = new Map<string, string>();
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
      if (line) lines.set(key, line);
    }),
  );
  return lines.size ? applyShopWorth(hits, lines) : hits;
};

const announce = (id: string, hits: ShopHit[]) => {
  const steals = hits.filter((h) => h.kind === 'steal');
  const deals = hits.filter((h) => h.kind === 'deal');
  const top = steals[0] ?? deals[0];
  const mark = `${id}:${top?.id ?? ''}`;
  if (!top || noted === mark) return;
  noted = mark;
  const notice = steals.length
    ? steals.length === 1
      ? `Shop steal: ${steals[0]!.title} at ${formatMoney(steals[0]!.price)}`
      : `${steals.length} buy-it-now steals in the shop`
    : deals.length === 1
      ? `Shop deal: ${deals[0]!.title} at ${formatMoney(deals[0]!.price)}`
      : `${deals.length} buy-it-now deals in the shop`;
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
};

export const startShopWatch = () => {
  ensureShopListener();
  if (isShareWorker()) return;
  const id = liveIdFromPath();
  if (!id || id === liveId) return;
  liveId = id;
  listings = [];
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
  pending = [];
  gen += 1;
  clearTimeout(timer);
  overlay.setShop(null);
};
