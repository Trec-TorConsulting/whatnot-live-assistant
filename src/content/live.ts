import { matchKeywords, sanitizeAlertSettings, type AlertSettings } from '../shared/alerts';
import { CONTENT_SOURCE, HOOK_SOURCE, type ContentToHook, type HookToContent } from '../shared/hookProtocol';
import {
  decodePhoenixFrame,
  emptySession,
  noteCurrencyPair,
  noteElectronicsName,
  noteElectronicsRules,
  noteEstateName,
  noteEstateRules,
  noteRunnerGiveawayStems,
  noteShippingQuote,
  noteShippingRules,
  reduceGraphql,
  sessionForPath,
  reduceSocket,
  snapshotSession,
  type LiveSession,
  type LiveSignal,
} from '../shared/live';
import { pendingSpins, prizePriceKey } from '../shared/breaks';
import { manifestFrom } from '../shared/prizeValue';
import { send } from '../shared/messages';
import { soldFromSale, type SoldItem } from '../shared/soldHistory';
import type { ShopScan } from '../shared/shop';
import { getAlertSettings, getProfile, onItemChanged } from '../shared/storage';
import { every, onRetire } from './lifecycle';
import { findLiveHost, findStreamVideo, liveIdFromPath } from './selectors';
import { currentShowType } from './showType';

type Listener = (session: LiveSession, signals: LiveSignal[]) => void;

let session: LiveSession | null = null;
let hookAlive = false;
let username = '';
let alerts: AlertSettings = sanitizeAlertSettings(undefined);
const listeners = new Set<Listener>();
let pushTimer: ReturnType<typeof setTimeout> | undefined;

export const liveSession = () => session;
export const hookInstalled = () => hookAlive;
export const onLive = (fn: Listener) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const postToHook = (msg: ContentToHook) => window.postMessage({ source: CONTENT_SOURCE, ...msg }, location.origin);

const currentSession = (): LiveSession | null => {
  const next = sessionForPath(session, liveIdFromPath());
  session = next;
  return next;
};

const schedulePush = () => {
  if (pushTimer) return;
  pushTimer = setTimeout(() => {
    pushTimer = undefined;
    if (session && !session.show.host) {
      const host = findLiveHost();
      if (host) session = { ...session, show: { ...session.show, host } };
    }
    if (session) send('LIVE_UPDATE', { session: snapshotSession(session) }).catch(() => undefined);
  }, 1000);
};

// The share tab is a second copy of a show you already have open; its alerts would be duplicates.
let shareWorker = false;
export const markShareWorker = () => {
  shareWorker = true;
};
export const isShareWorker = () => shareWorker;

export const rememberShipping = (shipping: number | null) => {
  if (!session || shareWorker) return;
  const next = noteShippingQuote(session, shipping);
  if (next === session) return;
  session = next;
  schedulePush();
};

export const rememberRules = (key: string | null) => {
  if (!session || shareWorker) return;
  const next = noteEstateRules(session, key);
  if (next === session) return;
  session = next;
  schedulePush();
};

export const rememberEstateName = (name: string | null | undefined) => {
  if (!session || shareWorker) return;
  const next = noteEstateName(session, name);
  if (next === session) return;
  session = next;
  schedulePush();
};

export const rememberElectronicsRules = (key: string | null) => {
  if (!session || shareWorker) return;
  const next = noteElectronicsRules(session, key);
  if (next === session) return;
  session = next;
  schedulePush();
};

export const rememberElectronicsName = (name: string | null | undefined) => {
  if (!session || shareWorker) return;
  const next = noteElectronicsName(session, name);
  if (next === session) return;
  session = next;
  schedulePush();
};

export const rememberRunnerGiveawayStems = (bodyOrStems: unknown) => {
  if (!session || shareWorker) return;
  const next = noteRunnerGiveawayStems(session, bodyOrStems);
  if (next === session) return;
  session = next;
  schedulePush();
};

export const rememberShippingRules = (key: string | null) => {
  if (!session || shareWorker) return;
  const next = noteShippingRules(session, key);
  if (next === session) return;
  session = next;
  schedulePush();
};

export const rememberCurrencyPair = (
  pair: { amount: number; code: string; usd: number | null; tariffs?: boolean } | null | undefined,
) => {
  if (!session || shareWorker) return;
  const next = noteCurrencyPair(session, pair);
  if (next === session) return;
  session = next;
  schedulePush();
};

export const publishShop = (shop: ShopScan) => {
  const s = currentSession();
  if (!s || shareWorker) return;
  session = { ...s, shop };
  schedulePush();
};

// Only signals the background acts on leave the tab: new giveaways, keyword hits, and your wins.
const forward = (signal: LiveSignal) => {
  if (!session || shareWorker) return;
  const base = { liveId: session.show.liveId, showTitle: session.show.title, host: session.show.host };
  if (signal.kind === 'giveaway_started' && alerts.giveaways) {
    void send('LIVE_SIGNAL', { ...base, signal }).catch(() => undefined);
  } else if (signal.kind === 'chat' && alerts.chatKeywords.length && matchKeywords(signal.message.text, alerts.chatKeywords).length) {
    void send('LIVE_SIGNAL', { ...base, signal }).catch(() => undefined);
  } else if (signal.kind === 'sale' && username && signal.sale.buyer?.toLowerCase() === username.toLowerCase()) {
    const photo = winPhoto();
    const currencyRate = session.currency?.rate ?? null;
    void send('LIVE_SIGNAL', { ...base, signal, ...(photo ? { photo } : {}), ...(currencyRate !== null ? { currencyRate } : {}) }).catch(() => undefined);
  }
};

// A small frame of the video as the win comes in, usually still showing the item.
const PHOTO_PX = 320;
const winPhoto = (): string | null => {
  const video = findStreamVideo();
  if (!video?.videoWidth || !video.videoHeight) return null;
  const scale = Math.min(1, PHOTO_PX / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  try {
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.7);
  } catch {
    return null;
  }
};

let soldQueue: SoldItem[] = [];
let soldTimer: ReturnType<typeof setTimeout> | undefined;

const recordSold = (signal: LiveSignal) => {
  if (!session || signal.kind !== 'sale') return;
  const item = soldFromSale(signal.sale, session.show.liveId, session.show.title, currentShowType(), session.show.host, session.currency?.rate ?? null);
  if (!item) return;
  soldQueue.push(item);
  soldTimer ??= setTimeout(() => {
    soldTimer = undefined;
    const items = soldQueue;
    soldQueue = [];
    void send('SALES_RECORD', { items }).catch(() => undefined);
  }, 5000);
};

const emit = (signals: LiveSignal[]) => {
  if (!session) return;
  for (const fn of listeners) fn(session, signals);
  signals.forEach(forward);
  signals.forEach(recordSold);
  schedulePush();
};

// The wheel's counts change after each spin, so it's refetched when a spin sells or the next spot
// goes up, and on a slow poll in case those events are missed.
const BREAK_MIN_GAP_MS = 1500;
const BREAK_POLL_MS = 15_000;
const NOTES_POLL_MS = 2 * 60 * 1000;
const PENDING_RECHECK_MS = 4000;
let breakTimer: ReturnType<typeof setTimeout> | undefined;
let pendingTimer: ReturnType<typeof setTimeout> | undefined;
let lastBreakFetch = 0;
let lastNotesFetch = 0;

const refreshNotes = () => {
  if (!session || shareWorker) return;
  lastNotesFetch = Date.now();
  postToHook({ kind: 'fetch_notes', id: session.show.liveId });
};

const refreshBreak = () => {
  if (!session?.breakId || shareWorker || breakTimer) return;
  const paging = session.wheel?.id === session.breakId && session.wheel.complete === false && !!session.wheel.prizesCursor;
  breakTimer = setTimeout(
    () => {
      breakTimer = undefined;
      lastBreakFetch = Date.now();
      const id = session?.breakId;
      if (!id) return;
      const wheel = session?.wheel?.id === id ? session.wheel : null;
      const soldAfter = wheel ? wheel.soldCursor : null;
      // A short list is read from the start. A list Whatnot split across pages continues from the cursor.
      const optionsAfter = wheel && !wheel.complete ? (wheel.prizesCursor ?? null) : null;
      postToHook({ kind: 'fetch_break', id, soldAfter, optionsAfter });
    },
    Math.max(0, lastBreakFetch + (paging ? 200 : BREAK_MIN_GAP_MS) - Date.now()),
  );
};

// Prize values are worked out once per prize list, as soon as it loads, so they're ready before
// anyone bids; the background caches them by prize name and condition.
let valuedPrizes = '';
let extractedManifests = new Set<string>();
const valueWheel = (s: LiveSession) => {
  const wheel = s.wheel?.id === s.breakId ? s.wheel : null;
  if (!wheel?.prizes.length || shareWorker) return;
  const notes = s.show.note?.text ?? null;
  const listed = wheel.prizes.map(({ title, detail }) => ({ title, detail }));
  const manifest = manifestFrom(wheel.description, notes).items.map((item) => ({ title: item.name, detail: '' }));
  const prizes = [...listed, ...manifest];
  const key = `${wheel.id}|${wheel.description ?? ''}|${notes ?? ''}|${prizes.map(prizePriceKey).join('|')}`;
  if (key === valuedPrizes) return;
  valuedPrizes = key;
  const context = { showTitle: s.show.title, wheelTitle: wheel.title, categories: s.show.categories, notes };
  void send('WHEEL_VALUE', { prizes, context }).catch(() => undefined);

  if (!extractedManifests.has(wheel.id) && (wheel.description || notes)) {
    extractedManifests.add(wheel.id);
    void send('EXTRACT_MANIFEST_AI', {
      breakId: wheel.id,
      description: wheel.description,
      notes,
      categories: s.show.categories,
    })
      .then((res) => {
        if (res.ok && res.manifest) {
          const extraPrizes = res.manifest.items.map((it) => ({ title: it.name, detail: '' }));
          if (res.manifest.floorName) extraPrizes.push({ title: res.manifest.floorName, detail: '' });
          if (extraPrizes.length) void send('WHEEL_VALUE', { prizes: extraPrizes, context }).catch(() => undefined);
        }
      })
      .catch(() => undefined);
  }
};

const wheelMoved = (prev: LiveSession, next: LiveSession) =>
  Boolean(next.breakId) &&
  (next.breakId !== prev.breakId ||
    next.sales.length !== prev.sales.length ||
    next.lot?.title !== prev.lot?.title ||
    (next.lot?.status === 'sold' && prev.lot?.status !== 'sold'));

const onHookMessage = (e: MessageEvent) => {
  if (e.source !== window || e.data?.source !== HOOK_SOURCE) return;
  const msg = e.data as HookToContent;
  if (msg.kind === 'hello') {
    hookAlive = true;
    return;
  }
  const s = currentSession();
  if (!s) return;
  if (msg.kind === 'socket') {
    const frame = decodePhoenixFrame(msg.raw);
    if (!frame) return;
    const result = reduceSocket(s, frame, Date.now(), username || null);
    session = result.session;
    if (wheelMoved(s, session)) refreshBreak();
    emit(result.signals);
  } else if (msg.kind === 'graphql_op') {
    session = reduceGraphql(s, msg.operation, null);
    schedulePush();
  } else if (msg.kind === 'graphql') {
    let body: unknown = null;
    try {
      body = JSON.parse(msg.body);
    } catch {
      return;
    }
    session = reduceGraphql(s, msg.operation, body, Date.now(), msg.optionsAfter);
    valueWheel(session);
    const stuck = typeof msg.optionsAfter === 'string' && session.wheel?.prizesCursor === msg.optionsAfter;
    // Prize pages and long spin histories arrive 100 at a time; keep paging until caught up.
    if (session.wheel && !session.wheel.complete && session.wheel.prizesCursor && !stuck) refreshBreak();
    else if (session.wheel?.soldHasMore && session.wheel !== s.wheel) refreshBreak();
    // A spin read before Whatnot randomized it gets read again shortly; with Auto-Randomize off the
    // seller may take a while, so this only rechecks every few seconds.
    else if (session.wheel && pendingSpins(session.wheel) && !pendingTimer) {
      pendingTimer = setTimeout(() => {
        pendingTimer = undefined;
        refreshBreak();
      }, PENDING_RECHECK_MS);
    }
    emit([]);
  }
};

export const startLiveBridge = async () => {
  window.addEventListener('message', onHookMessage);
  onRetire(() => {
    window.removeEventListener('message', onHookMessage);
    listeners.clear();
    clearTimeout(breakTimer);
    clearTimeout(pendingTimer);
    clearTimeout(pushTimer);
    clearTimeout(soldTimer);
  });
  postToHook({ kind: 'ready' });
  every(() => {
    if (Date.now() - lastBreakFetch >= BREAK_POLL_MS) refreshBreak();
    if (Date.now() - lastNotesFetch >= NOTES_POLL_MS) refreshNotes();
  }, BREAK_POLL_MS);
  [alerts, username] = await Promise.all([getAlertSettings(), getProfile().then((p) => p.username)]);
  onItemChanged('alertSettings', (v) => (alerts = sanitizeAlertSettings(v)));
  onItemChanged('profile', (v) => (username = v?.username ?? ''));
};

// Whatnot navigates client-side; a new show starts a fresh session.
export const resetForPath = () => {
  const liveId = liveIdFromPath();
  if (!liveId && session) {
    session = null;
    return;
  }
  if (liveId && session?.show.liveId !== liveId) {
    session = emptySession(liveId);
    schedulePush();
  }
  if (liveId) refreshNotes();
};
