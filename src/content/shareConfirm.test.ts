import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitForShareRecord } from './shareConfirm';

afterEach(() => {
  vi.useRealTimers();
});

describe('waitForShareRecord', () => {
  it('records a successful LogShare and ignores anything after', async () => {
    let report: (ok: boolean) => void = () => undefined;
    const { promise } = waitForShareRecord((onResult) => {
      report = onResult;
      return () => undefined;
    }, 8000);
    report(true);
    report(false);
    await expect(promise).resolves.toBe('recorded');
  });

  it('stops on a refused LogShare', async () => {
    let report: (ok: boolean) => void = () => undefined;
    const { promise } = waitForShareRecord((onResult) => {
      report = onResult;
      return () => undefined;
    }, 8000);
    report(false);
    await expect(promise).resolves.toBe('refused');
  });

  it('times out when Whatnot never answers', async () => {
    vi.useFakeTimers();
    const { promise } = waitForShareRecord(() => () => undefined, 8000);
    const result = promise.then((value) => value);
    await vi.advanceTimersByTimeAsync(7999);
    let settled = false;
    void result.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe('timeout');
  });

  it('drops the listener when cancelled', async () => {
    vi.useFakeTimers();
    const unsubscribe = vi.fn();
    let report: (ok: boolean) => void = () => undefined;
    const { promise, cancel } = waitForShareRecord((onResult) => {
      report = onResult;
      return unsubscribe;
    }, 8000);
    cancel();
    report(true);
    await vi.advanceTimersByTimeAsync(8000);
    let settled = false;
    void promise.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
