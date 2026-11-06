import { describe, expect, it } from 'vitest';
import {
  emptyWheel,
  extractFloorsFromNotes,
  formatWheelSlots,
  hitSlot,
  isFloorSlot,
  parseWheelSlots,
  resetSpins,
  undoSpin,
  wheelOdds,
  type WheelState,
} from './wheel';

const wheel = (text: string, price: number | null): WheelState => ({ ...emptyWheel('show1', 0), price, slots: parseWheelSlots(text) });

describe('parseWheelSlots', () => {
  it('reads counts, prices and unpriced prizes', () => {
    expect(parseWheelSlots('Silver Eagle x2 $35\nWheat penny 10x $1\n\nMorgan dollar $1,045.50\nMystery x3 ?\nPlain prize')).toEqual([
      { label: 'Silver Eagle', total: 2, left: 2, value: 35 },
      { label: 'Wheat penny', total: 10, left: 10, value: 1 },
      { label: 'Morgan dollar', total: 1, left: 1, value: 1045.5 },
      { label: 'Mystery', total: 3, left: 3, value: null },
      { label: 'Plain prize', total: 1, left: 1, value: null },
    ]);
  });

  it('round-trips through formatWheelSlots', () => {
    const slots = parseWheelSlots('Silver Eagle x2 $35\nMystery ?');
    expect(parseWheelSlots(formatWheelSlots(slots))).toEqual(slots);
  });
});

describe('wheelOdds', () => {
  it('computes chances and expected value per spin', () => {
    const odds = wheelOdds(wheel('Eagle $40\nPenny x3 $0', 15));
    expect(odds.spotsLeft).toBe(4);
    expect(odds.slots.map((s) => s.chance)).toEqual([0.25, 0.75]);
    expect(odds.expectedValue).toBe(10);
    expect(odds.edge).toBe(-5);
    expect(odds.chanceBeatPrice).toBe(0.25);
    expect(odds.topPrize).toEqual({ label: 'Eagle', value: 40, chance: 0.25 });
    expect(odds.top).toMatchObject({ label: 'Eagle', value: 40, left: 1, chance: 0.25, loss: -25 });
    expect(odds.floor).toMatchObject({ label: 'Penny', value: 0, left: 3, chance: 0.75, loss: 15 });
    expect(odds.verdict).toBe('not_worth');
    expect(odds.spinsUntilWorth).toBe(2);
  });

  it('turns worth it once cheap prizes come off', () => {
    let w = wheel('Eagle $40\nPenny x3 $0', 15);
    w = hitSlot(hitSlot(w, 1, 1), 1, 2);
    const odds = wheelOdds(w);
    expect(odds.expectedValue).toBe(20);
    expect(odds.verdict).toBe('worth');
    expect(odds.spinsUntilWorth).toBe(0);
  });

  it('says never when even the best prize is below the price', () => {
    expect(wheelOdds(wheel('A $5\nB $3', 10)).spinsUntilWorth).toBeNull();
  });

  it('treats unpriced prizes as a floor and never calls it not worth', () => {
    const odds = wheelOdds(wheel('Eagle $40\nMystery x3 ?', 15));
    expect(odds.expectedIsFloor).toBe(true);
    expect(odds.expectedValue).toBe(10);
    expect(odds.verdict).toBe('unclear');
    expect(odds.spinsUntilWorth).toBeNull();
    expect(wheelOdds(wheel('Eagle $80\nMystery ?', 30)).verdict).toBe('worth');
  });

  it('marks the lowest priced prizes as the floor, naming the one with the most copies first', () => {
    const odds = wheelOdds(wheel('Junk $1\nCent x4 $1\nFiller x8 $5\nEagle $40\nEnvelope x2 ?', 12));
    expect(odds.floor).toMatchObject({ label: 'Cent, Junk', value: 1, left: 5, loss: 11 });
    expect(odds.top).toMatchObject({ label: 'Eagle', value: 40, left: 1, loss: -28 });
    expect(odds.floor?.label).not.toContain('Filler');
  });

  it('is unclear without a price and empty when no spots are left', () => {
    expect(wheelOdds(wheel('Eagle $40', null)).verdict).toBe('unclear');
    expect(wheelOdds(hitSlot(wheel('Eagle $40', 10), 0)).verdict).toBe('empty');
  });

  it('handles multi floors with different values and combines them in floor odds', () => {
    const odds = wheelOdds(
      wheel('Wheat cent (floor) 5x $0.15\nBuffalo nickel (floor) 4x $0.75\nBoard pick hit $50', 10),
    );
    expect(odds.floor).toMatchObject({
      label: 'Wheat cent (floor), Buffalo nickel (floor)',
      value: 0.15,
      valueHigh: 0.75,
      left: 9,
      chance: 0.9,
    });
    expect(odds.top).toMatchObject({
      label: 'Board pick hit',
      value: 50,
      left: 1,
      chance: 0.1,
    });
  });

  it('extracts multi floors from game show notes and matches slots', () => {
    const notes =
      'Revers randomized wheels \n10 spots \nYou either get a wheat cent, buffalo nickel or the hit\nWhoever gets the hit gets to pick a item off the board \n\nPlay responsibly and no refunds thank you ';
    const floors = extractFloorsFromNotes(notes);
    expect(floors).toEqual(['wheat cent', 'buffalo nickel']);
    expect(isFloorSlot('Wheat Cent', floors)).toBe(true);
    expect(isFloorSlot('Wheat Penny', floors)).toBe(true);
    expect(isFloorSlot('1936 Buffalo Nickel', floors)).toBe(true);
    expect(isFloorSlot('Board pick hit', floors)).toBe(false);
  });
});

describe('spins', () => {
  it('ignores hits on empty slots, and undo and reset restore counts', () => {
    let w = hitSlot(wheel('Eagle $40\nPenny x2 $1', 5), 0, 1);
    expect(hitSlot(w, 0, 2)).toBe(w);
    w = hitSlot(w, 1, 3);
    expect(w.slots.map((s) => s.left)).toEqual([0, 1]);
    expect(undoSpin(w).slots.map((s) => s.left)).toEqual([0, 2]);
    expect(resetSpins(w)).toMatchObject({ spins: [], slots: [{ left: 1 }, { left: 2 }] });
  });
});
