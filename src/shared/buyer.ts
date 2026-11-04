// Buyer helpers: watchlist, spending limits by period, alerts while bidding, seller notes, and
// quick chat lines. Alerts only; nothing here ever places a bid.
import type { Lot, Sale } from './live';
import { formatMoney } from './money';
import { purchaseUsd, type Purchase } from './purchases';
import { DAY } from './time';

export interface WatchItem {
  words: string[];
  max: number | null;
  text: string;
}

export interface BuyerSettings {
  watchlist: WatchItem[];
  outbid: boolean;
  lastSeconds: number;
  mentions: boolean;
  sound: boolean;
  tiltLosses: number;
  chatTemplates: string[];
  // Your sales tax rate, for all-in prices.
  taxPercent: number;
  // Whatnot's seller fee for the flip calculator.
  feePercent: number;
  // Words to look for in show titles on any Whatnot page you browse.
  showKeywords: string[];
}

export const DEFAULT_CHAT_TEMPLATES = [
  'What year is it?',
  'Can you show the back?',
  'Is it graded or raw?',
  'Can you show it closer?',
];

export const DEFAULT_BUYER_SETTINGS: BuyerSettings = {
  watchlist: [],
  outbid: true,
  lastSeconds: 5,
  mentions: true,
  sound: true,
  tiltLosses: 3,
  chatTemplates: DEFAULT_CHAT_TEMPLATES,
  taxPercent: 0,
  feePercent: 10.9,
  showKeywords: [],
};

const MAX_WATCH = 100;
const MAX_TEMPLATES = 8;
const CHAT_MAX = 150;

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9$.\s]/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^\.+|\.+$/g, ''))
    .filter(Boolean);

// "silver eagle 2021 $35": every word has to be in the lot title; a trailing $ amount is your max.
export const parseWatchLine = (line: string): WatchItem | null => {
  const text = line.trim().replace(/\s+/g, ' ');
  if (!text) return null;
  const m = text.match(/\$\s?([\d,]+(?:\.\d{1,2})?)\s*$/);
  const max = m ? parseFloat(m[1]!.replace(/,/g, '')) : null;
  const w = words(m ? text.slice(0, m.index) : text).filter((x) => !x.startsWith('$'));
  if (!w.length) return null;
  return { words: w, max: max && max > 0 ? Math.round(max * 100) / 100 : null, text };
};

export const parseWatchlist = (text: string) =>
  text
    .split('\n')
    .map(parseWatchLine)
    .filter((x): x is WatchItem => Boolean(x))
    .slice(0, MAX_WATCH);

export const watchLine = (w: WatchItem) => w.text;

const tokenSet = (s: string) => new Set(words(s).map((t) => t.replace(/^\$/, '')));

// The entry with the most words wins, so "1921 morgan" beats "morgan".
export const matchWatch = (title: string | null, list: WatchItem[]): WatchItem | null => {
  if (!title) return null;
  const have = tokenSet(title);
  let best: WatchItem | null = null;
  for (const w of list) if (w.words.every((x) => have.has(x)) && (!best || w.words.length > best.words.length)) best = w;
  return best;
};

const clampInt = (v: unknown, lo: number, hi: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : fallback;

export const sanitizeBuyerSettings = (input: unknown): BuyerSettings => {
  const s = (input ?? {}) as Partial<BuyerSettings>;
  const d = DEFAULT_BUYER_SETTINGS;
  const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
  const watchlist = Array.isArray(s.watchlist)
    ? s.watchlist.map((w) => parseWatchLine(String((w as WatchItem)?.text ?? ''))).filter((w): w is WatchItem => Boolean(w)).slice(0, MAX_WATCH)
    : d.watchlist;
  const templates = Array.isArray(s.chatTemplates)
    ? s.chatTemplates.map((t) => String(t).replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX)).filter(Boolean).slice(0, MAX_TEMPLATES)
    : d.chatTemplates;
  return {
    watchlist,
    outbid: bool(s.outbid, d.outbid),
    lastSeconds: clampInt(s.lastSeconds, 0, 30, d.lastSeconds),
    mentions: bool(s.mentions, d.mentions),
    sound: bool(s.sound, d.sound),
    tiltLosses: clampInt(s.tiltLosses, 0, 20, d.tiltLosses),
    chatTemplates: templates,
    taxPercent: clampMoney(s.taxPercent, 0, 20, d.taxPercent),
    feePercent: clampMoney(s.feePercent, 0, 40, d.feePercent),
    showKeywords: Array.isArray(s.showKeywords)
      ? [...new Set(s.showKeywords.map((k) => String(k).trim().toLowerCase()).filter((k) => k.length >= 2 && k.length <= 40))].slice(0, 30)
      : d.showKeywords,
  };
};

const clampMoney = (v: unknown, lo: number, hi: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v * 100) / 100)) : fallback;

// --- Following your bids ---

type LotLike = Pick<Lot, 'id' | 'title' | 'leader' | 'status' | 'currentBid' | 'endsAt'>;

export type BuyerEvent =
  | { kind: 'outbid'; key: string; by: string; bid: number | null; title: string | null }
  | { kind: 'loss_streak'; losses: number }
  | { kind: 'closing'; key: string; secondsLeft: number; state: 'leading' | 'outbid' | 'watch'; title: string | null };

const lotKey = (lot: Pick<Lot, 'id' | 'title'>) => lot.id ?? lot.title ?? null;

// Which lots you've led and who leads each now; a loss is a lot you led that sold to someone else.
export class BidTracker {
  private led = new Set<string>();
  private leaderOf = new Map<string, string>();
  private closingAt = new Map<string, number>();
  private losses = 0;
  private username: () => string;

  constructor(username: () => string) {
    this.username = username;
  }

  private isMe(user: string | null | undefined) {
    const me = this.username();
    return Boolean(me && user && user.toLowerCase() === me.toLowerCase());
  }

  you(lot: LotLike | null): 'leading' | 'outbid' | null {
    if (!lot || !this.username()) return null;
    if (this.isMe(lot.leader)) return 'leading';
    const key = lotKey(lot);
    return key && this.led.has(key) && lot.status === 'active' ? 'outbid' : null;
  }

  // Updates without a leader say nothing about who's on top, so they don't count as an outbid.
  lot(lot: LotLike): BuyerEvent[] {
    const key = lotKey(lot);
    if (!key || !lot.leader) return [];
    const prev = this.leaderOf.get(key);
    this.leaderOf.set(key, lot.leader);
    if (this.isMe(lot.leader)) {
      this.led.add(key);
      return [];
    }
    return this.isMe(prev) && lot.status === 'active' ? [{ kind: 'outbid', key, by: lot.leader, bid: lot.currentBid, title: lot.title }] : [];
  }

  sale(sale: Pick<Sale, 'productId' | 'title' | 'buyer' | 'kind'>, streakAt: number): BuyerEvent[] {
    if (sale.kind === 'giveaway') return [];
    if (this.isMe(sale.buyer)) {
      this.losses = 0;
      return [];
    }
    const key = sale.productId ?? sale.title;
    if (!key || !this.led.has(key)) return [];
    this.led.delete(key);
    this.losses += 1;
    return streakAt > 0 && this.losses >= streakAt ? [{ kind: 'loss_streak', losses: this.losses }] : [];
  }

  // Soft close: a late bid pushes the end time back, which counts as a new close.
  closing(lot: LotLike | null, now: number, seconds: number, watched: boolean): BuyerEvent | null {
    if (!lot?.endsAt || lot.status !== 'active' || seconds <= 0) return null;
    const left = lot.endsAt - now;
    if (left <= 0 || left > seconds * 1000) return null;
    const you = this.you(lot);
    if (!you && !watched) return null;
    const key = lotKey(lot);
    if (!key) return null;
    const prev = this.closingAt.get(key);
    if (prev && lot.endsAt - prev < 1500) return null;
    this.closingAt.set(key, lot.endsAt);
    return { kind: 'closing', key, secondsLeft: Math.ceil(left / 1000), state: you ?? 'watch', title: lot.title };
  }

  // A new show starts with a clean slate of lots; the loss streak carries over.
  resetShow() {
    this.led.clear();
    this.leaderOf.clear();
    this.closingAt.clear();
  }
}

// --- Spending by period ---

export interface PeriodSpend {
  day: number;
  week: number;
  month: number;
}

// Weeks start on Monday.
export const periodStarts = (now: number) => {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  const week = new Date(day);
  week.setDate(week.getDate() - ((week.getDay() + 6) % 7));
  const month = new Date(day);
  month.setDate(1);
  return { day: day.getTime(), week: week.getTime(), month: month.getTime() };
};

export const spentByPeriod = (list: Purchase[], now: number): PeriodSpend => {
  const s = periodStarts(now);
  const out = { day: 0, week: 0, month: 0 };
  for (const p of list) {
    const usd = purchaseUsd(p);
    if (usd === null) continue;
    if (p.at >= s.day) out.day += usd;
    if (p.at >= s.week) out.week += usd;
    if (p.at >= s.month) out.month += usd;
  }
  const r = (n: number) => Math.round(n * 100) / 100;
  return { day: r(out.day), week: r(out.week), month: r(out.month) };
};

// --- Sellers ---

export interface SellerNote {
  note: string;
  blocked: boolean;
  at: number;
}

export const sellerKey = (host: string) => host.trim().replace(/^@/, '').toLowerCase();

export const sanitizeSellerNotes = (input: unknown): Record<string, SellerNote> => {
  const out: Record<string, SellerNote> = {};
  for (const [k, v] of Object.entries((input ?? {}) as Record<string, Partial<SellerNote>>).slice(-1000)) {
    const note = String(v?.note ?? '').trim().slice(0, 300);
    const blocked = v?.blocked === true;
    if (note || blocked) out[sellerKey(k)] = { note, blocked, at: typeof v?.at === 'number' ? v.at : 0 };
  }
  return out;
};

export interface SellerHistory {
  wins: number;
  total: number;
  average: number;
  appraisedPaid: number;
  appraisedValue: number;
  thisShow: number;
  lastAt: number | null;
}

export const sellerHistory = (list: Purchase[], host: string, liveId: string | null): SellerHistory => {
  const key = sellerKey(host);
  const mine = list.filter((p) => p.host && sellerKey(p.host) === key && p.kind !== 'giveaway');
  const priced = mine.filter((p) => purchaseUsd(p) !== null);
  const total = priced.reduce((n, p) => n + (purchaseUsd(p) ?? 0), 0);
  const appraised = priced.filter((p) => p.appraisedValue !== null);
  const r = (n: number) => Math.round(n * 100) / 100;
  return {
    wins: mine.length,
    total: r(total),
    average: priced.length ? r(total / priced.length) : 0,
    appraisedPaid: r(appraised.reduce((n, p) => n + (purchaseUsd(p) ?? 0), 0)),
    appraisedValue: r(appraised.reduce((n, p) => n + (p.appraisedValue ?? 0), 0)),
    thisShow: liveId ? list.filter((p) => p.liveId === liveId).length : 0,
    lastAt: mine.length ? Math.max(...mine.map((p) => p.at)) : null,
  };
};

// One short line for the on-page panel; null when there's nothing worth saying.
export const sellerLine = (h: SellerHistory, now: number): string | null => {
  const parts: string[] = [];
  if (h.wins) {
    const ago = h.lastAt ? Math.round((now - h.lastAt) / DAY) : null;
    parts.push(`You've won ${h.wins} from them (${formatMoney(h.total)}, avg ${formatMoney(h.average)})${ago !== null ? `, last ${ago ? `${ago}d ago` : 'today'}` : ''}`);
  }
  if (h.appraisedPaid > 0 && h.appraisedValue > 0) {
    const pct = Math.round((h.appraisedPaid / h.appraisedValue) * 100);
    parts.push(`paid ${pct}% of appraised`);
  }
  return parts.length ? parts.join(' · ') : null;
};

// --- Chat ---

export const mentionsUser = (text: string, username: string) =>
  Boolean(username) && new RegExp(`(^|[^\\w.])@${username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\w.])`, 'i').test(text);

// A question to send the seller, from what the appraisal is unsure about.
export const askSeller = (cautions: string[], subtitle: string | null): string | null => {
  const all = cautions.join(' ').toLowerCase();
  if (/not for|does not match|check the slab/.test(all)) return 'Can you show the cert number on the slab up close?';
  if (/faked|altered/.test(all)) return 'Can you show the date and mint mark up close, front and back?';
  if (/not sure what this is/.test(all)) return 'What is this exactly? Can you show it closer, front and back?';
  if (/priciest in this lot/.test(all)) return 'Which item is this lot for exactly?';
  if (subtitle && /low confidence/i.test(subtitle)) return 'Can you show it closer, front and back?';
  return null;
};
