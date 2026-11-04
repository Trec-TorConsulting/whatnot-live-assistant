// The detected show type adds a reading hint, and keeps calibration and sold comps within the same
// kind of show. It never widens what gets appraised: that is always the item being presented. The
// rest of a flea-market table is a separate Scan pass, on by default only for flea shows.

export type ShowType = 'coins' | 'cards' | 'jewelry' | 'collectibles' | 'flea' | 'electronics' | 'tools' | 'wholesale' | 'general';

export const SHOW_TYPES: Record<ShowType, { label: string; hint: string | null }> = {
  coins: {
    label: 'Coins & bullion',
    hint: 'Coin and bullion show: read the slab or holder label, and count every piece in the presented lot (rolls, stacks, tubes, bars).',
  },
  cards: {
    label: 'Cards',
    hint: "Card show: read the slab label (grader, grade, cert), or the card's year, set, number, and parallel.",
  },
  jewelry: {
    label: 'Jewelry & scrap',
    hint: 'Jewelry show: read hallmarks (10K, 14K, 18K, 925, PLAT) and any scale display for the weight in grams.',
  },
  collectibles: { label: 'Collectibles', hint: null },
  flea: { label: 'Flea market / yard sale', hint: null },
  electronics: { label: 'Electronics', hint: null },
  tools: { label: 'Tools', hint: null },
  wholesale: { label: 'Case packs & wholesale', hint: null },
  general: { label: 'General', hint: null },
};

export const scansByDefault = (type: ShowType) => type === 'flea';

export const isShowType = (v: unknown): v is ShowType => typeof v === 'string' && v in SHOW_TYPES;

// Whatnot tags shows with category slugs ("us_coins", "numismatics"); the title fills in when
// they're missing, and the seller's show notes fill in when both are silent. Flea-market words
// describe the whole show, so they outweigh item words: a "garage sale: coins, cards, toys" show
// is a garage sale, including when that wording is only in the notes.
const PATTERNS: [Exclude<ShowType, 'general'>, RegExp, number][] = [
  [
    'wholesale',
    /\b(?:reseller ?bundles?|wholesale|case ?packs?|closeouts?|dozens?|bulk ?buys?)\b|\b\d+\/\$\d+\b/g,
    4,
  ],
  [
    'flea',
    /\b(?:flea|yard ?sales?|garage ?sales?|estate ?sales?|estates?|storage ?units?|storage ?wars|thrift\w*|rummage|swap ?meets?|junk(?!\s+(?:silver|gold))\w*|pickers?|picking|pallets?|liquidations?|antique ?malls?|treasure ?hunt\w*|mixed ?lots?|a little of everything|everything ?sale)\b/g,
    3,
  ],
  [
    'coins',
    /\b(?:coins?|numismatic\w*|currency|banknotes?|paper ?money|bullion|silver|gold|copper|platinum|palladium|morgans?|peace ?dollars?|pcgs|ngc|anacs|slabs?|bars?|rounds?|stack\w*|precious ?metals?)\b/g,
    1,
  ],
  [
    'cards',
    /\b(?:cards?|tcg|pok[eé]mon|mtg|magic the gathering|yu-?gi-oh|one piece|lorcana|sports ?cards?|baseball|basketball|football|hockey|soccer|psa|bgs|sgc|rookies?|packs?)\b/g,
    1,
  ],
  [
    'jewelry',
    /\b(?:jewel\w*|scrap|karat|\d{1,2}k|sterling|watch(?:es)?|rolex|rings?|necklaces?|chains?|bracelets?|earrings?|gemstones?|diamonds?)\b/g,
    1,
  ],
  [
    'collectibles',
    /\b(?:comics?|funko|toys?|action ?figures?|figures?|lego|hot ?wheels|video ?games?|retro ?gaming|nintendo|sega|playstation|vinyl|records?|stamps?|philatel\w*|sneakers?|memorabilia|autographs?|collectibles?)\b/g,
    1,
  ],
  [
    'tools',
    /\b(?:tools?|milwaukee|ryobi|dewalt|makita|ridgid|craftsman|kobalt|bosch|snap-?on|power ?tools?|hand ?tools?|drills?|sawzall)\b/g,
    1,
  ],
  [
    'electronics',
    /\b(?:everyday ?electronics?|electronics?|laptops?|phones?|smartphones?|tablets?|computers?|macbooks?|ipads?|iphones?|airpods?|monitors?|drones?)\b/g,
    1,
  ],
];

const CASE_PACK_TAG_RE = /\bcase ?packs?\b/;
const ELECTRONICS_TAG_RE = /\b(?:everyday ?electronics?|electronics?|laptops?|phones?|smartphones?|tablets?|computers?)\b/;
const TOOLS_TAG_RE = /\b(?:tools?|milwaukee|ryobi|dewalt|makita|ridgid|craftsman|kobalt|bosch|snap-?on)\b/;

const words = (s: string) => s.toLowerCase().replace(/_/g, ' ');
const stripCasePack = (s: string) => s.replace(/\bcase ?packs?\b/g, ' ');

const hits = (re: RegExp, text: string) => text.match(re)?.length ?? 0;

export const detectShowType = (title: string | null | undefined, categories: string[] = [], notes = ''): ShowType => {
  const tags = words(categories.join(' | '));
  if (CASE_PACK_TAG_RE.test(tags)) return 'wholesale';
  const name = words(title ?? '');
  const note = words(notes);
  const electronicsTagged = ELECTRONICS_TAG_RE.test(tags);
  const toolsTagged = TOOLS_TAG_RE.test(tags);
  // A Whatnot tag already named the show. Notes still count for flea wording, which describes
  // the whole show, and they fill in when no tag matched.
  const tagged = PATTERNS.some(([type, re]) => hits(re, type === 'cards' ? stripCasePack(tags) : tags) > 0);
  let best: ShowType = 'general';
  let bestScore = 0;
  for (const [type, re, weight] of PATTERNS) {
    if ((type === 'flea' || type === 'wholesale') && (electronicsTagged || toolsTagged)) continue;
    const tText = type === 'cards' ? stripCasePack(tags) : tags;
    const nText = type === 'cards' ? stripCasePack(name) : name;
    const noteText = type === 'cards' ? stripCasePack(note) : note;
    const noteHits = !tagged || type === 'flea' || type === 'wholesale' ? hits(re, noteText) : 0;
    // Whatnot's own tags count double: sellers' titles are often loose.
    const score = (hits(re, tText) * 2 + hits(re, nText) + noteHits) * weight;
    if (score > bestScore) {
      best = type;
      bestScore = score;
    }
  }
  return best;
};
