// Runs inside the background share tab the extension opens for a show: opens the Share menu once,
// leaves it open, and clicks the chosen option every time the background grants the next share.
// If a click closes the menu, the next round reopens it.
import { send } from '../shared/messages';
import type { ShareSession } from '../shared/storage';
import { MINUTE, SECOND, formatClock, randomBetween, sleep } from '../shared/time';
import type { ShareTarget } from '../shared/types';
import { hideWorkerBanner, showWorkerBanner } from './banner';
import { clickLikeUser, waitFor } from './dom';
import { liveSession, postToHook } from './live';
import { overlay } from './overlay';
import { findShareButton, findShareTarget } from './selectors';
import { findLoginPrompt, findWarning } from './warnings';

const TARGET_LABEL: Record<ShareTarget, string> = { copy: 'Copy link', x: 'X', facebook: 'Facebook' };
const PAGE_READY_MS = 30 * SECOND;

let activeSession: string | null = null;

export const isSharing = () => activeSession !== null;

const openMenu = async (target: ShareTarget) => {
  const existing = findShareTarget(target);
  if (existing) return existing;
  const button = findShareButton();
  if (!button) return null;
  clickLikeUser(button);
  return waitFor(() => findShareTarget(target), 5 * SECOND);
};

const shareOnce = async (target: ShareTarget, quiet: boolean): Promise<{ ok: true } | { ok: false; error: string }> => {
  if (quiet) postToHook({ kind: 'quiet', ms: 5000 });
  const option = await openMenu(target);
  if (!option) {
    return findShareButton()
      ? { ok: false, error: `${TARGET_LABEL[target]} option not found in the Share menu. Try 🎯 Pick on the Share tab.` }
      : { ok: false, error: 'Share button not found on this page. Try 🎯 Pick on the Share tab.' };
  }
  await sleep(randomBetween({ min: 100, max: 300 }));
  clickLikeUser(option);
  return { ok: true };
};

const describe = (s: ShareSession, done: number) =>
  `Sharing via ${TARGET_LABEL[s.target]}: ${done} sent${s.remaining !== null ? `, ${Math.max(0, s.remaining - (done - s.done))} left` : ''}`;

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
      const result = await shareOnce(session.target, session.quiet);
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
