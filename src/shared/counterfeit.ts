// What to check (or ask the seller to show) before trusting an item, by kind. These are checks, not
// findings: none of them says the item is fake.
import type { ItemType } from './appraisal';
import type { ShowType } from './showType';
import { readPlatform } from './tools';

export interface CheckContext {
  itemType: ItemType | null | undefined;
  slabbed: boolean;
  metal: string | null;
  keyDate: boolean;
  showType?: ShowType | null;
  title?: string | null;
  startPrice?: number | null;
  price?: number | null;
}

const BY_TYPE: Partial<Record<ItemType, string[]>> = {
  coin: [
    'Weight and diameter match the coin’s specs (a scale reading on camera)',
    'Edge: reeding or lettering matches the type',
    'No soft, mushy details or a “greasy” cast look',
    'Date and mint mark aren’t tooled or added',
  ],
  bullion: [
    'Weight on a scale matches the stated weight',
    'Assay card or serial number for bars, and it matches',
    'A magnet does not stick (silver and gold are not magnetic)',
    'Refiner mark and fonts look like the real product',
  ],
  token_medal: ['Weight and metal match what’s claimed', 'Maker’s marks or hallmark visible'],
  banknote: ['Watermark and security thread when held to light', 'Crisp, raised printing; no blurry dots', 'Serial numbers match on both sides'],
  trading_card: [
    'Print pattern under a loupe (real cards show a rosette, fakes are blurry or flat)',
    'Card stock and edges: light test, no glossy blur on the back',
    'Fonts and set symbol match the real card',
  ],
  sports_memorabilia: ['Authentication sticker or COA from PSA/DNA, JSA, or Beckett', 'Look the cert number up on the authenticator’s site'],
  comic_book: ['No restoration: color touch, trimmed edges, or added staples', 'Check the cover price and printing for reprints'],
  toy_figure: ['Box printing, logos, and copyright line match the original', 'Seams and paint are clean, not bootleg-rough'],
  video_game: ['Label print quality and the board inside, for cartridges', 'Region and serial code on the label'],
  vinyl_media: ['Matrix/runout numbers in the dead wax match a known pressing', 'Label and catalog number match the pressing'],
  jewelry_watch: [
    'Hallmark or karat stamp (14K, 585, 925) and maker’s mark',
    'A magnet does not stick to gold or silver',
    'For watches: serial and reference numbers, movement, and weight',
  ],
  stamp: ['Perforations and gum aren’t reworked', 'Watermark, color, and printing method match the issue'],
  antique_decor: ['Maker’s marks, wear, and patina consistent with the age', 'No modern screws, glue, or casting seams'],
  glass_pottery: ['Maker’s mark on the base', 'Wear on the base that matches the age'],
  electronics: [
    'Check activation lock (Find My / iCloud or Google account signed out)',
    'Check carrier lock and IMEI status (unlocked vs carrier-locked)',
    'Check battery health and cycle count on screen',
    'Check that the serial number on the box matches the device',
    'Confirm whether a charger or power adapter is present',
  ],
};

const TOOLS_CHECKS = [
  'Count the batteries and charger on camera (confirm tool-only vs kit)',
  'Check the nameplate part number on the tool or box',
  'Confirm the battery platform (M12, M18, 20V MAX, ONE+ 18V) matches your batteries',
];

const SLAB = ['Look up the cert number on the grader’s site and match the photo', 'Holder edges and label fonts look factory, not reopened'];
const KEY_DATE = 'Key dates are the most faked: ask for close-ups of the date and mint mark';

const MULTI_GAME_CONSOLE_RE = /\b\d+\s*-\s*in\s*-\s*1\b|\b\d{2,}\s+built[- ]?in\s+games?\b/i;
const BIG_CARD_RE = /\b(?:512\s*gb|[1-9]\d*\s*tb)\b/i;
const SD_CARD_RE = /\b(?:sd|micro\s*sd|tf|memory)\s*cards?\b/i;
const DEVICE_TITLE_RE =
  /\b(?:iphone|ipad|macbook|laptop|chromebook|thinkpad|pixel|galaxy|smartphone|phone|tablet|airpods)\b/i;
const TOOL_TITLE_RE =
  /\b(?:cordless|brushless|drill|driver|impact|ratchet|grinder|sawzall|hackzall|milwaukee|dewalt|ryobi|makita)\b/i;

export const MAX_CHECKS = 5;

export const checksFor = (c: CheckContext): string[] => {
  const title = c.title ?? '';
  const clones: string[] = [];
  if (MULTI_GAME_CONSOLE_RE.test(title)) {
    clones.push('Verify licensing: built-in multi-game consoles are usually unlicensed');
  }
  if (BIG_CARD_RE.test(title) && SD_CARD_RE.test(title)) {
    const statedPrice = c.startPrice ?? c.price ?? null;
    const titlePriceMatch = title.match(/\$\s*(\d+(?:\.\d+)?)/);
    const titlePrice = titlePriceMatch?.[1] ? parseFloat(titlePriceMatch[1]) : null;
    const effectivePrice = statedPrice ?? titlePrice;
    if (effectivePrice === null || effectivePrice <= 5) {
      clones.push('Test the card’s real capacity with a read/write utility before trusting the label');
    }
  }

  const isTools =
    c.showType === 'tools' ||
    readPlatform(title) !== null ||
    (c.itemType === 'tools_household' && TOOL_TITLE_RE.test(title));

  const isElectronics =
    !isTools &&
    (c.itemType === 'electronics' || c.showType === 'electronics' || DEVICE_TITLE_RE.test(title));

  const base = isTools
    ? TOOLS_CHECKS
    : isElectronics
      ? BY_TYPE.electronics!
      : (c.itemType && BY_TYPE[c.itemType]) || [];

  const metal =
    c.metal && /gold|silver|platinum|palladium/i.test(c.metal) && c.itemType !== 'bullion'
      ? ['A magnet does not stick (precious metals are not magnetic)']
      : [];

  const lines = [
    ...clones,
    ...(c.keyDate && !c.slabbed ? [KEY_DATE] : []),
    ...(c.slabbed ? SLAB : []),
    ...base,
    ...metal,
  ];
  return [...new Set(lines)].slice(0, MAX_CHECKS);
};
