import type { AcquireResult, Result } from '../shared/messages';
import { createLock } from '../shared/lock';
import { parseSellerList, sellerUrl } from '../shared/sellers';
import type { Settings } from '../shared/settings';
import { getItem, getSettings, setItem } from '../shared/storage';
import { MINUTE, SECOND, randomBetween } from '../shared/time';
import {
  isActiveJob,
  type ActionKind,
  type Halt,
  type Job,
  type JobKind,
  type SellerReport,
  type SellerTask,
  type UndoOptions,
} from '../shared/types';
import { acquire, cooldown, peekAction } from './rateGate';

export const ALARM_TICK = 'wn2-job-tick';
export const ALARM_WATCHDOG = 'wn2-job-watchdog';

const MAX_CONSECUTIVE_FAILURES = 3;
const PARK_THRESHOLD_MS = MINUTE;

const withJob = createLock();

const loadJob = async () => (await getItem('job')) ?? null;

// Worst case per seller: page load, then every allowed click at max spacing plus verification time.
const sellerTimeoutMs = (settings: Settings) =>
  2 * MINUTE + (settings.maxBookmarksPerSeller + 1) * (settings.actionDelayMs.max + 10 * SECOND);

const saveJob = async (job: Job) => {
  job.updatedAt = Date.now();
  await setItem('job', job);
};

const scheduleTick = (at: number) => chrome.alarms.create(ALARM_TICK, { when: Math.max(at, Date.now() + SECOND) });

const clearAlarms = () => Promise.all([chrome.alarms.clear(ALARM_TICK), chrome.alarms.clear(ALARM_WATCHDOG)]);

const closeWorkerTab = async (job: Job) => {
  if (job.workerTabId !== null) await chrome.tabs.remove(job.workerTabId).catch(() => undefined);
  job.workerTabId = null;
};

const openWorkerTab = async (tabId: number | null, url: string) => {
  if (tabId !== null) {
    try {
      await chrome.tabs.update(tabId, { url });
      return tabId;
    } catch {
      // Tab is gone; open a fresh one below.
    }
  }
  const tab = await chrome.tabs.create({ url, active: false });
  if (tab.id === undefined) throw new Error('Could not open a worker tab');
  return tab.id;
};

const park = async (job: Job, at: number, reason: string) => {
  job.status = 'waiting';
  job.nextRunAt = at;
  job.waitReason = reason;
  job.inFlight = null;
  await saveJob(job);
  await chrome.alarms.clear(ALARM_WATCHDOG);
  await scheduleTick(at);
};

const pause = async (job: Job, reason: string) => {
  job.status = 'paused';
  job.pauseReason = reason;
  job.nextRunAt = null;
  job.waitReason = null;
  job.inFlight = null;
  await clearAlarms();
  await saveJob(job);
};

const finish = async (job: Job, status: 'done' | 'stopped') => {
  job.status = status;
  job.inFlight = null;
  job.nextRunAt = null;
  job.waitReason = null;
  await clearAlarms();
  await closeWorkerTab(job);
  await saveJob(job);
};

const haltMessage = (halt: Halt) => {
  switch (halt.code) {
    case 'not_logged_in':
      return 'You appear to be logged out of Whatnot. Log in, then press Resume.';
    case 'warning':
      return `Whatnot showed a warning: “${halt.detail}”. Paused with a cooldown before any more actions.`;
    case 'clicks_not_sticking':
      return 'Clicks stopped taking effect, which can mean Whatnot is limiting actions. Paused with a cooldown.';
  }
};

const recordSeller = async (job: Job, report: SellerReport) => {
  const now = Date.now();
  const seller = job.sellers[job.index] ?? '';
  job.results.push({ ...report, seller, finishedAt: now });
  job.index += 1;
  job.sellersSinceBreak += 1;
  const failed = Boolean(report.error) || report.follow === 'failed';
  job.consecutiveFailures = failed ? job.consecutiveFailures + 1 : 0;

  if (job.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    await pause(job, `${MAX_CONSECUTIVE_FAILURES} sellers in a row failed. Check that Whatnot pages load and you're logged in, then Resume.`);
    return;
  }
  if (job.index >= job.sellers.length) {
    await finish(job, 'done');
    return;
  }
  const settings = await getSettings();
  await park(job, now + randomBetween(settings.sellerDelayMs), 'Spacing between sellers');
};

export const tick = () =>
  withJob(async () => {
    const job = await loadJob();
    if (!job || (job.status !== 'running' && job.status !== 'waiting') || job.inFlight) return;
    const now = Date.now();
    if (job.nextRunAt && job.nextRunAt > now + SECOND) {
      await scheduleTick(job.nextRunAt);
      return;
    }
    if (job.index >= job.sellers.length) {
      await finish(job, 'done');
      return;
    }

    const settings = await getSettings();
    if (job.sellersSinceBreak >= settings.breakEverySellers) {
      job.sellersSinceBreak = 0;
      await park(job, now + randomBetween(settings.breakMs), 'Taking a short break');
      return;
    }

    // Don't load a profile page if the budget can't cover even one action soon.
    const probe: ActionKind = job.kind === 'follow_bookmark' ? 'bookmark' : 'unbookmark';
    const peek = await peekAction(probe);
    if (!peek.allowed && peek.retryAt - now > PARK_THRESHOLD_MS) {
      await park(job, peek.retryAt, peek.reason);
      return;
    }

    const seller = job.sellers[job.index];
    if (!seller) return;
    const tabId = await openWorkerTab(job.workerTabId, sellerUrl(seller));
    job.workerTabId = tabId;
    job.status = 'running';
    job.nextRunAt = null;
    job.waitReason = null;
    const deadlineAt = now + sellerTimeoutMs(settings);
    job.inFlight = { index: job.index, tabId, startedAt: now, deadlineAt, claimedDocumentId: null };
    await saveJob(job);
    await chrome.alarms.create(ALARM_WATCHDOG, { when: deadlineAt });
  });

export const startJob = async (
  kind: JobKind,
  rawSellers: string[],
  undo: UndoOptions,
  dryRun: boolean,
): Promise<Result> => {
  const { sellers } = parseSellerList(rawSellers.join('\n'));
  const result = await withJob(async (): Promise<Result> => {
    const current = await loadJob();
    if (isActiveJob(current)) return { ok: false, error: 'A job is already active. Stop it before starting another.' };
    if (sellers.length === 0) return { ok: false, error: 'Add at least one seller.' };
    if (kind === 'unfollow_unbookmark' && !undo.unfollow && !undo.unbookmark) {
      return { ok: false, error: 'Pick unfollow, remove bookmarks, or both.' };
    }
    const now = Date.now();
    await saveJob({
      id: crypto.randomUUID(),
      kind,
      undo: kind === 'unfollow_unbookmark' ? undo : { unfollow: false, unbookmark: false },
      dryRun,
      sellers,
      index: 0,
      status: 'running',
      nextRunAt: null,
      waitReason: null,
      pauseReason: null,
      inFlight: null,
      workerTabId: current?.workerTabId ?? null,
      results: [],
      sellersSinceBreak: 0,
      consecutiveFailures: 0,
      startedAt: now,
      updatedAt: now,
    });
    return { ok: true };
  });
  if (result.ok) await tick();
  return result;
};

export const pauseJob = () =>
  withJob(async (): Promise<Result> => {
    const job = await loadJob();
    if (!job || (job.status !== 'running' && job.status !== 'waiting')) return { ok: false, error: 'Nothing is running.' };
    await pause(job, 'Paused by you.');
    return { ok: true };
  });

export const resumeJob = async (): Promise<Result> => {
  const result = await withJob(async (): Promise<Result> => {
    const job = await loadJob();
    if (!job || job.status !== 'paused') return { ok: false, error: 'Nothing is paused.' };
    job.status = 'waiting';
    job.pauseReason = null;
    job.nextRunAt = Date.now();
    job.consecutiveFailures = 0;
    await saveJob(job);
    return { ok: true };
  });
  if (result.ok) await tick();
  return result;
};

export const stopJob = () =>
  withJob(async (): Promise<Result> => {
    const job = await loadJob();
    if (!job || !isActiveJob(job)) return { ok: false, error: 'Nothing is active.' };
    await finish(job, 'stopped');
    return { ok: true };
  });

export const clearJob = () =>
  withJob(async (): Promise<Result> => {
    const job = await loadJob();
    if (isActiveJob(job)) return { ok: false, error: 'Stop the active job first.' };
    await setItem('job', null);
    return { ok: true };
  });

export const claimTask = (sender: chrome.runtime.MessageSender) =>
  withJob(async (): Promise<SellerTask | null> => {
    const job = await loadJob();
    const inFlight = job?.inFlight;
    if (!job || job.status !== 'running' || !inFlight || sender.tab?.id !== inFlight.tabId) return null;
    const documentId = sender.documentId ?? `frame-${sender.frameId ?? 0}-${Date.now()}`;
    if (inFlight.claimedDocumentId === documentId) return null;
    inFlight.claimedDocumentId = documentId;
    await saveJob(job);
    const settings = await getSettings();
    return {
      jobId: job.id,
      index: inFlight.index,
      kind: job.kind,
      undo: job.undo,
      dryRun: job.dryRun,
      seller: job.sellers[inFlight.index] ?? '',
      maxBookmarksPerSeller: settings.maxBookmarksPerSeller,
    };
  });

export const completeTask = async ({ jobId, index, report }: { jobId: string; index: number; report: SellerReport }) => {
  const needsCooldown = await withJob(async () => {
    const job = await loadJob();
    if (!job || job.id !== jobId || job.inFlight?.index !== index || report.stopped) return false;
    await chrome.alarms.clear(ALARM_WATCHDOG);
    job.inFlight = null;

    // Halted and deferred sellers are retried from the start; every step skips work that's already done.
    if (report.halt) {
      await pause(job, haltMessage(report.halt));
      return report.halt.code !== 'not_logged_in';
    }
    if (report.deferUntil) {
      await park(job, report.deferUntil, report.deferReason ?? 'Rate limit reached');
      return false;
    }
    await recordSeller(job, report);
    return false;
  });
  if (needsCooldown) await cooldown((await getSettings()).warningCooldownMs);
  return { ok: true } as Result;
};

export const acquireForTask = async ({ jobId, index, kind }: { jobId: string; index: number; kind: ActionKind }) => {
  const stillValid = async () => {
    const job = await loadJob();
    return Boolean(job && job.id === jobId && job.status === 'running' && job.inFlight?.index === index);
  };
  if (!(await stillValid())) return { granted: false, stop: true } satisfies AcquireResult;
  return acquire(kind, stillValid);
};

export const onWatchdog = () =>
  withJob(async () => {
    const job = await loadJob();
    if (!job?.inFlight || Date.now() < job.inFlight.deadlineAt - SECOND) return;
    job.inFlight = null;
    await recordSeller(job, {
      follow: 'failed',
      bookmarksChanged: 0,
      bookmarksAlready: 0,
      bookmarksFailed: 0,
      capped: false,
      error: 'Timed out waiting for the seller page',
    });
  });

export const onTabRemoved = (tabId: number) =>
  withJob(async () => {
    const job = await loadJob();
    if (!job || job.workerTabId !== tabId) return;
    job.workerTabId = null;
    if (job.inFlight?.tabId === tabId) {
      await pause(job, 'The worker tab was closed. Press Resume to continue.');
    } else {
      await saveJob(job);
    }
  });

export const onBrowserStartup = () =>
  withJob(async () => {
    const job = await loadJob();
    if (!job) return;
    job.workerTabId = null;
    if (job.status === 'running' || job.status === 'waiting') {
      await pause(job, 'Chrome restarted. Press Resume to continue.');
    } else {
      await saveJob(job);
    }
  });

// Alarms aren't guaranteed to survive restarts or updates, so re-arm from the saved job on wake.
export const ensureScheduled = () =>
  withJob(async () => {
    const job = await loadJob();
    if (!job) return;
    if (job.status === 'waiting' && job.nextRunAt && !(await chrome.alarms.get(ALARM_TICK))) {
      await scheduleTick(job.nextRunAt);
    }
    if (job.status === 'running' && !job.inFlight && !(await chrome.alarms.get(ALARM_TICK))) {
      await scheduleTick(Date.now() + SECOND);
    }
    if (job.inFlight && !(await chrome.alarms.get(ALARM_WATCHDOG))) {
      await chrome.alarms.create(ALARM_WATCHDOG, { when: Math.max(Date.now() + SECOND, job.inFlight.deadlineAt) });
    }
  });
