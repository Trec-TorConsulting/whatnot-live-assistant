import { MINUTE, SECOND, type Range } from './time';

export interface Settings {
  actionDelayMs: Range;
  sellerDelayMs: Range;
  breakEverySellers: number;
  breakMs: Range;
  maxActionsPerHour: number;
  maxActionsPerDay: number;
  maxFollowsPerHour: number;
  maxFollowsPerDay: number;
  maxBookmarksPerSeller: number;
  warningCooldownMs: number;
}

export const DEFAULT_SETTINGS: Settings = {
  actionDelayMs: { min: 4 * SECOND, max: 9 * SECOND },
  sellerDelayMs: { min: 20 * SECOND, max: 45 * SECOND },
  breakEverySellers: 10,
  breakMs: { min: 3 * MINUTE, max: 6 * MINUTE },
  maxActionsPerHour: 60,
  maxActionsPerDay: 300,
  maxFollowsPerHour: 20,
  maxFollowsPerDay: 100,
  maxBookmarksPerSeller: 30,
  warningCooldownMs: 30 * MINUTE,
};

// Hard guardrails: saved settings are clamped into these bounds so the UI can't be used to go unsafe.
// The click-delay ceiling stays under the service worker's ~30s idle timeout, since that wait happens inline.
export const GUARDRAILS = {
  actionDelayMs: { floor: 2 * SECOND, ceiling: 20 * SECOND },
  sellerDelayMs: { floor: 10 * SECOND, ceiling: 30 * MINUTE },
  breakEverySellers: { floor: 1, ceiling: 50 },
  breakMs: { floor: 1 * MINUTE, ceiling: 2 * 60 * MINUTE },
  maxActionsPerHour: { floor: 1, ceiling: 120 },
  maxActionsPerDay: { floor: 1, ceiling: 600 },
  maxFollowsPerHour: { floor: 1, ceiling: 40 },
  maxFollowsPerDay: { floor: 1, ceiling: 200 },
  maxBookmarksPerSeller: { floor: 1, ceiling: 60 },
  warningCooldownMs: { floor: 5 * MINUTE, ceiling: 24 * 60 * MINUTE },
} as const;

const clamp = (value: unknown, floor: number, ceiling: number, fallback: number) => {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.min(ceiling, Math.max(floor, n));
};

const clampRange = (value: unknown, bounds: { floor: number; ceiling: number }, fallback: Range): Range => {
  const v = (value ?? {}) as Partial<Range>;
  const min = clamp(v.min, bounds.floor, bounds.ceiling, fallback.min);
  const max = clamp(v.max, bounds.floor, bounds.ceiling, fallback.max);
  return min <= max ? { min, max } : { min: max, max: min };
};

export const sanitizeSettings = (input: unknown): Settings => {
  const s = (input ?? {}) as Partial<Settings>;
  const d = DEFAULT_SETTINGS;
  const g = GUARDRAILS;
  const settings: Settings = {
    actionDelayMs: clampRange(s.actionDelayMs, g.actionDelayMs, d.actionDelayMs),
    sellerDelayMs: clampRange(s.sellerDelayMs, g.sellerDelayMs, d.sellerDelayMs),
    breakEverySellers: clamp(s.breakEverySellers, g.breakEverySellers.floor, g.breakEverySellers.ceiling, d.breakEverySellers),
    breakMs: clampRange(s.breakMs, g.breakMs, d.breakMs),
    maxActionsPerHour: clamp(s.maxActionsPerHour, g.maxActionsPerHour.floor, g.maxActionsPerHour.ceiling, d.maxActionsPerHour),
    maxActionsPerDay: clamp(s.maxActionsPerDay, g.maxActionsPerDay.floor, g.maxActionsPerDay.ceiling, d.maxActionsPerDay),
    maxFollowsPerHour: clamp(s.maxFollowsPerHour, g.maxFollowsPerHour.floor, g.maxFollowsPerHour.ceiling, d.maxFollowsPerHour),
    maxFollowsPerDay: clamp(s.maxFollowsPerDay, g.maxFollowsPerDay.floor, g.maxFollowsPerDay.ceiling, d.maxFollowsPerDay),
    maxBookmarksPerSeller: clamp(
      s.maxBookmarksPerSeller,
      g.maxBookmarksPerSeller.floor,
      g.maxBookmarksPerSeller.ceiling,
      d.maxBookmarksPerSeller,
    ),
    warningCooldownMs: clamp(s.warningCooldownMs, g.warningCooldownMs.floor, g.warningCooldownMs.ceiling, d.warningCooldownMs),
  };
  settings.maxActionsPerHour = Math.min(settings.maxActionsPerHour, settings.maxActionsPerDay);
  settings.maxFollowsPerHour = Math.min(settings.maxFollowsPerHour, settings.maxFollowsPerDay, settings.maxActionsPerHour);
  settings.maxFollowsPerDay = Math.min(settings.maxFollowsPerDay, settings.maxActionsPerDay);
  return settings;
};
