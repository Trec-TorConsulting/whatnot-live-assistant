// The detected show type adds a reading hint, and keeps calibration and sold comps within the same
// kind of show. It never widens what gets appraised: that is always the item being presented. The
// rest of a flea-market table is a separate Scan pass, on by default only for flea shows.

export type ShowType = 'coins' | 'cards' | 'jewelry' | 'collectibles' | 'flea' | 'general';

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
  general: { label: 'General', hint: null },
};

export const scansByDefault = (type: ShowType) => type === 'flea';

export const isShowType = (v: unknown): v is ShowType => typeof v === 'string' && v in SHOW_TYPES;

// Whatnot tags shows with category slugs ("us_coins", "numismatics"); the title fills in when
// they're missing. Flea-market words describe the whole show, so they outweigh item words: a
// "garage sale: coins, cards, toys" show is a garage sale.
const PATTERNS: [Exclude<ShowType, 'general'>, RegExp, number][] = [
  [
    'flea',
    /\b(?:flea|yard ?sales?|garage ?sales?|estate ?sales?|estates?|storage ?units?|storage ?wars|thrift\w*|rummage|swap ?meets?|junk\w*|pickers?|picking|pallets?|liquidations?|antique ?malls?|treasure ?hunt\w*|mixed ?lots?|a little of everything|everything ?sale)\b/g,
    3,
  ],
  [
    'coins',
    /\b(?:coins?|numismatic\w*|currency|banknotes?|paper ?money|bullion|silver|gold|copper|platinum|palladium|morgans?|peace ?dollars?|pcgs|ngc|anacs|slabs?|bars?|rounds?|stack\w*|precious ?metals?)\b/g,
    1,
  ],
  [
    'cards',
    /\b(?:cards?|tcg|pok[eé]mon|mtg|magic the gathering|yu-?gi-?oh|one piece|lorcana|sports ?cards?|baseball|basketball|football|hockey|soccer|psa|bgs|sgc|rookies?|packs?)\b/g,
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
];

const words = (s: string) => s.toLowerCase().replace(/_/g, ' ');

export const detectShowType = (title: string | null | undefined, categories: string[] = []): ShowType => {
  const tags = words(categories.join(' | '));
  const name = words(title ?? '');
  let best: ShowType = 'general';
  let bestScore = 0;
  for (const [type, re, weight] of PATTERNS) {
    // Whatnot's own tags count double: sellers' titles are often loose.
    const score = ((tags.match(re)?.length ?? 0) * 2 + (name.match(re)?.length ?? 0)) * weight;
    if (score > bestScore) {
      best = type;
      bestScore = score;
    }
  }
  return best;
};
