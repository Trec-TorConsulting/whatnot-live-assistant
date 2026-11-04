import { toUsd } from './currency';
import { DAY } from './time';

export interface Purchase {
  key: string;
  at: number;
  liveId: string | null;
  showTitle: string | null;
  host: string | null;
  title: string;
  price: number;
  currency?: string | null;
  priceUsd?: number | null;
  kind: 'auction' | 'buy_now' | 'giveaway' | 'manual' | 'unknown';
  appraisedValue: number | null;
  meltValue: number | null;
  appraisalId: string | null;
  source: 'auto' | 'manual';
  // Fine metal from the appraisal, so the portfolio can revalue it at today's spot.
  metal?: string | null;
  oz?: number | null;
}

export const purchaseUsd = (p: Pick<Purchase, 'price' | 'currency' | 'priceUsd'>, rate?: number | null): number | null => {
  if (p.priceUsd !== undefined) return p.priceUsd;
  const code = (p.currency ?? 'USD').toUpperCase();
  if (code !== 'USD') return rate ? toUsd(p.price, code, rate) : null;
  return p.price;
};

export const MAX_PURCHASES = 2000;

export const purchaseKey = (p: Pick<Purchase, 'liveId' | 'title' | 'price' | 'at'> & { productId?: string | null }) =>
  [p.liveId ?? 'manual', p.productId ?? p.title.toLowerCase().trim(), p.price.toFixed(2), p.liveId ? '' : Math.floor(p.at / 60_000)].join('|');

export const addPurchase = (list: Purchase[], p: Purchase): { list: Purchase[]; added: boolean } => {
  if (list.some((x) => x.key === p.key)) return { list, added: false };
  const next = [...list, p].sort((a, b) => a.at - b.at);
  return { list: next.length > MAX_PURCHASES ? next.slice(next.length - MAX_PURCHASES) : next, added: true };
};

const startOfDay = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const startOfMonth = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  return d.getTime();
};

export interface SpendSummary {
  today: number;
  thisMonth: number;
  allTime: number;
  count: number;
  unconvertedCount?: number;
  days: { day: number; total: number }[];
  shows: { liveId: string; title: string; total: number; count: number }[];
  appraisedPaid: number;
  appraisedValue: number;
}

export const summarizeSpend = (list: Purchase[], now: number): SpendSummary => {
  const today = startOfDay(now);
  const month = startOfMonth(now);
  const days = Array.from({ length: 7 }, (_, i) => ({ day: today - (6 - i) * DAY, total: 0 }));
  const shows = new Map<string, { liveId: string; title: string; total: number; count: number }>();
  let todayTotal = 0;
  let monthTotal = 0;
  let allTime = 0;
  let appraisedPaid = 0;
  let appraisedValue = 0;
  let unconvertedCount = 0;

  for (const p of list) {
    const usd = purchaseUsd(p);
    if (usd === null) {
      unconvertedCount += 1;
      continue;
    }
    allTime += usd;
    if (p.at >= today) todayTotal += usd;
    if (p.at >= month) monthTotal += usd;
    const bucket = days.find((d) => p.at >= d.day && p.at < d.day + DAY);
    if (bucket) bucket.total += usd;
    if (p.liveId) {
      const s = shows.get(p.liveId) ?? { liveId: p.liveId, title: p.showTitle ?? p.host ?? p.liveId, total: 0, count: 0 };
      s.total += usd;
      s.count += 1;
      shows.set(p.liveId, s);
    }
    if (p.appraisedValue !== null) {
      appraisedPaid += usd;
      appraisedValue += p.appraisedValue;
    }
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    today: round(todayTotal),
    thisMonth: round(monthTotal),
    allTime: round(allTime),
    count: list.length,
    unconvertedCount,
    days: days.map((d) => ({ ...d, total: round(d.total) })),
    shows: Array.from(shows.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
      .map((s) => ({ ...s, total: round(s.total) })),
    appraisedPaid: round(appraisedPaid),
    appraisedValue: round(appraisedValue),
  };
};

export const spentInShow = (list: Purchase[], liveId: string) =>
  Math.round(
    list
      .filter((p) => p.liveId === liveId)
      .reduce((n, p) => {
        const usd = purchaseUsd(p);
        return usd !== null ? n + usd : n;
      }, 0) * 100,
  ) / 100;

const STOP = new Set(['the', 'a', 'of', 'and', 'with', 'coin', 'coins', 'lot', 'oz', 'us', 'usa', 'one', 'in', 'for']);
export const titleTokens = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9/ ]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1 && !STOP.has(t)),
  );

// "You already own this": past purchases sharing most meaningful words (and any year) with the item.
export const findSimilarPurchases = (name: string, list: Purchase[], limit = 3): Purchase[] => {
  const want = titleTokens(name);
  if (want.size === 0) return [];
  const years = [...want].filter((t) => /^(1[6-9]\d\d|20\d\d)$/.test(t));
  return list
    .map((p) => {
      const have = titleTokens(p.title);
      if (years.length && !years.some((y) => have.has(y))) return { p, score: 0 };
      const overlap = [...want].filter((t) => have.has(t)).length;
      return { p, score: overlap / want.size };
    })
    .filter((x) => x.score >= 0.75)
    .sort((a, b) => b.score - a.score || b.p.at - a.p.at)
    .slice(0, limit)
    .map((x) => x.p);
};

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const purchasesCsv = (list: Purchase[]) =>
  [
    ['date', 'title', 'price', 'kind', 'show', 'host', 'appraised_value', 'melt_value'].join(','),
    ...list.map((p) =>
      [new Date(p.at).toISOString(), p.title, p.price.toFixed(2), p.kind, p.showTitle, p.host, p.appraisedValue, p.meltValue]
        .map(csvCell)
        .join(','),
    ),
  ].join('\n');
