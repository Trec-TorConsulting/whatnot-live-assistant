import { describe, expect, it } from 'vitest';
import { mergeOverrides, parseOverrides } from './overrides';
import { sanitizeShareSettings, SHARE_GUARDRAILS } from './shareSettings';

describe('parseOverrides', () => {
  it('accepts known selector keys', () => {
    const { value, errors } = parseOverrides(
      JSON.stringify({ followButton: 'button.follow', shareTargets: { copy: '[data-testid=copy]' }, warningPattern: 'slow down' }),
    );
    expect(value).toEqual({ followButton: 'button.follow', shareTargets: { copy: '[data-testid=copy]' }, warningPattern: 'slow down' });
    expect(errors).toEqual([]);
  });

  it('reports bad JSON, bad selectors, bad regexes, and unknown keys', () => {
    expect(parseOverrides('{nope').errors[0]).toMatch(/Not valid JSON/);
    const { value, errors } = parseOverrides({ showCard: 'div[', warningPattern: '(', extra: 1 }, (s) => !s.includes('['));
    expect(value).toEqual({});
    expect(errors).toEqual(['showCard: not a valid CSS selector', 'warningPattern: not a valid regular expression', 'extra: unknown key (ignored)']);
  });

  it('treats empty input as no overrides', () => {
    expect(parseOverrides('  ')).toEqual({ value: {}, errors: [] });
  });
});

describe('mergeOverrides', () => {
  it('lets hosted values win key by key', () => {
    expect(
      mergeOverrides({ followButton: 'a', shareTargets: { copy: 'c1', x: 'x1' } }, { followButton: 'b', shareTargets: { copy: 'c2' } }),
    ).toEqual({ followButton: 'b', shareTargets: { copy: 'c2', x: 'x1' } });
  });
});

describe('sanitizeShareSettings', () => {
  it('clamps to guardrails and validates the target', () => {
    const s = sanitizeShareSettings({ target: 'myspace', delayMs: { min: 10, max: 999_999 }, maxPerHour: 9999 });
    expect(s.target).toBe('copy');
    expect(s.delayMs).toEqual({ min: SHARE_GUARDRAILS.delayMs.floor, max: SHARE_GUARDRAILS.delayMs.ceiling });
    expect(s).not.toHaveProperty('maxPerHour');
  });
});
