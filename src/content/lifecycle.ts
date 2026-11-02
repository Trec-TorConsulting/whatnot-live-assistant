// After the extension is reloaded or updated, this copy of the content script keeps running in open
// tabs but can no longer reach the extension. The background injects a fresh copy, and this one stops
// so the two don't both guard bids, raise alerts, appraise, and fight over the panel.
const RETIRE_EVENT = 'wn2-retire';
let retired = false;
const stops: (() => void)[] = [];

export const contextAlive = () => !retired && Boolean(globalThis.chrome?.runtime?.id);

export const onRetire = (stop: () => void) => {
  if (retired) stop();
  else stops.push(stop);
};

export const every = (fn: () => void, ms: number) => {
  const id = setInterval(fn, ms);
  onRetire(() => clearInterval(id));
};

const retire = () => {
  if (retired) return;
  retired = true;
  for (const stop of stops.splice(0)) {
    try {
      stop();
    } catch {
      // The rest still stop.
    }
  }
};

// Tells any older copy in this tab to stop, then listens for a newer one. Both copies share the
// page's DOM, so the event reaches across them.
export const claimPage = () => {
  document.dispatchEvent(new Event(RETIRE_EVENT));
  document.addEventListener(RETIRE_EVENT, retire, { once: true });
};
