import { formatDuration } from '../shared/time';
import type { DiagnosticsReport } from '../shared/messages';
import type { Job, SellerResult } from '../shared/types';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export const describeResult = (r: SellerResult, job: Pick<Job, 'kind' | 'undo' | 'dryRun'>): string => {
  const parts: string[] = [];
  const dry = job.dryRun;

  if (job.kind === 'follow_bookmark') {
    const follow = {
      done: dry ? 'would follow' : 'followed',
      already: 'already following',
      not_found: 'follow button not found',
      failed: 'follow did not take effect',
      skipped: '',
    }[r.follow];
    if (follow) parts.push(follow);
    if (r.bookmarksChanged) parts.push(`${dry ? 'would bookmark' : 'bookmarked'} ${plural(r.bookmarksChanged, 'show')}`);
    if (r.bookmarksAlready) parts.push(`${r.bookmarksAlready} already bookmarked`);
  } else {
    const follow = {
      done: dry ? 'would unfollow' : 'unfollowed',
      already: 'not following',
      not_found: 'follow button not found',
      failed: 'unfollow did not take effect',
      skipped: '',
    }[r.follow];
    if (follow) parts.push(follow);
    if (r.bookmarksChanged) parts.push(`${dry ? 'would remove' : 'removed'} ${plural(r.bookmarksChanged, 'bookmark')}`);
    if (job.undo.unbookmark && r.bookmarksAlready) parts.push(`${r.bookmarksAlready} not bookmarked`);
  }

  if (r.bookmarksFailed) parts.push(`${r.bookmarksFailed} didn't take effect`);
  if (r.capped) parts.push('stopped at per-seller cap');
  if (r.showsNotLoaded) parts.push("some shows didn't load; run again to finish");
  if (r.error) parts.push(`error: ${r.error}`);
  return parts.length ? parts.join(' · ') : 'nothing to do';
};

export interface StatusView {
  label: string;
  tone: 'idle' | 'running' | 'waiting' | 'paused';
  detail: string;
}

export const describeStatus = (job: Job | null | undefined, now: number): StatusView => {
  if (!job) return { label: 'Idle', tone: 'idle', detail: '' };
  const total = job.sellers.length;
  const position = `${Math.min(job.index + 1, total)}/${total}`;
  switch (job.status) {
    case 'running':
      return job.inFlight
        ? { label: `Working ${position}`, tone: 'running', detail: `On @${job.sellers[job.inFlight.index] ?? ''}` }
        : { label: 'Starting…', tone: 'running', detail: '' };
    case 'waiting': {
      const left = job.nextRunAt ? formatDuration(job.nextRunAt - now) : '';
      return {
        label: left ? `Next in ${left}` : 'Waiting',
        tone: 'waiting',
        detail: `${job.waitReason ?? 'Waiting'} · next: @${job.sellers[job.index] ?? ''}`,
      };
    }
    case 'paused':
      return { label: 'Paused', tone: 'paused', detail: job.pauseReason ?? '' };
    case 'done':
      return { label: 'Done', tone: 'idle', detail: '' };
    case 'stopped':
      return { label: 'Stopped', tone: 'idle', detail: '' };
  }
};

export const summarize = (job: Job): string => {
  const r = job.results;
  const followed = r.filter((x) => x.follow === 'done').length;
  const changed = r.reduce((n, x) => n + x.bookmarksChanged, 0);
  const failed = r.filter((x) => x.error || x.follow === 'failed').length;
  const verb =
    job.kind === 'follow_bookmark'
      ? `${followed} ${job.dryRun ? 'to follow' : 'followed'}, ${changed} ${job.dryRun ? 'to bookmark' : 'bookmarked'}`
      : `${followed} ${job.dryRun ? 'to unfollow' : 'unfollowed'}, ${changed} ${job.dryRun ? 'bookmarks to remove' : 'bookmarks removed'}`;
  return `${r.length}/${job.sellers.length} sellers · ${verb}${failed ? ` · ${failed} failed` : ''}`;
};

export const summarizeReport = (r: DiagnosticsReport) => {
  const states = r.showCards.reduce<Record<string, number>>((acc, c) => {
    const k = c.state ?? 'unreadable';
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  const rows: [string, string, boolean | null][] = [
    ['Page', `${r.page} · ${new URL(r.url).pathname}`, null],
    ['Login prompt', r.loggedOutPrompt ? 'showing (log in first)' : 'none', !r.loggedOutPrompt],
    ['Warning', r.warning ?? 'none', !r.warning],
    ['Page hook', r.hookInstalled ? 'connected' : 'not connected (refresh the tab)', r.hookInstalled],
  ];
  if (r.page === 'profile' || r.showCards.length) {
    rows.push(
      ['Follow button', r.follow ? `${r.follow.state} (“${r.follow.label}”)` : 'not found', Boolean(r.follow)],
      [
        'Show cards',
        r.showCards.length ? `${r.showCards.length}: ${Object.entries(states).map(([k, n]) => `${n} ${k}`).join(', ')}` : 'none found',
        r.showCards.length > 0 && !states.unreadable,
      ],
      ['See-all button', r.expandButton ? 'found' : 'not shown', null],
    );
  }
  if (r.page === 'live') {
    const targets = Object.entries(r.share.targets).filter(([, v]) => v).map(([k]) => k);
    rows.push(
      ['Share button', r.share.button ? 'found' : 'not found', r.share.button],
      ['Share menu', targets.length ? `open: ${targets.join(', ')}` : 'closed (normal)', null],
      ['Video', r.video ? `${r.video.width}×${r.video.height}` : 'not playing', Boolean(r.video)],
      ['Bid buttons', r.bidButtons.length ? r.bidButtons.join(' | ') : 'none visible', null],
    );
    if (r.live) {
      const events = Object.entries(r.live.eventCounts).map(([k, n]) => `${k}×${n}`).join(', ');
      rows.push(
        ['Socket events', events || 'none yet', Boolean(events)],
        ['Show', `${r.live.show.title ?? '?'} · @${r.live.show.host ?? '?'} · ${r.live.show.viewers ?? '?'} viewers`, null],
        ['Current lot', r.live.lot ? `${r.live.lot.title ?? '?'} · ${r.live.lot.currentBid ?? '?'}` : 'none seen (log in to get auction data)', null],
      );
      if (r.live.breakId) {
        const w = r.live.wheel?.id === r.live.breakId ? r.live.wheel : null;
        rows.push([
          'Wheel',
          w ? `${w.prizes.length} prizes, ${w.prizes.reduce((n, p) => n + p.left, 0)} spots${w.complete ? '' : ' (partial list)'}` : `break ${r.live.breakId}, prize list not loaded`,
          Boolean(w?.complete),
        ]);
      }
    }
  }
  if (r.overrides.length) rows.push(['Overrides', r.overrides.join(', '), null]);
  return rows;
};
