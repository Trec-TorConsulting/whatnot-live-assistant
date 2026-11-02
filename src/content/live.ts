import { matchKeywords, sanitizeAlertSettings, type AlertSettings } from '../shared/alerts';
import { CONTENT_SOURCE, HOOK_SOURCE, type ContentToHook, type HookToContent } from '../shared/hookProtocol';
import {
  decodePhoenixFrame,
  emptySession,
  reduceGraphql,
  reduceSocket,
  snapshotSession,
  type LiveSession,
  type LiveSignal,
} from '../shared/live';
import { pendingSpins, prizeValueKey } from '../shared/breaks';
import { send } from '../shared/messages';
import { soldFromSale, type SoldItem } from '../shared/soldHistory';
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
  const liveId = liveIdFromPath();
  if (!liveId) return null;
  if (!session || session.show.liveId !== liveId) session = emptySession(liveId);
  return session;
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
    void send('LIVE_SIGNAL', { ...base, signal, ...(photo ? { photo } : {}) }).catch(() => undefined);
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
  const item = soldFromSale(signal.sale, session.show.liveId, session.show.title, currentShowType(), session.show.host);
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
const PENDING_RECHECK_MS = 4000;
let breakTimer: ReturnType<typeof setTimeout> | undefined;
let pendingTimer: ReturnType<typeof setTimeout> | undefined;
let lastBreakFetch = 0;

const refreshBreak = () => {
  if (!session?.breakId || shareWorker || breakTimer) return;
  breakTimer = setTimeout(
    () => {
      breakTimer = undefined;
      lastBreakFetch = Date.now();
      const id = session?.breakId;
      if (!id) return;
      const soldAfter = session?.wheel?.id === id ? session.wheel.soldCursor : null;
      postToHook({ kind: 'fetch_break', id, soldAfter });
    },
    Math.max(0, lastBreakFetch + BREAK_MIN_GAP_MS - Date.now()),
  );
};

// Prize values are worked out once per prize list, as soon as it loads, so they're ready before
// anyone bids; the background caches them by prize name and condition.
let valuedPrizes = '';
const valueWheel = (s: LiveSession) => {
  const wheel = s.wheel?.id === s.breakId ? s.wheel : null;
  if (!wheel?.prizes.length || shareWorker) return;
  const prizes = wheel.prizes.map(({ title, detail }) => ({ title, detail }));
  const key = `${wheel.id}|${prizes.map(prizeValueKey).join('|')}`;
  if (key === valuedPrizes) return;
  valuedPrizes = key;
  const context = { showTitle: s.show.title, wheelTitle: wheel.title, categories: s.show.categories };
  void send('WHEEL_VALUE', { prizes, context }).catch(() => undefined);
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
    const result = reduceSocket(s, frame);
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
    session = reduceGraphql(s, msg.operation, body);
    valueWheel(session);
    // Long spin histories arrive 100 at a time; keep paging until caught up.
    if (session.wheel?.soldHasMore && session.wheel !== s.wheel) refreshBreak();
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
};
