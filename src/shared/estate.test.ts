import { describe, expect, it } from 'vitest';
import { detectShowType } from './showType';
import {
  buildEstateView,
  clothingFacts,
  estatePassOn,
  estateRules,
  isTemplate,
  lotNumber,
  rulesAreNew,
  rulesKey,
  rulesText,
  shippingCallout,
  wantFrom,
  wantMatches,
  weightTier,
} from './estate';

describe('template listings', () => {
  it('reads the lot number and weight tier off a shipping bucket', () => {
    const title = '*c - 2 oz Item on screen #57';
    expect(isTemplate(title)).toBe(true);
    expect(lotNumber(title)).toBe(57);
    expect(weightTier(title)).toBe('2 oz');
    expect(isTemplate('Junk bag #70 Bid responsibly no refund')).toBe(true);
    expect(lotNumber('Junk bag #70 Bid responsibly no refund')).toBe(70);
    expect(isTemplate('E Random 1-2lb #10')).toBe(true);
    expect(lotNumber('E Random 1-2lb #10')).toBe(10);
    expect(weightTier('E Random 1-2lb #10')).toBe('1-2 lb');
    expect(isTemplate('Cool Vintage Small 8-11 oz')).toBe(true);
    expect(weightTier('Cool Vintage Small 8-11 oz')).toBe('8-11 oz');
    expect(isTemplate('*z - Category - Coins')).toBe(true);
    expect(isTemplate('Sewing Patterns Vintage As Shown')).toBe(true);
  });

  it('keeps a named title, and does not read a year as a lot number', () => {
    expect(isTemplate("Chico's Blue Textured Fringe Trim Sweater Jacket Size 1 Medium")).toBe(false);
    const book = 'Better Homes & Gardens Cookbook 1953';
    expect(isTemplate(book)).toBe(false);
    expect(lotNumber(book)).toBeNull();
  });
});

describe('estate pass', () => {
  it('turns on for an Estate Sales category without changing show type', () => {
    expect(estatePassOn({ showTitle: 'Monday madness', categories: ['Estate Sales'] })).toBe(true);
    expect(detectShowType('Monday madness', ['Estate Sales'])).toBe('flea');
  });

  it('stays off for a coin lot on a coin show', () => {
    expect(estatePassOn({ showTitle: 'Morgan hour', lotTitle: '1921 Morgan dollar', categories: ['Coins & Money'] })).toBe(false);
    expect(detectShowType('1921 Morgan dollar', ['Coins & Money'])).toBe('coins');
  });

  it('turns on for a junk bag even when the show is not an estate', () => {
    expect(estatePassOn({ showTitle: 'Craft hour', lotTitle: 'Junk bag #3' })).toBe(true);
  });
});

describe('shipping, rules, wants, and clothing', () => {
  it('calls out shipping that is at least half the bid or the start', () => {
    expect(shippingCallout(4.47, 5, 4, false)).toMatch(/at least half/);
    expect(shippingCallout(4.47, 36, 4, false)).toBeNull();
    expect(shippingCallout(4.47, 5, 4, true)).toBeNull();
    expect(shippingCallout(4.47, null, 3, false)).toMatch(/at least half/);
  });

  it('reads buying rules once and leaves the coupon out', () => {
    const notes = 'Items were not washed. /coupon SAVE10';
    expect(estateRules(notes, null)).toEqual(['clean']);
    expect(rulesText(notes, null)).toMatch(/Clean before wearing/);
    expect(rulesText(notes, null)).not.toContain('SAVE10');
    expect(estateRules(null, 'no refund and as seen')).toEqual(['no-returns', 'as-is']);
    const rules = estateRules(notes, null);
    const key = rulesKey(rules);
    expect(rulesAreNew(null, rules)).toBe(true);
    expect(rulesAreNew(key, rules)).toBe(false);
  });

  it('keeps item wants and matches them to a recognized name', () => {
    expect(wantFrom('Can you run the duck with the heart dress?')).toBeTruthy();
    expect(wantFrom('Sterling?')).toBe('Sterling?');
    expect(wantFrom('No sound?')).toBeNull();
    expect(wantFrom('How do the bulk ship?')).toBeNull();
    expect(wantMatches('lion', 'Chalkware lion bookend')).toBe(true);
    expect(wantMatches('pixies', 'Roseville pixie figurine')).toBe(true);
  });

  it('shows a stated clothing brand and size and does not invent a measurement', () => {
    const facts = clothingFacts("Chico's Blue Textured Fringe Trim Sweater Jacket Size 1 Medium", null, null);
    expect(facts).toMatchObject({ brand: "Chico's", size: '1', measurement: null });
    const view = buildEstateView({
      lotTitle: "Chico's Blue Textured Fringe Trim Sweater Jacket Size 1 Medium",
      categories: ['Estate Sales'],
      recognizedName: "Chico's jacket",
    });
    expect(view?.clothing).toContain("Chico's");
    expect(view?.clothing).toContain('size 1');
    expect(view?.clothing ?? '').not.toMatch(/\dcm|inch/i);
  });
});
