// Coin and bullion appraisal logic: series weights, listing-text pre-appraisal, the Gemini answer
// schema, PCGS sale summaries, and the market value / suggested max bid that comes out of them.
import { CASE_PACK_HINT, contentsLine, isGenericCaseLot, resolveLotCount, type CountSource } from './casePack';
import { formatMoney } from './money';
import { ELECTRONICS_HINT, electronicsPassOn, isPullBucket, pullContext, readMsrp } from './electronics';
import { ESTATE_HINT, estatePassOn, isTemplate, lotNumber, templateContext } from './estate';
import { runnerItemName, runnerNoteSupplement, runnerPassOn } from './runner';
import { noteForPrompt } from './showNotes';
import { SHOW_TYPES, type ShowType } from './showType';
import { TOOLS_HINT, toolsPassOn } from './tools';
import type { Calibration } from './calibration';
import type { RefPrice } from './refPrice';
import type { CompSummary } from './soldHistory';
import type { TableItem } from './tableScan';

export type Metal = 'silver' | 'gold' | 'platinum' | 'palladium';

// Troy ounces of precious metal per coin; preferred over the model's guess when the series matches.
export const SERIES: Record<string, { metal: Metal; oz: number }> = {
  morgan_dollar: { metal: 'silver', oz: 0.7734 },
  peace_dollar: { metal: 'silver', oz: 0.7734 },
  trade_dollar: { metal: 'silver', oz: 0.7874 },
  us_90_dime: { metal: 'silver', oz: 0.0723 },
  us_90_quarter: { metal: 'silver', oz: 0.1808 },
  us_90_half: { metal: 'silver', oz: 0.3617 },
  kennedy_40_half: { metal: 'silver', oz: 0.1479 },
  eisenhower_40_dollar: { metal: 'silver', oz: 0.3161 },
  war_nickel_35: { metal: 'silver', oz: 0.0563 },
  american_silver_eagle: { metal: 'silver', oz: 1 },
  silver_maple_leaf: { metal: 'silver', oz: 1 },
  american_gold_eagle_1oz: { metal: 'gold', oz: 1 },
  american_gold_eagle_half: { metal: 'gold', oz: 0.5 },
  american_gold_eagle_quarter: { metal: 'gold', oz: 0.25 },
  american_gold_eagle_tenth: { metal: 'gold', oz: 0.1 },
  american_gold_buffalo: { metal: 'gold', oz: 1 },
  gold_maple_leaf: { metal: 'gold', oz: 1 },
  us_gold_20_double_eagle: { metal: 'gold', oz: 0.9675 },
  us_gold_10_eagle: { metal: 'gold', oz: 0.48375 },
  us_gold_5_half_eagle: { metal: 'gold', oz: 0.24187 },
  us_gold_2_50_quarter_eagle: { metal: 'gold', oz: 0.12094 },
  canada_80_dime: { metal: 'silver', oz: 0.06 },
  canada_80_quarter: { metal: 'silver', oz: 0.15 },
  canada_80_half: { metal: 'silver', oz: 0.3 },
  canada_80_dollar: { metal: 'silver', oz: 0.6 },
  krugerrand_1oz: { metal: 'gold', oz: 1 },
  britannia_silver_1oz: { metal: 'silver', oz: 1 },
  britannia_gold_1oz: { metal: 'gold', oz: 1 },
  philharmonic_silver_1oz: { metal: 'silver', oz: 1 },
  philharmonic_gold_1oz: { metal: 'gold', oz: 1 },
  kangaroo_silver_1oz: { metal: 'silver', oz: 1 },
  kangaroo_gold_1oz: { metal: 'gold', oz: 1 },
  libertad_silver_1oz: { metal: 'silver', oz: 1 },
};

export const SPOT_SYMBOLS: Record<Metal, string> = { silver: 'XAG', gold: 'XAU', platinum: 'XPT', palladium: 'XPD' };

export const isMetal = (m: unknown): m is Metal => typeof m === 'string' && m in SPOT_SYMBOLS;

// Only the 1 oz issue: fractional, multi-ounce, gram, and kilo sizes fall through to the generic
// "N oz metal" match below or to the model.
const oneOz = (re: RegExp) =>
  new RegExp(`^(?!.*(?:\\b\\d+\\/\\d+\\b|\\b(?:[2-9]|\\d{2,})\\s*(?:troy\\s*)?oz\\b|\\bkilo|\\d\\s*(?:g|grams?)\\b)).*(?:${re.source})`, 'i');

const QUICK_PATTERNS: [RegExp, string, string][] = [
  [/\bmorgan\b/i, 'morgan_dollar', 'Morgan Dollar'],
  [/\bpeace\s*(silver\s*)?dollar\b/i, 'peace_dollar', 'Peace Dollar'],
  [/\btrade\s*dollar\b/i, 'trade_dollar', 'Trade Dollar'],
  [/\bsilver\s*eagle\b|\bASE\b/, 'american_silver_eagle', 'American Silver Eagle'],
  [/\bsilver\s*maple/i, 'silver_maple_leaf', 'Silver Maple Leaf'],
  [/1\/10\s*oz[^\n]*gold\s*eagle|gold\s*eagle[^\n]*1\/10/i, 'american_gold_eagle_tenth', '1/10 oz Gold Eagle'],
  [/1\/4\s*oz[^\n]*gold\s*eagle|gold\s*eagle[^\n]*1\/4/i, 'american_gold_eagle_quarter', '1/4 oz Gold Eagle'],
  [/1\/2\s*oz[^\n]*gold\s*eagle|gold\s*eagle[^\n]*1\/2/i, 'american_gold_eagle_half', '1/2 oz Gold Eagle'],
  [/\bgold\s*eagle\b/i, 'american_gold_eagle_1oz', '1 oz Gold Eagle'],
  [/\bgold\s*buffalo\b/i, 'american_gold_buffalo', 'Gold Buffalo'],
  [/\bgold\s*maple/i, 'gold_maple_leaf', 'Gold Maple Leaf'],
  [/\bdouble\s*eagle\b|\$20\s*(liberty|saint|gold)/i, 'us_gold_20_double_eagle', '$20 Gold Double Eagle'],
  [/\b(walking\s*liberty|franklin)\s*half/i, 'us_90_half', '90% Silver Half'],
  [/\bmercury\s*dime/i, 'us_90_dime', 'Mercury Dime'],
  [/\b(standing\s*liberty|barber)\s*quarter/i, 'us_90_quarter', '90% Silver Quarter'],
  [/\bwar\s*nickel/i, 'war_nickel_35', 'War Nickel'],
  [oneOz(/\bkrugerrand/), 'krugerrand_1oz', '1 oz Krugerrand'],
  [oneOz(/\bgold\b.*\bbritannia|\bbritannia\b.*\bgold\b/), 'britannia_gold_1oz', '1 oz Gold Britannia'],
  [oneOz(/\bbritannia\b/), 'britannia_silver_1oz', '1 oz Silver Britannia'],
  [oneOz(/\bgold\b.*\bphilharmonic|\bphilharmonic\b.*\bgold\b/), 'philharmonic_gold_1oz', '1 oz Gold Philharmonic'],
  [oneOz(/\bphilharmonic\b/), 'philharmonic_silver_1oz', '1 oz Silver Philharmonic'],
  [oneOz(/\bgold\b.*\bkangaroo|\bkangaroo\b.*\bgold\b/), 'kangaroo_gold_1oz', '1 oz Gold Kangaroo'],
  [oneOz(/\bkangaroo\b/), 'kangaroo_silver_1oz', '1 oz Silver Kangaroo'],
  // Copper, bronze, and brass Libertads (and "cobre") are base metal. Only a Libertad that
  // does not name one of those, or gold, is the 1 oz silver issue.
  [oneOz(/^(?!.*\b(?:gold|copper|cobre|bronze|brass)\b).*\blibertad\b/), 'libertad_silver_1oz', '1 oz Silver Libertad'],
];

// The fraction comes first, and the lookbehind keeps "1/1000 oz" from being read as 1000 oz.
const OZ_AMOUNT = String.raw`(?<![\d/.])(\d+\/\d+|\d+(?:\.\d+)?)`;
const BULLION_RE = new RegExp(
  `${OZ_AMOUNT}\\s*(?:troy\\s*)?oz\\b[^\\n]*?\\b(silver|gold|platinum|palladium)\\b|\\b(silver|gold|platinum|palladium)\\b[^\\n]*?${OZ_AMOUNT}\\s*(?:troy\\s*)?oz\\b`,
  'i',
);

const ozOf = (amount: string): number | null => {
  const frac = /^(\d+)\/(\d+)$/.exec(amount);
  if (frac) {
    const den = Number(frac[2]);
    return den > 0 ? Number(frac[1]) / den : null;
  }
  const n = Number(amount);
  return n > 0 ? n : null;
};
const QTY_RE = /\b(?:qty\.?|x)\s*(\d{1,3})\b|\b(\d{1,3})\s*(?:x|pcs|coins)\b/i;
const SLAB_RE =
  /\b(PCGS|NGC|ANACS|ICG|CACG)\b[^\n]{0,12}?\b(MS|PR|PF|SP|AU|XF|EF|VF|VG|AG|F|G)\s*-?\s*(\d{1,2})\s*(\+)?\s*((?:DM)?PL|DCAM|CAM|RD|RB|BN)?/i;
// PCGS certs are 7-9 digits; the lookarounds keep prices like "$1,250" and dates out.
const CERT_RE = /(?<![\d$.,])(\d{7,9})(?![\d,.])/;

export interface QuickRead {
  name: string;
  metal: Metal;
  oz: number;
  quantity: number;
  grade: string | null;
  source: string;
}

export interface QuickResult {
  read: QuickRead | null;
  cert: string | null;
}

// Instant melt floor from listing text, shown while the model looks at the video.
export const quickRead = (pageText: string): QuickResult => {
  const lines = String(pageText || '').split('\n');
  const certLine = lines.find((l) => /\bPCGS\b/i.test(l) && CERT_RE.test(l));
  const cert = certLine?.match(CERT_RE)?.[1] ?? null;

  // Listing titles carry a year or a weight; chat chatter usually doesn't.
  for (const line of lines.filter((l) => /\b(1[789]\d\d|20\d\d)\b|\boz\b/i.test(l))) {
    const qtyMatch = line.match(QTY_RE);
    const quantity = qtyMatch ? Math.max(1, parseInt(qtyMatch[1] ?? qtyMatch[2] ?? '1', 10)) : 1;
    const series = QUICK_PATTERNS.find(([re]) => re.test(line));
    let metal: Metal;
    let oz: number;
    let name: string;
    if (series) {
      const known = SERIES[series[1]]!;
      ({ metal, oz } = known);
      name = series[2];
    } else {
      const m = line.match(BULLION_RE);
      if (!m) continue;
      const amount = (m[1] ?? m[4])!;
      const parsed = ozOf(amount);
      if (parsed === null) continue;
      metal = (m[2] ?? m[3])!.toLowerCase() as Metal;
      oz = parsed;
      name = `${amount} oz ${metal}`;
    }
    const slab = line.match(SLAB_RE);
    const grade = slab
      ? `${slab[1]!.toUpperCase()} ${slab[2]!.toUpperCase()} ${slab[3]}${slab[4] ?? ''}${slab[5] ? ` ${slab[5].toUpperCase()}` : ''}`
      : null;
    return { read: { name, metal, oz, quantity, grade, source: line.slice(0, 80) }, cert };
  }
  return { read: null, cert };
};

export interface Melt {
  metal: Metal;
  spot: number;
  oz: number;
  perPiece: number;
  total: number;
}

const OZ_PER_GRAM = 0.0321507;
const GRAMS_RE = /(?<![\w.])(\d+(?:\.\d+)?)\s*(?:g|grams?)\b/i;

// "1 g Gold Bar" weighs 0.032 oz in total, so its pure metal can't be more. Caps a model that
// answered 1 (ounces) for 1 gram, which would show a melt value 31x too high.
export const capFineOz = (name: string, oz: number | null) => {
  const grams = /\boz\b/i.test(name) ? null : name.match(GRAMS_RE)?.[1];
  const gross = grams ? parseFloat(grams) * OZ_PER_GRAM : null;
  return oz !== null && gross !== null && oz > gross ? gross : oz;
};

// Purity from a jewelry stamp. Plated and filled stamps (GF, GP, RGP, HGE, vermeil, EP) are a thin
// layer over base metal, so they have no melt worth counting.
const PLATED_RE = /\b(?:gf|g\.f\.|gold[\s-]*filled|gp|rgp|hge|hgp|vermeil|ep(?:ns)?|plated|electroplate\w*|clad|filled)\b|\d+\/\d+\s*\d+\s*k/i;
const PURITY: [RegExp, Metal, number][] = [
  [/\b24\s*k(?:t|arat)?\b/i, 'gold', 0.999],
  [/\b(?:22\s*k(?:t|arat)?|916|917)\b/i, 'gold', 0.9167],
  [/\b(?:18\s*k(?:t|arat)?|750)\b/i, 'gold', 0.75],
  [/\b(?:14\s*k(?:t|arat)?|585|583)\b/i, 'gold', 0.583],
  [/\b(?:10\s*k(?:t|arat)?|417)\b/i, 'gold', 0.417],
  [/\b(?:9\s*k(?:t|arat)?|375)\b/i, 'gold', 0.375],
  [/\b(?:pt|plat(?:inum)?)\s*-?\s*950\b|\b950\s*(?:pt|plat)/i, 'platinum', 0.95],
  [/\b(?:pt|plat(?:inum)?)\s*-?\s*900\b|\b900\s*(?:pt|plat)/i, 'platinum', 0.9],
  [/\b(?:pd|pall(?:adium)?)\s*-?\s*950\b/i, 'palladium', 0.95],
  [/\b(?:925|sterling|ster)\b/i, 'silver', 0.925],
  [/\b(?:900|coin\s+silver)\b/i, 'silver', 0.9],
  [/\b800\b/i, 'silver', 0.8],
];

// "999" and "fine" are stamped on gold, silver, and platinum alike, so the metal comes from the item.
export const hallmarkPurity = (hallmark: string | null | undefined, metalHint?: unknown): { metal: Metal; purity: number } | null => {
  const s = String(hallmark ?? '').trim();
  if (!s || PLATED_RE.test(s)) return null;
  const hit = PURITY.find(([re]) => re.test(s));
  if (hit) return { metal: hit[1], purity: hit[2] };
  return /\b(?:999\.?9?|fine)\b/i.test(s) && isMetal(metalHint) ? { metal: metalHint, purity: 0.999 } : null;
};

// Melt for jewelry is plain arithmetic on two things read off the frame: the stamp and the scale.
export const jewelryFineOz = (item: Pick<AppraisalItem, 'hallmark' | 'gross_grams' | 'metal'>) => {
  const p = hallmarkPurity(item.hallmark, item.metal);
  const grams = typeof item.gross_grams === 'number' && item.gross_grams > 0 && item.gross_grams < 5000 ? item.gross_grams : null;
  return p && grams ? { metal: p.metal, oz: grams * OZ_PER_GRAM * p.purity } : null;
};

export const meltFor = (metal: Metal, oz: number, quantity: number, spot: number): Melt => ({
  metal,
  spot,
  oz,
  perPiece: spot * oz,
  total: spot * oz * Math.max(1, quantity),
});

export const ITEM_TYPES = [
  'coin',
  'banknote',
  'bullion',
  'token_medal',
  'trading_card',
  'sports_memorabilia',
  'comic_book',
  'toy_figure',
  'video_game',
  'vinyl_media',
  'electronics',
  'stamp',
  'jewelry_watch',
  'vintage_clothing',
  'antique_decor',
  'glass_pottery',
  'tools_household',
  'other',
] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const ITEM_TYPE_LABEL: Record<ItemType, string> = {
  coin: 'Coin',
  banknote: 'Paper money',
  bullion: 'Bullion',
  token_medal: 'Token / medal',
  trading_card: 'Trading card',
  sports_memorabilia: 'Sports memorabilia',
  comic_book: 'Comic book',
  toy_figure: 'Toy / figure',
  video_game: 'Video game',
  vinyl_media: 'Records / media',
  electronics: 'Electronics',
  stamp: 'Stamp',
  jewelry_watch: 'Jewelry / watch',
  vintage_clothing: 'Vintage clothing',
  antique_decor: 'Antique / decor',
  glass_pottery: 'Glass / pottery',
  tools_household: 'Household / garage sale',
  other: 'Collectible',
};

// PCGS CoinFacts only knows coins; everything else is valued from the AI estimate and melt.
export const isPcgsPriceable = (type: unknown) => type === 'coin' || type === 'bullion' || type === 'token_medal';

export interface CardId {
  game: 'magic' | 'pokemon' | 'yugioh' | 'sports' | 'other';
  name: string;
  set?: string | null;
  number?: string | null;
}

export interface AppraisalItem {
  is_collectible: boolean;
  item_type: ItemType;
  country?: string | null;
  item_name: string;
  year?: number | null;
  mint_mark?: string | null;
  pcgs_number?: string | null;
  grade_number?: number | null;
  plus_grade?: boolean | null;
  series_key: string;
  metal: string;
  fine_weight_oz?: number | null;
  hallmark?: string | null;
  gross_grams?: number | null;
  card?: CardId | null;
  quantity: number;
  is_slabbed: boolean;
  grading_service?: string | null;
  grade?: string | null;
  grade_estimate?: string | null;
  cert_number?: string | null;
  estimate_low_usd?: number | null;
  estimate_high_usd?: number | null;
  confidence: 'high' | 'medium' | 'low';
  // What makes this one worth more than a common copy; "" when nothing does.
  special?: string | null;
  notes: string;
}

export const APPRAISAL_SCHEMA = {
  type: 'OBJECT',
  properties: {
    is_collectible: { type: 'BOOLEAN' },
    item_type: { type: 'STRING', enum: [...ITEM_TYPES] },
    // Nothing reads it, but it stays: answering it before item_name steers names of world coins and notes.
    country: { type: 'STRING', nullable: true },
    item_name: { type: 'STRING' },
    year: { type: 'INTEGER', nullable: true },
    mint_mark: { type: 'STRING', nullable: true },
    pcgs_number: { type: 'STRING', nullable: true },
    grade_number: { type: 'INTEGER', nullable: true },
    plus_grade: { type: 'BOOLEAN', nullable: true },
    series_key: { type: 'STRING', enum: [...Object.keys(SERIES), 'other'] },
    metal: {
      type: 'STRING',
      enum: ['silver', 'gold', 'platinum', 'palladium', 'copper', 'nickel', 'clad', 'paper', 'other', 'unknown'],
    },
    fine_weight_oz: { type: 'NUMBER', nullable: true },
    hallmark: { type: 'STRING', nullable: true },
    gross_grams: { type: 'NUMBER', nullable: true },
    card: {
      type: 'OBJECT',
      nullable: true,
      properties: {
        game: { type: 'STRING', enum: ['magic', 'pokemon', 'yugioh', 'sports', 'other'] },
        name: { type: 'STRING' },
        set: { type: 'STRING', nullable: true },
        number: { type: 'STRING', nullable: true },
      },
      required: ['game', 'name'],
    },
    quantity: { type: 'INTEGER' },
    is_slabbed: { type: 'BOOLEAN' },
    grading_service: { type: 'STRING', nullable: true },
    grade: { type: 'STRING', nullable: true },
    grade_estimate: { type: 'STRING', nullable: true },
    cert_number: { type: 'STRING', nullable: true },
    estimate_low_usd: { type: 'NUMBER' },
    estimate_high_usd: { type: 'NUMBER' },
    confidence: { type: 'STRING', enum: ['high', 'medium', 'low'] },
    special: { type: 'STRING' },
    notes: { type: 'STRING' },
    // Names and price ranges only. A full second item would add output tokens on the critical path.
    others: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          item_name: { type: 'STRING' },
          quantity: { type: 'INTEGER' },
          estimate_low_usd: { type: 'NUMBER' },
          estimate_high_usd: { type: 'NUMBER' },
        },
        required: ['item_name', 'quantity', 'estimate_low_usd', 'estimate_high_usd'],
      },
    },
  },
  required: [
    'is_collectible',
    'item_type',
    'item_name',
    'series_key',
    'metal',
    'quantity',
    'is_slabbed',
    'estimate_low_usd',
    'estimate_high_usd',
    'confidence',
    'special',
    'notes',
    'others',
  ],
};

// Shared by both models. Seller frames show cases, shelves, and stacks behind the lot; valuing
// those would put a max bid on something that isn't for sale.
export const FOCUS_INSTRUCTION =
  'Appraise only the item being presented for sale right now: the one in hand, held up, pointed at, on the mat or tray, named by the lot title, or else closest to the camera. Ignore everything behind or around it (display cases, shelves, bins, stacks, other slabs), even if it looks more valuable. Read its slab/holder label, tags, hallmarks, brand marks, and on-screen text.';

// Shared by both models; the mintage rule is because real mintages come from a table, not the model.
export const SPECIAL_INSTRUCTION =
  'special: at most 12 words on what makes this exact item worth more than a common one (key date, scarce mint, error, variety, proof-like, rookie card, first edition, autograph, low print run, rare color), or "" if nothing does. Never give mintage or population numbers.';

// Identical on every call and sent as the system instruction, so Gemini's implicit prompt cache can
// reuse it; anything that varies per request belongs in appraisalContext.
export const APPRAISAL_INSTRUCTIONS = [
  'Collectibles and resale identifier. Image: a Whatnot livestream frame. Items can be coins, paper money, bullion, tokens, medals, trading cards, sports memorabilia, comics, toys, video games, records, stamps, jewelry, watches, vintage clothing, antiques, glassware, pottery, or general garage-sale goods. Answer fast.',
  FOCUS_INSTRUCTION,
  'others: other pieces of that same presented lot only (e.g. the rest of a held-up stack or a tray of pieces sold together), priciest first; [] when the lot is one item. Group similar cheap pieces as one entry with a quantity and a per-piece estimate. Do not repeat the main item, and never list background items, chat, buttons, or price tags overlaid on the video.',
  'The show title, Whatnot category, and lot title hint at what is being sold (a "Sports Cards" show is probably selling cards), but trust the image when they disagree, since mixed and garage-sale shows sell anything.',
  'is_collectible: true for any item with resale value; false only when no sellable item is visible or it cannot be identified.',
  'item_type: banknote for any paper or polymer money; token_medal for tokens and medals; jewelry_watch for jewelry, watches, and hallmarked sterling or karat-gold pieces (including flatware); electronics for phones, radios, cameras, audio gear, and computers; tools_household for everyday garage-sale goods; other if nothing fits.',
  'country: issuing country for money ("United States" for US); otherwise the maker country if known, else null.',
  'item_name: be specific. Money: country (if not US), denomination, and year/series, e.g. "1957 $1 Silver Certificate", "1923 Weimar 1 Million Mark", "1964 Canada Silver Dollar". Everything else: year or era, brand/maker, line/model, and number or edition, e.g. "1986 Fleer Michael Jordan #57", "1978 Kenner Star Wars Boba Fett", "1960s Pyrex Butterprint Mixing Bowl", "1970s Levi\'s 501 Redline Selvedge Jeans".',
  'series_key: only for the precious-metal coin issue (us_90_* = US pre-1965 silver, canada_80_* = Canada 1920-1967 silver), else "other".',
  'metal / fine_weight_oz: troy oz of pure precious metal per piece for coins, bullion, and hallmarked sterling or karat-gold items when the weight is shown or stated; null for base metal, paper, and anything whose weight you cannot tell. Convert grams: 1 g = 0.03215 troy oz (a 1 g bar is 0.03215, not 1). quantity: pieces in the lot; count every identical piece shown (two 1 g bars = 2).',
  'hallmark / gross_grams: jewelry, watches, flatware, and other hallmarked pieces only (not coins or bullion): the purity stamp exactly as shown, e.g. "14K", "585", "925", "PT950", "1/20 12K GF", and the total weight in grams from a scale display or the listing. Null when not shown; never guess a weight.',
  'card: trading cards only: game (magic, pokemon, yugioh, sports, other), the card\'s own printed name (e.g. "Charizard", "Black Lotus", "Dark Magician"), its set name, and the collector number as printed (e.g. "4/102", "LOB-005"); null for everything else.',
  'grade: from a slab or the listing only; grade_estimate: rough raw range like "VF-XF" (coins), "AU-CU" (paper), "PSA 7-8" (cards), or a condition like "Near Mint", "Good, light wear", "complete in box" for everything else. cert_number: only if legible.',
  'Slabs: read grading_service (coins: PCGS/NGC/ANACS/ICG/CACG; paper: PMG/PCGS Banknote/CGA; cards: PSA/BGS/SGC/CGC; comics: CGC/CBCS; games: WATA/VGA; autographs: PSA/DNA, JSA, Beckett), grade (e.g. "MS 63", "PMG 64 EPQ", "PSA 10", "CGC 9.8"; include +, PL, DMPL, CAC sticker, star note, auto grade), and cert_number from the label or listing.',
  'year / mint_mark: the date (series year for paper, release or manufacture year for everything else) and coin mint mark ("" for no mint mark / Philadelphia, null for anything that is not a coin). Null if not readable.',
  'pcgs_number: US or world coins only: the PCGS CoinFacts coin number for this exact date, mint, and designation (PL/DMPL/RD/Cameo variants have their own numbers); null if you are not sure. It gets verified, so never invent one. Null for everything that is not an unaltered coin (paper money, hobo nickel carvings, counterstamps, coin jewelry, cards, and all other items).',
  'estimate_low_usd / estimate_high_usd: per-piece US price range where most recent SOLD copies of this exact item in this condition land (eBay sold or Whatnot), i.e. the middle of typical sales, not asking prices and not the full span from junk to perfect. Account for errors, star notes, fancy serials, signature combos, autographs, rookie cards, first editions, completeness, original box or tags, damage, and the chance it is a reproduction.',
  'Keep the range tight: high should be at most about 2x low. Go wider only when value hinges on something the image cannot show (an ungraded card\'s centering, whether electronics work), and say so in notes. If you are unsure, center the range on what similar items commonly sell for rather than widening it. Always give a range when is_collectible is true, even for cheap garage-sale goods; use 0 for both only when is_collectible is false.',
  'grade_number: the numeric 1-70 grade printed on the slab; null for a raw coin and for anything that is not a coin. plus_grade: true only for a + printed on the slab.',
  SPECIAL_INSTRUCTION,
  'notes: one short sentence on what limits accuracy (e.g. authenticity, size, or condition that cannot be checked on camera).',
].join('\n');

export interface CasePackPromptInput {
  lotNumber?: number | null;
  count?: number | null;
  countSource?: CountSource | string | null;
  pin?: string | null;
}

export interface AppraisalContext {
  pageText: string;
  showTitle: string;
  lotTitle?: string | null;
  lotSubtitle?: string | null;
  categories?: string[];
  showType?: ShowType;
  showNotes?: string | null;
  casePack?: CasePackPromptInput | null;
}

const sourcePhrase = (src: CountSource | string | null | undefined): string => {
  if (src === 'mod') return 'a mod';
  if (src === 'notes') return 'the notes';
  if (src === 'subtitle') return 'the subtitle';
  return 'the title';
};

// Per request rather than in the cached instructions, so every show type shares one cache entry.
export const appraisalContext = ({
  pageText,
  showTitle,
  lotTitle,
  lotSubtitle,
  categories = [],
  showType = 'general',
  showNotes,
  casePack,
}: AppraisalContext) => {
  const baseNotes = noteForPrompt(showNotes);
  const runnerSupp = runnerNoteSupplement(showNotes);
  const notes = [baseNotes, runnerSupp].filter(Boolean).join('\n');
  const isWholesale =
    showType === 'wholesale' ||
    Boolean(casePack) ||
    /\b(?:case\s*packs?|casepacks?)\b/i.test(lotTitle ?? '');
  const effectiveShowType: ShowType = isWholesale ? 'wholesale' : showType;

  const pinObj = casePack?.pin ? contentsLine(casePack.pin) : null;
  const resolvedCase = isWholesale
    ? resolveLotCount({
        lotTitle,
        lotSubtitle,
        notes: showNotes,
        pin: pinObj,
      })
    : null;
  const cpCount = casePack?.count !== undefined ? casePack.count : (resolvedCase?.count ?? null);
  const cpSource = casePack?.countSource !== undefined ? casePack.countSource : (resolvedCase?.source ?? null);
  const cpNum = casePack?.lotNumber !== undefined ? casePack.lotNumber : lotNumber(lotTitle);
  const cpPinText = casePack?.pin ?? null;
  const genericCase = isWholesale && Boolean(lotTitle && isGenericCaseLot(lotTitle));

  const runnerOn = !isWholesale && runnerPassOn(showNotes);
  const runnerNamed = !isWholesale && lotTitle ? runnerItemName(lotTitle, runnerOn) : null;
  const tools = !isWholesale && toolsPassOn({ lotTitle, showTitle, categories, notes: showNotes, showType: effectiveShowType });
  const electronics =
    !isWholesale && !tools && electronicsPassOn({ lotTitle, showTitle, categories, notes: showNotes, showType: effectiveShowType });
  const pull = !isWholesale && !runnerNamed && Boolean(lotTitle && isPullBucket(lotTitle, showTitle));
  const template = !isWholesale && !runnerNamed && !tools && !electronics && Boolean(lotTitle && isTemplate(lotTitle));
  const msrp = !pull && !genericCase && lotTitle ? readMsrp(runnerNamed ?? lotTitle) : null;
  let page = pageText;
  if ((pull || template || genericCase) && lotTitle) {
    page = page.split(lotTitle).join(' ').replace(/[ \t]{2,}/g, ' ').trim();
  } else if (runnerNamed && lotTitle) {
    page = page.split(lotTitle).join(runnerNamed).replace(/[ \t]{2,}/g, ' ').trim();
  } else if (msrp && lotTitle) {
    page = page.split(lotTitle).join(msrp.cleanTitle).replace(/[ \t]{2,}/g, ' ').trim();
  }
  const pass =
    !isWholesale &&
    !runnerNamed &&
    !tools &&
    !electronics &&
    estatePassOn({ lotTitle, showTitle, categories, notes: showNotes, showType: effectiveShowType });

  let lotLine = '';
  if (genericCase) {
    const bits = [
      cpNum != null ? `lot ${cpNum}` : 'case-pack lot',
      cpCount != null ? `${cpCount} ${cpCount === 1 ? 'piece' : 'pieces'} stated by ${sourcePhrase(cpSource)}` : null,
      cpPinText ? `pinned "${cpPinText}"${pinObj?.name ? ` (${pinObj.name})` : ''}` : null,
    ].filter(Boolean);
    lotLine = `Listing context: ${bits.join(', ')}. The listing title is a case-pack bucket, not the item name.`;
  } else if (pull) {
    lotLine = pullContext(lotTitle, showTitle) ?? '';
  } else if (template) {
    lotLine = templateContext(lotTitle) ?? '';
  } else if (msrp) {
    lotLine = pullContext(runnerNamed ?? lotTitle, showTitle) ?? '';
  } else if (runnerNamed) {
    lotLine = `Current lot title: ${runnerNamed}`;
  } else if (lotTitle) {
    const extraBits = isWholesale
      ? [
          cpCount != null ? `${cpCount} ${cpCount === 1 ? 'piece' : 'pieces'} stated by ${sourcePhrase(cpSource)}` : null,
          cpPinText ? `pinned "${cpPinText}"` : null,
        ].filter(Boolean)
      : [];
    lotLine = `Current lot title: ${lotTitle}${extraBits.length ? ` (${extraBits.join(', ')})` : ''}`;
  }

  return [
    `Show: ${showTitle || 'unknown'}`,
    categories.length ? `Whatnot category: ${categories.join(' > ')}` : '',
    lotLine,
    notes ? `Seller show notes (rules and what is in the show; the image still wins):\n${notes}` : '',
    SHOW_TYPES[effectiveShowType].hint ?? '',
    isWholesale ? CASE_PACK_HINT : tools ? TOOLS_HINT : electronics ? ELECTRONICS_HINT : pass ? ESTATE_HINT : '',
    'Listing text (title, bid, grade, or cert):',
    page || '(none)',
  ]
    .filter(Boolean)
    .join('\n');
};

export const reconcileCount = (
  statedCount: number | null | undefined,
  modelQuantity: number | null | undefined,
): { quantity: number; countNote: string | null } => {
  const model = Math.max(1, Math.round(modelQuantity || 1));
  if (statedCount != null && statedCount > 0) {
    const stated = Math.round(statedCount);
    if (model <= 1) {
      return { quantity: stated, countNote: stated > 1 ? `${stated} stated` : null };
    }
    if (model !== stated) {
      return {
        quantity: Math.min(stated, model),
        countNote: `${model} counted · ${stated} stated`,
      };
    }
    return { quantity: stated, countNote: stated > 1 ? `${stated} stated` : null };
  }
  return { quantity: model, countNote: null };
};

export interface AuctionSummary {
  count: number;
  median?: number;
  low?: number;
  high?: number;
  lastAt: number;
  lastPrice: number;
}

const median = (nums: number[]) => {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};

export const summarizeAuctions = (
  auctions: { Price?: unknown; Date?: unknown; IsCAC?: unknown }[] | undefined,
  now: number,
  recentYears = 3,
): AuctionSummary | null => {
  const cutoff = now - recentYears * 365 * 24 * 60 * 60 * 1000;
  const sales = (auctions ?? [])
    .map((a) => ({ price: Number(a.Price), at: Date.parse(String(a.Date)), cac: Boolean(a.IsCAC) }))
    .filter((a) => a.price > 0 && Number.isFinite(a.at))
    .sort((a, b) => b.at - a.at);
  // CAC-stickered coins sell at a premium; keep them out of a non-CAC median when possible.
  const plain = sales.filter((s) => !s.cac);
  const pool = (plain.length >= 2 ? plain : sales).filter((s) => s.at >= cutoff).slice(0, 10);
  const newest = sales[0];
  if (!pool.length) return newest ? { count: 0, lastAt: newest.at, lastPrice: newest.price } : null;
  const prices = pool.map((s) => s.price);
  return {
    count: pool.length,
    median: median(prices),
    low: Math.min(...prices),
    high: Math.max(...prices),
    lastAt: pool[0]!.at,
    lastPrice: pool[0]!.price,
  };
};

const normMint = (m: unknown) =>
  String(m ?? '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .replace(/^P$/, '');

const YEAR_WORD = /^(1[6-9]\d\d|20\d\d)$/;
// Grades, services, and filler. Left in, they would make unrelated coins look like the same one.
const NAME_NOISE = new Set([
  'pcgs', 'ngc', 'anacs', 'icg', 'cacg', 'cac', 'coin', 'coins', 'graded', 'certified', 'slab', 'slabbed',
  'proof', 'business', 'strike', 'mint', 'state', 'ms', 'au', 'xf', 'ef', 'vf', 'vg', 'ag', 'pr', 'pf', 'sp',
  'bu', 'unc', 'pl', 'rb', 'rd', 'bn', 'cam',
]);
const DENOM_WORD = new Set(['dollar', 'dollars', 'cent', 'cents', 'nickel', 'nickels', 'dime', 'dimes', 'quarter', 'quarters']);
const METAL_WORD = new Set(['gold', 'silver', 'platinum', 'palladium']);

const coinWords = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !NAME_NOISE.has(w) && !YEAR_WORD.test(w));

// The CoinFacts name and the name read off the item have to be the same issue. A shared
// denomination is not enough, and a metal, denomination number, or size the other name contradicts
// is a different coin.
export const coinNamesAgree = (pcgsName: string, itemName: string) => {
  const a = coinWords(pcgsName);
  const b = coinWords(itemName);
  const picked = (list: string[], set: Set<string>) => new Set(list.filter((w) => set.has(w)));
  const conflicts = (left: Set<string>, right: Set<string>) => left.size > 0 && right.size > 0 && [...left].some((w) => !right.has(w));
  if (conflicts(picked(a, METAL_WORD), picked(b, METAL_WORD))) return false;
  if ((picked(a, METAL_WORD).size > 0) !== (picked(b, METAL_WORD).size > 0)) return false;
  const nums = (list: string[]) => new Set(list.filter((w) => /^\d+$/.test(w)));
  if (conflicts(nums(a), nums(b))) return false;
  const series = (list: string[]) => list.filter((w) => !DENOM_WORD.has(w) && !METAL_WORD.has(w) && !/^\d+$/.test(w));
  const sa = series(a);
  const sb = series(b);
  if (!sa.length || !sb.length) return false;
  const shorter = sa.length <= sb.length ? sa : sb;
  const longer = sa.length <= sb.length ? sb : sa;
  const longerSet = new Set(longer);
  if (!shorter.every((w) => longerSet.has(w))) return false;
  // "Double eagle" is not a $10 eagle, but "$20 Saint-Gaudens" is the same coin as "Saint-Gaudens double eagle".
  const has = (list: string[], word: string) => list.includes(word);
  const sizeOk = (left: string[], right: string[]) =>
    (!has(left, 'double') || has(right, 'double') || has(right, '20')) && (!has(left, 'tenth') || has(right, 'tenth') || has(right, '10'));
  return sizeOk(a, b) && sizeOk(b, a);
};

// A spec number or cert from the model is a guess until CoinFacts names the same coin. Year is
// required. Mint is required for a spec-number lookup; a cert may omit it when the holder didn't
// show one, but a mint that was read still has to agree.
export const matchesCoin = (
  data: { Year?: unknown; Name?: unknown; MintMark?: unknown },
  item: Partial<Pick<AppraisalItem, 'year' | 'mint_mark' | 'item_name'>>,
  requireMint = true,
) => {
  const pcgsYear =
    parseInt(String(data.Year ?? ''), 10) || parseInt(String(data.Name ?? '').match(/\b(1[6-9]\d\d|20\d\d)\b/)?.[1] ?? '', 10);
  if (!item.year || !pcgsYear || Number(item.year) !== pcgsYear) return false;
  if (item.mint_mark == null) {
    if (requireMint) return false;
  } else if (normMint(data.MintMark) !== normMint(item.mint_mark)) return false;
  return coinNamesAgree(String(data.Name ?? ''), item.item_name ?? '');
};

export interface PriceInfo {
  guide: number | null;
  auctions: AuctionSummary | null;
}

export interface Estimate {
  low: number;
  high: number;
}

// The model's per-piece range; one usable bound stands in for both.
export const estimateOf = (item: Pick<AppraisalItem, 'estimate_low_usd' | 'estimate_high_usd'>): Estimate | null => {
  const usable = (n: unknown) => (typeof n === 'number' && n > 0 && Number.isFinite(n) ? n : null);
  const a = usable(item.estimate_low_usd);
  const b = usable(item.estimate_high_usd);
  const low = a ?? b;
  const high = b ?? a;
  if (low === null || high === null) return null;
  return { low: Math.min(low, high), high: Math.max(low, high) };
};

export type ValueBasis = 'auctions' | 'guide' | 'market' | 'whatnot' | 'estimate' | 'melt' | 'none';

export const BASIS_LABEL: Record<ValueBasis, string> = {
  auctions: 'recent PCGS sales',
  guide: 'PCGS guide',
  market: 'TCGplayer market price',
  whatnot: 'Whatnot sales you watched',
  estimate: 'AI estimate',
  melt: 'melt',
  none: '',
};

// One matching sale could be a fluke or a different variant; two or more set the value.
export const MIN_COMPS = 2;

export interface Valuation {
  marketValue: number | null;
  meltValue: number | null;
  suggestedMax: number | null;
  basis: ValueBasis;
}

// Collector value comes from PCGS auction sales, a card's exact market price, Whatnot sales you
// watched, then the model's rough estimate, and never drops below melt. The PCGS price guide is a
// retail figure, not a sale, so it never sets this number. The suggested max is a walk-away price:
// a share of a realized price, melt for bullion, and never above the low end of an AI-only range.
export const computeValue = (
  {
    quantity,
    melt,
    price,
    market = null,
    estimate = null,
    comps = null,
  }: { quantity: number; melt: Melt | null; price: PriceInfo | null; market?: number | null; estimate?: Estimate | null; comps?: CompSummary | null },
  maxBidPercent = 80,
): Valuation => {
  const qty = Math.max(1, quantity || 1);
  const meltValue = melt ? melt.total : null;
  const estimateMid = estimate ? (estimate.low + estimate.high) / 2 : null;
  const compMedian = comps && comps.count >= MIN_COMPS ? comps.median : null;
  const marketPrice = market && market > 0 ? market : null;
  const perCoin = price?.auctions?.median ?? marketPrice ?? compMedian ?? estimateMid;
  let basis: ValueBasis = price?.auctions?.median
    ? 'auctions'
    : marketPrice
      ? 'market'
      : compMedian
        ? 'whatnot'
        : estimateMid
          ? 'estimate'
          : 'none';
  const collector = perCoin !== null ? perCoin * qty : null;
  const marketValue = collector !== null ? Math.max(collector, meltValue ?? 0) : meltValue;
  if (marketValue === null) return { marketValue: null, meltValue, suggestedMax: null, basis };
  // An estimate that doesn't clear melt is just the metal floor, so it isn't labeled as a guess.
  if (basis === 'estimate' && meltValue !== null && (collector ?? 0) <= meltValue) basis = 'melt';
  else if (basis === 'none' && meltValue !== null) basis = 'melt';
  let share = basis === 'melt' ? marketValue : (marketValue * maxBidPercent) / 100;
  if (basis === 'estimate' && estimate) share = Math.min(share, estimate.low * qty);
  const suggestedMax = Math.round(Math.max(share, meltValue ?? 0) * 100) / 100;
  return { marketValue: Math.round(marketValue * 100) / 100, meltValue, suggestedMax, basis };
};

// Two besides the main item: three lines fill the card, and more output would slow the answer.
const MAX_OTHERS = 2;
// A bad count on a bin of goods should not turn into a huge total.
const MAX_PILE = 24;

export interface OtherItem {
  item_name: string;
  quantity: number;
  estimate_low_usd: number;
  estimate_high_usd: number;
}

export interface LotPiece {
  name: string;
  quantity: number;
  total: number;
  guess: boolean;
}

export interface LotRollup {
  total: number;
  pieces: LotPiece[];
}

const roundMoney = (n: number) => Math.round(n * 100) / 100;

export const lotLine = (p: LotPiece) => `${p.name}${p.quantity > 1 ? ` ×${p.quantity}` : ''} ${formatMoney(p.total)}${p.guess ? ' AI' : ''}`;

// Drops blank names and ranges the model didn't actually price. Caps the pile so one wild quantity
// can't dominate the total.
export const parseOthers = (raw: unknown): OtherItem[] => {
  if (!Array.isArray(raw)) return [];
  const out: OtherItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const name = String(r.item_name ?? '').trim().slice(0, 80);
    const estimate = estimateOf({
      estimate_low_usd: typeof r.estimate_low_usd === 'number' ? r.estimate_low_usd : null,
      estimate_high_usd: typeof r.estimate_high_usd === 'number' ? r.estimate_high_usd : null,
    });
    if (!name || !estimate) continue;
    const qty = typeof r.quantity === 'number' && r.quantity > 0 ? Math.min(MAX_PILE, Math.round(r.quantity)) : 1;
    out.push({ item_name: name, quantity: qty, estimate_low_usd: estimate.low, estimate_high_usd: estimate.high });
    if (out.length === MAX_OTHERS) break;
  }
  return out;
};

// The full appraisal stays on one item. Everything else is an AI range counted at its low end, so
// the total of a crowded frame doesn't look better than a guess. One item returns null: the card
// stays as it is.
export const lotRollup = (
  primary: { name: string; quantity: number; marketValue: number | null; basis: ValueBasis },
  others: unknown,
): LotRollup | null => {
  const pieces: LotPiece[] = [];
  const name = primary.name.trim();
  const qty = Math.max(1, primary.quantity || 1);
  if (name && primary.marketValue !== null && primary.basis !== 'none') {
    pieces.push({ name, quantity: qty, total: primary.marketValue, guess: primary.basis === 'estimate' });
  }
  const seen = new Set(pieces.map((p) => p.name.toLowerCase()));
  for (const o of parseOthers(others)) {
    const key = o.item_name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    pieces.push({ name: o.item_name, quantity: o.quantity, total: roundMoney(o.estimate_low_usd * o.quantity), guess: true });
  }
  if (pieces.length < 2) return null;
  pieces.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  const top = pieces.slice(0, MAX_OTHERS + 1);
  return { total: roundMoney(top.reduce((sum, p) => sum + p.total, 0)), pieces: top };
};

export interface AppraisalRecord {
  id: string;
  at: number;
  liveId: string | null;
  showTitle: string | null;
  lotId: string | null;
  lotTitle: string | null;
  // The listing line the quick read came from; key dates are matched against it too.
  listing?: string | null;
  name: string;
  itemType?: ItemType | null;
  year?: number | null;
  mintMark?: string | null;
  slabbed?: boolean;
  special?: string | null;
  grade: string | null;
  quantity: number;
  countNote?: string | null;
  confidence: AppraisalItem['confidence'] | 'quick';
  model: string | null;
  melt: Melt | null;
  price: (PriceInfo & { name?: string; link?: string | null; source?: string }) | null;
  comps?: CompSummary | null;
  priceNote: string | null;
  // The AI's range after the show-type correction; rawEstimate is what the model said.
  estimate?: Estimate | null;
  rawEstimate?: Estimate | null;
  calibration?: Calibration | null;
  // Card or record database prices and grading-company cert checks, filled in after the answer.
  refs?: RefPrice[];
  refNotes?: string[];
  valuation: Valuation;
  // Set when the presented lot has more than one item: the priciest lines and their total.
  lot?: LotRollup | null;
  // How much of the frame was looked at.
  showType?: ShowType;
  // Flea-market table scan, filled in after the answer is on screen. null: not run, or it failed.
  table?: TableItem[] | null;
  tableNote?: string | null;
  notes: string | null;
  elapsedMs: number;
}

const SALE_BASIS = new Set<ValueBasis>(['auctions', 'market', 'whatnot']);
// Melt is a checked metal floor. It can cap a bid, and it is not a sale price, so it is not a "Max bid".
const GUARD_BASIS = new Set<ValueBasis>(['auctions', 'market', 'whatnot', 'melt']);

// The number on the card. A PCGS sale, an exact card price, or two or more Whatnot comps can say
// "Max bid". Melt is labeled as melt. A model range says it is a guess, at its low end. A price
// guide is labeled as a guide. A low-confidence read says nothing you could bid.
export const bidHeadline = (record: Pick<AppraisalRecord, 'confidence' | 'valuation' | 'price' | 'quantity'>): string | null => {
  if (record.confidence === 'low') return null;
  const v = record.valuation;
  if (SALE_BASIS.has(v.basis) && v.suggestedMax !== null) return `Max bid ${formatMoney(v.suggestedMax)}`;
  if (v.basis === 'melt' && v.suggestedMax !== null) return `Melt ${formatMoney(v.suggestedMax)}`;
  if (v.basis === 'estimate' && v.suggestedMax !== null) return `Guess, low end ${formatMoney(v.suggestedMax)}`;
  if (v.basis === 'guide' && v.marketValue !== null) return `Guide ${formatMoney(v.marketValue)}`;
  const guide = record.price?.guide;
  if (v.basis === 'none' && guide && guide > 0) {
    const qty = Math.max(1, record.quantity || 1);
    return qty > 1 ? `Guide ${formatMoney(guide)} each` : `Guide ${formatMoney(guide)}`;
  }
  return null;
};

// What a bid may be judged against. Low confidence, a price guide, and an empty result are not
// ceilings. A model-only value caps at the low end on the card, and that midpoint is not a market price.
export const guardAppraisal = (
  record: Pick<AppraisalRecord, 'confidence' | 'valuation'> | null,
): { marketValue: number | null; suggestedMax: number | null } | null => {
  if (!record || record.confidence === 'low') return null;
  const v = record.valuation;
  if (v.basis === 'estimate') return v.suggestedMax !== null ? { marketValue: null, suggestedMax: v.suggestedMax } : null;
  if (GUARD_BASIS.has(v.basis)) return { marketValue: v.marketValue, suggestedMax: v.suggestedMax };
  return null;
};
