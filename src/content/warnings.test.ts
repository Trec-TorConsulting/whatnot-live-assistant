import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setOverridesForTest } from './overridesState';
import { findDialogClose, findShareTarget } from './selectors';
import { findLoginPrompt, findWarning } from './warnings';

// happy-dom has no layout; give every element a visible box so visibility checks pass.
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, top: 0, left: 0, right: 300, bottom: 300, width: 300, height: 300, toJSON: () => ({}) });
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  setOverridesForTest({});
});

describe('native <dialog> handling (Whatnot markup)', () => {
  it('sees the login prompt in an open <dialog>', () => {
    document.body.innerHTML = `<dialog open><section data-testid="dialog-content">Join Whatnot! Sign up Log in Continue with Google</section></dialog>`;
    expect(findLoginPrompt()).toBe(true);
  });

  it('ignores a closed <dialog>', () => {
    document.body.innerHTML = `<dialog><section>Log in Continue with Google</section></dialog>`;
    expect(findLoginPrompt()).toBe(false);
  });

  it('does not mistake the share menu for a login prompt or warning', () => {
    document.body.innerHTML = `<dialog open><section>Share Coins by traderbea
      <button><svg aria-label="Close modal"></svg></button>
      <button data-testid="share-copy-link-button">Copy link</button>
      <a href="https://x.com/intent/tweet?via=whatnot">X</a>
      <a data-testid="share-facebook-link" href="https://www.facebook.com/sharer/sharer.php">Facebook</a>
    </section></dialog>
    <a href="https://www.facebook.com/v22.0/dialog/oauth?client_id=1">Continue with Facebook</a>`;
    expect(findLoginPrompt()).toBe(false);
    expect(findWarning()).toBeNull();
    expect(findShareTarget('copy')?.textContent).toBe('Copy link');
    expect(findShareTarget('x')?.getAttribute('href')).toContain('x.com/intent');
    expect(findShareTarget('facebook')?.getAttribute('data-testid')).toBe('share-facebook-link');
    expect(findDialogClose(document.querySelector('dialog')!)).not.toBeNull();
  });

  it('never picks the Facebook login link as a share target', () => {
    document.body.innerHTML = `<a href="https://www.facebook.com/v22.0/dialog/oauth?client_id=1">Continue with Facebook</a>`;
    expect(findShareTarget('facebook')).toBeNull();
  });

  it('reads rate-limit warnings from toasts and custom patterns', () => {
    document.body.innerHTML = `<div role="alert">Whoa, slow down! Try again later.</div>`;
    expect(findWarning()).toMatch(/slow down/);
    document.body.innerHTML = `<div class="Toast_root">Hold up, partner</div>`;
    expect(findWarning()).toBeNull();
    setOverridesForTest({ warningPattern: 'hold up' });
    expect(findWarning()).toMatch(/Hold up/);
  });
});
