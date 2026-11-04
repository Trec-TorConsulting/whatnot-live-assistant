// Device and tool specification extraction from listing titles and descriptions:
// year, processor chip, RAM, storage, screen size, generation, model variant, and manufacturer part number.

export interface DeviceSpecs {
  year: number | null;
  chip: string | null;
  ramGb: number | null;
  storageGb: number | null;
  screenIn: number | null;
  gen: string | null;
  variant: string | null;
  part: string | null;
}

const YEAR_RE = /\b(19\d{2}|20\d{2})\b/;

const CHIP_RE =
  /\b(?:apple\s+)?(m[1-4](?:\s+(?:pro|max|ultra))?|i[3579](?:-\d{4,5}[a-z]*)?|celeron|pentium|ryzen\s+[3579]|snapdragon(?:\s+\w+)?)\b/i;

const GEN_RE = /\b(\d{1,2}(?:st|nd|rd|th))\s*gen(?:eration)?\b|\bgen(?:eration)?\s*(\d{1,2})\b/i;

// Screen size: 7 to 34 inches, written as 14", 13.3 in, 15.6 inch. Excludes fractions like 3/8-in or 5 in. grinder discs when < 7.
const SCREEN_RE = /(?<!\/|\d-)(\d{1,2}(?:\.\d)?)\s*(?:"|”|''|[- ]?inch(?:es)?\b|[- ]?in\.?(?=\s|$|\)))/gi;

const VARIANT_RE =
  /\b((?:pro|max|plus|ultra|mini|air)(?:\s+(?:pro|max|plus|ultra|mini))*\+?)(?:\s+([1-9]\d?)\b(?![\s-]*(?:gb|tb|in\b|inch|core|gen|oz|lb|v\b|ah\b|"|”)))?/i;

// Part numbers:
// - NN-NN-NNNN (e.g. 48-11-2425)
// - NNNN-NN (e.g. 2886-20, 2457-21, 3046-20), not preceded/followed by slash (excludes 4-1/2)
// - Mixed alphanumeric with >=2 letters and >=3 digits (e.g. DMAPL9910-S7, CSBAM-760)
const PART_DASH_3_RE = /(?<![\d/])\b(\d{2}-\d{2}-\d{4})\b(?![\d/])/;
const PART_MILWAUKEE_RE = /(?<![\d/])\b(\d{4}-\d{2}[a-z]?)\b(?![\d/])/i;
const PART_MIXED_RE = /\b([a-z]{2,}\d{3,}(?:-[a-z0-9]+)?|[a-z]{2,}-\d{3,}[a-z0-9]*)\b/i;

export const readPartNumber = (title: string | null | undefined, description?: string | null): string | null => {
  const blob = [title, description].filter(Boolean).join(' ');
  if (!blob) return null;
  // Strip fractions like 4-1/2 or 7-1/4 first so they never partially match.
  const clean = blob.replace(/\b\d+\s*-\s*\d+\s*\/\s*\d+\b/g, ' ');
  const m3 = clean.match(PART_DASH_3_RE);
  if (m3?.[1]) return m3[1].toUpperCase();
  const mm = clean.match(PART_MILWAUKEE_RE);
  if (mm?.[1]) return mm[1].toUpperCase();
  const mx = clean.match(PART_MIXED_RE);
  if (mx?.[1]) return mx[1].toUpperCase();
  return null;
};

const normalizeChip = (raw: string): string => {
  const clean = raw.replace(/^apple\s+/i, '').trim().replace(/\s+/g, ' ');
  if (/^i[3579]/i.test(clean)) return clean.slice(0, 2).toLowerCase();
  if (/^m[1-4]/i.test(clean)) {
    return clean
      .split(' ')
      .map((w, idx) => (idx === 0 ? w.toUpperCase() : w[0]!.toUpperCase() + w.slice(1).toLowerCase()))
      .join(' ');
  }
  return clean[0]!.toUpperCase() + clean.slice(1).toLowerCase();
};

const readRamAndStorage = (text: string): { ramGb: number | null; storageGb: number | null } => {
  let ramGb: number | null = null;
  let storageGb: number | null = null;
  const unmatched: number[] = [];

  const re = /\b(\d+(?:\.\d+)?)\s*(tb|gb)\b(?:\s*(ram|memory|unified|ssd|hdd|nvme|rom|storage))?/gi;
  for (const m of text.matchAll(re)) {
    const val = parseFloat(m[1]!);
    if (!Number.isFinite(val) || val <= 0) continue;
    const unit = m[2]!.toLowerCase();
    const gb = unit === 'tb' ? Math.round(val * 1024) : val;
    const tag = (m[3] ?? '').toLowerCase();
    if (tag === 'ram' || tag === 'memory' || tag === 'unified') {
      if (ramGb === null) ramGb = gb;
    } else if (tag === 'ssd' || tag === 'hdd' || tag === 'nvme' || tag === 'rom' || tag === 'storage' || unit === 'tb') {
      if (storageGb === null) storageGb = gb;
    } else {
      unmatched.push(gb);
    }
  }

  if (ramGb === null && storageGb === null) {
    if (unmatched.length >= 2) {
      const sorted = [...unmatched].sort((a, b) => a - b);
      ramGb = sorted[0]!;
      storageGb = sorted[sorted.length - 1]!;
    } else if (unmatched.length === 1) {
      storageGb = unmatched[0]!;
    }
  } else if (ramGb !== null && storageGb === null && unmatched.length >= 1) {
    storageGb = Math.max(...unmatched);
  } else if (storageGb !== null && ramGb === null && unmatched.length >= 1) {
    const candidate = Math.min(...unmatched);
    if (candidate < storageGb) ramGb = candidate;
  }

  return { ramGb, storageGb };
};

const readScreen = (text: string): number | null => {
  for (const m of text.matchAll(SCREEN_RE)) {
    const n = parseFloat(m[1]!);
    if (Number.isFinite(n) && n >= 7 && n <= 34) return n;
  }
  return null;
};

export const extractDeviceSpecs = (title: string | null | undefined, description?: string | null): DeviceSpecs => {
  const t = title ?? '';
  const yearMatch = t.match(YEAR_RE);
  const year = yearMatch?.[1] ? parseInt(yearMatch[1], 10) : null;

  const chipMatch = t.match(CHIP_RE);
  const chip = chipMatch?.[1] ? normalizeChip(chipMatch[1]) : null;

  const { ramGb, storageGb } = readRamAndStorage(t);
  const screenIn = readScreen(t);

  const genMatch = t.match(GEN_RE);
  const gen = genMatch ? `${(genMatch[1] ?? `${genMatch[2]}th`).toLowerCase()} gen` : null;

  const varMatch = t.match(VARIANT_RE);
  const variant = varMatch?.[1]
    ? `${varMatch[1].toLowerCase().replace(/\s+/g, ' ')}${varMatch[2] ? ` ${varMatch[2]}` : ''}`
    : null;

  const part = readPartNumber(t, description);

  return { year, chip, ramGb, storageGb, screenIn, gen, variant, part };
};

const formatStorage = (gb: number): string => {
  if (gb >= 1024 && gb % 1024 === 0) return `${gb / 1024}TB`;
  return `${gb}GB`;
};

export const specLine = (title: string | null | undefined, description?: string | null): string | null => {
  const s = extractDeviceSpecs(title, description);
  if (!s.chip && s.ramGb === null && s.storageGb === null && s.screenIn === null && !s.gen) return null;
  const parts = [
    s.year !== null ? String(s.year) : null,
    s.chip,
    s.gen,
    s.ramGb !== null ? `${s.ramGb}GB RAM` : null,
    s.storageGb !== null ? formatStorage(s.storageGb) : null,
    s.screenIn !== null ? `${s.screenIn} inch` : null,
  ];
  return parts.filter(Boolean).join(' · ') || null;
};

// Returns true when both titles state a spec and the values disagree. A spec missing on either side is not a conflict,
// except when both share a variant word (e.g. "Pro") and only one has a trailing generation digit ("Pro 2" vs "Pro").
export const specsConflict = (aTitle: string, bTitle: string): boolean => {
  const a = extractDeviceSpecs(aTitle);
  const b = extractDeviceSpecs(bTitle);
  if (a.year !== null && b.year !== null && a.year !== b.year) return true;
  if (a.part !== null && b.part !== null && a.part !== b.part) return true;
  if (a.chip !== null && b.chip !== null && a.chip.toLowerCase() !== b.chip.toLowerCase()) return true;
  if (a.ramGb !== null && b.ramGb !== null && a.ramGb !== b.ramGb) return true;
  if (a.storageGb !== null && b.storageGb !== null && a.storageGb !== b.storageGb) return true;
  if (a.screenIn !== null && b.screenIn !== null && a.screenIn !== b.screenIn) return true;
  if (a.gen !== null && b.gen !== null && a.gen !== b.gen) return true;
  if (a.variant !== null && b.variant !== null && a.variant !== b.variant) return true;
  return false;
};
