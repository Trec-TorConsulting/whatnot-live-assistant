// Your collection: things you own (typed in, plus your Whatnot purchases) and sets you're filling,
// like "morgan dollar 1878-1921". An appraisal is checked against both.
import { titleTokens } from './purchases';

export interface CollectionSet {
  words: string[];
  from: number;
  to: number;
  text: string;
}

export interface CollectionSettings {
  owned: string[];
  sets: CollectionSet[];
}

export const DEFAULT_COLLECTION: CollectionSettings = { owned: [], sets: [] };

const MAX_OWNED = 2000;
const MAX_SETS = 30;

// "morgan dollar 1878-1921": the words have to be in the item's name, the years bound the set.
export const parseSetLine = (line: string): CollectionSet | null => {
  const text = line.trim().replace(/\s+/g, ' ');
  const m = text.match(/\b(1[6-9]\d\d|20\d\d)\s*[-–]\s*(1[6-9]\d\d|20\d\d)\s*$/);
  if (!m) return null;
  const words = [...titleTokens(text.slice(0, m.index))];
  const from = Number(m[1]);
  const to = Number(m[2]);
  return words.length && from <= to ? { words, from, to, text } : null;
};

export const sanitizeCollection = (input: unknown): CollectionSettings => {
  const s = (input ?? {}) as Partial<CollectionSettings>;
  return {
    owned: Array.isArray(s.owned) ? s.owned.map((x) => String(x).trim().slice(0, 200)).filter(Boolean).slice(0, MAX_OWNED) : [],
    sets: Array.isArray(s.sets)
      ? s.sets.map((x) => parseSetLine(String((x as CollectionSet)?.text ?? ''))).filter((x): x is CollectionSet => Boolean(x)).slice(0, MAX_SETS)
      : [],
  };
};

// "1881-S", "1881 S", "1893-CC" → { year: 1881, mint: 'S' }. A bare year has no mint.
export const dateOf = (s: string): { year: number; mint: string | null } | null => {
  const m = s.match(/\b(1[6-9]\d\d|20\d\d)(?:[-\s]?(CC|[PDSOW]))?\b/i);
  return m ? { year: Number(m[1]), mint: m[2] ? m[2].toUpperCase() : null } : null;
};

const hasWords = (title: string, words: string[]) => {
  const have = titleTokens(title);
  return words.every((w) => have.has(w));
};

export interface CollectionCheck {
  similar: number;
  set: { text: string; have: boolean; dates: number } | null;
}

// "Have" means a date (and mint, when both sides show one) already among your items for that set.
export const compareToCollection = (
  item: { name: string; year?: number | null; mintMark?: string | null },
  owned: string[],
  sets: CollectionSet[],
): CollectionCheck => {
  const want = titleTokens(item.name);
  const similar = want.size
    ? owned.filter((o) => {
        const have = titleTokens(o);
        return [...want].filter((t) => have.has(t)).length / want.size >= 0.75;
      }).length
    : 0;
  const date = item.year ? { year: item.year, mint: item.mintMark ? item.mintMark.toUpperCase() : null } : dateOf(item.name);
  const set = date ? sets.find((s) => hasWords(item.name, s.words) && date.year >= s.from && date.year <= s.to) : undefined;
  if (!set || !date) return { similar, set: null };
  const dates = owned.filter((o) => hasWords(o, set.words)).map(dateOf).filter((d): d is NonNullable<typeof d> => Boolean(d));
  const have = dates.some((d) => d.year === date.year && (!date.mint || !d.mint || d.mint === date.mint));
  return { similar, set: { text: set.text, have, dates: new Set(dates.map((d) => `${d.year}${d.mint ?? ''}`)).size } };
};

export const collectionLine = (c: CollectionCheck): string | null => {
  if (c.set) return c.set.have ? `Already in your set: ${c.set.text}` : `Needed for your set: ${c.set.text} (you have ${c.set.dates} dates)`;
  return c.similar ? `You own ${c.similar} like this` : null;
};
