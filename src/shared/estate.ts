// Estate and grab-bag shows sell through a reusable shipping-tier listing. The title is not the item.
import { electronicsPassOn } from './electronics';
import { formatMoney } from './money';
import { runnerItemName, runnerPassOn } from './runner';
import type { ShowType } from './showType';

const GRAB = /\b(?:item on screen|random\.?\s*pulls?|junk bags?|random beauties)\b/i;
const YEAR = /\b(?:1[6-9]\d{2}|20\d{2})\b/;
const BRAND = /[a-z0-9]+['’]s\b/i;
const AS_SHOWN = /\bas shown\b|\bas seen\b/i;
const FILLER = new Set([
  'vintage', 'random', 'item', 'items', 'pull', 'pulls', 'screen', 'cool', 'shown', 'seen', 'as',
  'estate', 'sale', 'sales', 'the', 'a', 'an', 'of', 'and', 'on', 'in', 'for', 'to', 'no', 'refund',
  'returns', 'bid', 'responsibly', 'during', 'live', 'please', 'listen', 'description', 'pre',
  'owned', 'fair', 'good', 'box', 'one', 'all', 'extra', 'large', 'small', 'medium', 'solo', 'ship',
  'shipping', 'fragile', 'with', 'from', 'your', 'my',
]);

export interface TemplateLot {
  template: boolean;
  number: number | null;
  tier: string | null;
}

export const lotNumber = (title: string | null | undefined): number | null => {
  const m = title?.match(/#\s*(\d+)\b/);
  return m?.[1] ? Number(m[1]) : null;
};

export const weightTier = (title: string | null | undefined): string | null => {
  const t = title?.toLowerCase() ?? '';
  const range = t.match(/(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*(oz|lbs|lb)\b/);
  if (range) return `${range[1]}-${range[2]} ${range[3] === 'oz' ? 'oz' : 'lb'}`;
  const over = t.match(/\bover\s+(\d+(?:\.\d+)?)\s*(oz|lbs|lb)\b/);
  if (over) return `over ${over[1]} ${over[2] === 'oz' ? 'oz' : 'lb'}`;
  const one = t.match(/(\d+(?:\.\d+)?)\s*(oz|lbs|lb)\b/);
  if (one) return `${one[1]} ${one[2] === 'oz' ? 'oz' : 'lb'}`;
  return null;
};

const weightOnly = (title: string) => {
  const words = title
    .toLowerCase()
    .replace(/#\s*\d+/g, ' ')
    .replace(/\d+(?:\.\d+)?/g, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !FILLER.has(w) && !['oz', 'lb', 'lbs', 'pound', 'pounds', 'ounce', 'ounces'].includes(w));
  return words.length === 0 && /\d/.test(title) && /(?:\b(?:oz|lbs?|pounds?|ounces?|small|medium|large|solo|fragile)\b|\d(?:oz|lbs?)\b)/i.test(title);
};

export const isTemplate = (title: string | null | undefined): boolean => {
  const t = title?.trim() ?? '';
  if (t.length < 2) return false;
  if (GRAB.test(t) || /\bcategory\b/i.test(t)) return true;
  const named = BRAND.test(t) || YEAR.test(t);
  if (AS_SHOWN.test(t)) return !named;
  return weightOnly(t);
};

export const readTemplate = (title: string | null | undefined): TemplateLot => ({
  template: isTemplate(title),
  number: isTemplate(title) ? lotNumber(title) : null,
  tier: isTemplate(title) ? weightTier(title) : null,
});

export const estatePassOn = (p: {
  lotTitle?: string | null;
  showTitle?: string | null;
  categories?: string[];
  notes?: string | null;
  showType?: ShowType;
}): boolean => {
  if (electronicsPassOn(p)) return false;
  if (p.lotTitle && runnerItemName(p.lotTitle, runnerPassOn(p.notes))) return false;
  if (p.lotTitle && isTemplate(p.lotTitle)) return true;
  const blob = [p.showTitle, ...(p.categories ?? []), p.notes].filter(Boolean).join('\n');
  return /\bestate\s+(?:sales?|shows?)\b/i.test(blob);
};

export const ESTATE_HINT =
  'This listing title is only a shipping bucket. The image decides what the item is. Read maker marks, pattern names, clothing brand, size, and flaws, and hallmarks. Do not invent a size, weight, or certification number.';

export const templateContext = (title: string | null | undefined): string | null => {
  if (!title || !isTemplate(title)) return null;
  const n = lotNumber(title);
  const tier = weightTier(title);
  const bits = [n != null ? `lot ${n}` : null, tier ? `tier ${tier}` : null].filter(Boolean).join(', ');
  return `Listing context: ${bits || 'template lot'}. The listing title is a shipping bucket, not the item name.`;
};

export const shippingCallout = (
  shipping: number | null,
  bid: number | null,
  start: number | null,
  shippingPaid: boolean,
): string | null => {
  if (shippingPaid || shipping == null) return null;
  const price = bid != null && bid > 0 ? bid : start;
  if (price == null || price <= 0 || shipping < price / 2) return null;
  const which = bid != null && bid > 0 ? 'bid' : 'start';
  return `Ship ${formatMoney(shipping)} is at least half this ${formatMoney(price)} ${which}`;
};

export type EstateRule = 'no-returns' | 'as-is' | 'clean' | 'solo-ship';

const RULE_LABEL: Record<EstateRule, string> = {
  'no-returns': 'No returns',
  'as-is': 'As-is',
  clean: 'Clean before wearing',
  'solo-ship': 'Solo or fragile ship',
};

export const estateRules = (notes: string | null | undefined, lotTitle: string | null | undefined): EstateRule[] => {
  const text = `${notes ?? ''}\n${lotTitle ?? ''}`.toLowerCase();
  const out: EstateRule[] = [];
  if (/no\s+returns?|no\s+refund/.test(text)) out.push('no-returns');
  if (/as[-\s]?is|as\s+seen/.test(text)) out.push('as-is');
  if (/not\s+washed|not\s+laundered|clean\s+before/.test(text)) out.push('clean');
  if (/solo[-\s]?ship|fragile/.test(text)) out.push('solo-ship');
  return out;
};

export const rulesKey = (rules: EstateRule[]) => [...rules].sort().join('|');

export const rulesAreNew = (prev: string | null, rules: EstateRule[]) => {
  const key = rulesKey(rules);
  return key.length > 0 && key !== (prev ?? '');
};

export const rulesText = (notes: string | null | undefined, lotTitle: string | null | undefined) =>
  estateRules(notes, lotTitle)
    .map((r) => RULE_LABEL[r])
    .join(' · ');

const NOT_WANT = /\b(ship|shipping|sound|tall|seller|host)\b/i;

export const wantFrom = (text: string): string | null => {
  const t = text.trim();
  if (!t || NOT_WANT.test(t)) return null;
  const words = t.replace(/[^\w\s'-]/g, ' ').split(/\s+/).filter(Boolean);
  const asks = /\b(any|run|please)\b/i.test(t);
  const shortQuestion = /\?\s*$/.test(t) && words.length >= 1 && words.length <= 4;
  if (!asks && !shortQuestion) return null;
  return t;
};

const stem = (w: string) => (w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w);

export const wantMatches = (want: string, name: string): boolean => {
  const words = want.toLowerCase().match(/[a-z]{4,}/g) ?? [];
  if (!words.length || !name.trim()) return false;
  const longest = words.reduce((a, b) => (b.length > a.length ? b : a));
  const n = name.toLowerCase();
  const s = stem(longest);
  return n.includes(longest) || n.includes(s);
};

export const pinFrom = (text: string, isHost: boolean, isMod: boolean): string | null => {
  if (!isHost && !isMod) return null;
  const t = text.trim();
  if (!t || /^(ty|thanks|thank you)!?$/i.test(t) || /\bjoined\b/i.test(t) || /^(hi|hello|hey|welcome)\b/i.test(t)) return null;
  const bare = t.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\s!?.,]+/gu, '');
  if (!bare) return null;
  return t;
};

const GARMENT = /\b(jacket|blouse|coat|dress|jeans|sweater|shirt|pants|skirt|suit)\b/i;

export interface ClothingFacts {
  brand: string | null;
  size: string | null;
  flaw: string | null;
  measurement: string | null;
}

export const clothingFacts = (
  listing: string | null | undefined,
  name: string | null | undefined,
  notes: string | null | undefined,
): ClothingFacts | null => {
  const blob = [listing, name, notes].filter(Boolean).join('\n');
  if (!GARMENT.test(blob)) return null;
  const brand = blob.match(/\b([A-Za-z]+['’]s)\b/)?.[1] ?? null;
  const size = blob.match(/\bsize\s+(\d+|x{0,2}s|m|l|x{0,2}l|small|medium|large)\b/i)?.[1] ?? null;
  const flaw = blob.match(/\b(pilling|stain|hole|not washed|not laundered|clean before wearing)\b/i)?.[1] ?? null;
  const measurement = blob.match(/\b(\d+(?:\.\d+)?\s*(?:"|in|inch|inches|cm))\b/i)?.[1] ?? null;
  return { brand, size, flaw, measurement };
};

export interface EstateRun {
  number: number | null;
  name: string | null;
  price: number;
}

export const pushRun = (runs: EstateRun[], entry: EstateRun): EstateRun[] => [entry, ...runs].slice(0, 12);

export const templateLine = (title: string, start: number | null, shipping: number | null): string | null => {
  if (!isTemplate(title)) return null;
  const n = lotNumber(title);
  const tier = weightTier(title);
  const parts = [n != null ? `Lot ${n}` : 'Template lot', tier, start != null ? `start ${formatMoney(start)}` : null, shipping != null ? `ship ${formatMoney(shipping)}` : null];
  return parts.filter(Boolean).join(' · ');
};

export interface EstateView {
  line: string | null;
  shippingNote: string | null;
  rules: string | null;
  wants: { text: string; hit: boolean }[];
  clothing: string | null;
  runs: string[];
}

export const buildEstateView = (input: {
  lotTitle?: string | null;
  showTitle?: string | null;
  categories?: string[];
  notes?: string | null;
  showType?: ShowType;
  start?: number | null;
  bid?: number | null;
  shipping?: number | null;
  shippingPaid?: boolean;
  recognizedName?: string | null;
  wants?: string[];
  runs?: EstateRun[];
  appraisalNotes?: string | null;
}): EstateView | null => {
  const pass = estatePassOn(input);
  if (!pass) return null;
  const title = input.lotTitle ?? '';
  const template = isTemplate(title);
  const line = template ? templateLine(title, input.start ?? null, input.shipping ?? null) : null;
  const shippingNote = template ? shippingCallout(input.shipping ?? null, input.bid ?? null, input.start ?? null, Boolean(input.shippingPaid)) : null;
  const rules = rulesText(input.notes, template ? title : null);
  const name = input.recognizedName ?? '';
  const wants = (input.wants ?? []).map((text) => ({ text, hit: Boolean(name) && wantMatches(text, name) }));
  const cloth = clothingFacts(title, name, [input.notes, input.appraisalNotes].filter(Boolean).join('\n'));
  const clothing = cloth
    ? [cloth.brand, cloth.size ? `size ${cloth.size}` : null, cloth.flaw].filter(Boolean).join(' · ')
    : null;
  const runs = (input.runs ?? []).map((r) =>
    [`Lot ${r.number ?? '?'}`, r.name, formatMoney(r.price)].filter(Boolean).join(' · '),
  );
  if (!line && !shippingNote && !rules && !wants.length && !clothing && !runs.length) return null;
  return { line, shippingNote, rules: rules || null, wants, clothing: clothing || null, runs };
};

export const estateViewFromSession = (
  session: {
    show: { title: string | null; categories?: string[]; note?: { text?: string | null } | null };
    lot: { title: string | null; currentBid: number | null; bidCount: number | null } | null;
    estatePins?: Record<string, string>;
    estateWants?: string[];
    estateRuns?: EstateRun[];
    shippingQuote?: number | null;
  },
  extra: {
    shippingPaid?: boolean;
    shipping?: number | null;
    recognizedName?: string | null;
    appraisalNotes?: string | null;
    showType?: ShowType;
  } = {},
): EstateView | null => {
  const lot = session.lot;
  const bidCount = lot?.bidCount ?? 0;
  const number = lotNumber(lot?.title);
  const pin = number != null ? (session.estatePins?.[String(number)] ?? null) : null;
  const named = extra.recognizedName && !isTemplate(extra.recognizedName) ? extra.recognizedName : pin;
  return buildEstateView({
    lotTitle: lot?.title,
    showTitle: session.show.title,
    categories: session.show.categories,
    notes: session.show.note?.text,
    showType: extra.showType,
    start: bidCount > 0 ? null : (lot?.currentBid ?? null),
    bid: bidCount > 0 ? (lot?.currentBid ?? null) : null,
    shipping: extra.shipping !== undefined ? extra.shipping : (session.shippingQuote ?? null),
    shippingPaid: extra.shippingPaid,
    recognizedName: named,
    wants: session.estateWants ?? [],
    runs: session.estateRuns ?? [],
    appraisalNotes: extra.appraisalNotes,
  });
};
