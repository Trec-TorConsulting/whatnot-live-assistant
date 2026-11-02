import { SECOND, type Range } from './time';
import type { ShareTarget } from './types';

export interface ShareSettings {
  target: ShareTarget;
  quiet: boolean;
  delayMs: Range;
}

export const DEFAULT_SHARE_SETTINGS: ShareSettings = {
  target: 'copy',
  quiet: true,
  delayMs: { min: 8 * SECOND, max: 15 * SECOND },
};

// The delay ceiling stays under the service worker's ~30s idle timeout, since that wait is inline.
export const SHARE_GUARDRAILS = {
  delayMs: { floor: 0.5 * SECOND, ceiling: 20 * SECOND },
} as const;

const TARGETS: ShareTarget[] = ['copy', 'x', 'facebook'];

const clamp = (v: unknown, floor: number, ceiling: number, fallback: number) => {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback;
  return Math.min(ceiling, Math.max(floor, n));
};

export const sanitizeShareSettings = (input: unknown): ShareSettings => {
  const s = (input ?? {}) as Partial<ShareSettings>;
  const d = DEFAULT_SHARE_SETTINGS;
  const g = SHARE_GUARDRAILS;
  const range = (s.delayMs ?? {}) as Partial<Range>;
  const min = clamp(range.min, g.delayMs.floor, g.delayMs.ceiling, d.delayMs.min);
  const max = clamp(range.max, g.delayMs.floor, g.delayMs.ceiling, d.delayMs.max);
  return {
    target: TARGETS.includes(s.target as ShareTarget) ? (s.target as ShareTarget) : d.target,
    quiet: typeof s.quiet === 'boolean' ? s.quiet : d.quiet,
    delayMs: min <= max ? { min, max } : { min: max, max: min },
  };
};
