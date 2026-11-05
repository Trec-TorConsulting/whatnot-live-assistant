// Everyday Electronics and Tools shows: pull buckets versus specific devices, listing condition,
// device spec line, tools quick read, missing accessories, stated MSRP & mismatch, show rules and
// seller promises, sudden-death label, pinned host/mod identifications, buyer wants, and run board.
import { extractDeviceSpecs, readPartNumber, specLine } from './deviceSpecs';
import {
  isTemplate,
  lotNumber,
  pinFrom,
  shippingCallout,
  wantMatches,
  weightTier,
  type EstateRun,
} from './estate';
import { formatMoney } from './money';
import { detectShowType, type ShowType } from './showType';
import { readPlatform, toolsLine, toolsPassOn, toolWantFrom, toolWantMatches } from './tools';

export { lotNumber, shippingCallout, specLine };
export type PullRun = EstateRun;

export type ElectronicsCondition = 'for-parts' | 'open-box' | 'refurbished' | 'used' | 'new';

export const CONDITION_LABEL: Record<ElectronicsCondition, string> = {
  'for-parts': 'For parts or untested',
  'open-box': 'Open-box',
  refurbished: 'Certified refurbished',
  used: 'Used and working',
  new: 'Brand new',
};

const YEAR_RE = /\b(?:19\d{2}|20\d{2})\b/;
const STORAGE_RE = /\b\d+(?:\.\d+)?\s*(?:gb|tb)\b/i;
// Model tokens: letter+digit mixes (M1, i5, S23, G502, WH-1000XM4), pro+/plus/ultra/max/mini/air,
// generation markers, or a model number after a product line (AirPods Pro 1, iPhone 13).
const MODEL_TOKEN_RE =
  /\b(?:[a-z]{1,4}\d{1,4}[a-z0-9-]*|\d{1,4}[a-z]{1,4}\d*|(?:pro\+|pro\s+\d+|plus|ultra|max|mini|air|nano|studio|fold|flip)|(?:\d+(?:st|nd|rd|th)\s*gen|gen\s*\d+)|(?:iphone|ipad|airpods|pixel|galaxy|surface|switch|playstation|ps)\s+\d+)\b/i;

const GENERIC_CLASS_WORDS = new Set([
  'apple', 'android', 'samsung', 'google', 'microsoft', 'sony', 'lg', 'dell', 'hp', 'lenovo',
  'ipad', 'ipads', 'tablet', 'tablets', 'iphone', 'iphones', 'smartphone', 'smartphones',
  'phone', 'phones', 'cellphone', 'cellphones', 'mobile', 'laptop', 'laptops', 'notebook', 'notebooks',
  'macbook', 'macbooks', 'chromebook', 'chromebooks', 'computer', 'computers', 'pc', 'desktop',
  'monitor', 'monitors', 'tv', 'television', 'speaker', 'speakers', 'headphones', 'headset',
  'earbuds', 'earphones', 'airpods', 'watch', 'watches', 'smartwatch', 'camera', 'cameras',
  'drone', 'drones', 'glasses', 'smart', 'ai', 'electronic', 'electronics', 'device', 'devices',
  'charger', 'chargers', 'battery', 'batteries', 'cable', 'cables', 'cord', 'cords', 'adapter', 'adapters', 'case', 'cases',
  'accessory', 'accessories', 'wireless', 'bluetooth', 'digital', 'portable', 'hd', '4k',
  'new', 'used', 'open', 'box', 'working', 'tested', 'untested', 'parts', 'refurbished', 'certified',
  'black', 'white', 'silver', 'gray', 'grey', 'gold', 'blue', 'red', 'pink', 'green', 'space',
  'with', 'without', 'w', 'no', 'not', 'a', 'an', 'the', 'and', 'or', 'for', 'in', 'on', 'of', 'only',
]);

const PULL_PHRASE_RE =
  /\b(?:pallet\s*pulls?|random\s*(?:items?|pulls?|electronics?|boxes?|lots?)|item\s+on\s+screen|mystery\s*(?:box|boxes|pulls?|items?|lots?)|(?:xs|x-?small|small|medium|large|x-?large|xl)\s+pulls?|abc\s+(?:xs|x-?small|small|medium|large|x-?large|xl))\b/i;

const BARE_SIZE_RE =
  /^\s*(?:\d+\s*[.)-]?\s*)?(?:xs(?:\s*-\s*x?small)?|x-?small|extra\s+small|small|medium|med|large|lg|x-?large|extra\s+large|xl|xxl)(?:\s+pulls?|\s+items?|\s+lots?|\s+boxes?)?(?:\s*#\s*\d+)?\s*$/i;

const BARE_RANGE_RE =
  /^\s*(?:lot\s*#?\s*\d+\s*[-•·:]?\s*)?(\d{1,2})\s*-\s*(\d{1,2})(?:\s*(?:lbs?|pounds?))?(?:\s*#\s*\d+)?\s*$/i;

const AS_SHOWN_RE = /\bas\s+(?:shown|seen)(?:\s+on\s+screen)?\b/i;

const LEADING_X_RE = /^\s*\(\s*x\s*\)\s*/i;

const MSRP_PATTERNS: RegExp[] = [
  /^\s*\(\s*\$\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:retail|msrp|value)?!?\s*\)\s*[-•·:|]?\s*/i,
  /^\s*\(\s*(?:retail|msrp|value)\s*:?\s*\$?\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*!?\s*\)\s*[-•·:|]?\s*/i,
  /^\s*(?:msrp|retail(?:\s+price)?)\s*:?\s*\$\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*!?\s*[-•·:|]?\s*/i,
  /^\s*\$\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:msrp|retail|value)!?\s*[-•·:|]?\s*/i,
  /^\s*\$\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*[•·|–—-]\s*/,
  /^\s*\$\s*(\d{2,}(?:,\d{3})*(?:\.\d+)?)\b\s+(?=[a-z0-9])/i,
];

const INLINE_MSRP_RE =
  /\(\s*\$\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:retail|msrp|value)!?\s*\)|\(\s*(?:retail|msrp|value)\s*:?\s*\$?\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*!?\s*\)|\b(?:msrp|retail(?:\s+price)?)\s*:?\s*\$\s*(\d+(?:,\d{3})*(?:\.\d+)?)\b|\$\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:msrp|retail|value)\b!?/i;

const MID_TITLE_DOLLAR_RE = /\b([a-z][a-z0-9\s-]*?)\s+\$\s*(\d{2,}(?:,\d{3})*(?:\.\d+)?)\b\s+([a-z][a-z0-9\s-]*)/i;

const cleanLeadingMarkers = (s: string) =>
  s
    .replace(LEADING_X_RE, '')
    .replace(/^\s*\*+\s*no\s+(?:charger|adapter|power\s+cord)s?\s*\*+\s*/i, '')
    .replace(/^[-•·:|,\s]+|[-•·:|,\s]+$/g, '')
    .trim();

export const readMsrp = (text: string | null | undefined): { msrp: number; cleanTitle: string } | null => {
  const raw0 = text?.trim() ?? '';
  if (!raw0) return null;
  const raw = raw0.replace(LEADING_X_RE, '');
  for (const re of MSRP_PATTERNS) {
    const m = raw.match(re);
    if (m?.[1]) {
      const msrp = parseFloat(m[1].replace(/,/g, ''));
      const cleanTitle = cleanLeadingMarkers(raw.slice(m[0].length));
      if (msrp > 0) return { msrp, cleanTitle };
    }
  }
  const inline = raw.match(INLINE_MSRP_RE);
  const amount = inline?.[1] ?? inline?.[2] ?? inline?.[3] ?? inline?.[4];
  if (inline && amount) {
    const msrp = parseFloat(amount.replace(/,/g, ''));
    const cleanTitle = cleanLeadingMarkers(
      raw
        .replace(inline[0], ' ')
        .replace(/\s{2,}/g, ' '),
    );
    if (msrp > 0) return { msrp, cleanTitle };
  }
  const mid = raw.match(MID_TITLE_DOLLAR_RE);
  if (mid?.[2] && !/\b(?:start|shipping|ship|bid|off|coupon)\b/i.test(mid[3] ?? '')) {
    const msrp = parseFloat(mid[2].replace(/,/g, ''));
    const cleanTitle = cleanLeadingMarkers(
      raw
        .replace(/\$\s*\d{2,}(?:,\d{3})*(?:\.\d+)?\b/, ' ')
        .replace(/\s{2,}/g, ' '),
    );
    if (msrp >= 10) return { msrp, cleanTitle };
  }
  return null;
};

export const stripMsrp = (text: string | null | undefined): string => {
  const parsed = readMsrp(text);
  if (parsed) return parsed.cleanTitle;
  return cleanLeadingMarkers(text?.trim() ?? '');
};

export const notesRetailMap = (notes: string | null | undefined): Map<string, number> => {
  const map = new Map<string, number>();
  if (!notes) return map;
  for (const line of notes.split(/\r?\n/)) {
    const m = line.match(
      /^[\s•*-]*([A-Za-z0-9][A-Za-z0-9\s+.-]{1,30}?)\s*(?:[-–—:|]+\s*(?:retail|msrp|value)?\s*:?\s*|\s+(?:retail|msrp)\s*:?\s*)\$\s*(\d+(?:,\d{3})*(?:\.\d+)?)\b/i,
    );
    if (m?.[1] && m[2]) {
      const model = m[1].replace(/\b(?:retail|msrp|value)\b/gi, '').trim();
      const val = parseFloat(m[2].replace(/,/g, ''));
      if (model.length >= 2 && val > 0) {
        map.set(model, val);
      }
    }
  }
  return map;
};

export const retailMismatch = (
  lotTitle: string | null | undefined,
  notes: string | null | undefined,
): { titleRetail: number; notesRetail: number; model: string } | null => {
  const parsed = readMsrp(lotTitle);
  if (!parsed) return null;
  const map = notesRetailMap(notes);
  if (!map.size) return null;
  const clean = parsed.cleanTitle.toLowerCase();
  const lotSpecs = extractDeviceSpecs(parsed.cleanTitle);
  let best: { model: string; retail: number } | null = null;
  for (const [model, retail] of map) {
    const words = model.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    const allMatch = words.every((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(clean));
    if (!allMatch) continue;
    const noteSpecs = extractDeviceSpecs(model);
    if ((lotSpecs.variant ?? '') !== (noteSpecs.variant ?? '')) continue;
    if (!best || model.length > best.model.length) {
      best = { model, retail };
    }
  }
  if (!best || best.retail === parsed.msrp) return null;
  return { titleRetail: parsed.msrp, notesRetail: best.retail, model: best.model };
};

export const missingAccessory = (
  lotTitle: string | null | undefined,
  lotSubtitle?: string | null,
): string | null => {
  const text = `${lotTitle ?? ''}\n${lotSubtitle ?? ''}`;
  if (/\bno\s+chargers?\b|\bwithout\s+charger\b|\bmissing\s+charger\b|\bcharger\s+not\s+included\b/i.test(text)) {
    return 'No charger';
  }
  if (/\bno\s+(?:ac\s+)?adapters?\b|\bwithout\s+adapter\b|\bmissing\s+adapter\b/i.test(text)) {
    return 'No adapter';
  }
  if (/\bno\s+(?:power\s+)?(?:cord|cable)s?\b|\bwithout\s+(?:power\s+)?(?:cord|cable)\b/i.test(text)) {
    return 'No power cord';
  }
  return null;
};

const parseBareRange = (title: string | null | undefined): string | null => {
  const raw = stripMsrp(title);
  const m = raw.match(BARE_RANGE_RE);
  if (!m?.[1] || !m[2]) return null;
  const lo = parseInt(m[1], 10);
  const hi = parseInt(m[2], 10);
  if (lo >= 0 && hi > lo && hi <= 100) return `${lo}-${hi}`;
  return null;
};

export const pullTier = (title: string | null | undefined): string | null => {
  const range = parseBareRange(title);
  if (range) return range;
  const weight = weightTier(title);
  if (weight) return weight;
  const t = title?.toLowerCase() ?? '';
  if (/\b(?:xs\s*-\s*x?small|x-?small|extra\s+small)\b/.test(t)) return 'xsmall';
  if (/\b(?:x-?large|extra\s+large|xxl|xl)\b/.test(t)) return 'xlarge';
  if (/\bsmall\b/.test(t)) return 'small';
  if (/\bmedium\b/.test(t)) return 'medium';
  if (/\blarge\b/.test(t)) return 'large';
  return null;
};

const withoutParensAndLot = (title: string) =>
  stripMsrp(title)
    .replace(/^\s*\d+\s*[.)]\s*/, '')
    .replace(/#\s*\d+\b/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .trim();

export const isGenericDeviceClass = (title: string | null | undefined): boolean => {
  const raw = stripMsrp(title);
  if (!raw || raw.length < 2) return false;
  if (PULL_PHRASE_RE.test(raw) || BARE_SIZE_RE.test(raw) || AS_SHOWN_RE.test(raw) || parseBareRange(raw)) return false;
  if (YEAR_RE.test(raw) || STORAGE_RE.test(raw) || MODEL_TOKEN_RE.test(raw) || readPartNumber(raw) != null) return false;
  const base = withoutParensAndLot(raw);
  const tokens = base
    .toLowerCase()
    .replace(/[^a-z0-9\s/+.-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (!tokens.length) return false;
  const hasDeviceWord = tokens.some((w) =>
    [
      'ipad', 'ipads', 'tablet', 'tablets', 'iphone', 'iphones', 'smartphone', 'smartphones',
      'phone', 'phones', 'cellphone', 'laptop', 'laptops', 'notebook', 'macbook', 'chromebook',
      'computer', 'computers', 'pc', 'desktop', 'monitor', 'monitors', 'tv', 'television',
      'speaker', 'speakers', 'headphones', 'headset', 'earbuds', 'earphones', 'airpods',
      'smartwatch', 'camera', 'cameras', 'drone', 'drones', 'glasses', 'electronic', 'electronics',
      'battery', 'batteries', 'charger', 'chargers',
    ].includes(w),
  );
  if (!hasDeviceWord) return false;
  return tokens.every((w) => GENERIC_CLASS_WORDS.has(w));
};

export const isSpecificDevice = (title: string | null | undefined, showTitle?: string | null): boolean => {
  const raw = stripMsrp(title);
  if (!raw || raw.length < 2) return false;
  if (isPullBucket(title, showTitle) || isTemplate(raw) || isGenericDeviceClass(raw)) return false;
  if (YEAR_RE.test(raw) || STORAGE_RE.test(raw) || MODEL_TOKEN_RE.test(raw) || readPartNumber(raw) != null) return true;
  const tokens = withoutParensAndLot(raw)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !GENERIC_CLASS_WORDS.has(w));
  return tokens.length >= 1;
};

const normBanner = (s: string | null | undefined) =>
  withoutParensAndLot(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const isPullBucket = (title: string | null | undefined, showTitle?: string | null): boolean => {
  const raw = stripMsrp(title);
  if (!raw || raw.length < 2) return false;
  if (PULL_PHRASE_RE.test(raw) || BARE_SIZE_RE.test(raw) || parseBareRange(raw) != null) return true;
  if (isGenericDeviceClass(raw)) return true;
  if (YEAR_RE.test(raw) || STORAGE_RE.test(raw) || MODEL_TOKEN_RE.test(raw) || readPartNumber(raw) != null) return false;
  if (showTitle) {
    const lotNorm = normBanner(raw);
    const showNorm = normBanner(showTitle);
    if (showNorm.length >= 3 && lotNorm === showNorm) return true;
  }
  if (/\b(?:tools?|electronics?|deals?|pulls?)\s*(?:&|and)\s*more\b/i.test(raw) && /#\s*\d+\b/.test(raw)) {
    return true;
  }
  if (AS_SHOWN_RE.test(raw)) {
    const rest = withoutParensAndLot(raw.replace(AS_SHOWN_RE, ' '))
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
    return rest.length === 0 || rest.every((w) => GENERIC_CLASS_WORDS.has(w) || w === 'item' || w === 'items' || w === 'lot');
  }
  if (weightTier(raw) != null) {
    return isTemplate(raw);
  }
  return false;
};

export const electronicsPassOn = (p: {
  lotTitle?: string | null;
  showTitle?: string | null;
  categories?: string[];
  notes?: string | null;
  showType?: ShowType;
}): boolean => {
  const type = p.showType ?? detectShowType(p.showTitle, p.categories ?? [], p.notes ?? '');
  if (type === 'electronics') return true;
  if (type === 'tools' || type === 'coins' || type === 'cards' || type === 'jewelry') return false;
  const blob = [p.showTitle, ...(p.categories ?? []), p.notes].filter(Boolean).join('\n');
  if (/\bestate\s+(?:sales?|shows?)\b/i.test(blob)) return false;
  return Boolean(p.lotTitle && isPullBucket(p.lotTitle, p.showTitle));
};

export const readCondition = (
  subtitle: string | null | undefined,
  lotTitle?: string | null,
  categories: string[] = [],
): ElectronicsCondition | null => {
  const lotText = `${subtitle ?? ''}\n${lotTitle ?? ''}`;
  if (/\b(?:for\s+parts|not\s+fully\s+functioning|untested|defective|broken|salvage)\b/i.test(lotText)) return 'for-parts';
  if (/\bopen[- ]?box\b/i.test(lotText)) return 'open-box';
  if (/\b(?:certified\s+)?refurbished\b/i.test(lotText)) return 'refurbished';
  if (/\b(?:used|pre[- ]?owned|working)\b/i.test(lotText)) return 'used';
  if (/\b(?:brand\s+new|new\s+in\s+box|nib|factory\s+sealed)\b/i.test(lotText)) return 'new';
  const tagText = categories.join(' | ');
  if (/\b(?:certified\s+)?refurbished\b/i.test(tagText)) return 'refurbished';
  return null;
};

export const conditionLabel = (
  subtitle: string | null | undefined,
  lotTitle?: string | null,
  categories: string[] = [],
): string | null => {
  const c = readCondition(subtitle, lotTitle, categories);
  return c ? CONDITION_LABEL[c] : null;
};

export const isPartsCondition = (subtitle: string | null | undefined, lotTitle?: string | null): boolean =>
  readCondition(subtitle, lotTitle) === 'for-parts';

export const suddenDeathOn = (
  categories: string[] = [],
  notes?: string | null,
  lotTitle?: string | null,
): boolean => {
  const text = [...categories, notes ?? '', lotTitle ?? ''].join('\n');
  return /\bsudden\s+death\b/i.test(text);
};

const isPhoneOrTablet = (text: string) =>
  /\b(?:iphone|iphones|smartphone|smartphones|phone|phones|cellphone|android|pixel|galaxy\s+s\d*|ipad|ipads|tablet|tablets)\b/i.test(text);

const isLaptop = (text: string) =>
  /\b(?:laptop|laptops|macbook|macbooks|notebook|notebooks|chromebook|chromebooks|thinkpad)\b/i.test(text);

export const electronicsRules = (
  notes: string | null | undefined,
  lotTitle?: string | null,
  recognizedName?: string | null,
): string[] => {
  const noteText = notes ?? '';
  const combined = `${noteText}\n${lotTitle ?? ''}`;
  const itemText = `${lotTitle ?? ''}\n${recognizedName ?? ''}`;
  const out: string[] = [];

  if (/\bno\s+(?:returns?|refunds?|cancellations?|cancels?)\b|\ball\s+sales\s+final\b/i.test(combined)) {
    out.push('No returns or cancellations');
  }

  const capMatch =
    noteText.match(/\bbundle(?:\s+shipping)?(?:\s+is)?\s+up\s+to\s+(\d+)\b/i) ??
    noteText.match(/\bup\s+to\s+(\d+)\s+items?\s+(?:per\s+)?bundle\b/i);
  if (capMatch?.[1]) {
    out.push(`Bundle cap: ${capMatch[1]}`);
  }

  const regionMatch =
    noteText.match(/\bno\s+(?:shipping\s+to\s+|ship\s+to\s+)?(canada|alaska|hawaii|puerto\s+rico|international)\b/i) ??
    noteText.match(/\b(?:do\s+not|don't|cannot|can't)\s+ship\s+to\s+(canada|alaska|hawaii|puerto\s+rico|international)\b/i);
  if (regionMatch?.[1]) {
    const region = regionMatch[1].charAt(0).toUpperCase() + regionMatch[1].slice(1).toLowerCase();
    out.push(`No ${region} shipping`);
  }

  const noPhoneCharger =
    /\bphones?(?:\s+and\s+tablets?)?\s+(?:do\s+not|don't|never)\b[^\n.]*charger/i.test(noteText) ||
    /\bno\s+chargers?\s+(?:for|with|on)\s+phones?/i.test(noteText) ||
    /\bchargers?\s+(?:are\s+)?not\s+included\s+(?:for|with)\s+phones?/i.test(noteText) ||
    (/\blaptops?\s+come\s+with\s+chargers?\b/i.test(noteText) && /\bphones?(?:\s+and\s+tablets?)?\s+(?:do\s+not|don't)\b/i.test(noteText));
  const yesLaptopCharger = /\blaptops?\s+(?:come\s+with|include)\s+chargers?\b/i.test(noteText);

  if (isPhoneOrTablet(itemText) && noPhoneCharger) {
    out.push('No charger included');
  } else if (isLaptop(itemText) && yesLaptopCharger) {
    out.push('Charger included');
  } else if (/\bno\s+chargers?\s+included\b|\bchargers?\s+not\s+included\b/i.test(combined) && !yesLaptopCharger) {
    out.push('No charger included');
  }

  const warrantyMatch = noteText.match(/\b(\d+)\s*[- ]?\s*(year|yr|day|month)s?\s+warranty\b/i);
  if (warrantyMatch?.[1] && warrantyMatch[2]) {
    const unit = warrantyMatch[2].toLowerCase().replace(/^yr$/, 'year');
    out.push(`${warrantyMatch[1]}-${unit} warranty`);
  }

  const returnWindowMatch = noteText.match(/\b(\d+)\s*[- ]?\s*(day|month)s?\s+returns?(?:\s+(?:policy|window))?\b/i);
  if (returnWindowMatch?.[1] && returnWindowMatch[2]) {
    const unit = returnWindowMatch[2].toLowerCase();
    out.push(`${returnWindowMatch[1]}-${unit} return window`);
  }

  if (/\bfully\s+unlocked\b/i.test(noteText)) {
    out.push('Fully unlocked');
  }

  if (/\bchargers?\s+(?:are\s+)?(?:listed|sold)\s+separately\b/i.test(noteText)) {
    out.push('Charger sold separately');
  }

  return out;
};

export const electronicsRulesKey = (rules: string[]) => [...rules].sort().join('|');

export const electronicsRulesAreNew = (prev: string | null, rules: string[]) => {
  const key = electronicsRulesKey(rules);
  return key.length > 0 && key !== (prev ?? '');
};

export const electronicsRulesText = (
  notes: string | null | undefined,
  lotTitle?: string | null,
  recognizedName?: string | null,
) => electronicsRules(notes, lotTitle, recognizedName).join(' · ');

const SOLICITATION_RE =
  /\b(?:cell\s*phone|phone\s*number|my\s+number|my\s+cell|text\s+me|call\s+me|imessage|whatsapp|telegram|discord|cashapp|venmo|zelle|dm\s+me|message\s+me|send\s+your\s+number|drop\s+your\s+number)\b|\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/i;

const NOT_ELECTRONICS_WANT_RE = /\b(?:ship|shipping|sound|audio|volume|seller|host|tracking|refund|cancel)\b/i;

const KNOWN_TECH_WANT_RE =
  /\b(?:optiplex|gopro|macbook|ipad|iphone|airpods|imac|mac\s+mini|thinkpad|latitude|surface|chromebook|switch|ps5|ps4|xbox|steam\s*deck|kindle|roomba|ecovacs|dyson|bose|sonos|garmin|fitbit|quest|oculus|oled|monitor|gpu|rtx|rx)\b/i;

export const electronicsWantFrom = (text: string): string | null => {
  const t = text.trim();
  if (!t || SOLICITATION_RE.test(t) || NOT_ELECTRONICS_WANT_RE.test(t)) return null;
  if (/^(?:ty|thanks|thank you|hi|hello|hey|welcome|gg|nice|wow|lol|sold)\b/i.test(t)) return null;
  const toolWant = toolWantFrom(t);
  if (toolWant) return toolWant;
  const words = t.replace(/[^\w\s'-]/g, ' ').split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 10) return null;
  const asks = /\b(?:any|run|please|got|have)\b/i.test(t);
  const shortQuestion = /\?\s*$/.test(t) && words.length >= 1 && words.length <= 5;
  const namedTech = words.length <= 4 && KNOWN_TECH_WANT_RE.test(t);
  if (!asks && !shortQuestion && !namedTech) return null;
  return t;
};

export const electronicsWantMatches = (want: string, name: string, description?: string | null): boolean =>
  toolWantMatches(want, name, description) || wantMatches(want, name);

export const electronicsPinFrom = (text: string, isHost: boolean, isMod: boolean): string | null => {
  const raw = pinFrom(text, isHost, isMod);
  if (!raw) return null;
  return stripMsrp(raw) || raw;
};

export const ELECTRONICS_HINT =
  'Electronics show: read the brand, exact model, storage size, and visible condition from the frame and on-screen labels. A pull bucket or generic device-class title is not the item name—trust the image over a pull title. Treat any stated MSRP or retail figure as a seller claim, not a sold price. Do not invent storage, carrier lock, battery health, an IMEI, a serial, or a certification number.';

export const pullContext = (title: string | null | undefined, showTitle?: string | null): string | null => {
  if (!title) return null;
  const msrp = readMsrp(title);
  if (isPullBucket(title, showTitle)) {
    const n = lotNumber(title);
    const tier = pullTier(title);
    const bits = [n != null ? `lot ${n}` : null, tier ? `tier ${tier}` : null].filter(Boolean).join(', ');
    return `Listing context: ${bits || 'pull bucket'}. The listing title is a shipping or pull bucket, not the device name.`;
  }
  if (msrp) {
    return `Current lot title: ${msrp.cleanTitle} (seller states MSRP ${formatMoney(msrp.msrp)} as a claim, not a sold price)`;
  }
  return null;
};

export const pullLine = (title: string, start: number | null, shipping: number | null, showTitle?: string | null): string | null => {
  if (!isPullBucket(title, showTitle)) return null;
  const n = lotNumber(title);
  const tier = pullTier(title);
  const parts = [
    n != null ? `Lot ${n}` : 'Pull lot',
    tier,
    start != null ? `start ${formatMoney(start)}` : null,
    shipping != null ? `ship ${formatMoney(shipping)}` : null,
  ];
  return parts.filter(Boolean).join(' · ');
};

export interface ElectronicsView {
  line: string | null;
  specLine?: string | null;
  toolsLine?: string | null;
  accessory?: string | null;
  condition: string | null;
  msrp: string | null;
  suddenDeath: string | null;
  shippingNote: string | null;
  rules: string | null;
  wants: { text: string; hit: boolean }[];
  runs: string[];
}

export const buildElectronicsView = (input: {
  lotTitle?: string | null;
  lotSubtitle?: string | null;
  showTitle?: string | null;
  categories?: string[];
  notes?: string | null;
  showType?: ShowType;
  start?: number | null;
  bid?: number | null;
  shipping?: number | null;
  shippingPaid?: boolean;
  recognizedName?: string | null;
  hostMsrp?: number | null;
  wants?: string[];
  runs?: PullRun[];
}): ElectronicsView | null => {
  const title = input.lotTitle ?? '';
  const uncontextualized = !input.showType && !input.showTitle && !(input.categories && input.categories.length);
  const isTools = toolsPassOn(input) || (uncontextualized && readPlatform(title, input.lotSubtitle) !== null);
  const isElec = electronicsPassOn(input) || (uncontextualized && specLine(title) !== null);
  if (!isElec && !isTools) return null;
  const pull = isPullBucket(title, input.showTitle);
  const pLine = pull ? pullLine(title, input.start ?? null, input.shipping ?? null, input.showTitle) : null;
  const tLine = !pull && isTools ? toolsLine(title, input.lotSubtitle, input.start ?? null, input.shipping ?? null) : null;
  const sLine = !pull ? specLine(title) : null;
  const line = pLine ?? tLine ?? sLine ?? null;
  const accessory = missingAccessory(title, input.lotSubtitle);
  const condition = conditionLabel(input.lotSubtitle, title, input.categories ?? []);
  const parsedMsrp = readMsrp(title);
  const mismatch = retailMismatch(title, input.notes);
  const msrpVal = parsedMsrp?.msrp ?? input.hostMsrp ?? null;
  const msrp = mismatch
    ? `Stated retail ${formatMoney(mismatch.titleRetail)} (title) vs ${formatMoney(mismatch.notesRetail)} (notes) (claim)`
    : msrpVal != null && msrpVal > 0
      ? `Stated MSRP ${formatMoney(msrpVal)} (claim)`
      : null;
  const suddenDeath = suddenDeathOn(input.categories ?? [], input.notes, title) ? 'Sudden death' : null;
  const shippingNote = pull
    ? shippingCallout(input.shipping ?? null, input.bid ?? null, input.start ?? null, Boolean(input.shippingPaid))
    : null;
  const name = input.recognizedName ?? (pull ? '' : stripMsrp(title));
  const rules = electronicsRulesText(input.notes, title, name);
  const wants = (input.wants ?? []).map((text) => ({
    text,
    hit: (Boolean(name) && electronicsWantMatches(text, name, input.lotSubtitle)) ||
      (Boolean(title) && electronicsWantMatches(text, title, input.lotSubtitle)),
  }));
  const runs = (input.runs ?? []).map((r) =>
    [`Lot ${r.number ?? '?'}`, r.name, formatMoney(r.price)].filter(Boolean).join(' · '),
  );
  if (
    !line &&
    !sLine &&
    !tLine &&
    !accessory &&
    !condition &&
    !msrp &&
    !suddenDeath &&
    !shippingNote &&
    !rules &&
    !runs.length
  ) {
    return null;
  }
  return {
    line,
    specLine: sLine && sLine !== line ? sLine : null,
    toolsLine: tLine && tLine !== line ? tLine : null,
    accessory,
    condition,
    msrp,
    suddenDeath,
    shippingNote,
    rules: rules || null,
    wants: [],
    runs,
  };
};

export const electronicsViewFromSession = (
  session: {
    show: { title: string | null; categories?: string[]; note?: { text?: string | null } | null };
    lot: { title: string | null; subtitle?: string | null; currentBid: number | null; bidCount: number | null } | null;
    electronicsPins?: Record<string, string>;
    electronicsWants?: string[];
    electronicsRuns?: PullRun[];
    shippingQuote?: number | null;
  },
  extra: {
    shippingPaid?: boolean;
    shipping?: number | null;
    recognizedName?: string | null;
    lotSubtitle?: string | null;
    showType?: ShowType;
  } = {},
): ElectronicsView | null => {
  const lot = session.lot;
  const bidCount = lot?.bidCount ?? 0;
  const number = lotNumber(lot?.title);
  const pin = number != null ? (session.electronicsPins?.[String(number)] ?? null) : null;
  const named =
    extra.recognizedName && !isPullBucket(extra.recognizedName, session.show.title) ? extra.recognizedName : pin;
  return buildElectronicsView({
    lotTitle: lot?.title,
    lotSubtitle: extra.lotSubtitle ?? lot?.subtitle ?? null,
    showTitle: session.show.title,
    categories: session.show.categories,
    notes: session.show.note?.text,
    showType: extra.showType,
    start: bidCount > 0 ? null : (lot?.currentBid ?? null),
    bid: bidCount > 0 ? (lot?.currentBid ?? null) : null,
    shipping: extra.shipping !== undefined ? extra.shipping : (session.shippingQuote ?? null),
    shippingPaid: extra.shippingPaid,
    recognizedName: named,
    wants: session.electronicsWants ?? [],
    runs: session.electronicsRuns ?? [],
  });
};
