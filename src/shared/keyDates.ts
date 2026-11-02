// Well-known US key dates, semi-keys, and varieties, with their mintages. A table rather than the
// model: these are facts the model can misremember, and they're ready before the video is read.
// Mint "" is Philadelphia (no mint mark); listing titles leave the P off.

type Series =
  | 'indian_cent'
  | 'lincoln_cent'
  | 'buffalo_nickel'
  | 'jefferson_nickel'
  | 'mercury_dime'
  | 'washington_quarter'
  | 'standing_liberty_quarter'
  | 'walking_liberty_half'
  | 'franklin_half'
  | 'kennedy_half'
  | 'morgan_dollar'
  | 'peace_dollar'
  | 'silver_eagle';

const CENT = /\b(cent|cents|penny|pennies|1c|1¢)\b/i;
const NICKEL = /\b(nickel|nickels|5c|5¢)\b/i;
const DIME = /\b(dime|dimes|10c|10¢)\b/i;
const QUARTER = /\b(quarter|quarters|25c|25¢)\b/i;
const HALF = /\b(half|halves|50c|50¢)\b/i;

// Order matters: an Indian Head nickel is a Buffalo, and a Walking Liberty silver eagle isn't a half.
const SERIES: [Series, string, (t: string) => boolean][] = [
  ['silver_eagle', 'Silver Eagle', (t) => /\bsilver\s*eagle\b/i.test(t) || /\bASE\b/.test(t)],
  ['buffalo_nickel', 'Buffalo nickel', (t) => /\b(buffalo|indian\s*head)\b/i.test(t) && NICKEL.test(t)],
  ['indian_cent', 'Indian Head cent', (t) => /\bindian\b/i.test(t) && CENT.test(t)],
  ['lincoln_cent', 'Lincoln cent', (t) => /\b(lincoln|wheat)\b/i.test(t) && CENT.test(t)],
  ['jefferson_nickel', 'Jefferson nickel', (t) => /\bjefferson\b/i.test(t) && NICKEL.test(t)],
  ['mercury_dime', 'Mercury dime', (t) => /\b(mercury|winged\s*liberty)\b/i.test(t) && DIME.test(t)],
  ['standing_liberty_quarter', 'Standing Liberty quarter', (t) => /\bstanding\s*liberty\b/i.test(t) && QUARTER.test(t)],
  ['washington_quarter', 'Washington quarter', (t) => /\bwashington\b/i.test(t) && QUARTER.test(t)],
  ['walking_liberty_half', 'Walking Liberty half', (t) => /\bwalking\s*liberty\b/i.test(t) && HALF.test(t)],
  ['franklin_half', 'Franklin half', (t) => /\bfranklin\b/i.test(t) && HALF.test(t)],
  ['kennedy_half', 'Kennedy half', (t) => /\bkennedy\b/i.test(t) && HALF.test(t)],
  ['morgan_dollar', 'Morgan dollar', (t) => /\bmorgan\b/i.test(t)],
  ['peace_dollar', 'Peace dollar', (t) => /\bpeace\b/i.test(t) && /\bdollar\b|\$1\b/i.test(t)],
];

type Kind = 'key' | 'semi' | 'variety';

interface Entry {
  series: Series;
  year: number;
  // null: any mint.
  mint: string | null;
  kind: Kind;
  mintage?: number;
  note?: string;
  // CoinFacts spec for this date and mint. Copper uses the number PCGS lists for that issue.
  pcgs?: number;
  // Only applies when the listing or the model names it (VDB, a doubled die, an overdate).
  needs?: RegExp;
}

// What CoinFacts puts in the name or denomination. Used to reject a spec that is a different coin.
const DENOM: Record<Series, '1c' | '5c' | '10c' | '25c' | '50c' | '$1'> = {
  indian_cent: '1c',
  lincoln_cent: '1c',
  buffalo_nickel: '5c',
  jefferson_nickel: '5c',
  mercury_dime: '10c',
  washington_quarter: '25c',
  standing_liberty_quarter: '25c',
  walking_liberty_half: '50c',
  franklin_half: '50c',
  kennedy_half: '50c',
  morgan_dollar: '$1',
  peace_dollar: '$1',
  silver_eagle: '$1',
};

const DDO = /doubled?\s*die|\bddo\b/i;

const ENTRIES: Entry[] = [
  { series: 'indian_cent', year: 1877, mint: '', kind: 'key', mintage: 852_500 },
  { series: 'indian_cent', year: 1908, mint: 'S', kind: 'semi', mintage: 1_115_000, pcgs: 2232 },
  { series: 'indian_cent', year: 1909, mint: 'S', kind: 'key', mintage: 309_000 },
  { series: 'lincoln_cent', year: 1909, mint: 'S', kind: 'key', mintage: 484_000, note: 'VDB', needs: /\bvdb\b/i, pcgs: 2426 },
  { series: 'lincoln_cent', year: 1909, mint: 'S', kind: 'key', mintage: 1_825_000, pcgs: 2434 },
  { series: 'lincoln_cent', year: 1914, mint: 'D', kind: 'key', mintage: 1_193_000, pcgs: 2473 },
  { series: 'lincoln_cent', year: 1922, mint: null, kind: 'variety', note: '1922 No D: a weak-die Denver cent with no mint mark', needs: /\bno\s*d\b|\bplain\b/i },
  { series: 'lincoln_cent', year: 1931, mint: 'S', kind: 'key', mintage: 866_000, pcgs: 2620 },
  { series: 'lincoln_cent', year: 1955, mint: '', kind: 'variety', note: '1955 Doubled Die Obverse', needs: DDO },
  { series: 'lincoln_cent', year: 1972, mint: '', kind: 'variety', note: '1972 Doubled Die Obverse', needs: DDO },
  { series: 'buffalo_nickel', year: 1913, mint: 'S', kind: 'key', note: 'Type 2 is the key (1,209,000 minted)', pcgs: 3923 },
  { series: 'buffalo_nickel', year: 1918, mint: 'D', kind: 'variety', note: '1918/7-D overdate', needs: /18\s*\/\s*7|overdate/i },
  { series: 'buffalo_nickel', year: 1921, mint: 'S', kind: 'key', mintage: 1_557_000, pcgs: 3948 },
  { series: 'buffalo_nickel', year: 1924, mint: 'S', kind: 'semi', mintage: 1_437_000, pcgs: 3953 },
  { series: 'buffalo_nickel', year: 1926, mint: 'S', kind: 'key', mintage: 970_000, pcgs: 3959 },
  { series: 'buffalo_nickel', year: 1931, mint: 'S', kind: 'semi', mintage: 1_200_000, pcgs: 3971 },
  { series: 'buffalo_nickel', year: 1937, mint: 'D', kind: 'variety', note: '1937-D 3-Legged Buffalo', needs: /3\s*-?\s*leg|three\s*-?\s*leg/i },
  { series: 'jefferson_nickel', year: 1939, mint: 'D', kind: 'semi', mintage: 3_514_000 },
  { series: 'jefferson_nickel', year: 1950, mint: 'D', kind: 'key', mintage: 2_630_030 },
  { series: 'mercury_dime', year: 1916, mint: 'D', kind: 'key', mintage: 264_000, pcgs: 4906 },
  { series: 'mercury_dime', year: 1921, mint: '', kind: 'semi', mintage: 1_230_000, pcgs: 4934 },
  { series: 'mercury_dime', year: 1921, mint: 'D', kind: 'semi', mintage: 1_080_000 },
  { series: 'mercury_dime', year: 1942, mint: null, kind: 'variety', note: '1942/1 overdate', needs: /42\s*\/\s*1|overdate/i },
  { series: 'standing_liberty_quarter', year: 1916, mint: '', kind: 'key', mintage: 52_000, pcgs: 5704 },
  { series: 'standing_liberty_quarter', year: 1918, mint: 'S', kind: 'variety', note: '1918/7-S overdate', needs: /18\s*\/\s*7|overdate/i },
  { series: 'standing_liberty_quarter', year: 1927, mint: 'S', kind: 'semi', mintage: 396_000 },
  { series: 'washington_quarter', year: 1932, mint: 'D', kind: 'key', mintage: 436_800, pcgs: 5791 },
  { series: 'washington_quarter', year: 1932, mint: 'S', kind: 'key', mintage: 408_000, pcgs: 5792 },
  { series: 'walking_liberty_half', year: 1921, mint: '', kind: 'key', mintage: 246_000, pcgs: 6583 },
  { series: 'walking_liberty_half', year: 1921, mint: 'D', kind: 'key', mintage: 208_000, pcgs: 6584 },
  { series: 'walking_liberty_half', year: 1921, mint: 'S', kind: 'key', mintage: 548_000, pcgs: 6585 },
  { series: 'walking_liberty_half', year: 1938, mint: 'D', kind: 'semi', mintage: 491_600, pcgs: 6605 },
  { series: 'franklin_half', year: 1949, mint: 'S', kind: 'semi', mintage: 3_744_000 },
  { series: 'franklin_half', year: 1953, mint: '', kind: 'semi', mintage: 2_668_120 },
  { series: 'franklin_half', year: 1955, mint: '', kind: 'semi', mintage: 2_498_181 },
  { series: 'kennedy_half', year: 1970, mint: 'D', kind: 'key', mintage: 2_150_000, note: 'only sold in mint sets', pcgs: 6713 },
  { series: 'morgan_dollar', year: 1879, mint: 'CC', kind: 'semi', mintage: 756_000, pcgs: 7086 },
  { series: 'morgan_dollar', year: 1881, mint: 'CC', kind: 'semi', mintage: 296_000, pcgs: 7126 },
  { series: 'morgan_dollar', year: 1885, mint: 'CC', kind: 'semi', mintage: 228_000, pcgs: 7160 },
  { series: 'morgan_dollar', year: 1889, mint: 'CC', kind: 'key', mintage: 350_000, pcgs: 7190 },
  { series: 'morgan_dollar', year: 1892, mint: 'S', kind: 'semi', mintage: 1_200_000, note: 'rare in mint state', pcgs: 7218 },
  { series: 'morgan_dollar', year: 1893, mint: 'CC', kind: 'semi', mintage: 677_000, pcgs: 7222 },
  { series: 'morgan_dollar', year: 1893, mint: 'O', kind: 'semi', mintage: 300_000, pcgs: 7224 },
  { series: 'morgan_dollar', year: 1893, mint: 'S', kind: 'key', mintage: 100_000, note: 'the king of Morgans', pcgs: 7226 },
  { series: 'morgan_dollar', year: 1894, mint: '', kind: 'key', mintage: 110_000, pcgs: 7228 },
  { series: 'morgan_dollar', year: 1895, mint: '', kind: 'key', note: 'proof only: 880 struck, and fakes are common', pcgs: 7330 },
  { series: 'morgan_dollar', year: 1903, mint: 'S', kind: 'semi', mintage: 1_241_000, pcgs: 7288 },
  { series: 'morgan_dollar', year: 1904, mint: 'S', kind: 'semi', mintage: 2_304_000, pcgs: 7294 },
  { series: 'peace_dollar', year: 1921, mint: '', kind: 'key', mintage: 1_006_473, note: 'high relief', pcgs: 7356 },
  { series: 'peace_dollar', year: 1928, mint: '', kind: 'key', mintage: 360_649, pcgs: 7373 },
  { series: 'peace_dollar', year: 1934, mint: 'S', kind: 'semi', mintage: 1_011_000, pcgs: 7377 },
  { series: 'silver_eagle', year: 1995, mint: 'W', kind: 'key', mintage: 30_125, note: 'proof, only in the 10th anniversary set' },
  { series: 'silver_eagle', year: 1996, mint: '', kind: 'key', mintage: 3_603_386, note: 'lowest-mintage bullion Silver Eagle' },
];

export interface Callout {
  // key / semi / variety: it is one. check: it could be, and that's worth a close look.
  kind: Kind | 'check';
  // Key dates are the most faked coins, so a raw one needs a caution next to it.
  faked: boolean;
  text: string;
}

const DATE_RE = /\b(1[789]\d\d|20[0-2]\d)(?:\s*-\s*|\s+|\/\d\s*-?\s*)?(CC|[PDSOW])?\b/;

const normMint = (m: string | null | undefined) => {
  const s = String(m ?? '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
  return s === 'P' ? '' : s;
};

const dateLabel = (year: number, mint: string) => `${year}${mint ? `-${mint}` : ''}`;

interface DatedHit {
  entry: Entry;
  seriesLabel: string;
  year: number;
  mint: string;
}

// The key or semi-key this title names, plus varieties. A needed marker (VDB) wins its date slot.
const datedHits = ({ text, year, mint }: { text: string; year?: number | null; mint?: string | null }): DatedHit[] => {
  const found = SERIES.find(([, , test]) => test(text));
  if (!found) return [];
  const [series, seriesLabel] = found;
  const date = text.match(DATE_RE);
  const y = year ?? (date?.[1] ? parseInt(date[1], 10) : null);
  if (!y) return [];
  const m = mint != null ? normMint(mint) : normMint(date?.[1] && parseInt(date[1], 10) === y ? date[2] : '');
  const out: DatedHit[] = [];
  const seen = new Set<string>();
  for (const e of ENTRIES) {
    if (e.series !== series || e.year !== y || (e.mint !== null && e.mint !== m)) continue;
    const named = e.needs ? e.needs.test(text) : true;
    if (e.kind === 'variety') {
      out.push({ entry: e, seriesLabel, year: y, mint: m });
      continue;
    }
    if (!named || seen.has(`${e.year}|${e.mint}`)) continue;
    seen.add(`${e.year}|${e.mint}`);
    out.push({ entry: e, seriesLabel, year: y, mint: m });
  }
  return out;
};

// text: the item name plus the listing title. year and mint come from the model when it read them.
export const keyDateCallouts = (input: { text: string; year?: number | null; mint?: string | null }): Callout[] => {
  const out: Callout[] = [];
  for (const hit of datedHits(input)) {
    const e = hit.entry;
    if (e.kind === 'variety') {
      const named = e.needs ? e.needs.test(input.text) : true;
      out.push(
        named
          ? { kind: 'variety', faked: true, text: `Valuable variety: ${e.note}.` }
          : { kind: 'check', faked: false, text: `Check for the ${e.note}; it's worth far more.` },
      );
      continue;
    }
    const what = `${dateLabel(hit.year, hit.mint)}${e.note === 'VDB' ? ' VDB' : ''} ${hit.seriesLabel}`;
    const count = e.mintage ? `only ${e.mintage.toLocaleString('en-US')} minted` : null;
    const extra = e.note && e.note !== 'VDB' ? e.note : null;
    out.push({
      kind: e.kind,
      faked: e.kind === 'key',
      text: `${e.kind === 'key' ? 'Key date' : 'Semi-key date'}: ${what}${[count, extra].filter(Boolean).length ? `, ${[count, extra].filter(Boolean).join('; ')}` : ''}.`,
    });
  }
  return out;
};

export interface StatedGrade {
  gradeNo: number;
  label: string;
}

// Sheldon grades PCGS will price. A word with no number is that word's lowest grade.
const SHELDON = new Set([1, 2, 3, 4, 6, 8, 10, 12, 15, 20, 25, 30, 35, 40, 45, 50, 53, 55, 58, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70]);

const gradeOf = (n: number, label: string): StatedGrade | null => (SHELDON.has(n) ? { gradeNo: n, label } : null);

// Longer phrases first so "very good" is not also read as "good".
const GRADE_PATTERNS: [string, (m: RegExpMatchArray) => StatedGrade | null][] = [
  ['\\b(?:ms|mint\\s*state)\\s*-?\\s*(6\\d|70)\\b', (m) => gradeOf(Number(m[1]), `MS-${m[1]}`)],
  ['\\bau\\s*-?\\s*(50|53|55|58)\\b', (m) => gradeOf(Number(m[1]), `AU-${m[1]}`)],
  ['\\b(?:xf|ef)\\s*-?\\s*(40|45)\\b', (m) => gradeOf(Number(m[1]), `XF-${m[1]}`)],
  ['\\bvf\\s*-?\\s*(20|25|30|35)\\b', (m) => gradeOf(Number(m[1]), `VF-${m[1]}`)],
  ['\\bf\\s*-?\\s*(12|15)\\b', (m) => gradeOf(Number(m[1]), `F-${m[1]}`)],
  ['\\bvg\\s*-?\\s*(8|10)\\b', (m) => gradeOf(Number(m[1]), `VG-${m[1]}`)],
  ['\\bag\\s*-?\\s*3\\b|\\ba\\s*/\\s*g\\b', () => gradeOf(3, 'AG-3')],
  ['\\bg\\s*-?\\s*(4|6)\\b', (m) => gradeOf(Number(m[1]), `G-${m[1]}`)],
  ['\\babout\\s+uncirculated\\b', () => gradeOf(50, 'AU-50')],
  ['\\b(?:extremely\\s+fine|extra\\s+fine)\\b', () => gradeOf(40, 'XF-40')],
  ['\\bvery\\s+fine\\b', () => gradeOf(20, 'VF-20')],
  ['\\bvery\\s+good\\b', () => gradeOf(8, 'VG-8')],
  ['\\babout\\s+good\\b|\\bag\\b', () => gradeOf(3, 'AG-3')],
  ['\\b(?:uncirculated|brilliant\\s+uncirculated|\\bbu\\b|\\bms\\b)\\b', () => gradeOf(60, 'MS-60')],
  ['\\b(?:xf|ef)\\b', () => gradeOf(40, 'XF-40')],
  ['\\bvf\\b', () => gradeOf(20, 'VF-20')],
  ['\\bau\\b', () => gradeOf(50, 'AU-50')],
  ['\\bvg\\b', () => gradeOf(8, 'VG-8')],
  ['\\bfine\\b(?!\\s+silver\\b)', () => gradeOf(12, 'F-12')],
  ['\\bgood\\b', () => gradeOf(4, 'G-4')],
];

// One grade the title actually states. A range (VF-XF, Good - Extremely Fine) is not one price.
export const statedGrade = (text: string): StatedGrade | null => {
  const spans: { start: number; end: number; grade: StatedGrade }[] = [];
  for (const [source, toGrade] of GRADE_PATTERNS) {
    for (const m of text.matchAll(new RegExp(source, 'gi'))) {
      if (m.index == null) continue;
      const grade = toGrade(m);
      if (!grade) continue;
      spans.push({ start: m.index, end: m.index + m[0].length, grade });
    }
  }
  spans.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: typeof spans = [];
  for (const s of spans) {
    if (kept.some((k) => s.start < k.end && s.end > k.start)) continue;
    kept.push(s);
  }
  const grades = [...new Set(kept.map((s) => s.grade.gradeNo))];
  if (grades.length !== 1) return null;
  return kept.find((s) => /\d/.test(s.grade.label))?.grade ?? kept[0]!.grade;
};

export interface KeyDatePrice {
  pcgs: number;
  year: number;
  mint: string;
  denom: '1c' | '5c' | '10c' | '25c' | '50c' | '$1';
  grade: StatedGrade;
}

// A problem coin, a full-bands dime, or a prooflike dollar is not the straight-grade price.
const NOT_STRAIGHT = /\b(details|cleaned|scratched|damaged|holed|mounted|corroded|tooled|whizzed|full\s*bands|dmpl|proof[-\s]*like)\b|\bFB\b|\bPL\b|\bDMPL\b/;

// The CoinFacts spec and the one grade this key-date title states, when both are known.
export const keyDatePrice = (text: string): KeyDatePrice | null => {
  if (NOT_STRAIGHT.test(text)) return null;
  const hit = datedHits({ text }).find((h) => h.entry.kind !== 'variety' && h.entry.pcgs);
  if (!hit?.entry.pcgs) return null;
  if (/type\s*1/i.test(text) && /type\s*2/i.test(hit.entry.note ?? '')) return null;
  const grade = statedGrade(text);
  if (!grade) return null;
  return { pcgs: hit.entry.pcgs, year: hit.year, mint: hit.mint, denom: DENOM[hit.entry.series], grade };
};
