// What a win really costs (bid, shipping, tax), what it would bring back if resold on Whatnot, and
// what everything you've bought is worth today.
import { formatMoney } from './money';
import type { Purchase } from './purchases';

const round = (n: number) => Math.round(n * 100) / 100;

// The show's line under the bid button: "Shipping is $4.85 + Taxes" or "Free Shipping".
export const parseShipping = (text: string | null | undefined): number | null => {
  if (!text) return null;
  if (/free\s+shipping/i.test(text)) return 0;
  const m = text.match(/shipping[^$]*\$\s?([\d,]+(?:\.\d{1,2})?)/i);
  return m ? parseFloat(m[1]!.replace(/,/g, '')) : null;
};

export interface AllIn {
  total: number;
  shipping: number | null;
  tax: number;
  shippingPaid: boolean;
}

// Tax is your rate on the bid; states differ on taxing shipping, so it isn't. A win already in this
// show usually means shipping is paid, so it isn't added again.
export const allInPrice = (bid: number, shipping: number | null, taxPercent: number, shippingPaid: boolean): AllIn => {
  const tax = round((bid * taxPercent) / 100);
  const ship = shippingPaid ? 0 : (shipping ?? 0);
  return { total: round(bid + tax + ship), shipping, tax, shippingPaid };
};

export const allInLine = (a: AllIn, taxPercent: number) => {
  const parts = [
    a.shippingPaid ? 'shipping already paid this show' : a.shipping === null ? 'shipping unknown' : a.shipping === 0 ? 'free shipping' : `ship ${formatMoney(a.shipping)}`,
    taxPercent > 0 ? `tax ${formatMoney(a.tax)}` : null,
  ].filter(Boolean);
  return `All-in ${formatMoney(a.total)} (${parts.join(' + ')})`;
};

// --- Reselling ---

// Whatnot's seller fees: 8% commission plus 2.9% + $0.30 payment processing, on the sale price.
export const DEFAULT_FEE_PERCENT = 10.9;
export const DEFAULT_FEE_FIXED = 0.3;

export interface Flip {
  resale: number;
  fees: number;
  net: number;
  cost: number;
  profit: number;
  margin: number | null;
}

export const flipProfit = (resale: number, cost: number, feePercent = DEFAULT_FEE_PERCENT, feeFixed = DEFAULT_FEE_FIXED): Flip => {
  const fees = resale > 0 ? round((resale * feePercent) / 100 + feeFixed) : 0;
  const net = round(resale - fees);
  const profit = round(net - cost);
  return { resale, fees, net, cost, profit, margin: cost > 0 ? Math.round((profit / cost) * 100) : null };
};

export const flipLine = (f: Flip) =>
  `Resell ~${formatMoney(f.resale)}, keep ${formatMoney(f.net)} after fees: ${f.profit >= 0 ? '+' : '−'}${formatMoney(Math.abs(f.profit))}${f.margin !== null ? ` (${f.margin}%)` : ''} on ${formatMoney(f.cost)}`;

// --- Portfolio ---

export interface Portfolio {
  count: number;
  valued: number;
  cost: number;
  valuedCost: number;
  value: number;
  gain: number;
}

// An item is worth the higher of its appraisal and its metal at today's spot. Items with neither
// are counted but not valued, so the gain only compares like with like.
export const portfolioValue = (list: Purchase[], spot: Partial<Record<string, number | null>>): Portfolio => {
  let cost = 0;
  let valuedCost = 0;
  let value = 0;
  let valued = 0;
  for (const p of list) {
    cost += p.price;
    const live = p.metal && p.oz ? spot[p.metal] : null;
    const melt = live && p.oz ? p.oz * live : null;
    const worth = Math.max(p.appraisedValue ?? 0, melt ?? p.meltValue ?? 0);
    if (worth > 0) {
      valued += 1;
      valuedCost += p.price;
      value += worth;
    }
  }
  return { count: list.length, valued, cost: round(cost), valuedCost: round(valuedCost), value: round(value), gain: round(value - valuedCost) };
};
