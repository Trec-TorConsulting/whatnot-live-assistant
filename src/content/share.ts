// Runs inside the background share tab the extension opens for a show: opens the Share menu once,
// leaves it open, and clicks the chosen option every time the background grants the next share.
// If a click closes the menu, the next round reopens it.
import { HOOK_SOURCE } from '../shared/hookProtocol';
import { send } from '../shared/messages';
import type { ShareSession } from '../shared/storage';
import { MINUTE, SECOND, formatClock, randomBetween, sleep } from '../shared/time';
import type { ShareTarget } from '../shared/types';
import { hideWorkerBanner, showWorkerBanner } from './banner';
import { clickLikeUser, waitFor } from './dom';
import { liveSession, postToHook } from './live';
import { overlay } from './overlay';
import { findShareButton, findShareTarget } from './selectors';
import { waitForShareRecord, type ShareRecord } from './shareConfirm';
import { findLoginPrompt, findWarning } from './warnings';

const TARGET_LABEL: Record<ShareTarget, string> = { copy: 'Copy link', x: 'X', facebook: 'Facebook' };
const PAGE_READY_MS = 30 * SECOND;
// Quiet has to still be on when the click runs. Opening the menu can take the whole previous window.
const QUIET_MS = 8 * SECOND;
const CONFIRM_MS = 8 * SECOND;

let activeSession: string | null = null;

export const isSharing = () => activeSession !== null;

const openMenu = async (target: ShareTarget, quiet: boolean) => {
  const existing = findShareTarget(target);
  if (existing) return existing;
  const button = findShareButton();
  if (!button) return null;
  // The Share button itself can be the share, on a show whose menu is one click.
  if (quiet) postToHook({ kind: 'quiet', ms: QUIET_MS });
  clickLikeUser(button);
  return waitFor(() => findShareTarget(target), 5 * SECOND);
};

const subscribeLogShare = (onResult: (ok: boolean) => void) => {
  const listener = (e: MessageEvent) => {
    if (e.source !== window || e.data?.source !== HOOK_SOURCE || e.data?.kind !== 'log_share') return;
    onResult(e.data.ok === true);
  };
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
};

const missingOption = (target: ShareTarget) =>
  findShareButton()
    ? { ok: false as const, error: `${TARGET_LABEL[target]} option not found in the Share menu. Try 🎯 Pick on the Share tab.` }
    : { ok: false as const, error: 'Share button not found on this page. Try 🎯 Pick on the Share tab.' };

// Two tries: the first click can miss a menu that was still opening. A refusal is Whatnot's answer, so it does not retry.
const shareOnce = async (
  target: ShareTarget,
  quiet: boolean,
  stillRunning: () => boolean,
): Promise<{ ok: true } | { ok: false; error: string; stopped?: boolean }> => {
  let missed = false;
  for (let attempt = 0; attempt < 2 && stillRunning(); attempt++) {
    const option = await openMenu(target, quiet);
    if (!stillRunning()) return { ok: false, error: '', stopped: true };
    if (!option) return missingOption(target);
    await sleep(randomBetween({ min: 100, max: 300 }));
    if (!stillRunning()) return { ok: false, error: '', stopped: true };
    if (quiet) postToHook({ kind: 'quiet', ms: QUIET_MS });
    const pending = waitForShareRecord(subscribeLogShare, CONFIRM_MS);
    clickLikeUser(option);
    overlay.setShare('Clicked. Waiting for Whatnot to record it…', true);
    const recorded = await clickResult(pending, stillRunning);
    if (recorded === 'stopped') return { ok: false, error: '', stopped: true };
    if (recorded === 'recorded') return { ok: true };
    if (recorded === 'refused') return { ok: false, error: 'Whatnot refused that share, so it was not counted.' };
    missed = true;
  }
  if (!stillRunning()) return { ok: false, error: '', stopped: true };
  return {
    ok: false,
    error: missed
      ? 'Whatnot never recorded that share, so it was not counted.'
      : missingOption(target).error,
  };
};

// Polls for Stop so a long confirmation wait doesn't keep the loop running, and so the timer
// doesn't outlive the click.
const clickResult = async (
  pending: ReturnType<typeof waitForShareRecord>,
  stillRunning: () => boolean,
): Promise<ShareRecord | 'stopped'> => {
  while (stillRunning()) {
    const winner = await Promise.race([
      pending.promise.then((result) => ({ kind: 'record' as const, result })),
      sleep(200).then(() => ({ kind: 'tick' as const })),
    ]);
    if (winner.kind === 'record') return winner.result;
  }
  pending.cancel();
  return 'stopped';
};

const describe = (s: ShareSession, done: number) =>
  `Sharing via ${TARGET_LABEL[s.target]}: ${done} confirmed${s.remaining !== null ? `, ${Math.max(0, s.remaining - (done - s.done))} left` : ''}`;

export const runShareWorker = async (session: ShareSession) => {
  if (activeSession === session.id) return;
  activeSession = session.id;
  let done = session.done;
  showWorkerBanner(`Whatnot Assistant: sharing this show via ${TARGET_LABEL[session.target]}. Leave this tab open; close it to stop.`);
  overlay.setShare(describe(session, done), true);
  try {
    await waitFor(() => findShareButton() || findShareTarget(session.target) || findLoginPrompt(), PAGE_READY_MS);
    while (activeSession === session.id) {
      const grant = await send('SHARE_ACQUIRE', { sessionId: session.id });
      if (!grant.granted) {
        if (grant.stop) break;
        overlay.setShare(`${grant.reason}. Next share at ${formatClock(grant.retryAt)}.`, true);
        await sleep(Math.min(MINUTE, Math.max(SECOND, grant.retryAt - Date.now())));
        continue;
      }
      const warning = findWarning();
      if (warning || findLoginPrompt()) {
        await send('SHARE_DONE', {
          sessionId: session.id,
          ok: false,
          halt: warning ? { code: 'warning', detail: warning } : { code: 'not_logged_in', detail: 'Login prompt shown' },
        });
        break;
      }
      const result = await shareOnce(session.target, session.quiet, () => activeSession === session.id);
      if ('stopped' in result && result.stopped) break;
      const show = liveSession()?.show;
      await send('SHARE_DONE', {
        sessionId: session.id,
        ok: result.ok,
        error: result.ok ? undefined : result.error,
        title: show?.title ?? document.title.split(' · ')[0] ?? null,
        host: show?.host ?? null,
      });
      if (!result.ok) break;
      done += 1;
      overlay.setShare(describe(session, done), true);
    }
  } catch (err) {
    overlay.notice(String((err as Error)?.message ?? err));
  } finally {
    if (activeSession === session.id) activeSession = null;
    hideWorkerBanner();
    overlay.setShare(null, false);
  }
};

export const stopLocalShare = () => {
  activeSession = null;
};
