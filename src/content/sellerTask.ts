import { send } from '../shared/messages';
import { SECOND, randomBetween, sleep } from '../shared/time';
import type { ActionKind, FollowOutcome, Halt, SellerReport, SellerTask } from '../shared/types';
import { clickLikeUser, scrollIntoViewIfNeeded, waitFor } from './dom';
import {
  findExpandShowsButton,
  findHostFollowControl,
  findShowBookmarks,
  findShowCards,
  findShowPlaceholder,
  findShowsScrollContainer,
  findUnfollowConfirm,
  isLoginPath,
  isProfilePath,
  profileMissing,
  type BookmarkState,
  type FollowState,
} from './selectors';
import { findLoginPrompt, findWarning } from './warnings';

const PAGE_READY_TIMEOUT_MS = 15 * SECOND;
const VERIFY_TIMEOUT_MS = 6 * SECOND;
const MAX_UNVERIFIED_IN_A_ROW = 2;
const MAX_SCROLL_PASSES = 40;
const LOAD_MORE_TIMEOUT_MS = 8 * SECOND;

class Interrupt extends Error {
  constructor(
    readonly halt?: Halt,
    readonly deferUntil?: number,
    readonly deferReason?: string,
    readonly stopped = false,
  ) {
    super(halt?.detail ?? deferReason ?? 'stopped');
  }
}

type Outcome = 'done' | 'failed' | 'missing';

interface Step {
  locate: () => HTMLElement | null | undefined;
  verify: () => boolean;
  afterClick?: () => Promise<void>;
}

const guardPage = () => {
  const warning = findWarning();
  if (warning) throw new Interrupt({ code: 'warning', detail: warning });
  if (findLoginPrompt() || isLoginPath()) throw new Interrupt({ code: 'not_logged_in', detail: 'Login prompt shown' });
};

// Each click is granted by the background rate limiter, then checked for effect, so a soft block
// (clicks silently doing nothing) stops the run instead of burning through the list.
class ActionRunner {
  private unverified = 0;

  constructor(private readonly task: SellerTask) {}

  async act(kind: ActionKind, step: Step): Promise<Outcome> {
    if (this.task.dryRun) return step.locate() ? 'done' : 'missing';

    const grant = await send('RATE_ACQUIRE', { jobId: this.task.jobId, index: this.task.index, kind });
    if (!grant.granted) {
      if (grant.stop) throw new Interrupt(undefined, undefined, undefined, true);
      throw new Interrupt(undefined, grant.retryAt, grant.reason);
    }
    guardPage();

    const el = step.locate();
    if (!el) return 'missing';
    scrollIntoViewIfNeeded(el);
    await sleep(randomBetween({ min: 250, max: 700 }));
    clickLikeUser(el);
    if (step.afterClick) await step.afterClick();

    await waitFor(() => step.verify() || findWarning() !== null || findLoginPrompt(), VERIFY_TIMEOUT_MS);
    guardPage();
    if (step.verify()) {
      this.unverified = 0;
      return 'done';
    }
    this.unverified += 1;
    if (this.unverified >= MAX_UNVERIFIED_IN_A_ROW) {
      throw new Interrupt({ code: 'clicks_not_sticking', detail: `${kind} did not take effect` });
    }
    return 'failed';
  }
}

const waitForProfile = async () => {
  const ready = await waitFor(
    () => findHostFollowControl() || findShowCards().length > 0 || profileMissing(),
    PAGE_READY_TIMEOUT_MS,
  );
  guardPage();
  if (!isProfilePath()) throw new Error(`Seller page didn't load (ended up on ${location.pathname})`);
  if (!ready || profileMissing()) throw new Error('Seller profile not found. Check the username.');
};

const confirmUnfollow = async () => {
  const confirm = await waitFor(findUnfollowConfirm, 2500);
  if (!confirm) return;
  await sleep(randomBetween({ min: 300, max: 800 }));
  clickLikeUser(confirm);
};

const ensureFollowState = async (runner: ActionRunner, desired: FollowState): Promise<FollowOutcome> => {
  const control = findHostFollowControl();
  if (!control) return 'not_found';
  if (control.state === desired) return 'already';

  const outcome = await runner.act(desired === 'following' ? 'follow' : 'unfollow', {
    locate: () => {
      const c = findHostFollowControl();
      return c && c.state !== desired ? c.el : null;
    },
    verify: () => findHostFollowControl()?.state === desired,
    afterClick: desired === 'not_following' ? confirmUnfollow : undefined,
  });
  if (outcome === 'missing') return findHostFollowControl()?.state === desired ? 'already' : 'not_found';
  return outcome;
};

const expandShows = async () => {
  const expand = findExpandShowsButton();
  if (!expand) return;
  const before = findShowCards().length;
  clickLikeUser(expand);
  await waitFor(() => findShowCards().length > before, 2500);
};

const scrollForMore = async (container: HTMLElement) => {
  const prev = container.scrollTop;
  if (prev >= container.scrollHeight - container.clientHeight - 10) return false;
  container.scrollBy({ top: Math.round(window.innerHeight * 0.7), behavior: 'instant' });
  await sleep(randomBetween({ min: 800, max: 1500 }));
  return Math.abs(container.scrollTop - prev) >= 10;
};

// Rendered cards are found wherever they sit, so scrolling only serves to make Whatnot load more.
const loadMoreShows = async (container: HTMLElement, sawPlaceholder: boolean): Promise<'more' | 'end' | 'stuck'> => {
  const placeholder = findShowPlaceholder();
  if (!placeholder) {
    if (sawPlaceholder) return 'end';
    return (await scrollForMore(container)) ? 'more' : 'end';
  }
  const before = findShowCards().length;
  placeholder.scrollIntoView({ block: 'center', behavior: 'instant' });
  const loaded = await waitFor(() => findShowCards().length > before || !findShowPlaceholder(), LOAD_MORE_TIMEOUT_MS);
  await sleep(randomBetween({ min: 600, max: 1200 }));
  return loaded ? 'more' : 'stuck';
};

const ensureBookmarks = async (runner: ActionRunner, report: SellerReport, desired: BookmarkState, max: number) => {
  const kind: ActionKind = desired === 'bookmarked' ? 'bookmark' : 'unbookmark';
  await waitFor(() => findShowCards().length > 0, 4 * SECOND);
  await expandShows();
  const container = findShowsScrollContainer();
  const seen = new Set<string>();
  let sawPlaceholder = false;

  for (let pass = 0; pass < MAX_SCROLL_PASSES; pass++) {
    for (const show of findShowBookmarks()) {
      if (seen.has(show.liveId)) continue;
      seen.add(show.liveId);
      if (show.state === desired) {
        report.bookmarksAlready += 1;
        continue;
      }
      if (report.bookmarksChanged >= max) {
        report.capped = true;
        return;
      }
      const find = () => findShowBookmarks().find((s) => s.liveId === show.liveId);
      const outcome = await runner.act(kind, {
        locate: () => {
          const s = find();
          return s && s.state !== desired ? s.el : null;
        },
        verify: () => find()?.state === desired,
      });
      if (outcome === 'done') report.bookmarksChanged += 1;
      else if (outcome === 'failed') report.bookmarksFailed += 1;
      else if (find()?.state === desired) report.bookmarksAlready += 1;
    }
    sawPlaceholder ||= findShowPlaceholder() !== null;
    const next = await loadMoreShows(container, sawPlaceholder);
    if (next === 'stuck') report.showsNotLoaded = true;
    if (next !== 'more') return;
  }
  if (findShowPlaceholder()) report.showsNotLoaded = true;
};

export const runSellerTask = async (task: SellerTask): Promise<SellerReport> => {
  const report: SellerReport = {
    follow: 'skipped',
    bookmarksChanged: 0,
    bookmarksAlready: 0,
    bookmarksFailed: 0,
    capped: false,
  };
  const runner = new ActionRunner(task);
  try {
    await waitForProfile();
    if (task.kind === 'follow_bookmark') {
      report.follow = await ensureFollowState(runner, 'following');
      await ensureBookmarks(runner, report, 'bookmarked', task.maxBookmarksPerSeller);
    } else {
      if (task.undo.unbookmark) await ensureBookmarks(runner, report, 'not_bookmarked', task.maxBookmarksPerSeller);
      if (task.undo.unfollow) report.follow = await ensureFollowState(runner, 'not_following');
    }
  } catch (err) {
    if (err instanceof Interrupt) {
      if (err.halt) report.halt = err.halt;
      if (err.deferUntil) {
        report.deferUntil = err.deferUntil;
        report.deferReason = err.deferReason;
      }
      if (err.stopped) report.stopped = true;
    } else {
      report.error = String((err as Error)?.message ?? err);
    }
  }
  return report;
};
