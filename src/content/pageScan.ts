// On any Whatnot page: show cards are checked against your show keywords, and the Purchases list
// (Activity → Purchases) is read into your order tracker. Both only read what's on screen.
import { parseShowTime } from '../shared/alerts';
import type { ShowSeen } from '../shared/discover';
import { send } from '../shared/messages';
import { parseOrderLines } from '../shared/orders';
import { onRetire } from './lifecycle';
import { describeShowCard, findOrderCards, findShowCards, isLivePath } from './selectors';

const SCAN_DELAY_MS = 2000;
let timer: ReturnType<typeof setTimeout> | undefined;
let lastShows = '';
let lastOrders = '';

const scanShows = () => {
  const now = Date.now();
  const shows: ShowSeen[] = findShowCards().map(({ liveId, card }) => {
    const { timeText, title, host } = describeShowCard(card);
    const live = /\blive\b/i.test((card as HTMLElement).innerText ?? '') && !timeText;
    return { liveId, title, host, startsAt: live ? null : timeText ? parseShowTime(timeText, now) : null };
  });
  const usable = shows.filter((s) => s.title);
  const fingerprint = usable.map((s) => s.liveId).join(',');
  if (!usable.length || fingerprint === lastShows) return;
  lastShows = fingerprint;
  void send('SHOWS_SEEN', { shows: usable.slice(0, 200) }).catch(() => undefined);
};

const scanOrders = () => {
  const now = Date.now();
  const orders = findOrderCards().flatMap((c) => {
    const o = parseOrderLines(c.id, c.lines, c.image, now);
    return o ? [o] : [];
  });
  const fingerprint = orders.map((o) => `${o.id}:${o.status}:${o.deliveryAt}`).join(',');
  if (!orders.length || fingerprint === lastOrders) return;
  lastOrders = fingerprint;
  void send('ORDERS_SAVE', { orders }).catch(() => undefined);
};

const scan = () => {
  scanShows();
  scanOrders();
};

// Throttled, not debounced: a live page's chat changes the DOM nonstop, which would keep a debounce
// from ever firing. Live pages change the most and list the fewest shows, so they're read less often.
export const startPageScan = () => {
  const schedule = () => {
    if (timer) return;
    timer = setTimeout(
      () => {
        timer = undefined;
        scan();
      },
      isLivePath() ? SCAN_DELAY_MS * 5 : SCAN_DELAY_MS,
    );
  };
  schedule();
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  onRetire(() => {
    observer.disconnect();
    clearTimeout(timer);
  });
};
