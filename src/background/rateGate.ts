import type { AcquireResult } from '../shared/messages';
import { applyCooldown, checkAction, checkShare, recordAction, recordShare, type RateCheck } from '../shared/rateLimit';
import { createLock } from '../shared/lock';
import { getRateState, getSettings, getShareSettings, setItem } from '../shared/storage';
import { SECOND, sleep } from '../shared/time';
import type { ActionKind } from '../shared/types';

// Waits shorter than this happen here; longer ones are handed back so the job can park on an alarm.
const MAX_INLINE_WAIT_MS = 21 * SECOND;

// Single writer for the action log, so every tab and job shares one budget.
const withRate = createLock();

export const peekAction = async (kind: ActionKind): Promise<RateCheck> => {
  const [state, settings] = await Promise.all([getRateState(), getSettings()]);
  return checkAction(state, settings, kind, Date.now());
};

export const acquire = (kind: ActionKind, stillValid: () => Promise<boolean>): Promise<AcquireResult> =>
  withRate(async () => {
    for (;;) {
      const [state, settings] = await Promise.all([getRateState(), getSettings()]);
      const now = Date.now();
      const check = checkAction(state, settings, kind, now);
      if (check.allowed) {
        await setItem('rate', recordAction(state, settings, kind, now));
        return { granted: true };
      }
      if (check.retryAt - now > MAX_INLINE_WAIT_MS) {
        return { granted: false, stop: false, retryAt: check.retryAt, reason: check.reason };
      }
      await sleep(check.retryAt - now + 50);
      if (!(await stillValid())) return { granted: false, stop: true };
    }
  });

export const acquireShare = (show: string, stillValid: () => Promise<boolean>): Promise<AcquireResult> =>
  withRate(async () => {
    for (;;) {
      const [state, settings] = await Promise.all([getRateState(), getShareSettings()]);
      const now = Date.now();
      const check = checkShare(state, now);
      if (check.allowed) {
        await setItem('rate', recordShare(state, settings, show, now));
        return { granted: true };
      }
      if (check.retryAt - now > MAX_INLINE_WAIT_MS) {
        return { granted: false, stop: false, retryAt: check.retryAt, reason: check.reason };
      }
      await sleep(check.retryAt - now + 50);
      if (!(await stillValid())) return { granted: false, stop: true };
    }
  });

export const cooldown = (ms: number) =>
  withRate(async () => {
    await setItem('rate', applyCooldown(await getRateState(), Date.now() + ms));
  });
