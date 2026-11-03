import { createLock } from '../shared/lock';
import { sendToTab, type AcquireResult, type Result } from '../shared/messages';
import { getItem, getSession, getSettings, getShareSettings, setItem, setSession, type ShareSession } from '../shared/storage';
import { formatClock } from '../shared/time';
import type { Halt } from '../shared/types';
import { acquireShare, cooldown } from './rateGate';

const withSessions = createLock();

const load = async () => (await getSession('shareSessions')) ?? {};

const TARGET_LABEL = { copy: 'Copy link', x: 'X', facebook: 'Facebook' } as const;

export const shareStatusText = (s: ShareSession) => {
  if (s.status === 'stopped') return `${s.message ?? 'Stopped'} · ${s.done} confirmed`;
  if (s.status === 'waiting') return `${s.message ?? 'Waiting'}. Next share at ${formatClock(s.waitUntil ?? Date.now())}. ${s.done} confirmed`;
  return `Sharing via ${TARGET_LABEL[s.target]} in a background tab: ${s.done} confirmed${s.remaining !== null ? `, ${s.remaining} left` : ''}`;
};

// Your show tab's overlay mirrors the share tab's progress.
const notifyShowTab = (s: ShareSession) =>
  void sendToTab(s.tabId, 'SHARE_STATUS', { text: shareStatusText(s), sharing: s.status !== 'stopped' }).catch(() => undefined);

const closeWorker = (s: ShareSession | undefined) => {
  if (s?.workerTabId != null) void chrome.tabs.remove(s.workerTabId).catch(() => undefined);
};

const update = (fn: (sessions: Record<string, ShareSession>) => void | Promise<void>) =>
  withSessions(async () => {
    const sessions = await load();
    const before = JSON.stringify(sessions);
    await fn(sessions);
    await setSession('shareSessions', sessions);
    if (JSON.stringify(sessions) !== before) Object.values(sessions).forEach(notifyShowTab);
    return sessions;
  });

const liveIdOf = (url: string | undefined) => url?.match(/whatnot\.com\/live\/([^/?#]+)/)?.[1] ?? null;

// A press on the share tab's own overlay (or shortcut) controls the session it belongs to.
const showTabFor = async (tabId: number) => Object.values(await load()).find((s) => s.workerTabId === tabId)?.tabId ?? tabId;

export const startShare = async (requestedTabId: number, count: number | null): Promise<Result> => {
  const tabId = await showTabFor(requestedTabId);
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  const liveId = liveIdOf(tab?.url);
  if (!tab || !liveId || !tab.url) return { ok: false, error: 'Open a Whatnot live show in this tab first.' };
  const previous = (await load())[tabId];
  if (previous && previous.status !== 'stopped') return { ok: false, error: 'Already sharing this show. Stop it first.' };
  closeWorker(previous);

  const settings = await getShareSettings();
  const worker = await chrome.tabs.create({ url: tab.url, active: false, index: tab.index + 1, windowId: tab.windowId });
  if (worker.id === undefined) return { ok: false, error: "Couldn't open the share tab." };
  // Muted so you don't hear the show twice; kept from being discarded while it works.
  await chrome.tabs.update(worker.id, { muted: true, autoDiscardable: false }).catch(() => undefined);

  const session: ShareSession = {
    id: crypto.randomUUID(),
    tabId,
    workerTabId: worker.id,
    liveId,
    target: settings.target,
    quiet: settings.quiet,
    remaining: count,
    done: 0,
    status: 'running',
    waitUntil: null,
    message: 'Opening the share tab…',
    startedAt: Date.now(),
  };
  await update((s) => {
    s[tabId] = session;
  });
  return { ok: true };
};

// The share tab asks for its job when it loads, like bulk worker tabs do.
export const claimShareWork = async (tabId: number | undefined): Promise<ShareSession | null> => {
  if (tabId === undefined) return null;
  return Object.values(await load()).find((s) => s.workerTabId === tabId && s.status !== 'stopped') ?? null;
};

export const stopShare = async (requestedTabId: number, message = 'Stopped'): Promise<Result> => {
  const tabId = await showTabFor(requestedTabId);
  let stopped: ShareSession | undefined;
  await update((s) => {
    const session = s[tabId];
    if (!session) return;
    stopped = session;
    s[tabId] = { ...session, status: 'stopped', message, waitUntil: null, workerTabId: null };
  });
  closeWorker(stopped);
  return { ok: true };
};

export const toggleShare = async (tabId: number) => {
  const session = (await load())[await showTabFor(tabId)];
  return session && session.status !== 'stopped' ? stopShare(tabId) : startShare(tabId, null);
};

const findSession = async (sessionId: string) => Object.values(await load()).find((s) => s.id === sessionId) ?? null;

export const acquireShareForSession = async (sessionId: string): Promise<AcquireResult> => {
  const stillValid = async () => {
    const s = await findSession(sessionId);
    return Boolean(s && s.status !== 'stopped' && (s.remaining === null || s.remaining > 0));
  };
  const session = await findSession(sessionId);
  if (!session || !(await stillValid())) return { granted: false, stop: true };
  const result = await acquireShare(session.liveId, stillValid);
  await update((s) => {
    const current = s[session.tabId];
    if (!current || current.id !== sessionId || current.status === 'stopped') return;
    s[session.tabId] = result.granted
      ? { ...current, status: 'running', waitUntil: null, message: null }
      : result.stop
        ? current
        : { ...current, status: 'waiting', waitUntil: result.retryAt, message: result.reason };
  });
  return result;
};

const haltMessage = (halt: Halt) =>
  halt.code === 'not_logged_in'
    ? 'Stopped: you appear to be logged out of Whatnot.'
    : `Stopped: Whatnot showed a warning (“${halt.detail}”). Sharing and bulk actions are cooling down.`;

export const shareDone = async (p: {
  sessionId: string;
  ok: boolean;
  error?: string;
  halt?: Halt;
  title?: string | null;
  host?: string | null;
}): Promise<Result> => {
  let liveId: string | null = null;
  let finished: ShareSession | undefined;
  await update((s) => {
    const entry = Object.entries(s).find(([, v]) => v.id === p.sessionId);
    if (!entry) return;
    const [tabId, session] = entry;
    liveId = session.liveId;
    let next: ShareSession;
    if (p.halt) {
      next = { ...session, status: 'stopped', message: haltMessage(p.halt) };
    } else if (!p.ok) {
      next = { ...session, status: 'stopped', message: p.error ?? 'Share failed' };
    } else {
      const remaining = session.remaining === null ? null : Math.max(0, session.remaining - 1);
      next = {
        ...session,
        done: session.done + 1,
        remaining,
        status: remaining === 0 ? 'stopped' : session.status,
        message: remaining === 0 ? 'Done' : session.message,
      };
    }
    if (next.status === 'stopped') {
      finished = session;
      next.workerTabId = null;
    }
    s[tabId] = next;
  });
  closeWorker(finished);
  if (p.halt && p.halt.code !== 'not_logged_in') await cooldown((await getSettings()).warningCooldownMs);
  if (p.ok && liveId) {
    const stats = (await getItem('shareStats')) ?? { since: Date.now(), shows: {} };
    const prev = stats.shows[liveId];
    stats.shows[liveId] = {
      title: p.title ?? prev?.title ?? liveId,
      host: p.host ?? prev?.host ?? null,
      shares: (prev?.shares ?? 0) + 1,
      lastAt: Date.now(),
    };
    await setItem('shareStats', stats);
  }
  return { ok: true };
};

// Closing your show tab ends its sharing; closing the share tab stops it with a note.
export const forgetTab = async (tabId: number) => {
  let orphan: ShareSession | undefined;
  await update((s) => {
    if (s[tabId]) {
      orphan = s[tabId];
      delete s[tabId];
      return;
    }
    const entry = Object.entries(s).find(([, v]) => v.workerTabId === tabId);
    if (entry && entry[1].status !== 'stopped') {
      s[entry[0]] = { ...entry[1], status: 'stopped', message: 'Share tab was closed', workerTabId: null, waitUntil: null };
    }
  });
  closeWorker(orphan);
};
