import { describe, expect, it, vi } from 'vitest';
import { installQuietPatches } from './quiet';

describe('installQuietPatches', () => {
  it('skips clipboard writes and popups only while quiet', async () => {
    const writeText = vi.fn(async () => {
      throw new DOMException('Not allowed', 'NotAllowedError');
    });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const open = vi.fn(() => null);
    window.open = open;
    let quiet = true;
    installQuietPatches(() => quiet);

    // Safari rejects scripted clipboard writes; quiet mode hands Whatnot a resolved promise instead.
    await expect(navigator.clipboard.writeText('https://www.whatnot.com/s/abc')).resolves.toBeUndefined();
    expect(writeText).not.toHaveBeenCalled();
    expect(window.open('https://x.com/intent/post')).toBeNull();
    expect(open).not.toHaveBeenCalled();

    const link = document.createElement('a');
    link.href = 'https://www.facebook.com/sharer/sharer.php';
    link.target = '_blank';
    document.body.appendChild(link);
    const quietClick = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(quietClick);
    expect(quietClick.defaultPrevented).toBe(true);

    quiet = false;
    await expect(navigator.clipboard.writeText('x')).rejects.toThrow();
    expect(writeText).toHaveBeenCalledWith('x');
    window.open('https://x.com/intent/post');
    expect(open).toHaveBeenCalledTimes(1);
    const loudClick = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(loudClick);
    expect(loudClick.defaultPrevented).toBe(false);
    link.remove();
  });
});
