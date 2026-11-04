import {
  DEFAULT_FEE_FIXED,
  DEFAULT_FEE_PERCENT,
  allInPrice,
  flipProfit,
  shippingOwed,
  shippingRules,
  shippingRulesKey,
  shippingRulesLine,
  type ShippingOwed,
  type ShippingRules,
} from './costs';
import { formatForeignWithUsd, toUsd, type SessionCurrency } from './currency';
import { isTemplate, lotNumber } from './estate';
import { formatMoney } from './money';
import type { ShowType } from './showType';

const round = (n: number) => Math.round(n * 100) / 100;
const formatUnitMoney = (n: number) => `$${n.toFixed(2)}`;

export type CountSource = 'mod' | 'title' | 'subtitle' | 'notes';

export const CASE_PACK_HINT =
  'Wholesale / case-pack show: read the brand, style, size breakdown, and piece count shown on the box, hangtag, or bag. Give a per-piece resale estimate.';

export interface PackCountResult {
  count: number | null;
  counts: number[];
  source: 'title' | 'subtitle' | null;
  conflict: string | null;
}

const SOLD_PER_PIECE_RE = /\bsold\s+(?:per|by\s+the)\s+(?:piece|unit|item|each|single)\b/i;

const SET_PHRASE_RE =
  /\b\d+\s*(?:[- ]?pc|[- ]?pcs|[- ]?piece)s?\s+(?:[\w'-]+\s+){0,3}set\b|\bset\b[\s\S]{0,40}\b\d+\s*(?:[- ]?pc|[- ]?pcs|[- ]?piece)s?\b/i;

const MULTI_SET_PACK_RE =
  /\b(?:lot\s+of|pack\s+of|case\s*pack\s+of)\s+\d+|\b\d+\s+(?:gift\s+|pajama\s+|beauty\s+)?sets\b/i;

const extractCountsFromText = (text: string): number[] => {
  if (!text) return [];
  // Remove scale ratios like "1:10 Scale", lot numbers "#12", and dimensions/weights/counts like "4-Foot", "40 ounce", "42 count", "size 9-11"
  const cleaned = text
    .replace(/\b\d+\s*:\s*\d+\s*scale\b/gi, ' ')
    .replace(/#\s*\d+\b/g, ' ')
    .replace(/\bsize\s+\d+(?:\s*[-–/]\s*\d+)?\b/gi, ' ')
    .replace(/\b\d+(?:\.\d+)?\s*[- ]?(?:foot|feet|ft|inch|inches|in|oz|ounces?|lbs?|pounds?|grams?|g|kg|ml|l|count|ct)\b/gi, ' ');

  const found: { index: number; val: number }[] = [];
  const add = (index: number, raw: string | undefined) => {
    if (!raw) return;
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 5000) {
      found.push({ index, val: n });
    }
  };

  // 1. Ratio like "12/$12", "6/$12", "24/$24"
  for (const m of cleaned.matchAll(/(?<![\d#$])\b(\d{1,3})\s*\/\s*\$\s*\d+(?:\.\d+)?\b/gi)) {
    add(m.index ?? 0, m[1]);
  }

  // 2. "lot of N", "case pack of N", "pack of N"
  for (const m of cleaned.matchAll(/\b(?:lot|case\s*pack|pack)\s+of\s+(\d{1,4})\b/gi)) {
    add(m.index ?? 0, m[1]);
  }

  // 3. "N pcs", "N pieces", "N brand-new pieces", "N pairs", "N-pack", "N pack", "N pk", "N per"
  const unitRe =
    /(?<![#$:\d.])\b(\d{1,4})\s*(?:[- ]?(?:pcs?|pieces?|pairs?|packs?|pk)\b|\s+(?:brand[- ]new|new|assorted|matching)\s+(?:pcs?|pieces?|pairs?)\b|\s+per\b)(?!\s+set\b)/gi;
  for (const m of cleaned.matchAll(unitRe)) {
    add(m.index ?? 0, m[1]);
  }

  found.sort((a, b) => a.index - b.index);
  const unique: number[] = [];
  for (const item of found) {
    if (!unique.includes(item.val)) unique.push(item.val);
  }

  if (!unique.length && /\b(?:by\s+the\s+dozen|a\s+dozen|dozens?)\b/i.test(cleaned)) {
    unique.push(12);
  }

  return unique;
};

export const packCount = (
  title: string | null | undefined,
  subtitle?: string | null | undefined,
): PackCountResult => {
  const t = title?.trim() ?? '';
  const sub = subtitle?.trim() ?? '';
  if (sub && SOLD_PER_PIECE_RE.test(sub)) {
    return { count: 1, counts: [1], source: 'subtitle', conflict: null };
  }
  if (t && SOLD_PER_PIECE_RE.test(t)) {
    return { count: 1, counts: [1], source: 'title', conflict: null };
  }

  const combined = [t, sub].filter(Boolean).join(' — ');
  if (SET_PHRASE_RE.test(combined) && !MULTI_SET_PACK_RE.test(combined)) {
    return {
      count: 1,
      counts: [1],
      source: SET_PHRASE_RE.test(t) ? 'title' : 'subtitle',
      conflict: null,
    };
  }

  const titleCounts = extractCountsFromText(t);
  const subCounts = extractCountsFromText(sub);
  const counts: number[] = [];
  for (const c of [...titleCounts, ...subCounts]) {
    if (!counts.includes(c)) counts.push(c);
  }

  if (!counts.length) {
    return { count: null, counts: [], source: null, conflict: null };
  }

  const source: 'title' | 'subtitle' = titleCounts.length > 0 ? 'title' : 'subtitle';
  const count = Math.min(...counts);
  const conflict =
    counts.length > 1 ? `${counts.join(' and ')} pieces stated (using ${count})` : null;
  return { count, counts, source, conflict };
};

export const notesRatio = (notes: string | null | undefined): number | null => {
  if (!notes) return null;
  if (SOLD_PER_PIECE_RE.test(notes)) return 1;
  const ratioUnless = notes.match(
    /\b(\d{1,3})\s*\/\s*\$\s*\d+(?:\.\d+)?[\s\S]{0,80}?\bunless\s+(?:stated\s+otherwise|otherwise\s+stated)\b/i,
  );
  if (ratioUnless?.[1]) {
    const n = parseInt(ratioUnless[1], 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  if (/\bsold\s+by\s+the\s+dozen\b/i.test(notes)) return 12;
  const plainRatio = notes.match(/\b(\d{1,3})\s*\/\s*\$\s*\d+(?:\.\d+)?\b/);
  if (plainRatio?.[1] && /\b(?:dozens?|case\s*packs?)\b/i.test(notes)) {
    const n = parseInt(plainRatio[1], 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
};

export interface SizeRunResult {
  label: string;
  total: number;
  parts: { count: number; size: string }[];
}

export const sizeRun = (text: string | null | undefined): SizeRunResult | null => {
  if (!text) return null;
  const re =
    /\b(\d{1,2})\s*[-x×]?\s*(XXS|XS|S\/M|M\/L|L\/XL|XL\/XXL|1X|2X|3X|XXL|XL|S|M|L)(?=\b|[,/)\s])/gi;
  const parts: { count: number; size: string }[] = [];
  for (const m of text.matchAll(re)) {
    const count = parseInt(m[1]!, 10);
    const size = m[2]!.toUpperCase();
    if (Number.isFinite(count) && count > 0) {
      parts.push({ count, size });
    }
  }
  if (parts.length < 2) return null;
  const total = parts.reduce((sum, p) => sum + p.count, 0);
  const label = parts.map((p) => `${p.count} ${p.size}`).join(' · ');
  return { label, total, parts };
};

const GENERIC_CASE_WORDS = new Set([
  'clothing', 'apparel', 'case', 'pack', 'packs', 'casepack', 'casepacks',
  'bundle', 'bundles', 'reseller', 'wholesale', 'show', 'lot', 'lots',
  'item', 'items', 'quality', 'random', 'mystery', 'assorted', 'mixed',
  'box', 'boxes', 'bin', 'bins', 'pallet', 'pallets', 'pull', 'pulls',
  'tag', 'tags', 'pink', 'blue', 'red', 'green', 'yellow', 'orange',
  'purple', 'white', 'black', 'gold', 'silver', 'color', 'shipping',
  'cap', 'max', 'free', 'start', 'starts', 'sb', 'dozens', 'dozen',
  'as', 'seen', 'shown', 'on', 'screen', 'or', 'and', 'the', 'for',
  'with', 'up', 'to', 'rewards', 'reward', 'tier', 'small', 'medium',
  'large', 'heavy', 'am', 'pm', 'lbs', 'lb', 'pounds', 'pound', 'oz', 'ounces',
]);

const STYLE_CODE_RE = /\b[A-Z]{2,4}-\d{3,6}[A-Z0-9]*\b/;

export const isGenericCaseLot = (title: string | null | undefined): boolean => {
  const raw = title?.trim() ?? '';
  if (!raw) return true;
  if (isTemplate(raw)) return true;
  if (STYLE_CODE_RE.test(raw)) return false;

  const stripped = raw
    .replace(/#\s*\d+\b/g, ' ')
    .replace(/\blot\s+\d+\b/gi, ' ')
    .replace(/\b\d{1,2}\/\d{1,2}\b/g, ' ')
    .replace(/\b\d+\s*\/\s*\$\s*\d+(?:\.\d+)?\b/g, ' ')
    .replace(/\$\s*\d+(?:\.\d+)?/g, ' ')
    .replace(/\b\d+\s*(?:pcs?|pieces?|pk|packs?)\b/gi, ' ')
    .replace(/\b\d+(?:\s*[-–—to]+\s*\d+)?\s*(?:lbs?|pounds?|oz|ounces?)\b/gi, ' ')
    .replace(/[^a-zA-Z\s]/g, ' ')
    .toLowerCase();

  const words = stripped.split(/\s+/).filter((w) => w.length >= 2);
  return words.every((w) => GENERIC_CASE_WORDS.has(w));
};

export interface ContentsPin {
  name: string | null;
  count: number | null;
  label: string;
  text: string;
}

const IGNORE_PIN_RE =
  /\b(?:shipping|coupon|promo|code|follow|bookmark|share|welcome|thank|payment|checkout)\b|https?:\/\//i;

const tidyItemName = (raw: string): string => {
  const cleaned = raw.replace(/[!?#*]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  if (cleaned === cleaned.toUpperCase() && /[A-Z]/.test(cleaned)) {
    return cleaned
      .toLowerCase()
      .replace(/\b[a-z]/g, (c) => c.toUpperCase());
  }
  return cleaned;
};

export const contentsLine = (text: string | null | undefined): ContentsPin | null => {
  const raw = text?.trim() ?? '';
  if (!raw || raw.length > 80 || IGNORE_PIN_RE.test(raw)) return null;

  // 1. Ratio only: "6/$12", "4/$12", "24/$24"
  const ratioMatch = raw.match(/^(\d{1,3})\s*\/\s*\$\s*\d+(?:\.\d+)?$/i);
  if (ratioMatch?.[1]) {
    const count = parseInt(ratioMatch[1], 10);
    return { name: null, count, label: `×${count}`, text: raw };
  }

  // 2. Trailing X2 / x10: "SQUISHY CHUBBY BANANA X2", "JUMBO SQUISHY !? X1"
  const xMatch = raw.match(/^(.+?)\s+[x×](\d{1,4})\s*[!?]*$/i);
  if (xMatch?.[1] && xMatch[2]) {
    const name = tidyItemName(xMatch[1]);
    const count = parseInt(xMatch[2], 10);
    if (name && count > 0) {
      return { name, count, label: `${name} ×${count}`, text: raw };
    }
  }

  // 3. Dash or colon count: "Hats- 10", "Hats - 10", "Socks: 12"
  const dashMatch = raw.match(/^([A-Za-z][A-Za-z0-9\s'&/-]{1,40}?)\s*[-:–—]\s*(\d{1,4})\s*(?:pcs?|pieces?|pairs?|pk)?$/i);
  if (dashMatch?.[1] && dashMatch[2]) {
    const name = tidyItemName(dashMatch[1]);
    const count = parseInt(dashMatch[2], 10);
    if (name && count > 0) {
      return { name, count, label: `${name} ×${count}`, text: raw };
    }
  }

  // 4. Plain short item name with no question mark
  if (raw.includes('?')) return null;
  const pc = packCount(raw);
  if (pc.count !== null) {
    const strippedName = tidyItemName(
      raw.replace(/\b\d+\s*(?:pcs?|pieces?|pairs?|packs?|pk)\b/gi, ''),
    );
    const name = strippedName || null;
    return {
      name,
      count: pc.count,
      label: name ? `${name} ×${pc.count}` : `×${pc.count}`,
      text: raw,
    };
  }

  return null;
};

export const perPiece = (
  price: number | null | undefined,
  count: number | null | undefined,
): number | null => {
  if (price == null || !Number.isFinite(price) || price <= 0) return null;
  if (count == null || !Number.isFinite(count) || count <= 0) return null;
  return round(price / count);
};

export const landedPerPiece = (
  bid: number | null | undefined,
  shippingOrOwed: number | null | ShippingOwed | undefined,
  taxPercent = 0,
  count?: number | null | undefined,
): number | null => {
  if (bid == null || !Number.isFinite(bid) || bid <= 0) return null;
  if (count == null || !Number.isFinite(count) || count <= 0) return null;
  const allIn = allInPrice(bid, shippingOrOwed ?? null, taxPercent, false);
  return round(allIn.total / count);
};

export const breakEven = (
  landed: number | null | undefined,
  feePercent = DEFAULT_FEE_PERCENT,
  feeFixed = DEFAULT_FEE_FIXED,
): number | null => {
  if (landed == null || !Number.isFinite(landed) || landed <= 0) return null;
  const keepRatio = 1 - feePercent / 100;
  if (keepRatio <= 0) return null;
  return round((landed + feeFixed) / keepRatio);
};

export const weightPounds = (title: string | null | undefined): number | null => {
  if (!title) return null;
  const m = title.match(/\b(\d+(?:\.\d+)?)\s*(?:lbs?|pounds?)\b/i);
  if (!m?.[1]) return null;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export const perPound = (
  price: number | null | undefined,
  pounds: number | null | undefined,
): number | null => {
  if (price == null || !Number.isFinite(price) || price <= 0) return null;
  if (pounds == null || !Number.isFinite(pounds) || pounds <= 0) return null;
  return round(price / pounds);
};

export interface PriceClaimsResult {
  claims: string[];
  msrp: number | null;
  wasPrice: number | null;
  marketValue: null;
}

export const priceClaims = (
  title?: string | null,
  subtitle?: string | null,
  extra?: { struckPrice?: number | null; flashText?: string | null },
): PriceClaimsResult => {
  const t = title ?? '';
  const sub = subtitle ?? '';
  const flash = extra?.flashText ?? '';
  const blob = [t, sub, flash].filter(Boolean).join('\n');
  const claims: string[] = [];
  let msrp: number | null = null;
  let wasPrice: number | null = null;

  const msrpMatch =
    blob.match(/\$\s*(\d+(?:,\d{3})*(?:\.\d{1,2})?)\+?\s*msrp(?:\s+value)?\b/i) ??
    blob.match(/\bmsrp(?:\s+value)?\s*[:=-]?\s*\$\s*(\d+(?:,\d{3})*(?:\.\d{1,2})?)\+?/i);
  if (msrpMatch?.[1]) {
    const n = parseFloat(msrpMatch[1].replace(/,/g, ''));
    if (Number.isFinite(n) && n > 0) {
      msrp = n;
      claims.push(`seller says MSRP ${formatMoney(n)}`);
    }
  }

  if (msrp === null) {
    const valMatch = blob.match(/\$\s*(\d+(?:,\d{3})*(?:\.\d{1,2})?)\+?\s*(?:retail\s+)?value\b/i);
    if (valMatch?.[1]) {
      const n = parseFloat(valMatch[1].replace(/,/g, ''));
      if (Number.isFinite(n) && n > 0) {
        msrp = n;
        claims.push(`seller says ${formatMoney(n)} value`);
      }
    }
  }

  if (msrp === null) {
    const leadMatch = t.match(/^\s*\$\s*(\d+(?:\.\d{1,2})?)\s+(?!shipping|cap|start|sb\b)([A-Za-z]{2,})/i);
    if (leadMatch?.[1]) {
      const n = parseFloat(leadMatch[1]);
      if (Number.isFinite(n) && n > 0) {
        msrp = n;
        claims.push(`seller says ${formatMoney(n)}`);
      }
    }
  }

  let struck = extra?.struckPrice ?? null;
  if (struck === null) {
    const strikeMatch =
      blob.match(/\$\s*(\d+(?:,\d{3})*(?:\.\d{1,2})?)\s*(?:->|→)\s*\$\s*\d+/i) ??
      blob.match(/\b(?:was|struck\s+(?:through\s+)?from)\s*\$\s*(\d+(?:,\d{3})*(?:\.\d{1,2})?)/i);
    if (strikeMatch?.[1]) {
      const n = parseFloat(strikeMatch[1].replace(/,/g, ''));
      if (Number.isFinite(n) && n > 0) struck = n;
    }
  }
  if (struck !== null && Number.isFinite(struck) && struck > 0) {
    wasPrice = struck;
    claims.push(`seller's was-price ${formatMoney(struck)}`);
  }

  return { claims, msrp, wasPrice, marketValue: null };
};

export interface PerPieceShopRow {
  id: string;
  title: string;
  price: number;
  count: number;
  unitPrice: number;
  stock: number;
  kind: 'per-piece';
  label: string;
}

export const perPieceShopRows = (
  listings: readonly {
    id?: string;
    title: string;
    subtitle?: string | null;
    price: number;
    quantity?: number;
    mode?: 'bin' | 'auction';
    currency?: string | null;
    usdPrice?: number | null;
  }[],
): PerPieceShopRow[] => {
  const rows: PerPieceShopRow[] = [];
  for (const item of listings) {
    if (item.mode === 'auction') continue;
    const code = (item.currency ?? 'USD').toUpperCase();
    const effectivePrice = code === 'USD' ? item.price : (item.usdPrice ?? null);
    if (effectivePrice === null || !Number.isFinite(effectivePrice) || effectivePrice <= 0) continue;
    const pc = packCount(item.title, item.subtitle);
    if (!pc.count || pc.count < 2) continue;
    const unitPrice = perPiece(effectivePrice, pc.count);
    if (unitPrice === null) continue;
    const stock = item.quantity ?? 1;
    rows.push({
      id: item.id ?? item.title,
      title: item.title,
      price: effectivePrice,
      count: pc.count,
      unitPrice,
      stock,
      kind: 'per-piece',
      label: `${formatUnitMoney(unitPrice)} each (${pc.count} pcs · ${formatMoney(effectivePrice)})`,
    });
  }
  rows.sort((a, b) => a.unitPrice - b.unitPrice);
  return rows.slice(0, 8);
};

export interface CaseRun {
  number: number | null;
  name: string | null;
  count: number | null;
  price: number;
  unitPrice: number | null;
}

export const pushCaseRun = (runs: CaseRun[], entry: CaseRun): CaseRun[] =>
  [entry, ...runs].slice(0, 12);

export const formatCaseRun = (r: CaseRun): string =>
  [
    r.number !== null ? `Lot ${r.number}` : null,
    r.name,
    r.count !== null ? `${r.count} pieces` : null,
    formatMoney(r.price),
    r.unitPrice !== null ? `${formatUnitMoney(r.unitPrice)} each` : null,
  ]
    .filter(Boolean)
    .join(' · ');

export interface CasePackView {
  line: string | null;
  conflict: string | null;
  sizeRun: string | null;
  claims: string | null;
  breakEven: string | null;
  shippingRules: string | null;
  currencyNote: string | null;
  runs: string[];
}

export const resolveLotCount = (input: {
  lotTitle?: string | null;
  lotSubtitle?: string | null;
  notes?: string | null;
  pin?: ContentsPin | null;
}): {
  count: number | null;
  source: CountSource | null;
  conflict: string | null;
  pinName: string | null;
} => {
  if (input.pin?.count != null && input.pin.count > 0) {
    return {
      count: input.pin.count,
      source: 'mod',
      conflict: null,
      pinName: input.pin.name ?? null,
    };
  }
  const pc = packCount(input.lotTitle, input.lotSubtitle);
  if (pc.count !== null) {
    return {
      count: pc.count,
      source: pc.source ?? 'title',
      conflict: pc.conflict,
      pinName: input.pin?.name ?? null,
    };
  }
  const fromNotes = notesRatio(input.notes);
  if (fromNotes !== null) {
    return {
      count: fromNotes,
      source: 'notes',
      conflict: null,
      pinName: input.pin?.name ?? null,
    };
  }
  return {
    count: null,
    source: null,
    conflict: null,
    pinName: input.pin?.name ?? null,
  };
};

export const buildCasePackView = (input: {
  showType?: ShowType;
  lotTitle?: string | null;
  lotSubtitle?: string | null;
  notes?: string | null;
  bid?: number | null;
  start?: number | null;
  shipping?: number | null;
  shippingOwed?: ShippingOwed | null;
  shippingRules?: ShippingRules | null;
  taxPercent?: number;
  feePercent?: number;
  feeFixed?: number;
  pin?: ContentsPin | null;
  runs?: CaseRun[];
  currency?: SessionCurrency | null;
  rawBid?: number | null;
  struckPrice?: number | null;
  appraisedPerPiece?: number | null;
}): CasePackView | null => {
  if (input.showType && input.showType !== 'wholesale') return null;

  const title = input.lotTitle ?? '';
  const sub = input.lotSubtitle ?? '';
  const num = lotNumber(title);
  const generic = isGenericCaseLot(title);
  const resolved = resolveLotCount({
    lotTitle: title,
    lotSubtitle: sub,
    notes: input.notes,
    pin: input.pin,
  });

  const activePrice = input.bid ?? input.start ?? null;
  const taxPercent = input.taxPercent ?? 0;
  const shipArg = input.shippingOwed !== undefined && input.shippingOwed !== null ? input.shippingOwed : (input.shipping ?? null);

  const sr = sizeRun([title, sub].filter(Boolean).join(' '));
  let conflict = resolved.conflict;
  if (!conflict && sr && resolved.count !== null && sr.total !== resolved.count) {
    conflict = `Size run totals ${sr.total} vs ${resolved.count} pieces stated`;
  }

  let unit: number | null = null;
  let landed: number | null = null;
  const lineParts: string[] = [];
  if (num !== null) lineParts.push(`Lot ${num}`);
  if (resolved.pinName) {
    lineParts.push(resolved.pinName);
  } else if (!generic && title.trim()) {
    lineParts.push(title.trim());
  }

  if (resolved.count !== null) {
    const sourceLabel =
      resolved.source === 'mod'
        ? 'from a mod'
        : resolved.source === 'notes'
          ? 'from the notes'
          : resolved.source === 'subtitle'
            ? 'from the subtitle'
            : 'from the title';
    lineParts.push(`${resolved.count} ${resolved.count === 1 ? 'piece' : 'pieces'} (${sourceLabel})`);
    if (activePrice !== null && activePrice > 0) {
      unit = perPiece(activePrice, resolved.count);
      const canLand =
        input.shippingOwed != null
          ? input.shippingOwed.shippingPaid || input.shippingOwed.amount !== null
          : input.shipping !== undefined && input.shipping !== null;
      landed = canLand ? landedPerPiece(activePrice, shipArg, taxPercent, resolved.count) : null;
      if (unit !== null) lineParts.push(`${formatUnitMoney(unit)} each`);
      if (landed !== null) lineParts.push(`${formatUnitMoney(landed)} each landed`);
    }
  } else {
    const lbs = weightPounds(title);
    if (lbs !== null && activePrice !== null && activePrice > 0) {
      const pp = perPound(activePrice, lbs);
      if (pp !== null) lineParts.push(`${formatUnitMoney(pp)} per lb`);
    }
  }

  const be = landed !== null ? breakEven(landed, input.feePercent ?? DEFAULT_FEE_PERCENT, input.feeFixed ?? DEFAULT_FEE_FIXED) : null;
  let breakEvenText: string | null = be !== null ? `Break even ${formatUnitMoney(be)} each` : null;
  if (breakEvenText && input.appraisedPerPiece != null && input.appraisedPerPiece > 0 && landed !== null && resolved.count) {
    const oneFlip = flipProfit(
      input.appraisedPerPiece,
      landed,
      input.feePercent ?? DEFAULT_FEE_PERCENT,
      input.feeFixed ?? DEFAULT_FEE_FIXED,
    );
    const packProfit = round(oneFlip.profit * resolved.count);
    const sign = oneFlip.profit >= 0 ? '+' : '−';
    breakEvenText += ` · est. margin ${sign}${formatMoney(Math.abs(oneFlip.profit))} each (${sign}${formatMoney(Math.abs(packProfit))} pack)`;
  }

  const pcClaims = priceClaims(title, sub, { struckPrice: input.struckPrice });
  const claimsText = pcClaims.claims.length ? pcClaims.claims.join(' · ') : null;
  const rulesText = shippingRulesLine(input.shippingRules);
  const runs = (input.runs ?? []).map(formatCaseRun);

  let currencyNote: string | null = null;
  if (input.currency && input.currency.code !== 'USD' && input.rawBid != null && input.rawBid > 0) {
    currencyNote = formatForeignWithUsd(input.rawBid, input.currency.code, input.currency.rate);
  }

  const line = lineParts.length ? lineParts.join(' · ') : null;
  if (!line && !conflict && !sr && !claimsText && !breakEvenText && !rulesText && !currencyNote && !runs.length) {
    return null;
  }

  return {
    line,
    conflict,
    sizeRun: sr?.label ?? null,
    claims: claimsText,
    breakEven: breakEvenText,
    shippingRules: rulesText,
    currencyNote,
    runs,
  };
};

export const casePackViewFromSession = (
  session: {
    show: {
      liveId: string;
      title: string | null;
      categories?: string[];
      note?: { text?: string | null } | null;
    };
    lot: {
      title: string | null;
      subtitle?: string | null;
      currentBid: number | null;
      bidCount: number | null;
      currency?: string | null;
    } | null;
    casePins?: Record<string, ContentsPin>;
    caseRuns?: CaseRun[];
    currency?: SessionCurrency | null;
    shippingQuote?: number | null;
    shop?: { hits?: { title: string; price: number }[] } | null;
  },
  extra: {
    showType?: ShowType;
    shipping?: number | null;
    tariffs?: boolean;
    hasWinThisShow?: boolean;
    taxPercent?: number;
    feePercent?: number;
    shopListings?: { title: string; price: number }[];
    appraisedPerPiece?: number | null;
  } = {},
): CasePackView | null => {
  if (extra.showType && extra.showType !== 'wholesale') return null;
  const lot = session.lot;
  const num = lotNumber(lot?.title);
  const pin = num !== null ? (session.casePins?.[String(num)] ?? null) : (session.casePins?.['current'] ?? null);
  const rules = shippingRules({
    notes: session.show.note?.text,
    showTitle: session.show.title,
    lotTitle: lot?.title,
    shopListings: extra.shopListings,
  });
  const pageShipping = extra.shipping !== undefined ? extra.shipping : (session.shippingQuote ?? null);
  const owed = shippingOwed({
    rules,
    lotTitle: lot?.title,
    pageShipping,
    hasWinThisShow: Boolean(extra.hasWinThisShow),
    tariffs: extra.tariffs,
  });

  const code = lot?.currency ?? session.currency?.code ?? 'USD';
  const rawBid = lot?.currentBid ?? null;
  const usdBid =
    code !== 'USD'
      ? toUsd(rawBid, code, session.currency?.rate ?? null)
      : rawBid;

  const bidCount = lot?.bidCount ?? 0;
  return buildCasePackView({
    showType: extra.showType ?? 'wholesale',
    lotTitle: lot?.title,
    lotSubtitle: lot?.subtitle ?? null,
    notes: session.show.note?.text,
    start: bidCount > 0 ? null : usdBid,
    bid: bidCount > 0 ? usdBid : null,
    shipping: pageShipping,
    shippingOwed: owed,
    shippingRules: rules,
    taxPercent: extra.taxPercent ?? 0,
    feePercent: extra.feePercent ?? DEFAULT_FEE_PERCENT,
    pin,
    runs: session.caseRuns ?? [],
    currency: code !== 'USD' ? (session.currency ?? { code, rate: null }) : null,
    rawBid,
    appraisedPerPiece: extra.appraisedPerPiece,
  });
};

export { shippingRulesKey };
