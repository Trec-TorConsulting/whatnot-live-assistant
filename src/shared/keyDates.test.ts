import { describe, expect, it } from 'vitest';
import { keyDateCallouts } from './keyDates';

const texts = (text: string, year?: number | null, mint?: string | null) => keyDateCallouts({ text, year, mint }).map((c) => c.text);

describe('keyDateCallouts', () => {
  it('calls out key dates with their mintage from the listing title alone', () => {
    expect(texts('1893-S Morgan Silver Dollar PCGS VF 30')).toEqual(['Key date: 1893-S Morgan dollar, only 100,000 minted; the king of Morgans.']);
    expect(texts('1916 D Mercury Dime')).toEqual(['Key date: 1916-D Mercury dime, only 264,000 minted.']);
    expect(texts('1921 Walking Liberty Half Dollar')).toEqual(['Key date: 1921 Walking Liberty half, only 246,000 minted.']);
  });

  it('marks semi-keys and flags key dates as often faked', () => {
    const [semi] = keyDateCallouts({ text: '1955 Franklin Half' });
    expect(semi).toEqual({ kind: 'semi', faked: false, text: 'Semi-key date: 1955 Franklin half, only 2,498,181 minted.' });
    expect(keyDateCallouts({ text: '1889-CC Morgan' })[0]!.faked).toBe(true);
  });

  it('prefers the model’s date and mint over the text', () => {
    expect(texts('Morgan Dollar', 1893, 'S')).toHaveLength(1);
    expect(texts('1893-S Morgan Dollar', 1921, '')).toEqual([]);
    expect(texts('1950 Jefferson Nickel', 1950, 'D')).toEqual(['Key date: 1950-D Jefferson nickel, only 2,630,030 minted.']);
  });

  it('treats P and no mint mark as Philadelphia', () => {
    expect(texts('1928-P Peace Dollar')).toEqual(['Key date: 1928 Peace dollar, only 360,649 minted.']);
    expect(texts('1928-S Peace Dollar')).toEqual([]);
  });

  it('uses the VDB mintage only when VDB is named', () => {
    expect(texts('1909-S VDB Lincoln Wheat Cent')).toEqual(['Key date: 1909-S VDB Lincoln cent, only 484,000 minted.']);
    expect(texts('1909-S Lincoln Wheat Cent')).toEqual(['Key date: 1909-S Lincoln cent, only 1,825,000 minted.']);
  });

  it('names a variety when it is listed, and says to check for it otherwise', () => {
    expect(texts('1955 Lincoln Cent Doubled Die Obverse')).toEqual(['Valuable variety: 1955 Doubled Die Obverse.']);
    expect(texts('1955 Lincoln Wheat Penny')).toEqual(["Check for the 1955 Doubled Die Obverse; it's worth far more."]);
    expect(texts('1937-D Buffalo Nickel 3 Legged')).toEqual(['Valuable variety: 1937-D 3-Legged Buffalo.']);
  });

  it('does not mistake other coins for a series', () => {
    expect(texts('1921 Morgan Dollar')).toEqual([]);
    expect(texts('2021 Gold Buffalo 1 oz')).toEqual([]);
    expect(texts('1996 Walking Liberty design 1 oz silver round')).toEqual([]);
    expect(texts('1996 American Silver Eagle')).toEqual(['Key date: 1996 Silver Eagle, only 3,603,386 minted; lowest-mintage bullion Silver Eagle.']);
    expect(texts('1916 Standing Liberty Quarter')).toEqual(['Key date: 1916 Standing Liberty quarter, only 52,000 minted.']);
    expect(texts('Pokemon card 1999')).toEqual([]);
  });
});
