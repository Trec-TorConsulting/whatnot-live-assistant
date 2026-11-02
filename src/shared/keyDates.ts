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
  // Only applies when the listing or the model names it (VDB, a doubled die, an overdate).
  needs?: RegExp;
}

const DDO = /doubled?\s*die|\bddo\b/i;

const ENTRIES: Entry[] = [
  { series: 'indian_cent', year: 1877, mint: '', kind: 'key', mintage: 852_500 },
  { series: 'indian_cent', year: 1908, mint: 'S', kind: 'semi', mintage: 1_115_000 },
  { series: 'indian_cent', year: 1909, mint: 'S', kind: 'key', mintage: 309_000 },
  { series: 'lincoln_cent', year: 1909, mint: 'S', kind: 'key', mintage: 484_000, note: 'VDB', needs: /\bvdb\b/i },
  { series: 'lincoln_cent', year: 1909, mint: 'S', kind: 'key', mintage: 1_825_000 },
  { series: 'lincoln_cent', year: 1914, mint: 'D', kind: 'key', mintage: 1_193_000 },
  { series: 'lincoln_cent', year: 1922, mint: null, kind: 'variety', note: '1922 No D: a weak-die Denver cent with no mint mark', needs: /\bno\s*d\b|\bplain\b/i },
  { series: 'lincoln_cent', year: 1931, mint: 'S', kind: 'key', mintage: 866_000 },
  { series: 'lincoln_cent', year: 1955, mint: '', kind: 'variety', note: '1955 Doubled Die Obverse', needs: DDO },
  { series: 'lincoln_cent', year: 1972, mint: '', kind: 'variety', note: '1972 Doubled Die Obverse', needs: DDO },
  { series: 'buffalo_nickel', year: 1913, mint: 'S', kind: 'key', note: 'Type 2 is the key (1,209,000 minted)' },
  { series: 'buffalo_nickel', year: 1918, mint: 'D', kind: 'variety', note: '1918/7-D overdate', needs: /18\s*\/\s*7|overdate/i },
  { series: 'buffalo_nickel', year: 1921, mint: 'S', kind: 'key', mintage: 1_557_000 },
  { series: 'buffalo_nickel', year: 1924, mint: 'S', kind: 'semi', mintage: 1_437_000 },
  { series: 'buffalo_nickel', year: 1926, mint: 'S', kind: 'key', mintage: 970_000 },
  { series: 'buffalo_nickel', year: 1931, mint: 'S', kind: 'semi', mintage: 1_200_000 },
  { series: 'buffalo_nickel', year: 1937, mint: 'D', kind: 'variety', note: '1937-D 3-Legged Buffalo', needs: /3\s*-?\s*leg|three\s*-?\s*leg/i },
  { series: 'jefferson_nickel', year: 1939, mint: 'D', kind: 'semi', mintage: 3_514_000 },
  { series: 'jefferson_nickel', year: 1950, mint: 'D', kind: 'key', mintage: 2_630_030 },
  { series: 'mercury_dime', year: 1916, mint: 'D', kind: 'key', mintage: 264_000 },
  { series: 'mercury_dime', year: 1921, mint: '', kind: 'semi', mintage: 1_230_000 },
  { series: 'mercury_dime', year: 1921, mint: 'D', kind: 'semi', mintage: 1_080_000 },
  { series: 'mercury_dime', year: 1942, mint: null, kind: 'variety', note: '1942/1 overdate', needs: /42\s*\/\s*1|overdate/i },
  { series: 'standing_liberty_quarter', year: 1916, mint: '', kind: 'key', mintage: 52_000 },
  { series: 'standing_liberty_quarter', year: 1918, mint: 'S', kind: 'variety', note: '1918/7-S overdate', needs: /18\s*\/\s*7|overdate/i },
  { series: 'standing_liberty_quarter', year: 1927, mint: 'S', kind: 'semi', mintage: 396_000 },
  { series: 'washington_quarter', year: 1932, mint: 'D', kind: 'key', mintage: 436_800 },
  { series: 'washington_quarter', year: 1932, mint: 'S', kind: 'key', mintage: 408_000 },
  { series: 'walking_liberty_half', year: 1921, mint: '', kind: 'key', mintage: 246_000 },
  { series: 'walking_liberty_half', year: 1921, mint: 'D', kind: 'key', mintage: 208_000 },
  { series: 'walking_liberty_half', year: 1921, mint: 'S', kind: 'key', mintage: 548_000 },
  { series: 'walking_liberty_half', year: 1938, mint: 'D', kind: 'semi', mintage: 491_600 },
  { series: 'franklin_half', year: 1949, mint: 'S', kind: 'semi', mintage: 3_744_000 },
  { series: 'franklin_half', year: 1953, mint: '', kind: 'semi', mintage: 2_668_120 },
  { series: 'franklin_half', year: 1955, mint: '', kind: 'semi', mintage: 2_498_181 },
  { series: 'kennedy_half', year: 1970, mint: 'D', kind: 'key', mintage: 2_150_000, note: 'only sold in mint sets' },
  { series: 'morgan_dollar', year: 1879, mint: 'CC', kind: 'semi', mintage: 756_000 },
  { series: 'morgan_dollar', year: 1881, mint: 'CC', kind: 'semi', mintage: 296_000 },
  { series: 'morgan_dollar', year: 1885, mint: 'CC', kind: 'semi', mintage: 228_000 },
  { series: 'morgan_dollar', year: 1889, mint: 'CC', kind: 'key', mintage: 350_000 },
  { series: 'morgan_dollar', year: 1892, mint: 'S', kind: 'semi', mintage: 1_200_000, note: 'rare in mint state' },
  { series: 'morgan_dollar', year: 1893, mint: 'CC', kind: 'semi', mintage: 677_000 },
  { series: 'morgan_dollar', year: 1893, mint: 'O', kind: 'semi', mintage: 300_000 },
  { series: 'morgan_dollar', year: 1893, mint: 'S', kind: 'key', mintage: 100_000, note: 'the king of Morgans' },
  { series: 'morgan_dollar', year: 1894, mint: '', kind: 'key', mintage: 110_000 },
  { series: 'morgan_dollar', year: 1895, mint: '', kind: 'key', note: 'proof only: 880 struck, and fakes are common' },
  { series: 'morgan_dollar', year: 1903, mint: 'S', kind: 'semi', mintage: 1_241_000 },
  { series: 'morgan_dollar', year: 1904, mint: 'S', kind: 'semi', mintage: 2_304_000 },
  { series: 'peace_dollar', year: 1921, mint: '', kind: 'key', mintage: 1_006_473, note: 'high relief' },
  { series: 'peace_dollar', year: 1928, mint: '', kind: 'key', mintage: 360_649 },
  { series: 'peace_dollar', year: 1934, mint: 'S', kind: 'semi', mintage: 1_011_000 },
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

// text: the item name plus the listing title. year and mint come from the model when it read them.
export const keyDateCallouts = ({ text, year, mint }: { text: string; year?: number | null; mint?: string | null }): Callout[] => {
  const found = SERIES.find(([, , test]) => test(text));
  if (!found) return [];
  const [series, seriesLabel] = found;
  const date = text.match(DATE_RE);
  const y = year ?? (date?.[1] ? parseInt(date[1], 10) : null);
  if (!y) return [];
  const m = mint != null ? normMint(mint) : normMint(date?.[1] && parseInt(date[1], 10) === y ? date[2] : '');

  const out: Callout[] = [];
  const seen = new Set<string>();
  for (const e of ENTRIES) {
    if (e.series !== series || e.year !== y || (e.mint !== null && e.mint !== m)) continue;
    const slot = `${e.year}|${e.mint}`;
    const named = e.needs ? e.needs.test(text) : true;
    if (e.kind === 'variety') {
      out.push(
        named
          ? { kind: 'variety', faked: true, text: `Valuable variety: ${e.note}.` }
          : { kind: 'check', faked: false, text: `Check for the ${e.note}; it's worth far more.` },
      );
      continue;
    }
    // A dated entry that needs a marker (1909-S VDB) wins over the plain one when it's named.
    if (!named || seen.has(slot)) continue;
    seen.add(slot);
    const what = `${dateLabel(y, m)}${e.note === 'VDB' ? ' VDB' : ''} ${seriesLabel}`;
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
