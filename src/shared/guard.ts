import type { PeriodSpend } from './buyer';
import type { Lot } from './live';
import { formatMoney } from './money';

export interface GuardSettings {
  defaultMaxBid: number;
  showBudget: number;
  dailyBudget: number;
  weeklyBudget: number;
  monthlyBudget: number;
  lotMax: Record<string, number>;
  maxBidPercent: number;
  warnOverMarket: boolean;
  confirmOverMax: boolean;
}

export const DEFAULT_GUARD_SETTINGS: GuardSettings = {
  defaultMaxBid: 0,
  showBudget: 0,
  dailyBudget: 0,
  weeklyBudget: 0,
  monthlyBudget: 0,
  lotMax: {},
  maxBidPercent: 80,
  warnOverMarket: true,
  confirmOverMax: true,
};

const money = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : fallback);

export const sanitizeGuardSettings = (input: unknown): GuardSettings => {
  const s = (input ?? {}) as Partial<GuardSettings>;
  const d = DEFAULT_GUARD_SETTINGS;
  const lotMax: Record<string, number> = {};
  for (const [k, v] of Object.entries(s.lotMax ?? {}).slice(-200)) {
    const n = money(v, -1);
    if (n > 0) lotMax[k] = n;
  }
  return {
    defaultMaxBid: money(s.defaultMaxBid, d.defaultMaxBid),
    showBudget: money(s.showBudget, d.showBudget),
    dailyBudget: money(s.dailyBudget, d.dailyBudget),
    weeklyBudget: money(s.weeklyBudget, d.weeklyBudget),
    monthlyBudget: money(s.monthlyBudget, d.monthlyBudget),
    lotMax,
    maxBidPercent: Math.min(100, Math.max(10, Math.round(money(s.maxBidPercent, d.maxBidPercent)))),
    warnOverMarket: typeof s.warnOverMarket === 'boolean' ? s.warnOverMarket : d.warnOverMarket,
    confirmOverMax: typeof s.confirmOverMax === 'boolean' ? s.confirmOverMax : d.confirmOverMax,
  };
};

export type GuardLevel = 'ok' | 'near' | 'over';

export type CeilingSource = 'lot' | 'watch' | 'default' | 'budget' | 'daily' | 'weekly' | 'monthly' | 'appraisal';

export interface GuardStatus {
  level: GuardLevel;
  ceiling: number | null;
  ceilingSource: CeilingSource | null;
  reasons: string[];
}

export interface GuardInput {
  bid: number | null;
  lot: Pick<Lot, 'id'> | null;
  settings: GuardSettings;
  spentThisShow: number;
  spentByPeriod?: PeriodSpend;
  // Your max from a watchlist entry matching this lot's title.
  watchMax?: number | null;
  appraisal: { marketValue: number | null; suggestedMax: number | null } | null;
}

const NEAR_SHARE = 0.9;

const CEILING_LABEL: Record<CeilingSource, string> = {
  lot: 'your max for this lot',
  watch: 'your watchlist max',
  default: 'your max bid',
  budget: 'your remaining show budget',
  daily: "what's left of today's budget",
  weekly: "what's left of this week's budget",
  monthly: "what's left of this month's budget",
  appraisal: 'the suggested max',
};

// The ceiling is the tightest of: this lot's max (or your watchlist max), your default max, what's
// left of the show, day, week, and month budgets, and (when an appraisal exists) its suggested max.
export const guardStatus = ({ bid, lot, settings, spentThisShow, spentByPeriod, watchMax, appraisal }: GuardInput): GuardStatus => {
  const ceilings: { value: number; source: CeilingSource }[] = [];
  const lotMax = lot?.id ? settings.lotMax[lot.id] : undefined;
  const ownMax = lotMax ?? watchMax ?? undefined;
  if (lotMax) ceilings.push({ value: lotMax, source: 'lot' });
  else if (watchMax) ceilings.push({ value: watchMax, source: 'watch' });
  else if (settings.defaultMaxBid > 0) ceilings.push({ value: settings.defaultMaxBid, source: 'default' });
  if (settings.showBudget > 0) ceilings.push({ value: Math.max(0, settings.showBudget - spentThisShow), source: 'budget' });
  const periods = [
    ['daily', settings.dailyBudget, spentByPeriod?.day],
    ['weekly', settings.weeklyBudget, spentByPeriod?.week],
    ['monthly', settings.monthlyBudget, spentByPeriod?.month],
  ] as const;
  for (const [source, budget, spent] of periods) {
    if (budget > 0) ceilings.push({ value: Math.max(0, Math.round((budget - (spent ?? 0)) * 100) / 100), source });
  }
  if (!ownMax && appraisal?.suggestedMax) ceilings.push({ value: appraisal.suggestedMax, source: 'appraisal' });

  const tightest = ceilings.reduce<(typeof ceilings)[number] | null>((a, b) => (!a || b.value < a.value ? b : a), null);
  const reasons: string[] = [];
  let level: GuardLevel = 'ok';

  if (bid !== null && tightest) {
    if (bid > tightest.value) {
      level = 'over';
      reasons.push(`${formatMoney(bid)} is over ${CEILING_LABEL[tightest.source]} (${formatMoney(tightest.value)})`);
    } else if (bid >= tightest.value * NEAR_SHARE) {
      level = 'near';
      reasons.push(`${formatMoney(bid)} is close to your ceiling (${formatMoney(tightest.value)})`);
    }
  }
  if (bid !== null && settings.warnOverMarket && appraisal?.marketValue && bid > appraisal.marketValue) {
    level = 'over';
    reasons.push(`${formatMoney(bid)} is above the appraised market value (${formatMoney(appraisal.marketValue)})`);
  }
  return { level, ceiling: tightest?.value ?? null, ceilingSource: tightest?.source ?? null, reasons };
};

// "Bid $25", "$25", "Place bid: $1,200" -> 25 / 1200. Plain "Bid" buttons resolve elsewhere.
export const parseBidButton = (label: string): number | null => {
  const t = label.replace(/\s+/g, ' ').trim();
  if (t.length > 40) return null;
  const m = t.match(/^(?:(?:place\s+)?bid:?\s*)?\$\s?([\d,]+(?:\.\d{1,2})?)$/i);
  return m?.[1] ? parseFloat(m[1].replace(/,/g, '')) : null;
};
