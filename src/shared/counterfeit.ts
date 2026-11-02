// What to check (or ask the seller to show) before trusting an item, by kind. These are checks, not
// findings: none of them says the item is fake.
import type { ItemType } from './appraisal';

export interface CheckContext {
  itemType: ItemType | null | undefined;
  slabbed: boolean;
  metal: string | null;
  keyDate: boolean;
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
};

const SLAB = ['Look up the cert number on the grader’s site and match the photo', 'Holder edges and label fonts look factory, not reopened'];
const KEY_DATE = 'Key dates are the most faked: ask for close-ups of the date and mint mark';

export const MAX_CHECKS = 5;

export const checksFor = (c: CheckContext): string[] => {
  const base = (c.itemType && BY_TYPE[c.itemType]) || [];
  const metal = c.metal && /gold|silver|platinum|palladium/i.test(c.metal) && c.itemType !== 'bullion' ? ['A magnet does not stick (precious metals are not magnetic)'] : [];
  const lines = [...(c.keyDate && !c.slabbed ? [KEY_DATE] : []), ...(c.slabbed ? SLAB : []), ...base, ...metal];
  return [...new Set(lines)].slice(0, MAX_CHECKS);
};
