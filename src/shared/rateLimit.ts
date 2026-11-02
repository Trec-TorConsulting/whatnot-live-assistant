import type { Settings } from './settings';
import type { ShareSettings } from './shareSettings';
import type { ActionKind } from './types';
import { DAY, HOUR, randomBetween } from './time';

export interface RateEntry {
  at: number;
  kind: ActionKind;
  show?: string;
}

// Shares and account actions (follow/bookmark) keep separate spacing and caps in one log.
export interface RateState {
  log: RateEntry[];
  notBefore: number;
  shareNotBefore?: number;
}

export type RateCheck =
  | { allowed: true }
  | { allowed: false; retryAt: number; reason: string };

export interface RateUsage {
  hour: number;
  day: number;
  followsHour: number;
  followsDay: number;
  sharesHour: number;
  sharesDay: number;
  notBefore: number;
}

export const emptyRateState = (): RateState => ({ log: [], notBefore: 0, shareNotBefore: 0 });

export const isFollowKind = (kind: ActionKind) => kind === 'follow' || kind === 'unfollow';
const isShare = (e: RateEntry) => e.kind === 'share';

export const pruneRateState = (state: RateState, now: number): RateState => ({
  ...state,
  log: state.log.filter((e) => e.at > now - DAY).sort((a, b) => a.at - b.at),
});

// When `entries` (oldest first) already holds `limit` items inside the window, the next slot
// opens once enough of the oldest ones age out.
const windowRetryAt = (entries: RateEntry[], limit: number, windowMs: number): number | null => {
  if (entries.length < limit) return null;
  const blocker = entries[entries.length - limit];
  return blocker ? blocker.at + windowMs : null;
};

type Check = [RateEntry[], number, number, string];

const evaluate = (checks: Check[], spacing: { notBefore: number; reason: string } | null, now: number): RateCheck => {
  const blocks: { retryAt: number; reason: string }[] = [];
  if (spacing && now < spacing.notBefore) blocks.push({ retryAt: spacing.notBefore, reason: spacing.reason });
  for (const [entries, limit, windowMs, reason] of checks) {
    const retryAt = windowRetryAt(entries, limit, windowMs);
    if (retryAt !== null) blocks.push({ retryAt, reason });
  }
  if (blocks.length === 0) return { allowed: true };
  const worst = blocks.reduce((a, b) => (b.retryAt > a.retryAt ? b : a));
  return { allowed: false, retryAt: worst.retryAt, reason: worst.reason };
};

export const checkAction = (state: RateState, settings: Settings, kind: ActionKind, now: number): RateCheck => {
  const log = pruneRateState(state, now).log.filter((e) => !isShare(e));
  const hour = log.filter((e) => e.at > now - HOUR);
  const checks: Check[] = [
    [hour, settings.maxActionsPerHour, HOUR, 'Hourly action limit reached'],
    [log, settings.maxActionsPerDay, DAY, 'Daily action limit reached'],
  ];
  if (isFollowKind(kind)) {
    checks.push(
      [hour.filter((e) => isFollowKind(e.kind)), settings.maxFollowsPerHour, HOUR, 'Hourly follow limit reached'],
      [log.filter((e) => isFollowKind(e.kind)), settings.maxFollowsPerDay, DAY, 'Daily follow limit reached'],
    );
  }
  return evaluate(checks, { notBefore: state.notBefore, reason: 'Spacing between actions' }, now);
};

// Shares have no hourly, daily, or per-show caps: only the delay between them (and the cooldown
// after a Whatnot warning) holds them back.
export const checkShare = (state: RateState, now: number): RateCheck =>
  evaluate([], { notBefore: state.shareNotBefore ?? 0, reason: 'Spacing between shares' }, now);

export const recordAction = (
  state: RateState,
  settings: Settings,
  kind: ActionKind,
  now: number,
  rand: () => number = Math.random,
): RateState => {
  const pruned = pruneRateState(state, now);
  return {
    ...pruned,
    log: [...pruned.log, { at: now, kind }],
    notBefore: Math.max(state.notBefore, now + randomBetween(settings.actionDelayMs, rand)),
  };
};

export const recordShare = (
  state: RateState,
  settings: ShareSettings,
  show: string,
  now: number,
  rand: () => number = Math.random,
): RateState => {
  const pruned = pruneRateState(state, now);
  return {
    ...pruned,
    log: [...pruned.log, { at: now, kind: 'share', show }],
    shareNotBefore: Math.max(state.shareNotBefore ?? 0, now + randomBetween(settings.delayMs, rand)),
  };
};

export const applyCooldown = (state: RateState, until: number): RateState => ({
  ...state,
  notBefore: Math.max(state.notBefore, until),
  shareNotBefore: Math.max(state.shareNotBefore ?? 0, until),
});

export const rateUsage = (state: RateState, now: number): RateUsage => {
  const all = pruneRateState(state, now).log;
  const log = all.filter((e) => !isShare(e));
  const shares = all.filter(isShare);
  const hour = log.filter((e) => e.at > now - HOUR);
  return {
    hour: hour.length,
    day: log.length,
    followsHour: hour.filter((e) => isFollowKind(e.kind)).length,
    followsDay: log.filter((e) => isFollowKind(e.kind)).length,
    sharesHour: shares.filter((e) => e.at > now - HOUR).length,
    sharesDay: shares.length,
    notBefore: state.notBefore,
  };
};
