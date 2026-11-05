// Values for wheel prizes, so the odds have something to work with before you type your own.
// Real prices come first (melt from spot, Whatnot sold comps); the AI only fills what's left.
// Every range is valued at its low end so the wheel never looks better than the data backs.
import type { Metal } from './appraisal';
import { isHiddenPrize, isNumberedPrize, prizeIdentity } from './breaks';
import { noteForPrompt } from './showNotes';
import { DAY } from './time';

export type PrizeSource = 'melt' | 'sold' | 'ai';

export interface PrizeValue {
  low: number;
  high: number | null;
  source: PrizeSource;
  note: string | null;
  at: number;
  // For an envelope prize, what the stream showed inside it; the value is for that item.
  inside?: string;
}

export interface PrizeItem {
  title: string;
  // Condition text from the seller's checklist, "" when none.
  detail: string;
}

export interface PrizeContext {
  showTitle: string | null;
  wheelTitle: string | null;
  categories: string[];
  // The seller's show notes: rules and what the wheel is made of.
  notes?: string | null;
}

export const PRIZE_VALUE_TTL_MS: Record<PrizeSource, number> = { melt: DAY, sold: DAY, ai: 7 * DAY };

export const isFresh = (v: PrizeValue | undefined, now: number) => Boolean(v && now - v.at < PRIZE_VALUE_TTL_MS[v.source]);

const GRAMS_PER_OZ = 31.1035;
const KARAT: [RegExp, number][] = [
  [/\b24\s*k(?:t|arat)?\b|(?<![\d])\.?9999?(?!\d)|\bfine\b/i, 1],
  [/\b22\s*k(?:t|arat)?\b/i, 0.9167],
  [/\b18\s*k(?:t|arat)?\b/i, 0.75],
  [/\b14\s*k(?:t|arat)?\b/i, 0.583],
  [/\b10\s*k(?:t|arat)?\b/i, 0.417],
];
// Natural nuggets run roughly 80-92% gold; the bottom of that keeps melt a floor.
const NUGGET_PURITY = 0.8;
// A box or pack with a chance at metal is not that metal: "1OZ GOLD CHASE RIP/SHIP" is a sealed box.
// Clad and gilt are base metal with a color, not the metal named beside them.
const NOT_BULLION_RE = /\bchase\b|\brip\b|rip\s*\/\s*ship|\bbox\b|\bpacks?\b|\bbreak\b|\bmystery\b|\brandom\b|\bchance\b|\bspot\b|\bclad\b|\bgilt\b/i;
const WEIGHT_RE = /(?<![\d/.])(\d+\/\d+|\d*\.?\d+)(?:st|nd|rd|th)?\s*(grams?|gr?|oz|ozt|troy\s*oz|kilos?|kg)\b/i;
const METAL_RE = /\b(gold|silver|platinum|palladium)\b/i;

export interface PrizeMelt {
  metal: Metal;
  oz: number;
  purity: number;
  note: string | null;
}

// Only titles that state both the metal and its weight, like "1.51 GRAMS GOLD NUGGETS".
export const prizeMelt = (title: string): PrizeMelt | null => {
  if (NOT_BULLION_RE.test(title)) return null;
  const metal = title.match(METAL_RE)?.[1]?.toLowerCase() as Metal | undefined;
  const weight = title.match(WEIGHT_RE);
  if (!metal || !weight?.[1] || !weight[2]) return null;
  const [num, den] = weight[1].split('/').map(Number);
  const amount = den ? num! / den : parseFloat(weight[1]);
  if (!(amount > 0)) return null;
  const oz = /^g/i.test(weight[2]) ? amount / GRAMS_PER_OZ : /^k/i.test(weight[2]) ? (amount * 1000) / GRAMS_PER_OZ : amount;
  if (oz > 50) return null;
  const karat = KARAT.find(([re]) => re.test(title));
  if (karat) return { metal, oz, purity: karat[1], note: null };
  if (/\bnuggets?\b/i.test(title)) return { metal, oz, purity: NUGGET_PURITY, note: 'natural nugget, melt at 80% purity' };
  return { metal, oz, purity: 1, note: null };
};

const GRADE_RE = /\b(?:pcgs|ngc|icg|anacs|pmg)\b|\b(?:ms|pf|pr|au|xf|ef|vf|vg)\s*-?\s*\d{1,2}\b/i;
// "(.01)" before "Wheat" is the face value. ".10 gram" is a weight and is left alone.
const FACE_RE = /\(?\.(?:01|05|10|25|50)\)?(?=\s*(?:lincoln|wheat|indian|cent|penny|roosevelt|rosevelt|dime|washington|quarter|kennedy|half)\b)/gi;

// Seller shorthand, so melt and sold comps see the coin instead of the abbreviation.
// A trailing "good" is Whatnot's condition bucket and does not replace PR70 or MS69.
export const clarifyPrizeName = (title: string): string => {
  let s = title.replace(/\s+/g, ' ').trim();
  s = s.replace(FACE_RE, ' ');
  s = s.replace(/\base\b/gi, 'American Silver Eagle');
  s = s.replace(/\brosevelt\b/gi, 'Roosevelt');
  s = s.replace(/\b(\d+\s*\/\s*\d+)(?:st|nd|rd|th)?\s*gold\b/gi, (_, frac: string) => `${frac.replace(/\s+/g, '')} oz gold`);
  if (GRADE_RE.test(s)) s = s.replace(/\b(?:good|fair|poor)\b\s*$/i, '');
  return s.replace(/\s+/g, ' ').trim();
};

export interface ManifestItem {
  qty: number;
  name: string;
}

export interface PrizeManifest {
  items: ManifestItem[];
  // Whatnot stores 1000 characters. A description that long, or one that ends mid-word, is not the whole list.
  truncated: boolean;
}

const DESC_CAP = 1000;

// "1x 2024 1oz silver pr70 (temperance) (ngc) good" lines, split on the seller's arrows or newlines.
// A truncated description that starts the list over again stops at the first repeat.
// capped: Whatnot keeps 1000 characters of a break description. Show notes are not cut off that way.
export const parseManifest = (description: string | null | undefined, opts?: { capped?: boolean }): PrizeManifest => {
  const raw = description ?? '';
  const collapsed = raw.replace(/\s+/g, ' ').trim();
  if (!collapsed) return { items: [], truncated: false };
  const truncated = opts?.capped !== false && (raw.length >= DESC_CAP || collapsed.length >= DESC_CAP);
  const cutOff = truncated && !/\b(?:good|fair|poor)\s*$/i.test(collapsed);
  const parts = raw
    .split(/👉🏼|➡️|\n+/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const items: ManifestItem[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    if (cutOff && i === parts.length - 1) break;
    const m = part.match(/(\d+)\s*[x×]\s*(.+)$/i);
    if (!m?.[1] || !m[2]) continue;
    const qty = parseInt(m[1], 10);
    const name = clarifyPrizeName(m[2]);
    if (!(qty > 0) || !name) continue;
    const key = prizeIdentity(name);
    if (!key) continue;
    // The rest of a cut-off description is the list pasted a second time.
    if (truncated && seen.has(key)) break;
    seen.add(key);
    items.push({ qty, name });
  }
  return { items, truncated };
};

// The break description is the prize list. Show notes supply the same lines when that list is
// missing or cut off. A coin already named in the description is not added again.
export const manifestFrom = (description: string | null | undefined, notes?: string | null): PrizeManifest => {
  const listed = parseManifest(description);
  if (listed.items.length && !listed.truncated) return listed;
  const extra = parseManifest(notes, { capped: false });
  if (!extra.items.length) return listed;
  const seen = new Set(listed.items.map((item) => prizeIdentity(item.name)));
  const items = [...listed.items];
  for (const item of extra.items) {
    const key = prizeIdentity(item.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    items.push(item);
  }
  if (!listed.items.length) return { items, truncated: false };
  return { items, truncated: true };
};

const showNotesLine = (notes?: string | null) => {
  const text = noteForPrompt(notes);
  return text ? `Show notes: ${text}` : '';
};

export const PRIZE_INSTRUCTIONS = [
  'You value prizes on a Whatnot mystery wheel. For each numbered prize, give the per-prize US price range where recent sold copies land (eBay sold or Whatnot sold), not asking or retail prices.',
  '"RIP/SHIP" means the seller opens that sealed box or pack and ships what is inside: value it at what the sealed product sells for.',
  '"GENUINE ICG CERT" or similar means an authenticated slab of that item.',
  'Conditions for raw coins are Whatnot groups: "Poor - Fair", "Good - Extremely Fine", or "Uncirculated - Mint"; a lone "Fair" or "Good" means that group. Value a group at its lowest grade, e.g. Good - Extremely Fine as Good. A listed grade like "MS 63" or "PR70" is exact and is not lowered because the line also says good, fair, or poor.',
  '"Clad" is a modern copper-nickel coin with no precious-metal melt. "Gilt copper" is copper, not gold. A face value such as "(.01)", ".10", ".25", or ".50" is the denomination, not a weight. "Ase" means American Silver Eagle.',
  'Be conservative: if unsure, lean low. Keep high at most 2x low. Never answer 0.',
].join('\n');

export const PRIZE_SCHEMA = {
  type: 'object',
  properties: {
    prizes: {
      type: 'array',
      items: {
        type: 'object',
        properties: { i: { type: 'integer' }, low: { type: 'number' }, high: { type: 'number' } },
        required: ['i', 'low', 'high'],
        additionalProperties: false,
      },
    },
  },
  required: ['prizes'],
  additionalProperties: false,
};

// Gemini's responseSchema uses OpenAPI casing and no additionalProperties.
export const PRIZE_SCHEMA_GEMINI = {
  type: 'OBJECT',
  properties: {
    prizes: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { i: { type: 'INTEGER' }, low: { type: 'NUMBER' }, high: { type: 'NUMBER' } },
        required: ['i', 'low', 'high'],
      },
    },
  },
  required: ['prizes'],
};

export const prizePrompt = (prizes: PrizeItem[], ctx: PrizeContext) =>
  [
    ctx.showTitle ? `Show: ${ctx.showTitle}` : '',
    ctx.wheelTitle ? `Wheel: ${ctx.wheelTitle}` : '',
    ctx.categories.length ? `Categories: ${ctx.categories.join(', ')}` : '',
    showNotesLine(ctx.notes),
    'Prizes:',
    ...prizes.map((p, i) => `${i + 1}. ${p.title}${p.detail ? ` (condition: ${p.detail})` : ''}`),
  ]
    .filter(Boolean)
    .join('\n');

// Indices are 1-based in the prompt. A swapped range still counts; its smaller number is the low.
export const parsePrizeAnswer = (text: string, count: number): ({ low: number; high: number } | null)[] => {
  const out: ({ low: number; high: number } | null)[] = Array.from({ length: count }, () => null);
  let rows: unknown;
  try {
    rows = (JSON.parse(text) as { prizes?: unknown }).prizes;
  } catch {
    return out;
  }
  if (!Array.isArray(rows)) return out;
  for (const row of rows) {
    const r = row as { i?: unknown; low?: unknown; high?: unknown };
    const i = typeof r.i === 'number' ? r.i - 1 : -1;
    const nums = [r.low, r.high].filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0);
    if (i < 0 || i >= count || !nums.length || out[i]) continue;
    out[i] = { low: Math.min(...nums), high: Math.max(...nums) };
  }
  return out;
};

export const SOURCE_LABEL: Record<PrizeSource, string> = { melt: 'melt', sold: 'Whatnot sold', ai: 'AI est.' };

export const ENVELOPE_INSTRUCTIONS = [
  'This is a frame from a Whatnot wheel show. Some wheel prizes are sealed envelopes (or bags, tickets) known only by a number. The seller shows on camera the items those envelopes hold, usually laid out on a board or shelf with sticky notes or labels.',
  'List each item the frame shows as an envelope prize, one entry per physical item. inside: a short item name with metal, weight, year, and grade when shown, e.g. "1 kilo silver Koala NGC MS 69", "1985 Liberty MS 67", "1/10 oz gold coin".',
  'prize: the listed envelope name, copied exactly, only when that envelope\'s number or label is visibly tied to the item; otherwise "". Never pair an item with an envelope by guessing. A listed prize named "Item #N" or "Spot #N" is the sticky note or label showing that number: copy the listed name when N is on the note.',
  'Skip the named wheel prizes listed as not in envelopes, and skip displays, decor, and packaging. Only list items you can see; never add one from the wheel title.',
  'low / high: per-item US price range where recent sold copies land (eBay sold or Whatnot sold). Be conservative: if unsure, lean low. Keep high at most 2x low. Never answer 0.',
].join('\n');

export const ENVELOPE_SCHEMA = {
  type: 'object',
  properties: {
    envelopes: {
      type: 'array',
      items: {
        type: 'object',
        properties: { prize: { type: 'string' }, inside: { type: 'string' }, low: { type: 'number' }, high: { type: 'number' } },
        required: ['prize', 'inside', 'low', 'high'],
        additionalProperties: false,
      },
    },
  },
  required: ['envelopes'],
  additionalProperties: false,
};

export const ENVELOPE_SCHEMA_GEMINI = {
  type: 'OBJECT',
  properties: {
    envelopes: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { prize: { type: 'STRING' }, inside: { type: 'STRING' }, low: { type: 'NUMBER' }, high: { type: 'NUMBER' } },
        required: ['prize', 'inside', 'low', 'high'],
      },
    },
  },
  required: ['envelopes'],
};

export const envelopePrompt = (envelopes: PrizeItem[], others: string[], ctx: PrizeContext) =>
  [
    ctx.showTitle ? `Show: ${ctx.showTitle}` : '',
    ctx.wheelTitle ? `Wheel: ${ctx.wheelTitle}` : '',
    showNotesLine(ctx.notes),
    'Envelopes:',
    ...[...new Set(envelopes.map((p) => p.title.trim()))].map((t) => `- ${t}`),
    others.length ? `Named wheel prizes, not in envelopes: ${[...new Set(others.map((t) => t.trim()))].join('; ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');

// Named prizes ("Silver Eagle", "Graded Morgan") are valued by name as soon as the wheel loads.
// The video often shows the exact item (year, grade, weight), which this read picks up.
export const PRIZE_READ_INSTRUCTIONS = [
  "This is a frame from a Whatnot wheel show. The request lists the wheel's named prizes. For each listed prize this frame shows, say exactly what is on camera.",
  'prize: the listed prize name, copied exactly. Only list a prize when the item on camera is unmistakably that prize: its label, sticky note, or number is next to it, or it is the only item on camera that fits the name. Never pair by guessing, and skip prizes you cannot see.',
  'inside: a short name of what the camera shows, with year, metal, weight, grade, and grader when shown, e.g. "2024 Silver Eagle PCGS MS 70", "1/10 oz gold Maple Leaf", "1 g gold bar".',
  'low / high: per-item US price range where recent sold copies land (eBay sold or Whatnot sold). Be conservative: if unsure, lean low. Keep high at most 2x low. Never answer 0.',
].join('\n');

const READ_FIELDS = ['prize', 'inside', 'low', 'high'];

export const PRIZE_READ_SCHEMA = {
  type: 'object',
  properties: {
    prizes: {
      type: 'array',
      items: {
        type: 'object',
        properties: { prize: { type: 'string' }, inside: { type: 'string' }, low: { type: 'number' }, high: { type: 'number' } },
        required: READ_FIELDS,
        additionalProperties: false,
      },
    },
  },
  required: ['prizes'],
  additionalProperties: false,
};

export const PRIZE_READ_SCHEMA_GEMINI = {
  type: 'OBJECT',
  properties: {
    prizes: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { prize: { type: 'STRING' }, inside: { type: 'STRING' }, low: { type: 'NUMBER' }, high: { type: 'NUMBER' } },
        required: READ_FIELDS,
      },
    },
  },
  required: ['prizes'],
};

export const prizeReadPrompt = (prizes: PrizeItem[], ctx: PrizeContext) =>
  [
    ctx.showTitle ? `Show: ${ctx.showTitle}` : '',
    ctx.wheelTitle ? `Wheel: ${ctx.wheelTitle}` : '',
    showNotesLine(ctx.notes),
    'Named prizes:',
    ...[...new Set(prizes.map((p) => (p.detail ? `${p.title.trim()} (${p.detail.trim()})` : p.title.trim())))].map((t) => `- ${t}`),
  ]
    .filter(Boolean)
    .join('\n');

export interface BoardItem {
  inside: string;
  low: number;
  high: number;
}

export interface EnvelopeRead extends BoardItem {
  title: string;
}

const MAX_BOARD_ITEMS = 30;

// The envelope's number or letter: "ENVELOPE #3" and "#3" both give "3".
const tagOf = (title: string) => title.trim().match(/(?:#|\s|^)(\d{1,3}|[a-z])$/i)?.[1]?.toLowerCase() ?? null;

// Named instant hits match by label. A shelf number never assigns an item to an envelope: a number
// on this wheel stays in the pool, and a number that is not on this wheel is discarded.
export const parseEnvelopeAnswer = (
  text: string,
  titles: string[],
  field: 'envelopes' | 'prizes' = 'envelopes',
  named: string[] = [],
): { matched: EnvelopeRead[]; board: BoardItem[] } => {
  let rows: unknown;
  try {
    rows = (JSON.parse(text) as Record<string, unknown>)[field];
  } catch {
    return { matched: [], board: [] };
  }
  if (!Array.isArray(rows)) return { matched: [], board: [] };
  // Named prizes are listed as "Title (condition)"; the model may copy either form.
  const norm = (t: string) =>
    t
      .trim()
      .toLowerCase()
      .replace(/\s*\([^)]*\)$/, '')
      .replace(/\s+/g, ' ');
  const byName = new Map(titles.map((t) => [norm(t), t]));
  const namedByName = new Map((field === 'envelopes' ? named : titles).map((t) => [norm(t), t]));
  const wheelTags = new Set(titles.map((t) => tagOf(t)).filter((t): t is string => !!t));
  // Item #12 is the sticker "12". Envelope #12 is not: that number stays in the pool.
  const numberedByTag = new Map<string, string>();
  if (field === 'envelopes') {
    for (const t of titles) {
      if (!isNumberedPrize(t)) continue;
      const tag = tagOf(t);
      if (tag && !numberedByTag.has(tag)) numberedByTag.set(tag, t);
    }
  }
  const matched = new Map<string, EnvelopeRead>();
  const board: BoardItem[] = [];
  const keep = (item: BoardItem) => {
    if (board.length < MAX_BOARD_ITEMS) board.push(item);
  };
  for (const row of rows) {
    const r = row as { prize?: unknown; inside?: unknown; low?: unknown; high?: unknown };
    const prize = typeof r.prize === 'string' ? r.prize.trim() : '';
    const inside = typeof r.inside === 'string' ? r.inside.trim().slice(0, 120) : '';
    const nums = [r.low, r.high].filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0);
    if (!inside || !nums.length) continue;
    const item = { inside, low: Math.min(...nums), high: Math.max(...nums) };
    if (field === 'prizes') {
      const title = prize ? byName.get(norm(prize)) : undefined;
      if (title && !matched.has(title)) matched.set(title, { title, ...item });
      continue;
    }
    const namedTitle = prize ? namedByName.get(norm(prize)) : undefined;
    if (namedTitle && !matched.has(namedTitle)) {
      matched.set(namedTitle, { title: namedTitle, ...item });
      continue;
    }
    const tag = prize ? tagOf(prize) : null;
    const numbered = tag ? numberedByTag.get(tag) : undefined;
    if (numbered && !matched.has(numbered)) {
      matched.set(numbered, { title: numbered, ...item });
      continue;
    }
    const envelopeLike = !!prize && (isHiddenPrize(prize) || tag !== null);
    if (envelopeLike && tag && !wheelTags.has(tag) && !byName.has(norm(prize))) continue;
    keep(item);
  }
  return { matched: [...matched.values()], board };
};
