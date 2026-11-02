import { describe, expect, it, vi } from 'vitest';

// Each import after resetModules is a separate copy of the script, like the one injected after an update.
const load = async () => {
  vi.resetModules();
  return import('./lifecycle');
};

describe('lifecycle', () => {
  it('stops the older copy when a newer one claims the page, and only the older one', async () => {
    vi.useFakeTimers();
    try {
      const old = await load();
      old.claimPage();
      const oldStop = vi.fn();
      const oldTick = vi.fn();
      old.onRetire(oldStop);
      old.every(oldTick, 1000);

      const fresh = await load();
      fresh.claimPage();
      const freshStop = vi.fn();
      fresh.onRetire(freshStop);

      expect(oldStop).toHaveBeenCalledOnce();
      expect(freshStop).not.toHaveBeenCalled();
      vi.advanceTimersByTime(3000);
      expect(oldTick).not.toHaveBeenCalled();

      const late = vi.fn();
      old.onRetire(late);
      expect(late).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
