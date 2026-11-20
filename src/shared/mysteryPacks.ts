// Blind boxes, mystery packs, and chase packs advertise the top chase ("1/2oz GOLD OR 1/2oz SILVER",
// "VaultBox Red Core"), which is a rare pull rather than guaranteed bullion. This module detects them,
// provides a fast local catalog of popular releases (odds, floor, chase), and computes floor / EV melt
// without ever mistaking the chase prize for guaranteed melt.

export interface SpotPrices {
  gold: number | null;
  silver: number | null;
}

export interface MysteryPackInfo {
  name: string;
  /** Guaranteed minimum metal melt (floor), never the chase; null if unknown or non-bullion. */
  floorMelt: number | null;
  /** Odds-weighted expected melt when floor, chase, and odds are all known. */
  expectedMelt: number | null;
  /** Chase probability in [0, 1] (e.g. 0.003 for 0.3%). */
  chaseOdds: number | null;
  /** Short human-readable summary of floor, chase, and odds. */
  summary: string;
  /** Clean query name for eBay / market comp lookups, or null if too generic. */
  queryName: string | null;
  /** True when matched to a curated product or explicit odds were parsed. */
  known: boolean;
}

interface MetalSpec {
  metal: 'gold' | 'silver';
  oz: number;
}

interface PackEntry {
  id: string;
  name: string;
  queryName: string;
  test: (text: string) => boolean;
  floorMetal?: MetalSpec;
  chaseMetal?: MetalSpec;
  chaseOdds: number | null;
  summary: (floorMelt: number | null, expectedMelt: number | null) => string;
}

const GRAMS_PER_OZ = 31.1035;

const PACK_KEYWORD_RE =
  /\b(?:blind\s*box(?:es)?|mystery\s*(?:box(?:es)?|packs?|bags?|pouch(?:es)?|slabs?|coins?|envelopes?)?|chase\s*(?:packs?|box(?:es)?|bags?)|pick\s+(?:a|your)\s+packs?|slab\s*packs?|hot\s*packs?|god\s*packs?|repack(?:s|ed)?|(?:coin|slab|bullion|gold|silver|platinum)\s+packs?|hit\s*parade|vault\s*box(?:es)?|vaultbox|gold\s*rush|rip\s*(?:and|&|\/|or)\s*ship|chance\s*(?:at|to\s*(?:win|hit|pull)))\b/i;

const OR_CLAD_RE = /\b(?:either|or)\b.*\bclad\b|\bclad\b.*\bor\b/i;

const OR_METALS_RE =
  /\b((?:\d+\/\d+|\d+(?:\.\d+)?)\s*(?:troy\s*)?(?:ozt?|g|grams?))\s*(gold|silver|platinum)\s+or\s+((?:\d+\/\d+|\d+(?:\.\d+)?)\s*(?:troy\s*)?(?:ozt?|g|grams?))\s*(gold|silver|platinum)\b/i;

const GOLD_OR_SILVER_RE = /\b(?:gold\s+or\s+silver|silver\s+or\s+gold)\b/i;

// Strip fractional coin weights like "1/10 oz" or "1/2oz" before looking for "1/10" odds.
const WEIGHT_UNIT_RE = /\b\d+\/\d+\s*(?:st|nd|rd|th)?\s*(?:troy\s*)?(?:ozt?|grams?|gr?|kilos?|kg)\b/gi;
const ODDS_RATIO_RE = /\b(\d{1,4})\s*(?:in|\/|:)\s*(\d{1,6})\b/i;
const ODDS_PCT_RE = /\b(\d+(?:\.\d+)?)\s*%\s*(?:chance|odds|chase|hit)\b/i;

const parseWeightOz = (raw: string): number | null => {
  const m = raw.match(/(\d+\/\d+|\d+(?:\.\d+)?)\s*(?:troy\s*)?(ozt?|g|grams?)/i);
  if (!m?.[1] || !m[2]) return null;
  const [num, den] = m[1].split('/').map(Number);
  const val = den ? num! / den : parseFloat(m[1]);
  if (!(val > 0)) return null;
  return /^g/i.test(m[2]) ? val / GRAMS_PER_OZ : val;
};

const meltOf = (spec: MetalSpec | undefined, spot?: SpotPrices): number | null => {
  if (!spec || !spot) return null;
  const price = spec.metal === 'gold' ? spot.gold : spot.silver;
  return price && price > 0 ? Math.round(price * spec.oz * 100) / 100 : null;
};

const fmtUsd = (n: number) => `$${n.toFixed(n >= 100 ? 0 : 2)}`;

const AGORO_SUBJECTS_RE =
  /\b(?:goofy|mickey|minnie|donald|daisy|pluto|stitch|pooh|simba|disney|star\s*wars|batman|joker|superman|dc\s*comics|marvel|spider-?man|wolverine|deadpool|harry\s*potter|lotr|agoro|nz\s*mint|new\s*zealand\s*mint)\b/i;

const MYSTERY_PACKS: PackEntry[] = [
  {
    id: 'agoro-mlb-1-2oz',
    name: 'Agoro / NZ Mint MLB 1/2 oz Blind Box',
    queryName: 'Agoro MLB Blind Box 1/2 oz',
    test: (t) =>
      /\b(?:blind\s*box|agoro|nz\s*mint)\b/i.test(t) &&
      /\b(?:mlb|american\s+league|national\s+league|baseball)\b/i.test(t) &&
      /\b(?:1\/2\s*oz|half\s*oz|silver|gold)\b/i.test(t),
    floorMetal: { metal: 'silver', oz: 0.5 },
    chaseMetal: { metal: 'gold', oz: 0.5 },
    chaseOdds: 18 / 6000,
    summary: (floorMelt, ev) =>
      [
        `Blind box: 99.7% 1/2 oz silver${floorMelt ? ` (${fmtUsd(floorMelt)} melt)` : ''}`,
        '0.3% 1/2 oz gold chase (18/6,000)',
        ev ? `EV melt ${fmtUsd(ev)}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
  },
  {
    id: 'agoro-1-2oz',
    name: 'Agoro / NZ Mint 1/2 oz Blind Box',
    queryName: 'Agoro Blind Box 1/2 oz',
    test: (t) =>
      /\bblind\s*box\b/i.test(t) &&
      (AGORO_SUBJECTS_RE.test(t) || /\b1\/2\s*oz\b/i.test(t)) &&
      /\b(?:gold|silver)\b/i.test(t),
    floorMetal: { metal: 'silver', oz: 0.5 },
    chaseMetal: { metal: 'gold', oz: 0.5 },
    chaseOdds: 15 / 5000,
    summary: (floorMelt, ev) =>
      [
        `Blind box: 99.7% 1/2 oz silver${floorMelt ? ` (${fmtUsd(floorMelt)} melt)` : ''}`,
        '0.3% 1/2 oz gold chase (15/5,000)',
        ev ? `EV melt ${fmtUsd(ev)}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
  },
  {
    id: 'vaultbox-series',
    name: 'VaultBox Certified Coin Mystery Box',
    queryName: 'VaultBox sealed',
    test: (t) => /\bvault\s*box\b/i.test(t),
    chaseOdds: 0.03,
    summary: () => 'VaultBox mystery slab: floor is typically below MSRP · ~1–5% Red Core chase',
  },
  {
    id: 'hit-parade',
    name: 'Hit Parade Mystery Box',
    queryName: 'Hit Parade sealed',
    test: (t) => /\bhit\s*parade\b/i.test(t),
    chaseOdds: null,
    summary: () => 'Hit Parade mystery box: advertised coin is the top chase, floor is typically below MSRP',
  },
  {
    id: 'gold-rush',
    name: 'Gold Rush Mystery Pack',
    queryName: 'Gold Rush mystery',
    test: (t) => /\bgold\s*rush\b/i.test(t) && /\b(?:box|pack|chest|treasure|series|coin|bullion)\b/i.test(t),
    chaseOdds: null,
    summary: () => 'Gold Rush mystery pack: advertised coin is the top chase, not guaranteed',
  },
  {
    id: 'bullion-shark',
    name: 'Bullion Shark Mystery / Chase Pack',
    queryName: 'Bullion Shark mystery pack',
    test: (t) => /\bbullion\s*shark\b/i.test(t) && /\b(?:mystery|chase|pack|box)\b/i.test(t),
    chaseOdds: null,
    summary: () => 'Bullion Shark mystery pack: advertised hit is the chase, check floor vs asking price',
  },
];

const parseExplicitOdds = (text: string): number | null => {
  const stripped = text.replace(WEIGHT_UNIT_RE, ' ');
  const pct = stripped.match(ODDS_PCT_RE);
  if (pct?.[1]) {
    const p = parseFloat(pct[1]) / 100;
    if (p > 0 && p < 1) return p;
  }
  const ratio = stripped.match(ODDS_RATIO_RE);
  if (ratio?.[1] && ratio[2]) {
    const num = parseInt(ratio[1], 10);
    const den = parseInt(ratio[2], 10);
    if (num > 0 && den > num && den <= 100_000) return num / den;
  }
  return null;
};

const parseOrMetals = (text: string): { floor?: MetalSpec; chase?: MetalSpec } => {
  const m = text.match(OR_METALS_RE);
  if (!m?.[1] || !m[2] || !m[3] || !m[4]) return {};
  const oz1 = parseWeightOz(m[1]);
  const oz2 = parseWeightOz(m[3]);
  const met1 = m[2].toLowerCase();
  const met2 = m[4].toLowerCase();
  if (!oz1 || !oz2 || (met1 !== 'gold' && met1 !== 'silver') || (met2 !== 'gold' && met2 !== 'silver')) return {};
  // Gold is worth far more per oz than silver; otherwise smaller weight is the floor.
  const rank = (met: 'gold' | 'silver', oz: number) => (met === 'gold' ? 80 * oz : oz);
  const a: MetalSpec = { metal: met1, oz: oz1 };
  const b: MetalSpec = { metal: met2, oz: oz2 };
  return rank(a.metal, a.oz) <= rank(b.metal, b.oz) ? { floor: a, chase: b } : { floor: b, chase: a };
};

/** Returns true when a shop listing is a blind box, mystery pack, chase pack, or "X or Y" gamble. */
export const isMysteryPack = (title: string, subtitle?: string | null): boolean => {
  const text = subtitle ? `${title} ${subtitle}` : title;
  if (PACK_KEYWORD_RE.test(text)) return true;
  if (OR_METALS_RE.test(text)) return true;
  if (GOLD_OR_SILVER_RE.test(text) && /\b(?:box|pack|blind|mystery|chase|win|hit|chance)\b/i.test(text)) return true;
  return false;
};

/** Looks up a blind box / chase pack in the curated catalog or parses its floor/chase/odds. */
export const lookupMysteryPack = (
  title: string,
  subtitle?: string | null,
  spot?: SpotPrices,
): MysteryPackInfo | null => {
  const text = subtitle ? `${title} ${subtitle}` : title;
  if (!isMysteryPack(title, subtitle)) return null;

  for (const entry of MYSTERY_PACKS) {
    if (!entry.test(text)) continue;
    const floorMelt = meltOf(entry.floorMetal, spot);
    const chaseMelt = meltOf(entry.chaseMetal, spot);
    const expectedMelt =
      floorMelt !== null && chaseMelt !== null && entry.chaseOdds !== null
        ? Math.round(((1 - entry.chaseOdds) * floorMelt + entry.chaseOdds * chaseMelt) * 100) / 100
        : null;
    return {
      name: entry.name,
      floorMelt,
      expectedMelt,
      chaseOdds: entry.chaseOdds,
      summary: entry.summary(floorMelt, expectedMelt),
      queryName: entry.queryName,
      known: true,
    };
  }

  const odds = parseExplicitOdds(text);
  const cladFloor = OR_CLAD_RE.test(text);
  const { floor, chase } = cladFloor ? {} : parseOrMetals(text);
  const floorMelt = meltOf(floor, spot);
  const chaseMelt = meltOf(chase, spot);
  const expectedMelt =
    floorMelt !== null && chaseMelt !== null && odds !== null
      ? Math.round(((1 - odds) * floorMelt + odds * chaseMelt) * 100) / 100
      : null;

  const parts: string[] = [];
  if (odds !== null) {
    const pct = (odds * 100).toFixed(odds * 100 < 1 ? 1 : 0);
    parts.push(`Mystery/chase pack (${pct}% chase odds)`);
  } else if (cladFloor) {
    parts.push('Mystery/chase pack: floor is clad (no melt); advertised precious metals are chase hits');
  } else {
    parts.push('Mystery/chase pack: advertised hit is the max chase, not guaranteed');
  }
  if (floorMelt !== null && floor) {
    parts.push(`floor ${floor.oz} oz ${floor.metal} (${fmtUsd(floorMelt)} melt)`);
  }
  if (expectedMelt !== null) {
    parts.push(`EV melt ${fmtUsd(expectedMelt)}`);
  }

  // Only query eBay if the title has a specific product name beyond generic "mystery box/pack".
  const cleaned = title
    .replace(OR_METALS_RE, ' ')
    .replace(/\b(?:blind\s*box|mystery\s*box|chase\s*pack|mystery\s*pack)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const queryName = cleaned.length >= 4 ? title.replace(OR_METALS_RE, '').replace(/\s+/g, ' ').trim() : null;

  return {
    name: 'Mystery / Chase Pack',
    floorMelt,
    expectedMelt,
    chaseOdds: odds,
    summary: parts.join(' · '),
    queryName: queryName && queryName.length >= 4 ? queryName : null,
    known: odds !== null || floor !== undefined,
  };
};
