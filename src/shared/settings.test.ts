import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, GUARDRAILS, sanitizeSettings } from './settings';

describe('sanitizeSettings', () => {
  it('returns defaults for missing input', () => {
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it('clamps unsafe values to the guardrails', () => {
    const s = sanitizeSettings({
      ...DEFAULT_SETTINGS,
      actionDelayMs: { min: 100, max: 200 },
      maxActionsPerHour: 10_000,
      maxActionsPerDay: 10_000,
      maxFollowsPerHour: 10_000,
      maxBookmarksPerSeller: 0,
    });
    expect(s.actionDelayMs).toEqual({ min: GUARDRAILS.actionDelayMs.floor, max: GUARDRAILS.actionDelayMs.floor });
    expect(s.maxActionsPerHour).toBe(GUARDRAILS.maxActionsPerHour.ceiling);
    expect(s.maxActionsPerDay).toBe(GUARDRAILS.maxActionsPerDay.ceiling);
    expect(s.maxFollowsPerHour).toBe(GUARDRAILS.maxFollowsPerHour.ceiling);
    expect(s.maxBookmarksPerSeller).toBe(GUARDRAILS.maxBookmarksPerSeller.floor);
  });

  it('swaps inverted ranges and keeps hourly caps under daily caps', () => {
    const s = sanitizeSettings({
      ...DEFAULT_SETTINGS,
      sellerDelayMs: { min: 60_000, max: 20_000 },
      maxActionsPerHour: 100,
      maxActionsPerDay: 50,
      maxFollowsPerHour: 30,
      maxFollowsPerDay: 10,
    });
    expect(s.sellerDelayMs).toEqual({ min: 20_000, max: 60_000 });
    expect(s.maxActionsPerHour).toBe(50);
    expect(s.maxFollowsPerHour).toBe(10);
  });

  it('falls back to defaults for non-numeric values', () => {
    const s = sanitizeSettings({ maxActionsPerHour: Number.NaN, breakEverySellers: 'x' });
    expect(s.maxActionsPerHour).toBe(DEFAULT_SETTINGS.maxActionsPerHour);
    expect(s.breakEverySellers).toBe(DEFAULT_SETTINGS.breakEverySellers);
  });
});
