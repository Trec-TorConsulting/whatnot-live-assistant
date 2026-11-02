import { describe, expect, it } from 'vitest';
import {
  applyCooldown,
  checkAction,
  checkShare,
  emptyRateState,
  rateUsage,
  recordAction,
  recordShare,
  type RateState,
} from './rateLimit';
import { DEFAULT_SETTINGS, type Settings } from './settings';
import { DEFAULT_SHARE_SETTINGS } from './shareSettings';
import { DAY, HOUR, MINUTE, SECOND } from './time';
import type { ActionKind } from './types';

const settings: Settings = {
  ...DEFAULT_SETTINGS,
  actionDelayMs: { min: 4 * SECOND, max: 4 * SECOND },
  maxActionsPerHour: 3,
  maxActionsPerDay: 5,
  maxFollowsPerHour: 2,
  maxFollowsPerDay: 3,
};

const withLog = (entries: [number, ActionKind][]): RateState => ({
  log: entries.map(([at, kind]) => ({ at, kind })),
  notBefore: 0,
});

describe('checkAction', () => {
  const now = 10 * DAY;

  it('allows the first action', () => {
    expect(checkAction(emptyRateState(), settings, 'bookmark', now)).toEqual({ allowed: true });
  });

  it('enforces spacing set by the previous action', () => {
    const state = recordAction(emptyRateState(), settings, 'bookmark', now);
    const check = checkAction(state, settings, 'bookmark', now + SECOND);
    expect(check).toMatchObject({ allowed: false, retryAt: now + 4 * SECOND, reason: 'Spacing between actions' });
    expect(checkAction(state, settings, 'bookmark', now + 4 * SECOND)).toEqual({ allowed: true });
  });

  it('blocks at the hourly cap until the oldest action ages out', () => {
    const state = withLog([
      [now - 50 * MINUTE, 'bookmark'],
      [now - 30 * MINUTE, 'bookmark'],
      [now - 10 * MINUTE, 'bookmark'],
    ]);
    expect(checkAction(state, settings, 'bookmark', now)).toMatchObject({
      allowed: false,
      retryAt: now - 50 * MINUTE + HOUR,
      reason: 'Hourly action limit reached',
    });
  });

  it('blocks at the daily cap even when the hour is clear', () => {
    const state = withLog([
      [now - 20 * HOUR, 'bookmark'],
      [now - 15 * HOUR, 'bookmark'],
      [now - 10 * HOUR, 'bookmark'],
      [now - 5 * HOUR, 'bookmark'],
      [now - 2 * HOUR, 'bookmark'],
    ]);
    expect(checkAction(state, settings, 'bookmark', now)).toMatchObject({
      allowed: false,
      retryAt: now - 20 * HOUR + DAY,
      reason: 'Daily action limit reached',
    });
  });

  it('applies the tighter follow caps only to follow and unfollow', () => {
    const state = withLog([
      [now - 40 * MINUTE, 'follow'],
      [now - 20 * MINUTE, 'unfollow'],
    ]);
    expect(checkAction(state, settings, 'follow', now)).toMatchObject({ allowed: false, reason: 'Hourly follow limit reached' });
    expect(checkAction(state, settings, 'unfollow', now)).toMatchObject({ allowed: false });
    expect(checkAction(state, settings, 'bookmark', now)).toEqual({ allowed: true });
  });

  it('reports the latest of several blocking windows', () => {
    const state = applyCooldown(withLog([[now - 10 * MINUTE, 'follow']]), now + 2 * HOUR);
    expect(checkAction(state, settings, 'follow', now)).toMatchObject({ allowed: false, retryAt: now + 2 * HOUR });
  });

  it('ignores entries older than a day', () => {
    const state = withLog(Array.from({ length: 10 }, (_, i) => [now - DAY - i * MINUTE, 'follow'] as [number, ActionKind]));
    expect(checkAction(state, settings, 'follow', now)).toEqual({ allowed: true });
  });
});

describe('recordAction', () => {
  it('appends the action, prunes old ones, and sets randomized spacing within range', () => {
    const now = 10 * DAY;
    const ranged = { ...settings, actionDelayMs: { min: 4 * SECOND, max: 9 * SECOND } };
    const before = withLog([[now - 2 * DAY, 'bookmark']]);
    const low = recordAction(before, ranged, 'follow', now, () => 0);
    const high = recordAction(before, ranged, 'follow', now, () => 1);
    expect(low.log).toEqual([{ at: now, kind: 'follow' }]);
    expect(low.notBefore).toBe(now + 4 * SECOND);
    expect(high.notBefore).toBe(now + 9 * SECOND);
  });

  it('never shortens an active cooldown', () => {
    const now = 10 * DAY;
    const cooled = applyCooldown(emptyRateState(), now + HOUR);
    expect(recordAction(cooled, settings, 'bookmark', now).notBefore).toBe(now + HOUR);
  });
});

describe('rateUsage', () => {
  it('counts hour, day, follow, and share windows', () => {
    const now = 10 * DAY;
    const state = withLog([
      [now - 5 * HOUR, 'follow'],
      [now - 30 * MINUTE, 'bookmark'],
      [now - 10 * MINUTE, 'unfollow'],
      [now - 5 * MINUTE, 'share'],
    ]);
    expect(rateUsage(state, now)).toEqual({
      hour: 2,
      day: 3,
      followsHour: 1,
      followsDay: 2,
      sharesHour: 1,
      sharesDay: 1,
      notBefore: 0,
    });
  });
});

describe('shares', () => {
  const now = 10 * DAY;
  const share = { ...DEFAULT_SHARE_SETTINGS, delayMs: { min: 8 * SECOND, max: 8 * SECOND } };

  it('keeps a separate budget from account actions', () => {
    const state = withLog([
      [now - 10 * MINUTE, 'share'],
      [now - 9 * MINUTE, 'share'],
    ]);
    expect(checkAction(state, settings, 'bookmark', now)).toEqual({ allowed: true });
  });

  it('has no hourly, daily, or per-show caps', () => {
    const state: RateState = {
      log: Array.from({ length: 900 }, (_, i) => ({ at: now - i * MINUTE, kind: 'share' as const, show: 'a' })),
      notBefore: 0,
    };
    expect(checkShare(state, now)).toEqual({ allowed: true });
  });

  it('spaces shares and respects warning cooldowns', () => {
    const recorded = recordShare(emptyRateState(), share, 'a', now);
    expect(checkShare(recorded, now + SECOND)).toMatchObject({ allowed: false, retryAt: now + 8 * SECOND });
    expect(checkShare(recorded, now + 8 * SECOND)).toEqual({ allowed: true });
    const cooled = applyCooldown(emptyRateState(), now + HOUR);
    expect(checkShare(cooled, now)).toMatchObject({ allowed: false, retryAt: now + HOUR });
  });
});
