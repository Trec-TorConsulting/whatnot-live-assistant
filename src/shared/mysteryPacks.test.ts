import { describe, expect, it } from 'vitest';
import { isMysteryPack, lookupMysteryPack } from './mysteryPacks';

describe('isMysteryPack', () => {
  it('detects blind boxes, mystery packs, chase packs, and X or Y metal offers', () => {
    expect(isMysteryPack('GOOFY BLIND BOX 1/2oz GOLD OR 1/2oz SILVER')).toBe(true);
    expect(isMysteryPack('VaultBox Series 8 Sealed Box')).toBe(true);
    expect(isMysteryPack('1/10 oz Gold Chase Pack 1 in 10')).toBe(true);
    expect(isMysteryPack('Hit Parade Coin Mystery Box')).toBe(true);
    expect(isMysteryPack('PICK YOUR PACK!!! MASSIVE GOLD SILVER & PLATINUM')).toBe(true);
    expect(isMysteryPack('1996 American Silver Eagle')).toBe(false);
    expect(isMysteryPack('1/2 oz American Gold Eagle BU')).toBe(false);
  });
});

describe('lookupMysteryPack', () => {
  const spot = { gold: 3570, silver: 41.05 };

  it('returns floor melt, EV melt, and 0.3% chase odds for Agoro Goofy 1/2 oz Blind Box', () => {
    const info = lookupMysteryPack('GOOFY BLIND BOX 1/2oz GOLD OR 1/2oz SILVER', null, spot);
    expect(info).not.toBeNull();
    expect(info!.known).toBe(true);
    expect(info!.chaseOdds).toBeCloseTo(0.003);
    expect(info!.floorMelt).toBeCloseTo(20.53);
    expect(info!.expectedMelt).toBeCloseTo(0.997 * 20.53 + 0.003 * 1785, 1);
    expect(info!.summary).toContain('99.7% 1/2 oz silver');
    expect(info!.summary).toContain('0.3% 1/2 oz gold chase');
    expect(info!.queryName).toBe('Agoro Blind Box 1/2 oz');
  });

  it('identifies VaultBox series with Red Core chase context', () => {
    const info = lookupMysteryPack('VaultBox Series 8 NGC Mystery Box', null, spot);
    expect(info).not.toBeNull();
    expect(info!.known).toBe(true);
    expect(info!.floorMelt).toBeNull();
    expect(info!.summary).toContain('VaultBox');
    expect(info!.queryName).toBe('VaultBox sealed');
  });

  it('parses explicit odds and X or Y floor/chase metals on custom chase packs', () => {
    const info = lookupMysteryPack('Silver or Gold Chase Pack 1/10 oz Gold or 1 oz Silver (1 in 10)', null, spot);
    expect(info).not.toBeNull();
    expect(info!.known).toBe(true);
    expect(info!.chaseOdds).toBeCloseTo(0.1);
    expect(info!.floorMelt).toBeCloseTo(41.05);
    expect(info!.expectedMelt).toBeCloseTo(0.9 * 41.05 + 0.1 * 357, 1);
  });

  it('recognizes Pick Your Pack with clad floor and gold/silver/platinum chases', () => {
    const info = lookupMysteryPack(
      'PICK YOUR PACK!!! MASSIVE GOLD SILVER & PLATINUM',
      'GUARANTEED EITHER GOLD, SILVER, PLATINUM OR CLAD WITH EVERY PURCHASE. ALL COINS ARE GRADED WITH NGC, PCGS, CAC OR ICG',
      spot,
    );
    expect(info).not.toBeNull();
    expect(info!.floorMelt).toBeNull();
    expect(info!.summary).toContain('floor is clad (no melt)');
  });
});
