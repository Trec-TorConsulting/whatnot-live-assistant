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

// Domain spacing constraints to prevent 429s during burst scans (e.g. shop/table scans)
const DOMAIN_MIN_GAP_MS: Record<string, number> = {
  'api.scryfall.com': 100, // Scryfall asks 50-100ms
  'api.pokemontcg.io': 100,
  'db.ygoprodeck.com': 100,
  'api.psacard.com': 200,
  'api.discogs.com': 200,
  'api.pcgs.com': 250,
  'api.gold-api.com': 300,
  'ebay.com': 250,
  'greysheet.com': 300,
};

const domainTails: Record<string, Promise<unknown>> = {};
const domainLastAt: Record<string, number> = {};
let domainRateDisabled = false;

export const setDomainRateDisabled = (disabled: boolean) => {
  domainRateDisabled = disabled;
};

export const resetDomainRates = () => {
  for (const k of Object.keys(domainTails)) delete domainTails[k];
  for (const k of Object.keys(domainLastAt)) delete domainLastAt[k];
};

const domainKey = (url: string): string => {
  try {
    const host = new URL(url).hostname.toLowerCase();
    for (const key of Object.keys(DOMAIN_MIN_GAP_MS)) {
      if (host === key || host.endsWith(`.${key}`)) return key;
    }
    return host;
  } catch {
    return 'default';
  }
};

export const scheduleDomain = <T>(url: string, fn: () => Promise<T>): Promise<T> => {
  if (domainRateDisabled) return fn();
  const key = domainKey(url);
  const minGap = DOMAIN_MIN_GAP_MS[key] ?? 100;
  const prev = domainTails[key] ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(async () => {
    if (domainRateDisabled) return fn();
    const last = domainLastAt[key] ?? 0;
    const now = Date.now();
    const wait = Math.max(0, minGap - (now - last));
    if (wait > 0 && !domainRateDisabled) await sleep(wait);
    domainLastAt[key] = Date.now();
    return fn();
  });
  domainTails[key] = next.catch(() => undefined);
  return next;
};
