// Runs async critical sections one at a time, in call order.
export const createLock = () => {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(fn: () => Promise<T> | T): Promise<T> => {
    const run = tail.then(fn);
    tail = run.catch(() => undefined);
    return run;
  };
};
