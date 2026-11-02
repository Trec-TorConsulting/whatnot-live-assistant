// Finding things to buy: show titles matching your keywords, and when your watchlist items have
// sold cheapest in the sales you've seen.
import { matchKeywords } from './alerts';
import type { WatchItem } from './buyer';
import { formatMoney } from './money';
import type { SoldItem } from './soldHistory';

export interface ShowSeen {
  liveId: string;
  title: string;
  host: string | null;
  // null: live now.
  startsAt: number | null;
}

export interface ShowMatch extends ShowSeen {
  keyword: string;
  seenAt: number;
}

export const MAX_SHOW_MATCHES = 200;

export const matchShows = (shows: ShowSeen[], keywords: string[], now: number): ShowMatch[] =>
  shows.flatMap((s) => {
    const hit = matchKeywords(`${s.title} ${s.host ?? ''}`, keywords)[0];
    return hit ? [{ ...s, keyword: hit, seenAt: now }] : [];
  });

// Newest sighting wins; shows that ended more than 6 hours ago drop off.
export const mergeShowMatches = (current: ShowMatch[], incoming: ShowMatch[], now: number) => {
  const byId = new Map(current.map((m) => [m.liveId, m]));
  for (const m of incoming) byId.set(m.liveId, m);
  return [...byId.values()]
    .filter((m) => (m.startsAt ?? m.seenAt) > now - 6 * 60 * 60 * 1000)
    .sort((a, b) => (a.startsAt ?? a.seenAt) - (b.startsAt ?? b.seenAt))
    .slice(0, MAX_SHOW_MATCHES);
};

// --- Best time to buy ---

export const DAYPARTS = [
  { label: 'late night', from: 22, to: 5 },
  { label: 'morning', from: 5, to: 12 },
  { label: 'afternoon', from: 12, to: 17 },
  { label: 'evening', from: 17, to: 22 },
] as const;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const daypart = (t: number) => {
  const h = new Date(t).getHours();
  return DAYPARTS.find((d) => (d.from < d.to ? h >= d.from && h < d.to : h >= d.from || h < d.to))!.label;
};

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};

export interface BestTime {
  item: string;
  sales: number;
  overall: number;
  bucket: string;
  bucketMedian: number;
  bucketSales: number;
}

const MIN_SALES = 8;
const MIN_BUCKET = 3;

const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9.]+/).filter(Boolean));

// For each watchlist item with enough matching sales: the weekday or time of day whose median sale
// is lowest, if it's at least 10% under the item's overall median. Too few sales gives nothing.
export const bestTimes = (sold: SoldItem[], watchlist: WatchItem[]): BestTime[] =>
  watchlist.flatMap((w) => {
    const hits = sold.filter((s) => {
      const have = words(s.title);
      return w.words.every((x) => have.has(x));
    });
    if (hits.length < MIN_SALES) return [];
    const overall = median(hits.map((h) => h.price));
    const buckets = new Map<string, number[]>();
    for (const h of hits) {
      for (const key of [daypart(h.at), WEEKDAYS[new Date(h.at).getDay()]!]) buckets.set(key, [...(buckets.get(key) ?? []), h.price]);
    }
    let best: { bucket: string; m: number; n: number } | null = null;
    for (const [bucket, prices] of buckets) {
      if (prices.length < MIN_BUCKET) continue;
      const m = median(prices);
      if (!best || m < best.m) best = { bucket, m, n: prices.length };
    }
    if (!best || best.m > overall * 0.9) return [];
    return [{ item: w.text, sales: hits.length, overall, bucket: best.bucket, bucketMedian: best.m, bucketSales: best.n }];
  });

export const bestTimeLine = (b: BestTime) =>
  `${b.item}: cheapest ${WEEKDAYS.includes(b.bucket) ? `on ${b.bucket}` : `in the ${b.bucket}`}, median ${formatMoney(b.bucketMedian)} vs ${formatMoney(b.overall)} overall (${b.bucketSales} of ${b.sales} sales)`;
