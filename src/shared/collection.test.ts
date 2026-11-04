import { describe, expect, it } from 'vitest';
import { collectionLine, compareToCollection, dateOf, parseSetLine, sanitizeCollection } from './collection';
import { checksFor } from './counterfeit';

describe('collection', () => {
  it('reads sets and dates', () => {
    expect(parseSetLine('Morgan dollar 1878-1921')).toMatchObject({ words: ['morgan', 'dollar'], from: 1878, to: 1921 });
    expect(parseSetLine('morgan dollar')).toBeNull();
    expect(dateOf('1881-S Morgan')).toEqual({ year: 1881, mint: 'S' });
    expect(dateOf('1893 CC Morgan')).toEqual({ year: 1893, mint: 'CC' });
    expect(dateOf('1921 Silver Morgan')).toEqual({ year: 1921, mint: null });
    expect(sanitizeCollection({ owned: [' a ', ''], sets: [{ text: 'peace dollar 1921-1935' }, { text: 'junk' }] }).sets).toHaveLength(1);
  });

  it('says whether an item fills a gap in a set, by date and mint', () => {
    const sets = [parseSetLine('morgan dollar 1878-1921')!];
    const owned = ['1881-S Morgan Dollar', '1921 Morgan Dollar MS63', 'Peace Dollar 1923'];
    const need = compareToCollection({ name: '1881-O Morgan Silver Dollar', year: 1881, mintMark: 'O' }, owned, sets);
    expect(collectionLine(need)).toBe('Needed for your set: morgan dollar 1878-1921 (you have 2 dates)');
    const have = compareToCollection({ name: '1921 Morgan Silver Dollar', year: 1921, mintMark: null }, owned, sets);
    expect(collectionLine(have)).toBe('Already in your set: morgan dollar 1878-1921');
    expect(collectionLine(compareToCollection({ name: '1923 Peace Dollar' }, owned, sets))).toBe('You own 1 like this');
    expect(collectionLine(compareToCollection({ name: 'Pokemon Charizard' }, owned, sets))).toBeNull();
  });
});

describe('counterfeit checks', () => {
  it('lists checks by item type, key dates and slabs first', () => {
    const raw = checksFor({ itemType: 'coin', slabbed: false, metal: 'silver', keyDate: true });
    expect(raw[0]).toMatch(/Key dates/);
    expect(raw.length).toBeLessThanOrEqual(5);
    expect(checksFor({ itemType: 'coin', slabbed: true, metal: null, keyDate: true })[0]).toMatch(/cert number/);
    expect(checksFor({ itemType: 'bullion', slabbed: false, metal: 'gold', keyDate: false }).join(' ')).toMatch(/magnet/);
    expect(checksFor({ itemType: 'other', slabbed: false, metal: null, keyDate: false })).toEqual([]);
  });

  it('lists electronics checks, tools checks, and clone cues capped at five', () => {
    const phoneChecks = checksFor({
      itemType: 'electronics',
      slabbed: false,
      metal: null,
      keyDate: false,
      showType: 'electronics',
      title: 'Used Apple iPhone 13 128GB',
    });
    expect(phoneChecks.length).toBeLessThanOrEqual(5);
    expect(phoneChecks.join(' ')).toMatch(/activation lock/i);
    expect(phoneChecks.join(' ')).toMatch(/carrier lock/i);
    expect(phoneChecks.join(' ')).toMatch(/battery health/i);
    expect(phoneChecks.join(' ')).toMatch(/serial/i);

    const toolChecks = checksFor({
      itemType: 'tools_household',
      slabbed: false,
      metal: null,
      keyDate: false,
      showType: 'tools',
      title: 'Milwaukee M18 FUEL Hammer Drill',
    });
    expect(toolChecks.length).toBeLessThanOrEqual(5);
    expect(toolChecks.join(' ')).toMatch(/batteries and charger/i);
    expect(toolChecks.join(' ')).toMatch(/nameplate part number/i);
    expect(toolChecks.join(' ')).toMatch(/platform/i);

    const consoleChecks = checksFor({
      itemType: 'electronics',
      slabbed: false,
      metal: null,
      keyDate: false,
      showType: 'electronics',
      title: 'P5 Handheld Retro Gaming Console – 520 Built-In Games',
    });
    expect(consoleChecks.length).toBeLessThanOrEqual(5);
    expect(consoleChecks.join(' ')).toMatch(/unlicensed/i);

    const sdChecks = checksFor({
      itemType: 'electronics',
      slabbed: false,
      metal: null,
      keyDate: false,
      showType: 'electronics',
      title: '1TB SD Card',
      startPrice: 1,
    });
    expect(sdChecks.length).toBeLessThanOrEqual(5);
    expect(sdChecks.join(' ')).toMatch(/capacity/i);
  });
});
