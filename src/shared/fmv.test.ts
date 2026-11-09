import { describe, expect, it } from 'vitest';
import { detectSeries, fmvLookup, gradeToSheldon, sheldonToTier } from './fmv';

describe('fmv', () => {
  it('detects coin series from names', () => {
    expect(detectSeries('1881-S Morgan Silver Dollar')?.series).toBe('morgan_dollar');
    expect(detectSeries('1921 Peace Dollar BU')?.series).toBe('peace_dollar');
    expect(detectSeries('2022 American Silver Eagle')?.series).toBe('silver_eagle');
    expect(detectSeries('1943 Walking Liberty Half')?.series).toBe('walking_liberty_half');
    expect(detectSeries('1916-D Mercury Dime')?.series).toBe('mercury_dime');
  });

  it('converts grades to Sheldon tiers', () => {
    expect(gradeToSheldon('MS 65')).toBe(65);
    expect(gradeToSheldon('AU-58')).toBe(58);
    expect(gradeToSheldon('VF 30')).toBe(30);
    expect(sheldonToTier(65)).toBe('MS65');
    expect(sheldonToTier(58)).toBe('AU58');
    expect(sheldonToTier(40)).toBe('XF40');
  });

  it('prices common date coins according to FMV grade tiers', () => {
    const res = fmvLookup({
      item_name: '1881-S Morgan Dollar',
      grade: 'MS 65',
      grade_number: 65,
    });
    expect(res).not.toBeNull();
    expect(res?.source).toBe('fmv');
    expect(res?.value).toBe(210);
    expect(res?.detail).toContain('NumisMedia FMV');
  });

  it('applies key date premium for famous key dates', () => {
    const key = fmvLookup({
      item_name: '1893-S Morgan Dollar',
      year: 1893,
      mint_mark: 'S',
      grade: 'VF 20',
      grade_number: 20,
    });
    expect(key).not.toBeNull();
    expect(key?.value).toBeGreaterThan(1000);
  });

  it('detects and prices US paper currency series', () => {
    expect(detectSeries('1957 $1 Silver Certificate CU')?.series).toBe('us_silver_cert_1');
    expect(detectSeries('1928-A $2 Red Seal Legal Tender')?.series).toBe('us_red_seal_2');

    const rawNote = fmvLookup({
      item_name: '1957 $1 Silver Certificate',
      grade: '64',
      grade_number: 64,
    });
    expect(rawNote).not.toBeNull();
    expect(rawNote?.value).toBe(42);
    expect(rawNote?.detail).toBe('NumisMedia FMV / Paper Guide');
  });

  it('applies EPQ and Star Note multipliers for paper currency', () => {
    const epqNote = fmvLookup({
      item_name: '1957 $1 Silver Certificate',
      grade: '64 EPQ',
      grade_number: 64,
      paper_quality: 'epq',
    });
    // 42 * 1.35 = 56.7 -> 57
    expect(epqNote?.value).toBe(57);
    expect(epqNote?.name).toContain('EPQ');

    const starNote = fmvLookup({
      item_name: '1957 $1 Silver Certificate Star Note',
      grade: '64',
      grade_number: 64,
      star_note: true,
    });
    // 42 * 2.5 = 105
    expect(starNote?.value).toBe(105);
    expect(starNote?.name).toContain('★');
  });

  it('marks coins with premium slab attributes as common-date bullion baseline', () => {
    const res = fmvLookup({
      item_name: '2017-W American Silver Eagle Burnished',
      grade: 'MS 70',
      grade_number: 70,
      is_slabbed: true,
      signature: 'Elizabeth Jones',
      special: 'First Day of Issue, Elizabeth Jones signature label',
    });
    expect(res).not.toBeNull();
    expect(res?.value).toBe(75);
    expect(res?.detail).toContain('common-date bullion baseline');
  });
});

