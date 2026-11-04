import { dueShows, matchKeywords, mergeWatched, type WatchedShow } from '../shared/alerts';
import { toUsd } from '../shared/currency';
import { createLock } from '../shared/lock';
import type { LiveSignal } from '../shared/live';
import { formatMoney } from '../shared/money';
import { addPurchase, purchaseKey, type Purchase } from '../shared/purchases';
import { getAlertSettings, getItem, getTabAppraisal, getTabLive, setItem } from '../shared/storage';
import { DAY, MINUTE } from '../shared/time';

export const ALARM_WATCH = 'wn2-watch';
const CHAT_THROTTLE_MS = MINUTE;
const APPRAISAL_MATCH_MS = 15 * MINUTE;
const ICON = 'icons/icon-128.png';

const withData = createLock();

// Remembers which alerts already fired, so reloads and repeated events don't notify twice.
const firstTime = (key: string, windowMs = 7 * DAY) =>
  withData(async () => {
    const now = Date.now();
    const notified = (await getItem('notified')) ?? {};
    const last = notified[key];
    if (last && now - last < windowMs) return false;
    notified[key] = now;
    for (const [k, at] of Object.entries(notified)) if (now - at > 7 * DAY) delete notified[k];
    await setItem('notified', notified);
    return true;
  });

const targets = new Map<string, { tabId?: number; url?: string }>();

const notify = async (id: string, title: string, message: string, target: { tabId?: number; url?: string }) => {
  targets.set(id, target);
  await chrome.notifications.create(id, { type: 'basic', iconUrl: chrome.runtime.getURL(ICON), title, message, priority: 1 });
};

export const onNotificationClicked = async (id: string) => {
  const target = targets.get(id);
  const [, kind, ref] = id.split('|');
  const url =
    target?.url ?? (kind === 'show' ? `https://www.whatnot.com/live/${ref}` : kind === 'late' ? `https://www.whatnot.com/order/${ref}` : undefined);
  if (target?.tabId !== undefined) {
    const tab = await chrome.tabs.update(target.tabId, { active: true }).catch(() => null);
    if (tab?.windowId !== undefined) {
      await chrome.windows.update(tab.windowId, { focused: true }).catch(() => undefined);
      return;
    }
  }
  if (url) await chrome.tabs.create({ url });
};

const recordWin = async (
  p: { liveId: string; showTitle: string | null; host: string | null; currencyRate?: number | null },
  sale: Extract<LiveSignal, { kind: 'sale' }>['sale'],
  tabId: number | undefined,
  photo: string | undefined,
) => {
  const [appraisal, tabLive] =
    tabId !== undefined ? await Promise.all([getTabAppraisal(tabId), getTabLive(tabId)]) : [undefined, undefined];
  const fresh = appraisal && Date.now() - appraisal.at < APPRAISAL_MATCH_MS && (!appraisal.lotId || !sale.productId || appraisal.lotId === sale.productId);
  const melt = fresh ? appraisal.melt : null;
  const base = { at: sale.at, liveId: p.liveId, title: sale.title ?? 'Unknown item', price: sale.price ?? 0 };
  const currency = sale.currency ?? tabLive?.currency?.code ?? null;
  const rate = p.currencyRate !== undefined ? p.currencyRate : (tabLive?.currency?.rate ?? null);
  const code = (currency ?? 'USD').toUpperCase();
  const priceUsd = code === 'USD' ? base.price : toUsd(base.price, code, rate);
  const purchase: Purchase = {
    ...base,
    key: purchaseKey({ ...base, productId: sale.productId }),
    showTitle: p.showTitle,
    host: p.host,
    kind: sale.kind,
    appraisedValue: fresh ? appraisal.valuation.marketValue : null,
    meltValue: fresh ? appraisal.valuation.meltValue : null,
    appraisalId: fresh ? appraisal.id : null,
    source: 'auto',
    ...(currency ? { currency, priceUsd } : {}),
    ...(melt?.spot ? { metal: melt.metal, oz: Math.round((melt.total / melt.spot) * 10000) / 10000 } : {}),
  };
  return withData(async () => {
    const { list, added } = addPurchase((await getItem('purchases')) ?? [], purchase);
    if (!added) return false;
    await setItem('purchases', list);
    if (photo?.startsWith('data:image/jpeg;base64,') && photo.length < 80_000) {
      const photos = { ...((await getItem('purchasePhotos')) ?? {}), [purchase.key]: photo };
      const keep = new Set(list.slice(-MAX_PHOTOS).map((x) => x.key));
      await setItem('purchasePhotos', Object.fromEntries(Object.entries(photos).filter(([k]) => keep.has(k))));
    }
    return true;
  });
};

const MAX_PHOTOS = 150;

export const handleSignal = async (
  p: { liveId: string; showTitle: string | null; host: string | null; signal: LiveSignal; photo?: string; currencyRate?: number | null },
  tabId: number | undefined,
) => {
  const settings = await getAlertSettings();
  const who = p.host ? `@${p.host}` : 'A show';
  const { signal } = p;

  if (signal.kind === 'giveaway_started' && settings.giveaways) {
    if (await firstTime(`giveaway:${p.liveId}:${signal.giveawayId}`)) {
      await notify(`wn2|giveaway|${p.liveId}|${signal.giveawayId}`, `Giveaway started: ${who}`, p.showTitle ?? 'Enter in the Whatnot app.', { tabId });
    }
  } else if (signal.kind === 'chat') {
    const hits = matchKeywords(signal.message.text, settings.chatKeywords);
    for (const keyword of hits) {
      if (!(await firstTime(`chat:${p.liveId}:${keyword}`, CHAT_THROTTLE_MS))) continue;
      await notify(`wn2|chat|${p.liveId}|${signal.message.id}`, `“${keyword}” in ${who}'s chat`, `${signal.message.user}: ${signal.message.text}`.slice(0, 200), { tabId });
      break;
    }
  } else if (signal.kind === 'sale') {
    const added = await recordWin(p, signal.sale, tabId, p.photo);
    if (added && settings.myWins) {
      await notify(
        `wn2|win|${signal.sale.key}`,
        `You won: ${signal.sale.title ?? 'an item'}`,
        `${formatMoney(signal.sale.price)} in ${who}'s show`,
        { tabId },
      );
    }
  }
  return { ok: true as const };
};

export const notifyOnce = async (key: string, id: string, title: string, message: string, target: { tabId?: number; url?: string }, windowMs = 7 * DAY) => {
  if (await firstTime(key, windowMs)) await notify(id, title.slice(0, 120), message.slice(0, 200), target);
};

// The tab picks the wording; the id keeps a repeated event from notifying twice.
export const buyerAlert = async (p: { id: string; title: string; message: string }, tabId: number | undefined) => {
  if (await firstTime(`buyer:${p.id}`, 10 * MINUTE)) await notify(`wn2|buyer|${p.id}`, p.title.slice(0, 120), p.message.slice(0, 200), { tabId });
  return { ok: true as const };
};

export const addWatched = (shows: Omit<WatchedShow, 'notifiedAt'>[]) =>
  withData(async () => {
    await setItem('watched', mergeWatched((await getItem('watched')) ?? [], shows, Date.now()));
    return { ok: true as const };
  });

export const checkStartingSoon = async () => {
  const settings = await getAlertSettings();
  if (!settings.showStarting) return;
  const now = Date.now();
  const due = await withData(async () => {
    const watched = (await getItem('watched')) ?? [];
    const list = dueShows(watched, now, settings.leadMinutes);
    if (!list.length) return [];
    const ids = new Set(list.map((s) => s.liveId));
    await setItem('watched', watched.map((s) => (ids.has(s.liveId) ? { ...s, notifiedAt: now } : s)));
    return list;
  });
  for (const s of due) {
    const minutes = Math.max(0, Math.round((s.startsAt - now) / MINUTE));
    await notify(
      `wn2|show|${s.liveId}`,
      minutes > 0 ? `Starting in ${minutes} min${s.host ? `: @${s.host}` : ''}` : `Starting now${s.host ? `: @${s.host}` : ''}`,
      s.title || 'A show you bookmarked',
      { url: `https://www.whatnot.com/live/${s.liveId}` },
    );
  }
};

export const addManualPurchase = (p: Omit<Purchase, 'key'>) =>
  withData(async () => {
    const purchase: Purchase = { ...p, key: purchaseKey(p) };
    const { list, added } = addPurchase((await getItem('purchases')) ?? [], purchase);
    if (!added) return { ok: false as const, error: 'That purchase is already recorded.' };
    await setItem('purchases', list);
    return { ok: true as const };
  });

export const deletePurchase = (key: string) =>
  withData(async () => {
    await setItem('purchases', ((await getItem('purchases')) ?? []).filter((p) => p.key !== key));
    const photos = (await getItem('purchasePhotos')) ?? {};
    if (key in photos) {
      delete photos[key];
      await setItem('purchasePhotos', photos);
    }
    return { ok: true as const };
  });
