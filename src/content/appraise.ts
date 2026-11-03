import {
  computeValue,
  estimateOf,
  isPcgsPriceable,
  lotRollup,
  type AppraisalItem,
  type AppraisalRecord,
  type OtherItem,
  type PriceInfo,
} from '../shared/appraisal';
import { calibrated, calibrationFor } from '../shared/calibration';
import { marketOf, verifiedName } from '../shared/refPrice';
import { send, STALE_CONTEXT, type PriceLookupResult, type Req } from '../shared/messages';
import type { ShowType } from '../shared/showType';
import { formatMoney } from '../shared/money';
import { findSimilarPurchases } from '../shared/purchases';
import { findComps, summarizeComps } from '../shared/soldHistory';
import { collectionLine, compareToCollection, type CollectionSettings } from '../shared/collection';
import { getCollection, getGuardSettings, getItem } from '../shared/storage';
import { MINUTE } from '../shared/time';
import { appraisalView, listingView, messageView } from './appraisalView';
import { liveSession } from './live';
import { overlay, type AppraisalView } from './overlay';
import { collectPlayerText, findStreamVideo } from './selectors';
import { contextAlive } from './lifecycle';
import { currentScan, currentShowType } from './showType';

// A lot's item doesn't change, so reopening its appraisal reuses the answer instead of calling
// Gemini again. Pressing Appraise while that answer is on screen asks for a fresh look.
const LOT_CACHE_MS = 15 * MINUTE;

let latest: AppraisalRecord | null = null;
let shownId: string | null = null;
// Bumped when the card is cleared for a new auction. An appraisal still running for the old item is
// saved to history but no longer shown, and doesn't block appraising the new one.
let generation = 0;
let busyGen: number | null = null;
let busyAuction: number | null = null;
// Bumped on every new auction. Repeat auctions from one listing share its lot id, so this is what
// keeps an answer about an earlier auction from feeding the bid guard or being reused.
let auction = 0;
let latestAuction = 0;

const setLatest = (record: AppraisalRecord, forAuction: number) => {
  latest = record;
  latestAuction = forAuction;
};

export const latestAppraisal = () => (latestAuction === auction ? latest : null);

// Auto clears the card for the new item. Manual keeps it on screen until you press Appraise, marked
// as being about an earlier auction.
export const newAuction = (clearCard: boolean) => {
  auction++;
  if (clearCard) {
    generation++;
    shownId = null;
    overlay.setAppraisal(null);
  } else overlay.markAppraisalOld('From an earlier auction. Press Appraise for this one.');
};

// 1280px is a full portrait stream (720x1280), so small items like 1 g bars and their stamped
// weight aren't shrunk before the model reads them. 896px missed them.
const FRAME_PX = 1280;
const JPEG_QUALITY = 0.85;

// Whatnot streams over WebRTC (srcObject), so drawing the frame doesn't taint the canvas.
export const captureFrame = (video: HTMLVideoElement, maxPx = FRAME_PX) => {
  if (!video.videoWidth || !video.videoHeight) return null;
  const scale = Math.min(1, maxPx / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
  try {
    return canvas.toDataURL('image/jpeg', JPEG_QUALITY).split(',')[1] ?? null;
  } catch {
    return null;
  }
};

// Fallback: a screenshot of the tab (our panel hidden), cropped to the player.
const captureScreenshot = async (video: HTMLVideoElement | null) =>
  overlay.hiddenDuring(async () => {
    const shot = await send('CAPTURE_TAB', {});
    if (!shot.ok) return null;
    const bitmap = await createImageBitmap(await (await fetch(shot.dataUrl)).blob());
    const ratio = bitmap.width / window.innerWidth;
    const r = video?.getBoundingClientRect() ?? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    const sx = Math.max(0, r.left * ratio);
    const sy = Math.max(0, r.top * ratio);
    const sw = Math.min(bitmap.width - sx, r.width * ratio);
    const sh = Math.min(bitmap.height - sy, r.height * ratio);
    const scale = Math.min(1, FRAME_PX / Math.max(sw, sh));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(sw * scale);
    canvas.height = Math.round(sh * scale);
    canvas.getContext('2d')?.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', JPEG_QUALITY).split(',')[1] ?? null;
  });

const priceNote = (price: PriceLookupResult | null): string | null => {
  if (!price) return null;
  if (price.ok) return null;
  switch (price.reason) {
    case 'no-token':
      return 'Add a PCGS token in Settings for real sale prices.';
    case 'no-id':
      return price.error ?? 'Not enough detail for a PCGS price lookup.';
    case 'mismatch':
    case 'no-data':
    case 'error':
      return price.error ?? 'PCGS lookup failed.';
  }
};

const compsFor = async (names: (string | null | undefined)[], showType: ShowType) =>
  summarizeComps(findComps(names, (await getItem('soldHistory')) ?? [], Date.now(), 8, showType));

// Your collection, reloaded on each Appraise press so the card can say what it adds.
let owned: { items: string[]; sets: CollectionSettings['sets'] } = { items: [], sets: [] };
const loadOwned = async () => {
  const [c, p] = await Promise.all([getCollection(), getItem('purchases')]);
  owned = { items: [...c.owned, ...(p ?? []).filter((x) => x.kind !== 'giveaway').map((x) => x.title)], sets: c.sets };
};

const view = (record: AppraisalRecord, status: AppraisalView['status'], similar: string[]): AppraisalView => ({
  ...appraisalView(record, status, similar),
  owned: collectionLine(compareToCollection({ name: record.name, year: record.year, mintMark: record.mintMark }, owned.items, owned.sets)),
});

const calibrationNow = async (showType: ShowType) =>
  calibrationFor(showType, (await getItem('appraisals')) ?? [], (await getItem('soldHistory')) ?? []);

const similarTo = async (name: string) =>
  findSimilarPurchases(name, (await getItem('purchases')) ?? []).map(
    (p) => `${p.title} for ${formatMoney(p.price)} on ${new Date(p.at).toLocaleDateString()}`,
  );

const toPriceInfo = (price: PriceLookupResult | null) =>
  price?.ok ? { guide: price.guide, auctions: price.auctions, name: price.name, link: price.link, source: price.source } : null;

const cachedForLot = (liveId: string | null, lotId: string | null, showType: ShowType, scan: boolean) =>
  latest &&
  latestAuction === auction &&
  lotId &&
  latest.lotId === lotId &&
  latest.liveId === liveId &&
  (latest.showType ?? 'general') === showType &&
  (latest.table !== undefined) === scan &&
  latest.confidence !== 'quick' &&
  latest.valuation.marketValue !== null &&
  Date.now() - latest.at < LOT_CACHE_MS
    ? latest
    : null;

const showCached = async (record: AppraisalRecord) => {
  const guard = await getGuardSettings();
  const valuation = computeValue(
    {
      quantity: record.quantity,
      melt: record.melt,
      price: record.price,
      market: marketOf(record.refs, Boolean(record.slabbed)),
      estimate: record.estimate ?? null,
      comps: record.comps ?? null,
    },
    guard.maxBidPercent,
  );
  const v = view({ ...record, valuation }, 'done', await similarTo(record.name));
  const mins = Math.max(1, Math.round((Date.now() - record.at) / MINUTE));
  v.footer = `Saved from ${mins} min ago on this lot. Press Appraise again for a fresh look.`;
  overlay.setAppraisal(v);
  shownId = record.id;
};

// Table scans and reference prices fill in after the answer is on screen and don't hold up the
// next Appraise. They finish in any order, so each merges into the newest copy of the record. A
// newer appraisal on screen by then keeps its place; the fill is still saved to history.
type Fill = 'table' | 'refs';
const FILL_FOOTER: Record<Fill, string> = { table: 'Scanning the rest of the table…', refs: 'Checking card and record prices…' };
const MAX_FILLING = 10;
const filling = new Map<string, { record: AppraisalRecord; pending: Set<Fill>; similar: string[] }>();

// Only the first showing of an answer you asked for brings back a hidden panel; fills never do.
const showFilled = (id: string, reveal = false) => {
  const f = filling.get(id);
  if (!f || shownId !== id) return;
  const v = view(f.record, 'done', f.similar);
  const waiting = [...f.pending][0];
  overlay.setAppraisal(waiting ? { ...v, footer: FILL_FOOTER[waiting] } : v, reveal);
};

const startFills = (record: AppraisalRecord, fills: Fill[], similar: string[], reveal: boolean) => {
  filling.set(record.id, { record, pending: new Set(fills), similar });
  while (filling.size > MAX_FILLING) filling.delete(filling.keys().next().value!);
  showFilled(record.id, reveal);
};

const finishFill = async (id: string, fill: Fill, patch: (r: AppraisalRecord) => AppraisalRecord) => {
  const f = filling.get(id);
  if (!f) return;
  f.record = patch(f.record);
  f.pending.delete(fill);
  if (latest?.id === id) latest = f.record;
  showFilled(id);
  await send('APPRAISAL_SAVE', { record: f.record }).catch(() => undefined);
};

const addTableScan = async (id: string, req: Req<'TABLE_SCAN'>) => {
  const res = await send('TABLE_SCAN', req).catch((err: Error) => ({ ok: false as const, error: err.message }));
  await finishFill(id, 'table', (r) => (res.ok ? { ...r, table: res.items, tableNote: null } : { ...r, table: null, tableNote: `Table scan failed: ${res.error}` }));
};

// A card's own market price can replace the AI guess; a verified PSA cert gives the exact card to
// match Whatnot sales against.
const addRefs = async (id: string, item: Partial<AppraisalItem>, others: OtherItem[], maxBidPercent: number) => {
  const res = await send('REF_LOOKUP', { item }).catch((err: Error) => ({ ok: true as const, refs: [], notes: [`Price lookup failed: ${err.message}`] }));
  const f = filling.get(id);
  const psaName = verifiedName(res.refs);
  const comps = psaName && f ? ((await compsFor([psaName, f.record.lotTitle], f.record.showType ?? 'general').catch(() => null)) ?? f.record.comps ?? null) : null;
  await finishFill(id, 'refs', (r) => {
    const valuation = computeValue(
      { quantity: r.quantity, melt: r.melt, price: r.price, market: marketOf(res.refs, Boolean(r.slabbed)), estimate: r.estimate ?? null, comps: comps ?? r.comps ?? null },
      maxBidPercent,
    );
    return {
      ...r,
      refs: res.refs,
      refNotes: res.notes,
      comps: comps ?? r.comps ?? null,
      valuation,
      lot: lotRollup({ name: r.name, quantity: r.quantity, marketValue: valuation.marketValue, basis: valuation.basis }, others),
    };
  });
};

const needsRefs = (item: Partial<AppraisalItem>) =>
  Boolean(item.card?.name || (item.is_slabbed && /\bpsa\b/i.test(item.grading_service ?? '')) || item.item_type === 'vinyl_media');

// auto: started by a new lot rather than a press, so a hidden or collapsed panel stays that way.
export const appraiseNow = async ({ auto = false } = {}) => {
  if (!contextAlive()) {
    overlay.setAppraisal(messageView('error', 'Extension updated', [STALE_CONTEXT]), !auto);
    return;
  }
  if (busyGen === generation) {
    if (busyAuction === auction) return;
    // Still running for an earlier auction: its answer is about a different item.
    generation++;
  }
  const gen = generation;
  const forAuction = auction;
  busyGen = gen;
  busyAuction = forAuction;
  const current = () => gen === generation;
  const show = (v: AppraisalView) => {
    if (current()) overlay.setAppraisal(v, !auto);
  };
  const started = performance.now();
  const session = liveSession();
  const base = {
    id: crypto.randomUUID(),
    at: Date.now(),
    liveId: session?.show.liveId ?? null,
    showTitle: session?.show.title ?? (document.title.split(' · ')[0] || null),
    lotId: session?.lot?.id ?? null,
    lotTitle: session?.lot?.title ?? null,
  };
  const categories = session?.show.categories ?? [];
  const showType = currentShowType();
  void loadOwned();
  const scan = currentScan();
  const cached = cachedForLot(base.liveId, base.lotId, showType, scan);
  // Auto doesn't redo an answer already on screen for this auction (you appraised the pinned item).
  if (auto && cached && shownId === cached.id) {
    busyGen = null;
    return;
  }
  if (cached && !(overlay.appraisalVisible() && shownId === cached.id)) {
    try {
      await showCached(cached);
    } finally {
      if (busyGen === gen) busyGen = null;
    }
    return;
  }
  shownId = null;
  const fromListing = listingView(base.lotTitle);
  show(fromListing ?? messageView('pending', 'Appraising…', [], 'Reading the video frame'));

  try {
    const video = findStreamVideo();
    const pageText = [base.lotTitle, collectPlayerText(video, (el) => overlay.isOurs(el))].filter(Boolean).join('\n');
    const guard = await getGuardSettings();

    const quick = await send('QUICK_APPRAISE', { pageText }).catch(() => null);
    let quickRecord: AppraisalRecord | null = null;
    if (quick?.read) {
      const record: AppraisalRecord = {
        ...base,
        listing: quick.read.source,
        name: quick.read.name,
        slabbed: quick.read.grade !== null,
        grade: quick.read.grade,
        quantity: quick.read.quantity,
        confidence: 'quick',
        model: null,
        melt: quick.melt,
        price: null,
        priceNote: null,
        valuation: computeValue({ quantity: quick.read.quantity, melt: quick.melt, price: null }, guard.maxBidPercent),
        notes: null,
        elapsedMs: performance.now() - started,
      };
      if (current()) setLatest(record, forAuction);
      quickRecord = record;
      show(view(record, 'quick', await similarTo(record.name)));
    }

    const context = { pageText, showTitle: base.showTitle ?? '', lotTitle: base.lotTitle, categories, showType };
    const image = (video ? captureFrame(video) : null) ?? (await captureScreenshot(video));
    if (!image) {
      const why = video ? "Couldn't read the video frame. Try the Alt+Shift+V shortcut, which allows a screenshot." : 'Open a live show first.';
      if (quickRecord) {
        const v = view({ ...quickRecord, elapsedMs: performance.now() - started }, 'done', await similarTo(quickRecord.name));
        v.cautions.push(why);
        show(v);
      } else show(messageView('error', 'No video frame', [why]));
      return;
    }
    const res = await send('APPRAISE', { ...context, image });
    if (!res.ok && quickRecord) {
      // The listing-text read still gives a melt floor and max bid, so keep it on screen.
      const v = view({ ...quickRecord, elapsedMs: performance.now() - started }, 'done', await similarTo(quickRecord.name));
      v.cautions.push(`Video check failed: ${res.error}`);
      show(v);
      return;
    }
    if (!res.ok) {
      const lines = [res.error, res.needsKey ? 'Set up on-device AI, add a cloud AI key, or add an Ollama server in the side panel Settings tab.' : ''].filter(Boolean);
      // A key date read from the lot title is still worth keeping on screen.
      show(fromListing ? { ...fromListing, status: 'done', cautions: [...fromListing.cautions, ...lines], footer: null } : messageView('error', 'Appraisal failed', lines));
      return;
    }

    const item: Partial<AppraisalItem> = { ...res.item };
    // A PCGS cert in the listing title beats one the model may have misread on camera.
    if (isPcgsPriceable(item.item_type) && quick?.cert && (!item.cert_number || item.cert_number.replace(/\D/g, '') === quick.cert)) {
      Object.assign(item, { is_slabbed: true, grading_service: 'PCGS', cert_number: quick.cert });
    }
    const rawEstimate = res.item.is_collectible ? estimateOf(res.item) : null;
    const [price, comps, calibration] = res.item.is_collectible
      ? await Promise.all([
          send('PRICE_LOOKUP', { item }).catch(() => null),
          compsFor([res.item.item_name, base.lotTitle], showType).catch(() => null),
          rawEstimate ? calibrationNow(showType).catch(() => null) : null,
        ])
      : [null, null, null];
    const priceInfo: PriceInfo | null = toPriceInfo(price);
    const estimate = rawEstimate ? calibrated(rawEstimate, calibration) : null;
    const name = res.item.is_collectible ? res.item.item_name : `No sellable item identified: ${res.item.item_name}`;
    const valuation = computeValue(
      { quantity: res.item.quantity, melt: res.melt ?? quick?.melt ?? null, price: priceInfo, estimate, comps },
      guard.maxBidPercent,
    );
    const record: AppraisalRecord = {
      ...base,
      name,
      itemType: res.item.item_type ?? null,
      year: res.item.year ?? null,
      mintMark: res.item.mint_mark ?? null,
      slabbed: Boolean(item.is_slabbed),
      special: res.item.special?.trim() || null,
      grade: res.item.grade ?? res.item.grade_estimate ?? null,
      quantity: res.item.quantity,
      confidence: res.item.confidence,
      model: res.model,
      melt: res.melt ?? quick?.melt ?? null,
      price: toPriceInfo(price),
      priceNote: priceNote(price),
      estimate,
      rawEstimate,
      calibration,
      comps,
      valuation,
      // Only the presented item was looked up. The rest of its lot is already on the model answer, so this adds no wait.
      lot: lotRollup({ name, quantity: res.item.quantity, marketValue: valuation.marketValue, basis: valuation.basis }, res.others),
      showType,
      notes: res.item.notes || null,
      elapsedMs: performance.now() - started,
    };
    if (current()) setLatest(record, forAuction);
    const similar = await similarTo(record.name);
    const fills: Fill[] = [];
    if (scan) fills.push('table');
    if (res.item.is_collectible && needsRefs(item)) fills.push('refs');
    if (current()) shownId = record.id;
    startFills(record, fills, similar, !auto);
    await send('APPRAISAL_SAVE', { record }).catch(() => undefined);
    if (fills.includes('table')) void addTableScan(record.id, { ...context, image, mainItem: res.item.item_name });
    if (fills.includes('refs')) void addRefs(record.id, item, res.others, guard.maxBidPercent);
  } catch (err) {
    const message = String((err as Error)?.message ?? err);
    show(messageView('error', 'Appraisal failed', [/context invalidated/i.test(message) ? STALE_CONTEXT : message]));
  } finally {
    if (busyGen === gen) busyGen = null;
  }
};
