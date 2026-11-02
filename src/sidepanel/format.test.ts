import { describe, expect, it } from 'vitest';
import type { DiagnosticsReport } from '../shared/messages';
import type { Job, SellerResult } from '../shared/types';
import { describeResult, describeStatus, summarizeReport } from './format';

const result = (patch: Partial<SellerResult>): SellerResult => ({
  seller: 'bob',
  follow: 'already',
  bookmarksChanged: 0,
  bookmarksAlready: 0,
  bookmarksFailed: 0,
  capped: false,
  finishedAt: 0,
  ...patch,
});

const followJob = { kind: 'follow_bookmark', undo: { unfollow: false, unbookmark: false }, dryRun: false } as const;
const undoJob = { kind: 'unfollow_unbookmark', undo: { unfollow: true, unbookmark: true }, dryRun: false } as const;

describe('describeResult', () => {
  it('describes a follow + bookmark run', () => {
    expect(describeResult(result({ follow: 'done', bookmarksChanged: 2, bookmarksAlready: 1 }), followJob)).toBe(
      'followed · bookmarked 2 shows · 1 already bookmarked',
    );
  });

  it('describes a preview run', () => {
    expect(describeResult(result({ follow: 'done', bookmarksChanged: 1 }), { ...followJob, dryRun: true })).toBe(
      'would follow · would bookmark 1 show',
    );
  });

  it('describes an unfollow run', () => {
    expect(describeResult(result({ follow: 'done', bookmarksChanged: 3 }), undoJob)).toBe('unfollowed · removed 3 bookmarks');
  });

  it('surfaces errors', () => {
    expect(describeResult(result({ follow: 'skipped', error: 'Seller profile not found' }), followJob)).toBe(
      'error: Seller profile not found',
    );
  });
});

describe('summarizeReport', () => {
  const base: DiagnosticsReport = {
    url: 'https://www.whatnot.com/user/dammit_terry',
    page: 'profile',
    loggedOutPrompt: false,
    warning: null,
    follow: { state: 'not_following', label: 'Follow' },
    showCards: [
      { liveId: 'a', state: 'not_bookmarked', label: 'Bookmark this show', startsText: 'Fri 6:30 AM' },
      { liveId: 'b', state: 'bookmarked', label: 'Bookmark this show', startsText: 'Sat 7:00 AM' },
    ],
    expandButton: false,
    share: { button: false, targets: { copy: false, x: false, facebook: false } },
    video: null,
    bidButtons: [],
    hookInstalled: true,
    live: null,
    overrides: [],
  };

  it('summarizes a profile page', () => {
    const rows = Object.fromEntries(summarizeReport(base).map(([k, v, ok]) => [k, { v, ok }]));
    expect(rows['Follow button']).toEqual({ v: 'not_following (“Follow”)', ok: true });
    expect(rows['Show cards']).toEqual({ v: '2: 1 not_bookmarked, 1 bookmarked', ok: true });
    expect(rows['Login prompt']?.ok).toBe(true);
  });

  it('flags problems on a live page', () => {
    const rows = Object.fromEntries(
      summarizeReport({ ...base, url: 'https://www.whatnot.com/live/x', page: 'live', showCards: [], follow: null, loggedOutPrompt: true, hookInstalled: false }).map(
        ([k, v, ok]) => [k, { v, ok }],
      ),
    );
    expect(rows['Login prompt']).toEqual({ v: 'showing (log in first)', ok: false });
    expect(rows['Page hook']?.ok).toBe(false);
    expect(rows['Share button']?.ok).toBe(false);
    expect(rows['Follow button']).toBeUndefined();
  });
});

describe('describeStatus', () => {
  const job = {
    sellers: ['a', 'b', 'c'],
    index: 1,
    status: 'waiting',
    nextRunAt: 65_000,
    waitReason: 'Spacing between sellers',
  } as Job;

  it('shows a countdown while waiting', () => {
    expect(describeStatus(job, 0)).toEqual({
      label: 'Next in 1:05',
      tone: 'waiting',
      detail: 'Spacing between sellers · next: @b',
    });
  });

  it('is idle with no job', () => {
    expect(describeStatus(null, 0).label).toBe('Idle');
  });
});
