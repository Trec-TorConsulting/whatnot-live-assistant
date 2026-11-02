// Buyer alerts on a live show: outbid, a lot you're in about to close, a watchlist item coming up,
// someone @mentioning you, and a run of losses. It never bids; it only tells you.
import {
  BidTracker,
  DEFAULT_BUYER_SETTINGS,
  matchWatch,
  mentionsUser,
  sanitizeBuyerSettings,
  sanitizeSellerNotes,
  sellerHistory,
  sellerKey,
  sellerLine,
  type BuyerEvent,
  type BuyerSettings,
  type SellerNote,
  type WatchItem,
} from '../shared/buyer';
import type { Lot } from '../shared/live';
import { send } from '../shared/messages';
import { formatMoney } from '../shared/money';
import type { Purchase } from '../shared/purchases';
import { getItem, getProfile, onItemChanged } from '../shared/storage';
import { MINUTE } from '../shared/time';
import {
  BidderWatch,
  closesLine,
  JOINED_OPERATION,
  JOINED_QUERY,
  parseJoined,
  parseSellerProfile,
  PROFILE_TTL_MS,
  profileCaution,
  profileLine,
  sellerCloses,
  type SellerProfile,
} from '../shared/sellerInfo';
import { isShareWorker, liveSession, onLive } from './live';
import { every } from './lifecycle';
import { overlay, type SellerView } from './overlay';
import { findWinningUser } from './selectors';

type Tone = 'outbid' | 'closing' | 'watch' | 'mention' | 'warn';

let settings: BuyerSettings = DEFAULT_BUYER_SETTINGS;
let username = '';
let notes: Record<string, SellerNote> = {};
let purchases: Purchase[] = [];
let spot: { gold: number | null; silver: number | null } | null = null;
let onChange: () => void = () => undefined;

const tracker = new BidTracker(() => username);
const bidders = new BidderWatch();
const fired = new Set<string>();
let profile: SellerProfile | null = null;
let closes: string | null = null;

const MAX_FIRED = 500;
const CLOSING_POLL_MS = 250;
const SPOT_POLL_MS = 5 * MINUTE;

export const currentSpot = () => spot;
export const buyerSettings = () => settings;

const moderators = (): Set<string> =>
  new Set((liveSession()?.chat ?? []).filter((m) => m.isModerator && !m.isHost).map((m) => m.user.toLowerCase()));

// The host or a moderator on top is always mentioned; a bidder who keeps leading and never wins
// only when you're in the lot.
export const bidderNote = (leader: string | null, involved: boolean) => {
  const s = liveSession();
  if (!s) return null;
  const note = bidders.note(leader, s.show.host, moderators());
  if (!note) return null;
  return involved || /host's own account|moderator/.test(note) ? note : null;
};
export const watchFor = (lot: Pick<Lot, 'title'> | null): WatchItem | null => matchWatch(lot?.title ?? null, settings.watchlist);
export const youOnLot = (lot: Lot | null) => tracker.you(lot);

let audio: AudioContext | null = null;
const TONES: Record<Tone, number[]> = { outbid: [880, 620], closing: [1240, 1240], watch: [660, 880], mention: [990], warn: [440, 330] };

const beep = (tone: Tone) => {
  try {
    audio ??= new AudioContext();
    void audio.resume();
    let t = audio.currentTime;
    for (const f of TONES[tone]) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      osc.connect(gain).connect(audio.destination);
      osc.start(t);
      osc.stop(t + 0.15);
      t += 0.17;
    }
  } catch {
    // No audio (autoplay blocked or unsupported); the notice and flash still show.
  }
};

// The on-page notice always shows; a desktop notification only when you can't see the tab.
const alertOnce = (id: string, notice: string, detail: string, tone: Tone) => {
  if (fired.has(id) || isShareWorker()) return;
  fired.add(id);
  if (fired.size > MAX_FIRED) fired.delete(fired.values().next().value!);
  if (settings.sound) beep(tone);
  overlay.notice(notice, 6000);
  overlay.flash();
  if (document.hidden) void send('BUYER_ALERT', { id, title: notice, message: detail }).catch(() => undefined);
};

const CLOSING_STATE = { leading: "you're winning", outbid: "you're outbid", watch: 'on your watchlist' } as const;

const announce = (e: BuyerEvent, liveId: string) => {
  if (e.kind === 'outbid') {
    if (settings.outbid) alertOnce(`outbid:${liveId}:${e.key}:${e.bid}`, `Outbid by @${e.by} at ${formatMoney(e.bid)}`, e.title ?? 'This lot', 'outbid');
  } else if (e.kind === 'loss_streak') {
    alertOnce(`tilt:${liveId}:${e.losses}`, `Lost ${e.losses} in a row. Stick to your max.`, 'Chasing losses is how a show goes over budget.', 'warn');
  } else {
    alertOnce(`closing:${e.key}:${Date.now()}`, `${e.secondsLeft}s left, ${CLOSING_STATE[e.state]}`, e.title ?? 'Lot closing', 'closing');
  }
};

const onLot = (lot: Lot, liveId: string) => {
  const watch = watchFor(lot);
  const key = lot.id ?? lot.title;
  if (watch && key && lot.status === 'active') {
    alertOnce(`watch:${liveId}:${key}`, `Watchlist: ${lot.title ?? 'a lot'}`, watch.max ? `Your max is ${formatMoney(watch.max)}.` : 'On your watchlist.', 'watch');
  }
  bidders.lot(lot);
  for (const e of tracker.lot(lot)) announce(e, liveId);
};

// When the feed's updates don't name a leader, the "X is Winning!" line on the page still does.
let domLeader = '';
const checkClosing = () => {
  const s = liveSession();
  const lot = s?.lot ?? null;
  if (s && lot && !lot.leader && lot.status === 'active') {
    const shown = findWinningUser();
    if (shown && shown !== domLeader) {
      domLeader = shown;
      onLot({ ...lot, leader: shown }, s.show.liveId);
      onChange();
    }
  }
  const e = tracker.closing(lot, Date.now(), settings.lastSeconds, Boolean(watchFor(lot)));
  if (e && s) announce(e, s.show.liveId);
};

const sellerView = (): SellerView | null => {
  const show = liveSession()?.show;
  if (!show?.host) return null;
  const note = notes[sellerKey(show.host)];
  const history = sellerHistory(purchases, show.host, show.liveId);
  const current = profile && sellerKey(profile.host) === sellerKey(show.host) ? profile : null;
  return {
    host: show.host,
    note: note?.note || null,
    blocked: Boolean(note?.blocked),
    history: sellerLine(history, Date.now()),
    thisShow: history.thisShow,
    profile: current ? profileLine(current) : null,
    caution: current ? profileCaution(current) : null,
    closes,
  };
};

// Their public numbers come from their profile page, fetched once a day and off the critical path.
const PROFILE_FETCH_TIMEOUT_MS = 8000;
const loadSellerInfo = async (host: string) => {
  const key = sellerKey(host);
  const [profiles, sold, appraisals] = await Promise.all([getItem('sellerProfiles'), getItem('soldHistory'), getItem('appraisals')]);
  if (liveSession()?.show.host !== host) return;
  closes = closesLine(sellerCloses(sold ?? [], appraisals ?? [], host, Date.now()));
  const cached = profiles?.[key];
  profile = cached ?? null;
  refreshSeller();
  if (cached && Date.now() - cached.fetchedAt < PROFILE_TTL_MS) return;
  try {
    const [page, joinedAt] = await Promise.all([fetchText(`/user/${encodeURIComponent(host)}`), fetchJoined(host)]);
    const parsed = page ? parseSellerProfile(page, host, Date.now()) : null;
    if (!parsed) return;
    const full = { ...parsed, joinedAt: joinedAt ?? cached?.joinedAt ?? null };
    profile = { ...full, firstSeen: cached?.firstSeen ?? parsed.fetchedAt };
    void send('SELLER_PROFILE_SAVE', { profile: full }).catch(() => undefined);
    if (liveSession()?.show.host === host) refreshSeller();
  } catch {
    // Offline or blocked: the row just goes without their numbers.
  }
};

const fetchText = async (url: string, init: RequestInit = {}) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROFILE_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { credentials: 'include', ...init, signal: ctrl.signal });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

const fetchJoined = async (host: string) => {
  const body = await fetchText(`/services/graphql/?operationName=${JOINED_OPERATION}&ssr=0`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Cookie', 'x-whatnot-app': 'whatnot-web' },
    body: JSON.stringify({ operationName: JOINED_OPERATION, query: JOINED_QUERY, variables: { username: host } }),
  });
  return body ? parseJoined(body) : null;
};

const refreshSeller = () => {
  const v = sellerView();
  overlay.setSeller(v);
  const liveId = liveSession()?.show.liveId;
  if (v?.blocked && liveId) alertOnce(`blocked:${liveId}:${sellerKey(v.host)}`, `@${v.host} is on your blocklist`, v.note ?? 'You blocked this seller.', 'warn');
};

const spotText = () => {
  if (!spot || (spot.gold === null && spot.silver === null)) return null;
  return [spot.gold !== null ? `Gold ${formatMoney(spot.gold)}` : null, spot.silver !== null ? `Silver ${formatMoney(spot.silver)}` : null]
    .filter(Boolean)
    .join(' · ');
};

const refreshTools = () => overlay.setTools({ spot: spotText(), templates: settings.chatTemplates });

const loadSpot = async () => {
  const res = await send('SPOT_GET', {}).catch(() => null);
  if (res) spot = res;
  refreshTools();
  onChange();
};

export const startBuyer = async (opts: { onChange: () => void }) => {
  onChange = opts.onChange;
  const [s, profile, n, p] = await Promise.all([getItem('buyerSettings'), getProfile(), getItem('sellerNotes'), getItem('purchases')]);
  settings = sanitizeBuyerSettings(s);
  username = profile.username;
  notes = sanitizeSellerNotes(n);
  purchases = p ?? [];
  onItemChanged('buyerSettings', (v) => {
    settings = sanitizeBuyerSettings(v);
    refreshTools();
    onChange();
  });
  onItemChanged('profile', (v) => (username = v?.username ?? ''));
  onItemChanged('sellerNotes', (v) => {
    notes = sanitizeSellerNotes(v);
    refreshSeller();
  });
  onItemChanged('purchases', (v) => {
    purchases = v ?? [];
    refreshSeller();
  });

  let host = '';
  onLive((session, signals) => {
    const liveId = session.show.liveId;
    for (const signal of signals) {
      if (signal.kind === 'lot') onLot(signal.lot, liveId);
      else if (signal.kind === 'sale') {
        bidders.sale(signal.sale);
        for (const e of tracker.sale(signal.sale, settings.tiltLosses)) announce(e, liveId);
      }
      else if (signal.kind === 'chat' && settings.mentions && signal.message.user.toLowerCase() !== username.toLowerCase() && mentionsUser(signal.message.text, username)) {
        alertOnce(`mention:${signal.message.id}`, `@${signal.message.user} mentioned you`, signal.message.text, 'mention');
      }
    }
    if (`${liveId}|${session.show.host}` !== host) {
      host = `${liveId}|${session.show.host}`;
      refreshSeller();
      if (session.show.host && !isShareWorker()) void loadSellerInfo(session.show.host);
    }
  });
  every(checkClosing, CLOSING_POLL_MS);
  void loadSpot();
  every(() => void loadSpot(), SPOT_POLL_MS);
};

export const resetBuyer = () => {
  tracker.resetShow();
  bidders.reset();
  domLeader = '';
  closes = null;
  refreshSeller();
  refreshTools();
};
