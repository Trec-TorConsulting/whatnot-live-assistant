// The phone version of the share worker: opens Whatnot's Share menu, leaves it open, and taps the
// chosen option on the delay. If a tap closes the menu, the next round reopens it.
import { SECOND, randomBetween } from '../shared/time';
import type { ShareTarget } from '../shared/types';
import type { PhoneSettings } from './settings';

export const TARGET_LABEL: Record<ShareTarget, string> = { copy: 'Copy link', x: 'X', facebook: 'Facebook' };

const PAGE_READY_MS = 30 * SECOND;
const MENU_OPEN_MS = 5 * SECOND;
const QUIET_MS = 5 * SECOND;

export const APP_BLOCK_MESSAGE =
  'Whatnot is showing its app screen instead of the show. Tap aA › Request Desktop Website, then log in.';

export interface LoopDeps {
  findShareButton: () => HTMLElement | null;
  findShareTarget: (target: ShareTarget) => HTMLElement | null;
  findWarning: () => string | null;
  findLoginPrompt: () => boolean;
  findAppBlock: () => boolean;
  onLivePage: () => boolean;
  click: (el: HTMLElement) => void;
  waitFor: <T>(find: () => T | null | undefined | false, timeoutMs: number) => Promise<T | null>;
  setQuiet: (ms: number) => void;
  settings: () => PhoneSettings;
}

export interface LoopStatus {
  running: boolean;
  sent: number;
  confirmed: number;
  message: string;
}

export const describeRun = (target: ShareTarget, sent: number, confirmed: number) =>
  `Sharing via ${TARGET_LABEL[target]}: ${sent} sent, ${confirmed} confirmed by Whatnot`;

export const createShareLoop = (deps: LoopDeps, onStatus: (s: LoopStatus) => void) => {
  let generation = 0;
  let wake: (() => void) | null = null;
  let status: LoopStatus = { running: false, sent: 0, confirmed: 0, message: 'Ready' };

  const emit = (patch: Partial<LoopStatus>) => {
    status = { ...status, ...patch };
    onStatus(status);
  };

  // A stop wakes the pause early, so Stop takes effect right away even on a long delay.
  const pause = (ms: number) =>
    new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        if (wake === done) wake = null;
        resolve();
      };
      const timer = setTimeout(done, Math.max(0, ms));
      wake = done;
    });

  const end = (gen: number, message: string) => {
    if (gen !== generation) return;
    generation += 1;
    emit({ running: false, message });
  };

  const openMenu = async (target: ShareTarget) => {
    const existing = deps.findShareTarget(target);
    if (existing) return existing;
    const button = deps.findShareButton();
    if (!button) return null;
    deps.click(button);
    return deps.waitFor(() => deps.findShareTarget(target), MENU_OPEN_MS);
  };

  const run = async (gen: number) => {
    const first = deps.settings().target;
    await deps.waitFor(
      () => deps.findShareButton() || deps.findShareTarget(first) || deps.findLoginPrompt() || deps.findAppBlock(),
      PAGE_READY_MS,
    );
    while (gen === generation) {
      if (!deps.onLivePage()) return end(gen, `Stopped: you left the show. ${status.sent} sent.`);
      if (deps.findAppBlock()) return end(gen, APP_BLOCK_MESSAGE);
      const warning = deps.findWarning();
      if (warning) return end(gen, `Stopped: Whatnot showed a warning (“${warning}”). ${status.sent} sent.`);
      if (deps.findLoginPrompt()) return end(gen, 'Stopped: log in to Whatnot in Safari first.');

      const { target, quiet, delaySec } = deps.settings();
      if (quiet) deps.setQuiet(QUIET_MS);
      const option = await openMenu(target);
      if (gen !== generation) return;
      if (!option) {
        return end(
          gen,
          deps.findShareButton()
            ? `Stopped: ${TARGET_LABEL[target]} wasn't in the Share menu.`
            : "Stopped: couldn't find the Share button on this page.",
        );
      }
      await pause(randomBetween({ min: 100, max: 300 }));
      if (gen !== generation) return;
      deps.click(option);
      emit({ sent: status.sent + 1, message: describeRun(target, status.sent + 1, status.confirmed) });
      await pause(delaySec * SECOND);
    }
  };

  return {
    status: () => status,
    start: () => {
      if (status.running) return;
      const gen = ++generation;
      emit({ running: true, sent: 0, confirmed: 0, message: 'Looking for the Share button…' });
      return run(gen).catch((err: unknown) => end(gen, `Stopped: ${String((err as Error)?.message ?? err)}`));
    },
    stop: (message = 'Stopped') => {
      if (!status.running) return;
      generation += 1;
      wake?.();
      emit({ running: false, message: `${message}. ${status.sent} sent, ${status.confirmed} confirmed.` });
    },
    // Whatnot's LogShare request succeeded, so the share was recorded on its side.
    confirm: () => {
      if (!status.running) return;
      const confirmed = status.confirmed + 1;
      emit({ confirmed, message: describeRun(deps.settings().target, status.sent, confirmed) });
    },
  };
};

export type ShareLoop = ReturnType<typeof createShareLoop>;
