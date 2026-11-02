// On profile pages, remember bookmarked upcoming shows so "starting soon" alerts can fire later.
import { parseShowTime } from '../shared/alerts';
import { send } from '../shared/messages';
import { onRetire } from './lifecycle';
import { bookmarkForCard, describeShowCard, findShowCards, isProfilePath } from './selectors';

let timer: ReturnType<typeof setTimeout> | undefined;
let lastSent = '';

const scan = () => {
  if (!isProfilePath()) return;
  const now = Date.now();
  const shows = findShowCards().flatMap(({ liveId, card }) => {
    if (bookmarkForCard(card)?.state !== 'bookmarked') return [];
    const { timeText, title, host } = describeShowCard(card);
    const startsAt = timeText ? parseShowTime(timeText, now) : null;
    return startsAt ? [{ liveId, title, host, startsAt, seenAt: now }] : [];
  });
  const fingerprint = shows.map((s) => `${s.liveId}@${s.startsAt}`).join(',');
  if (!shows.length || fingerprint === lastSent) return;
  lastSent = fingerprint;
  void send('WATCH_SHOWS', { shows }).catch(() => undefined);
};

export const scheduleProfileScan = (delayMs = 1500) => {
  clearTimeout(timer);
  timer = setTimeout(scan, delayMs);
};

export const startProfileWatch = () => {
  scheduleProfileScan(3000);
  const observer = new MutationObserver(() => {
    if (isProfilePath()) scheduleProfileScan();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  onRetire(() => {
    observer.disconnect();
    clearTimeout(timer);
  });
};
