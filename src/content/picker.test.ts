import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSelector } from './picker';

vi.mock('./overlay', () => ({ overlay: { isOurs: () => false, notice: () => undefined } }));

// happy-dom doesn't lay out, so give every element a visible size.
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 40, height: 20, top: 0, left: 0 } as DOMRect);
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('buildSelector', () => {
  it('prefers a stable id, test id, or aria-label', () => {
    document.body.innerHTML = `
      <button id="share">a</button>
      <button id="btn-123456">b</button>
      <button data-testid="show-share-button">c</button>
      <button aria-label="Copy link">d</button>`;
    const [a, b, c, d] = Array.from(document.querySelectorAll('button'));
    expect(buildSelector(a!)).toBe('#share');
    expect(buildSelector(b!)).not.toContain('123456');
    expect(buildSelector(c!)).toBe('[data-testid="show-share-button"]');
    expect(buildSelector(d!)).toBe('button[aria-label="Copy link"]');
  });

  it('falls back to a path that finds the element first', () => {
    document.body.innerHTML = `
      <div><section><button aria-label="Share">x</button></section></div>
      <div><section><button aria-label="Share">y</button></section></div>`;
    const second = document.querySelectorAll('button')[1]!;
    const sel = buildSelector(second)!;
    expect(sel).toContain('nth-of-type(2)');
    expect(document.querySelector(sel)).toBe(second);
  });
});
