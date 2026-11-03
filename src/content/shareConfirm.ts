// A share counts only after Whatnot's LogShare response. Timeout means the click never registered.
export type ShareRecord = 'recorded' | 'refused' | 'timeout';

export const waitForShareRecord = (
  subscribe: (onResult: (ok: boolean) => void) => () => void,
  timeoutMs: number,
): { promise: Promise<ShareRecord>; cancel: () => void } => {
  let settled = false;
  let resolve: (result: ShareRecord) => void = () => undefined;
  const promise = new Promise<ShareRecord>((res) => {
    resolve = res;
  });
  const finish = (result: ShareRecord) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    unsubscribe();
    resolve(result);
  };
  const unsubscribe = subscribe((ok) => finish(ok ? 'recorded' : 'refused'));
  const timer = setTimeout(() => finish('timeout'), timeoutMs);
  // Stop abandons the wait. Resolving it as a timeout would start another click.
  return {
    promise,
    cancel: () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
    },
  };
};
