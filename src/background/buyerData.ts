// Buyer data the tabs send in (seller profiles, your orders, shows matching your keywords) and the
// muted background tabs that watch other shows for you.
import { matchShows, mergeShowMatches, type ShowSeen } from '../shared/discover';
import { createLock } from '../shared/lock';
import { isLate, mergeOrders, type Order } from '../shared/orders';
import { sellerKey } from '../shared/buyer';
import type { SellerProfile } from '../shared/sellerInfo';
import { getBuyerSettings, getItem, getSession, setItem, setSession, type Monitor } from '../shared/storage';
import { DAY } from '../shared/time';
import { notifyOnce } from './alerts';

const withData = createLock();
const MAX_PROFILES = 300;
export const MAX_MONITORS = 4;

export const saveSellerProfile = (p: Omit<SellerProfile, 'firstSeen'>) =>
  withData(async () => {
    const all = (await getItem('sellerProfiles')) ?? {};
    const key = sellerKey(p.host);
    all[key] = { ...p, firstSeen: all[key]?.firstSeen ?? p.fetchedAt };
    const kept = Object.entries(all)
      .sort((a, b) => b[1].fetchedAt - a[1].fetchedAt)
      .slice(0, MAX_PROFILES);
    await setItem('sellerProfiles', Object.fromEntries(kept));
    return { ok: true as const };
  });

export const saveOrders = (orders: Order[]) =>
  withData(async () => {
    await setItem('orders', mergeOrders((await getItem('orders')) ?? {}, orders.slice(0, 100)));
    return { ok: true as const };
  });

// Runs with the 5-minute watch alarm; each late order notifies once a week at most.
export const checkLateOrders = async () => {
  const now = Date.now();
  for (const o of Object.values((await getItem('orders')) ?? {})) {
    if (!isLate(o, now)) continue;
    await notifyOnce(
      `late:${o.id}`,
      `wn2|late|${o.id}`,
      `Late package: ${o.title}`,
      `Expected ${new Date(o.deliveryAt!).toLocaleDateString()}${o.seller ? ` from @${o.seller}` : ''}. Open the order to message the seller.`,
      { url: `https://www.whatnot.com/order/${o.id}` },
      7 * DAY,
    );
  }
};

export const showsSeen = async (shows: ShowSeen[]) => {
  const settings = await getBuyerSettings();
  if (!settings.showKeywords.length) return { ok: true as const };
  const now = Date.now();
  const hits = matchShows(shows.slice(0, 200), settings.showKeywords, now);
  if (!hits.length) return { ok: true as const };
  await withData(async () => setItem('showMatches', mergeShowMatches((await getItem('showMatches')) ?? [], hits, now)));
  for (const m of hits) {
    const when = m.startsAt === null ? 'Live now' : new Date(m.startsAt).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
    await notifyOnce(`show:${m.liveId}:${m.keyword}`, `wn2|show|${m.liveId}`, `“${m.keyword}” show: ${when}`, `${m.host ? `@${m.host}: ` : ''}${m.title}`, {
      url: `https://www.whatnot.com/live/${m.liveId}`,
    });
  }
  return { ok: true as const };
};

// --- Watching other shows ---

const monitors = async () => (await getSession('monitors')) ?? {};

export const addMonitor = (liveId: string) =>
  withData(async () => {
    if (!/^[\w-]{6,64}$/.test(liveId)) return { ok: false as const, error: "That doesn't look like a show link." };
    const all = await monitors();
    if (all[liveId]) {
      const alive = await chrome.tabs.get(all[liveId].tabId).catch(() => null);
      if (alive) return { ok: true as const };
    }
    if (Object.keys(all).length >= MAX_MONITORS) return { ok: false as const, error: `You can watch up to ${MAX_MONITORS} shows at once.` };
    const tab = await chrome.tabs.create({ url: `https://www.whatnot.com/live/${liveId}`, active: false });
    if (tab.id === undefined) return { ok: false as const, error: "Couldn't open the show." };
    // Muted so the shows don't talk over each other; kept loaded so alerts keep coming.
    await chrome.tabs.update(tab.id, { muted: true, autoDiscardable: false }).catch(() => undefined);
    const watched = ((await getItem('watched')) ?? []).find((w) => w.liveId === liveId);
    const match = ((await getItem('showMatches')) ?? []).find((m) => m.liveId === liveId);
    const entry: Monitor = { liveId, tabId: tab.id, title: watched?.title ?? match?.title ?? null, host: watched?.host ?? match?.host ?? null, at: Date.now() };
    await setSession('monitors', { ...all, [liveId]: entry });
    return { ok: true as const };
  });

export const removeMonitor = (liveId: string) =>
  withData(async () => {
    const all = await monitors();
    const m = all[liveId];
    if (m) {
      delete all[liveId];
      await setSession('monitors', all);
      await chrome.tabs.remove(m.tabId).catch(() => undefined);
    }
    return { ok: true as const };
  });

export const focusMonitor = async (liveId: string) => {
  const m = (await monitors())[liveId];
  if (!m) return { ok: false as const, error: 'Not watching that show.' };
  const tab = await chrome.tabs.update(m.tabId, { active: true, muted: false }).catch(() => null);
  if (!tab) return { ok: false as const, error: 'That show tab was closed.' };
  if (tab.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true }).catch(() => undefined);
  return { ok: true as const };
};

export const forgetMonitorTab = (tabId: number) =>
  withData(async () => {
    const all = await monitors();
    const ids = Object.values(all).filter((m) => m.tabId === tabId);
    if (!ids.length) return;
    for (const m of ids) delete all[m.liveId];
    await setSession('monitors', all);
  });
