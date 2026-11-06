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
});

