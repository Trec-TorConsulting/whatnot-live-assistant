// Tools shows: battery platform, tool-only versus kit, manufacturer part number, battery capacity,
// quick read line, and part-number or platform+tool buyer wants.
import { readPartNumber } from './deviceSpecs';
import { wantMatches } from './estate';
import { formatMoney } from './money';
import { detectShowType, type ShowType } from './showType';

export { readPartNumber };

export type KitStatus = 'tool-only' | 'kit' | 'not-stated';

const PLATFORM_PATTERNS: [RegExp, string][] = [
  [/\bm18\s+fuel\b/i, 'M18 FUEL'],
  [/\bm12\s+fuel\b/i, 'M12 FUEL'],
  [/\bmx\s+fuel\b/i, 'MX FUEL'],
  [/\bm18\b/i, 'M18'],
  [/\bm12\b/i, 'M12'],
  [/\bryobi\b[^\n]*\bone\+\s*18\s*v\b|\bone\+\s*18\s*v\b/i, 'Ryobi ONE+ 18V'],
  [/\bryobi\b[^\n]*\bone\+/i, 'Ryobi ONE+'],
  [/\bryobi\b[^\n]*\b40\s*v\b/i, 'Ryobi 40V'],
  [/\bryobi\b[^\n]*\b18\s*v\b/i, 'Ryobi ONE+ 18V'],
  [/\bdewalt\b[^\n]*\bflexvolt\b|\bflexvolt\b/i, 'DeWalt FLEXVOLT'],
  [/\bdewalt\b[^\n]*\b20\s*v\s*max\b|\b20\s*v\s*max\b/i, 'DeWalt 20V MAX'],
  [/\bdewalt\b[^\n]*\b12\s*v\s*max\b|\b12\s*v\s*max\b/i, 'DeWalt 12V MAX'],
  [/\bmakita\b[^\n]*\b40\s*v\s*xgt\b|\b40\s*v\s*xgt\b/i, 'Makita 40V XGT'],
  [/\bmakita\b[^\n]*\b18\s*v\s*lxt\b|\b18\s*v\s*lxt\b/i, 'Makita 18V LXT'],
  [/\bridgid\s+18\s*v\b/i, 'Ridgid 18V'],
  [/\bkobalt\s+24\s*v\b/i, 'Kobalt 24V'],
  [/\bcraftsman\s+v20\b/i, 'Craftsman V20'],
  [/\bhercules\s+20\s*v\b/i, 'Hercules 20V'],
  [/\bbauer\s+20\s*v\b/i, 'Bauer 20V'],
  [/\bhart\s+20\s*v\b/i, 'Hart 20V'],
];

const POWER_TOOL_WORD_RE =
  /\b(?:drill|driver|impact|wrench|ratchet|grinder|saw|sawzall|hackzall|trimmer|blower|mower|edger|chainsaw|pruner|sander|router|planer|nailer|stapler|multi-?tool|oscillating|vacuum|vac|inflator|light|lantern|fan|radio|speaker|grease\s+gun|rotary|hammer|shear|nibbler|threader|press|polisher|buffer|heat\s+gun|soldering|cut-?off|band\s*saw|jig\s*saw|circular|reciprocating|miter|table\s+saw|caulk|drain|auger|pump|sprayer|compressor|generator)\b/i;

export const toolsPassOn = (p: {
  lotTitle?: string | null;
  showTitle?: string | null;
  categories?: string[];
  notes?: string | null;
  showType?: ShowType;
}): boolean => {
  const type = p.showType ?? detectShowType(p.showTitle, p.categories ?? [], p.notes ?? '');
  return type === 'tools';
};

export const readPlatform = (
  title: string | null | undefined,
  description?: string | null,
): string | null => {
  const combined = `${title ?? ''}\n${description ?? ''}`;
  for (const [re, label] of PLATFORM_PATTERNS) {
    if (re.test(combined)) return label;
  }
  return null;
};

export const hasIncludedCharger = (
  title: string | null | undefined,
  description?: string | null,
): boolean => {
  const combined = `${title ?? ''}\n${description ?? ''}`;
  if (/\b(?:no|without|missing)\s+(?:\w+\s+)?chargers?\b|\bchargers?\s+(?:are\s+)?(?:not\s+included|listed\s+separately|sold\s+separately)\b/i.test(combined)) {
    return false;
  }
  return /\bcharger\b/i.test(combined);
};

export const readAmpHours = (
  title: string | null | undefined,
  description?: string | null,
): string | null => {
  const combined = `${title ?? ''}\n${description ?? ''}`;
  const ah = combined.match(/\b(\d+(?:\.\d+)?)\s*a\.?h\b/i);
  if (ah?.[1]) return `${ah[1]} Ah`;
  const pack =
    combined.match(/\b(?:cp|xc|hd|ho|high\s+output)\s*(?:high\s+output\s*)?(\d+\.\d+)\b/i) ??
    combined.match(/\b(\d+\.\d+)\s*(?:ah\s*)?batter(?:y|ies)\b/i);
  if (pack?.[1]) return `${pack[1]} Ah`;
  return null;
};

export const readKitStatus = (
  title: string | null | undefined,
  description?: string | null,
): KitStatus | null => {
  const combined = `${title ?? ''}\n${description ?? ''}`;
  if (!combined.trim()) return null;
  if (/\b(?:tool[\s-]*only|bare\s*tool|\bbare\b)\b/i.test(combined)) return 'tool-only';
  if (/\bkit\b/i.test(combined)) return 'kit';

  const part = readPartNumber(title, description);
  if (part) {
    if (/^\d{4}-20$/i.test(part)) return 'tool-only';
    if (/^\d{4}-2[1-9]$/i.test(part)) return 'kit';
  }

  const hasToolWord = POWER_TOOL_WORD_RE.test(combined);
  const hasBattery =
    /\bbatter(?:y|ies)\b/i.test(combined) &&
    !/\b(?:no|without|missing)\s+(?:\w+\s+)?batter(?:y|ies)\b/i.test(combined);
  const hasCharger = hasIncludedCharger(title, description);

  if (hasToolWord && hasBattery && hasCharger) return 'kit';

  // Pure battery or charger listing without a tool does not need a tool-only/kit warning
  if (!hasToolWord && (hasBattery || hasCharger)) return null;

  const platform = readPlatform(title, description);
  const cordless = /\b(?:cordless|brushless|\d+\s*v\b)\b/i.test(combined);
  if (platform || cordless || (part && hasToolWord)) {
    return 'not-stated';
  }
  return null;
};

export const kitStatusLabel = (status: KitStatus | null): string | null => {
  if (status === 'tool-only') return 'tool-only';
  if (status === 'kit') return 'kit';
  if (status === 'not-stated') return 'tool-only or kit not stated';
  return null;
};

export const toolsLine = (
  title: string | null | undefined,
  description?: string | null,
  start?: number | null,
  shipping?: number | null,
): string | null => {
  const raw = `${title ?? ''}\n${description ?? ''}`.trim();
  if (!raw) return null;
  const platform = readPlatform(title, description);
  const kitStatus = readKitStatus(title, description);
  const kitText = kitStatusLabel(kitStatus);
  const part = readPartNumber(title, description);
  const ah = readAmpHours(title, description);
  const charger = hasIncludedCharger(title, description) && kitStatus !== 'kit' ? 'charger' : null;

  const core = [platform, kitText, part, ah, charger].filter(Boolean);
  if (!core.length) return null;

  const parts = [
    ...core,
    start != null ? `start ${formatMoney(start)}` : null,
    shipping != null ? `ship ${formatMoney(shipping)}` : null,
  ].filter(Boolean);
  return parts.join(' · ');
};

const SOLICITATION_RE =
  /\b(?:cell\s*phone|phone\s*number|my\s+number|my\s+cell|text\s+me|call\s+me|imessage|whatsapp|telegram|discord|cashapp|venmo|zelle|dm\s+me|message\s+me|send\s+your\s+number|drop\s+your\s+number)\b|\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/i;

const NOT_TOOL_WANT_RE = /\b(?:ship|shipping|sound|audio|volume|seller|host|tracking|refund|cancel)\b/i;

export const toolWantFrom = (text: string): string | null => {
  const t = text.trim();
  if (!t || SOLICITATION_RE.test(t) || NOT_TOOL_WANT_RE.test(t)) return null;
  if (/^(?:ty|thanks|thank you|hi|hello|hey|welcome|gg|nice|wow|lol|sold)\b/i.test(t)) return null;
  const words = t.replace(/[^\w\s'-]/g, ' ').split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 10) return null;

  const part = readPartNumber(t);
  if (part) return t;

  const platform = readPlatform(t);
  const hasToolWord = POWER_TOOL_WORD_RE.test(t) || /\b(?:packout|battery|batteries|charger)\b/i.test(t);
  const asks = /\b(?:any|run|please|got|have)\b/i.test(t) || /\?\s*$/.test(t);
  if (platform && (hasToolWord || asks || words.length >= 2)) return t;
  if (hasToolWord && asks && words.length <= 6) return t;
  return null;
};

export const toolWantMatches = (
  want: string,
  title: string | null | undefined,
  description?: string | null,
): boolean => {
  const target = `${title ?? ''} ${description ?? ''}`.trim();
  if (!target) return false;

  const wantPart = readPartNumber(want);
  if (wantPart) {
    const targetPart = readPartNumber(title, description);
    if (targetPart && targetPart.toUpperCase() === wantPart.toUpperCase()) return true;
    return target.toUpperCase().includes(wantPart.toUpperCase());
  }

  const wantPlatform = readPlatform(want);
  if (wantPlatform) {
    const targetPlatform = readPlatform(title, description);
    if (!targetPlatform) return false;
    const wNorm = wantPlatform.toUpperCase();
    const tNorm = targetPlatform.toUpperCase();
    if (tNorm !== wNorm && !tNorm.startsWith(`${wNorm} `) && !wNorm.startsWith(`${tNorm} `)) {
      return false;
    }
    const strippedWant = want
      .replace(/\bm18\s+fuel\b|\bm12\s+fuel\b|\bmx\s+fuel\b|\bm18\b|\bm12\b|\bryobi\b|\bone\+|\bdewalt\b|\bflexvolt\b|\bmakita\b|\blxt\b|\bxgt\b|\b(?:12|18|20|24|40)\s*v(?:\s*max)?\b/gi, ' ')
      .replace(/\b(?:any|run|please|got|have|a|an|the|for|on|in)\b/gi, ' ')
      .replace(/[^\w\s-]/g, ' ')
      .trim();
    if (!strippedWant) return true;
    return wantMatches(strippedWant, target);
  }

  return wantMatches(want, target);
};

export const TOOLS_HINT =
  'Tools show: read the brand, the battery platform (M12, M18, M18 FUEL, 20V MAX, FLEXVOLT, ONE+ 18V, 40V), the part number on the nameplate or box, and whether a battery and charger are in frame. Value bare tools as tool-only and kits as kits; when the listing does not state which, say so rather than guessing. Treat any stated MSRP or retail figure as a seller claim, not a sold price. Do not invent a part number or a battery capacity.';
