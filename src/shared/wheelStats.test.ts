import { describe, expect, it } from 'vitest';
import { bigHitCheck, chanceWorthWithin, nextSpinTurnsWorth, spinPrices, type StatPrize } from './wheelStats';

// Deterministic generator so the simulation is repeatable.
const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

const wheel = (...p: [string, number, number][]): StatPrize[] => p.map(([title, left, value]) => ({ title, left, value }));

describe('nextSpinTurnsWorth', () => {
  it('adds up the chance of hitting a prize whose removal lifts the wheel past the price', () => {
    // 1 x $100 and 3 x $0: worth $25 now. A $0 hit leaves 100/3 = $33.33, the $100 hit leaves $0.
    const w = wheel(['Eagle', 1, 100], ['Penny', 3, 0]);
    expect(nextSpinTurnsWorth(w, 30)).toBeCloseTo(0.75);
    expect(nextSpinTurnsWorth(w, 40)).toBe(0);
  });
});

describe('chanceWorthWithin', () => {
  it('matches the exact answer for one spin and grows with more spins', () => {
    const w = wheel(['Eagle', 1, 100], ['Penny', 3, 0]);
    const one = chanceWorthWithin(w, 30, 1, 5000, seeded(1));
    expect(one).toBeGreaterThan(0.72);
    expect(one).toBeLessThan(0.78);
    expect(chanceWorthWithin(w, 45, 2, 5000, seeded(2))).toBeCloseTo(0.5, 1);
    expect(chanceWorthWithin(w, 1000, 3, 500, seeded(3))).toBe(0);
  });
});

describe('spinPrices', () => {
  it('summarizes what spins sold for', () => {
    expect(spinPrices([{ title: 'a', price: 94.05 }, { title: 'b', price: 99 }, { title: 'c', price: null }, { title: 'd', price: 94.05 }])).toEqual({
      count: 3,
      median: 94.05,
      low: 94.05,
      high: 99,
      last: 94.05,
    });
    expect(spinPrices([])).toBeNull();
  });
});

describe('bigHitCheck', () => {
  it('rebuilds the wheel before each spin and compares big hits to a fair draw', () => {
    // Now: 1 Eagle, 1 Penny. History: Penny, Penny (oldest first). Before the last spin: 1 Eagle, 2 Pennies;
    // before the first: 1 Eagle, 3 Pennies. Big chances 1/3 and 1/4.
    const r = bigHitCheck(wheel(['Eagle', 1, 100], ['Penny', 1, 0]), [
      { title: 'Penny', price: 10 },
      { title: 'Penny', price: 10 },
    ], (t) => t === 'Eagle')!;
    expect(r.observed).toBe(0);
    expect(r.expected).toBeCloseTo(1 / 3 + 1 / 4);
    expect(r.lowTail).toBeCloseTo((2 / 3) * (3 / 4));
    expect(r.highTail).toBe(1);
  });

  it('flags a wheel that keeps missing its big prizes', () => {
    const hits = Array.from({ length: 40 }, () => ({ title: 'Penny', price: 10 }));
    const r = bigHitCheck(wheel(['Eagle', 20, 100], ['Penny', 40, 0]), hits, (t) => t === 'Eagle')!;
    expect(r.expected).toBeGreaterThan(10);
    expect(r.lowTail).toBeLessThan(0.001);
  });

  it('counts a prize that no longer appears because its last copy was hit', () => {
    const r = bigHitCheck(wheel(['Penny', 2, 0]), [{ title: '1.51 GRAMS GOLD', price: 99 }], (t) => /gold/i.test(t))!;
    expect(r).toMatchObject({ observed: 1, spins: 1 });
    expect(r.expected).toBeCloseTo(1 / 3);
  });
});
