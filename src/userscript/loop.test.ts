import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_BLOCK_MESSAGE, createShareLoop, type LoopDeps, type LoopStatus } from './loop';
import { DEFAULT_PHONE_SETTINGS, type PhoneSettings } from './settings';

const button = (label: string) => {
  const el = document.createElement('button');
  el.textContent = label;
  return el;
};

// A fake page: the Share button opens a menu holding Copy link; tapping it can close the menu.
const fakePage = (opts: { closeOnCopy?: boolean } = {}) => {
  const share = button('Share');
  const copy = button('Copy link');
  const page = {
    menuOpen: false,
    hasShare: true,
    warning: null as string | null,
    login: false,
    appBlock: false,
    live: true,
    clicks: [] as string[],
    settings: { ...DEFAULT_PHONE_SETTINGS, delaySec: 1 } as PhoneSettings,
    quietCalls: 0,
  };
  const deps: LoopDeps = {
    findShareButton: () => (page.hasShare ? share : null),
    findShareTarget: (t) => (page.menuOpen && t === 'copy' ? copy : null),
    findWarning: () => page.warning,
    findLoginPrompt: () => page.login,
    findAppBlock: () => page.appBlock,
    onLivePage: () => page.live,
    click: (el) => {
      page.clicks.push(el.textContent ?? '');
      if (el === share) page.menuOpen = true;
      if (el === copy && opts.closeOnCopy) page.menuOpen = false;
    },
    waitFor: async (find) => find() || null,
    setQuiet: () => {
      page.quietCalls += 1;
    },
    settings: () => page.settings,
  };
  return { page, deps };
};

const statuses: LoopStatus[] = [];
const record = (s: LoopStatus) => statuses.push(s);

// Fixed randomness puts every tap 200ms after the menu is ready.
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  statuses.length = 0;
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('createShareLoop', () => {
  it('opens the menu once, keeps it open, and taps Copy link on the delay', async () => {
    const { page, deps } = fakePage();
    const loop = createShareLoop(deps, record);
    void loop.start();
    await vi.advanceTimersByTimeAsync(300);
    expect(page.clicks).toEqual(['Share', 'Copy link']);
    expect(loop.status()).toMatchObject({ running: true, sent: 1 });

    await vi.advanceTimersByTimeAsync(999);
    expect(loop.status().sent).toBe(1);
    await vi.advanceTimersByTimeAsync(301);
    expect(loop.status().sent).toBe(2);
    expect(page.clicks.filter((c) => c === 'Share')).toHaveLength(1);
    expect(page.quietCalls).toBe(2);
    loop.stop();
  });

  it('reopens the menu when a tap closes it', async () => {
    const { page, deps } = fakePage({ closeOnCopy: true });
    const loop = createShareLoop(deps, record);
    void loop.start();
    await vi.advanceTimersByTimeAsync(300 + 1000 + 300);
    expect(page.clicks).toEqual(['Share', 'Copy link', 'Share', 'Copy link']);
    loop.stop();
  });

  it('picks up delay and quiet changes between shares', async () => {
    const { page, deps } = fakePage();
    const loop = createShareLoop(deps, record);
    void loop.start();
    await vi.advanceTimersByTimeAsync(300);
    page.settings = { ...page.settings, delaySec: 5, quiet: false };
    await vi.advanceTimersByTimeAsync(1000 + 300);
    expect(loop.status().sent).toBe(2);
    await vi.advanceTimersByTimeAsync(4000);
    expect(loop.status().sent).toBe(2);
    await vi.advanceTimersByTimeAsync(1300);
    expect(loop.status().sent).toBe(3);
    expect(page.quietCalls).toBe(1);
    loop.stop();
  });

  it('stops right away, even in the middle of a long delay', async () => {
    const { page, deps } = fakePage();
    page.settings = { ...page.settings, delaySec: 120 };
    const loop = createShareLoop(deps, record);
    const done = loop.start();
    await vi.advanceTimersByTimeAsync(300);
    loop.stop();
    await done;
    expect(loop.status()).toMatchObject({ running: false, sent: 1 });
    expect(loop.status().message).toBe('Stopped. 1 sent, 0 confirmed.');
    await vi.advanceTimersByTimeAsync(200_000);
    expect(page.clicks).toHaveLength(2);
  });

  it('stops on a Whatnot warning before tapping again', async () => {
    const { page, deps } = fakePage();
    const loop = createShareLoop(deps, record);
    const done = loop.start();
    await vi.advanceTimersByTimeAsync(300);
    page.warning = 'Too many requests, slow down';
    await vi.advanceTimersByTimeAsync(1300);
    await done;
    expect(loop.status().running).toBe(false);
    expect(loop.status().message).toContain('Too many requests');
    expect(page.clicks).toHaveLength(2);
  });

  it('stops when Whatnot asks you to log in', async () => {
    const { page, deps } = fakePage();
    page.login = true;
    const loop = createShareLoop(deps, record);
    await loop.start();
    expect(loop.status()).toMatchObject({ running: false, message: 'Stopped: log in to Whatnot in Safari first.' });
    expect(page.clicks).toEqual([]);
  });

  it("says how to get past Whatnot's app screen instead of waiting for a Share button", async () => {
    const { page, deps } = fakePage();
    page.appBlock = true;
    page.hasShare = false;
    const waitFor = vi.spyOn(deps, 'waitFor');
    const loop = createShareLoop(deps, record);
    await loop.start();
    expect(waitFor).toHaveBeenCalledTimes(1);
    expect(loop.status()).toMatchObject({ running: false, message: APP_BLOCK_MESSAGE });
    expect(page.clicks).toEqual([]);
  });

  it('stops when you leave the show', async () => {
    const { page, deps } = fakePage();
    const loop = createShareLoop(deps, record);
    const done = loop.start();
    await vi.advanceTimersByTimeAsync(300);
    page.live = false;
    await vi.advanceTimersByTimeAsync(1300);
    await done;
    expect(loop.status().message).toBe('Stopped: you left the show. 1 sent.');
  });

  it('explains when the Share button or the option is missing', async () => {
    const missingButton = fakePage();
    missingButton.page.hasShare = false;
    const a = createShareLoop(missingButton.deps, record);
    await a.start();
    expect(a.status().message).toBe("Stopped: couldn't find the Share button on this page.");

    const missingOption = fakePage();
    missingOption.page.settings = { ...missingOption.page.settings, target: 'x' };
    const b = createShareLoop(missingOption.deps, record);
    await b.start();
    expect(b.status().message).toBe("Stopped: X wasn't in the Share menu.");
  });

  it('counts confirmations only while running and resets on a new run', async () => {
    const { deps } = fakePage();
    const loop = createShareLoop(deps, record);
    loop.confirm();
    expect(loop.status().confirmed).toBe(0);
    void loop.start();
    await vi.advanceTimersByTimeAsync(300);
    loop.confirm();
    expect(loop.status()).toMatchObject({ sent: 1, confirmed: 1 });
    expect(loop.status().message).toBe('Sharing via Copy link: 1 sent, 1 confirmed by Whatnot');
    loop.stop();
    void loop.start();
    expect(loop.status()).toMatchObject({ running: true, sent: 0, confirmed: 0 });
    loop.stop();
  });

  it('ignores a second start while running', async () => {
    const { page, deps } = fakePage();
    const loop = createShareLoop(deps, record);
    void loop.start();
    void loop.start();
    await vi.advanceTimersByTimeAsync(300);
    expect(page.clicks).toEqual(['Share', 'Copy link']);
    loop.stop();
  });
});
