import { describe, expect, it } from 'vitest';
import type { BreakHit, BreakPrize, BreakSnapshot } from '../shared/breaks';
import { emptySession, type Lot } from '../shared/live';
import type { PrizeValue } from '../shared/prizeValue';
import { activeWheel, wheelView } from './wheel';

const NOW = 1_000_000;

const prize = (id: string, title: string, left: number, detail = ''): BreakPrize => ({ id, title, detail, left });
const hit = (spotId: string, title: string, price: number, buyer = 'amy'): BreakHit => ({
  spotId,
  title,
  buyer,
  price,
  pending: /^#\d+$/.test(title),
  seenAt: NOW,
});

const wheel = (over: Partial<BreakSnapshot> = {}): BreakSnapshot => ({
  id: 'b1',
  title: 'Gold Rush',
  format: 'MYSTERY',
  status: 'filling',
  sold: 6,
  total: 10,
  prizes: [prize('1', 'Gold Nugget', 1), prize('2', 'Wheat Penny', 3)],
  complete: true,
  hits: [hit('s1', 'Wheat Penny', 28)],
  soldOffset: 0,
  soldCursor: null,
  soldHasMore: false,
  titleKeys: {},
  fetchedAt: NOW,
  ...over,
});

const lot = (over: Partial<Lot> = {}): Lot => ({
  id: 'l1',
  title: 'Spin',
  currentBid: 30,
  bidCount: 2,
  leader: 'bob',
  endsAt: null,
  status: 'active',
  nextBid: 31,
  breakId: 'b1',
  updatedAt: NOW,
  ...over,
});

const values = { 'gold nugget': 100, 'wheat penny': 10 };

describe('activeWheel', () => {
  it('only counts the wheel for the break that is running', () => {
    const s = { ...emptySession('live1'), breakId: 'b1', wheel: wheel() };
    expect(activeWheel(s)?.id).toBe('b1');
    expect(activeWheel({ ...s, breakId: 'b2' })).toBeNull();
    expect(activeWheel(emptySession('live1'))).toBeNull();
    expect(activeWheel(null)).toBeNull();
  });
});

describe('wheelView', () => {
  it('says worth it when the spin beats its current bid', () => {
    const v = wheelView(wheel(), lot(), values, {}, NOW);
    expect(v.level).toBe('worth');
    expect(v.title).toBe('Gold Rush');
    expect(v.spots).toBe('4 of 10 spots left');
    expect(v.value).toBe('Worth $32.50 a spin');
    expect(v.verdict).toBe('Worth it: $2.50 over the bid');
    expect(v.facts).toEqual([
      { label: 'Beats the bid', value: '25% chance', detail: null },
      { label: 'Top', value: '$100 · 25% chance', detail: 'Gold Nugget · 1 left · gain $70' },
      { label: 'Floor', value: '$10 · 75% chance', detail: 'Wheat Penny · 3 left · lose $20' },
      { label: 'Last spin', value: '$28 · @amy', detail: 'Wheat Penny' },
    ]);
    expect(v.warnings).toEqual([]);
  });

  it('groups copies of the top and names the cheap floor', () => {
    const prizes = [
      prize('1', 'Silver Eagle', 1),
      prize('2', 'Gold Nugget', 1),
      prize('3', 'Wheat Penny', 5),
      prize('4', 'gold  nugget', 1),
      prize('5', 'Morgan Dollar', 2),
    ];
    const v = wheelView(wheel({ prizes }), lot(), { ...values, 'silver eagle': 35, 'morgan dollar': 40 }, {}, NOW);
    const top = v.facts.find((f) => f.label === 'Top');
    expect(top?.value).toBe('$100 · 20% chance');
    expect(top?.detail).toContain('2 left · gain $70');
    expect(top?.detail).toContain('Gold Nugget');
    expect(top?.detail).toContain('gold  nugget');
    expect(v.facts.find((f) => f.label === 'Floor')).toMatchObject({ value: '$10 · 50% chance', detail: 'Wheat Penny · 5 left · lose $20' });
    expect(v.facts.some((f) => f.label === 'Most spots')).toBe(false);
  });

  it('keeps one title in two conditions apart, using condition values before title-only ones', () => {
    const prizes = [prize('1', 'Morgan Dollar', 1, 'MS65'), prize('2', 'Morgan Dollar', 3, 'Good'), prize('3', 'Wheat Penny', 6)];
    const sold = (low: number): PrizeValue => ({ low, high: null, source: 'sold', note: null, at: NOW });
    const auto = { 'morgan dollar | ms65': sold(400), 'morgan dollar': sold(40) };
    const v = wheelView(wheel({ prizes }), lot(), { 'wheat penny': 10 }, auto, NOW);
    expect(v.facts.find((f) => f.label === 'Top')).toMatchObject({ value: '$400 · 10% chance', detail: 'Morgan Dollar · MS65 · 1 left · gain $370' });
    expect(v.facts.find((f) => f.label === 'Floor')).toMatchObject({ value: '$10 · 60% chance', detail: 'Wheat Penny · 6 left · lose $20' });
    // Your own title-only value still beats an automatic one for a specific condition.
    const yours = wheelView(wheel({ prizes }), lot(), { 'morgan dollar': 50, 'wheat penny': 10 }, auto, NOW);
    expect(yours.facts.find((f) => f.label === 'Top')!.value).toBe('$50 · 40% chance');
  });

  it('shows the last spin that has landed, not one still waiting on the wheel', () => {
    const v = wheelView(wheel({ hits: [hit('s1', 'Gold Nugget', 40, 'bob'), hit('s2', '#28', 35)] }), lot(), values, {}, NOW);
    expect(v.facts.find((f) => f.label === 'Last spin')).toEqual({ label: 'Last spin', value: '$40 · @bob', detail: 'Gold Nugget' });
  });

  it('says how many cheap hits it needs when not worth it', () => {
    const v = wheelView(wheel(), lot({ currentBid: 50 }), values, {}, NOW);
    expect(v.level).toBe('not_worth');
    expect(v.verdict).toBe('Not worth it yet: 2 more cheap hits needed');
  });

  it('uses the opening bid before anyone bids, and ignores a lot from another break', () => {
    expect(wheelView(wheel(), lot({ currentBid: null }), values, {}, NOW).verdict).toBe('Worth it: $1.50 over the bid');
    const between = wheelView(wheel({ hits: [] }), lot({ breakId: 'other' }), values, {}, NOW);
    expect(between.verdict).toBe('Waiting for the next spin’s bid');
    // Same rows between spins, so the card keeps its shape.
    expect(between.facts.map((f) => [f.label, f.value])).toEqual([
      ['Beats the bid', '—'],
      ['Top', '$100 · 25% chance'],
      ['Floor', '$10 · 75% chance'],
      ['Last spin', '—'],
    ]);
  });

  it('values automatic prizes at their low end', () => {
    const ai: PrizeValue = { low: 80, high: 150, source: 'ai', note: null, at: NOW };
    const v = wheelView(wheel(), lot(), { 'wheat penny': 10 }, { 'gold nugget': ai }, NOW);
    expect(v.value).toBe('Worth $27.50 a spin');
    expect(v.warnings).toEqual([]);
  });

  it('never calls a wheel with unpriced prizes not worth it', () => {
    const v = wheelView(wheel(), lot({ currentBid: 50 }), { 'wheat penny': 10 }, {}, NOW);
    expect(v.level).toBe('unclear');
    expect(v.value).toBe('Worth ≥ $7.50 a spin');
    expect(v.warnings).toContain('1 prize has no value yet (counted as $0).');
  });

  it('values envelopes from this wheel’s pool and ignores another wheel’s price', () => {
    const prizes = [prize('1', 'ENVELOPE #2', 1, 'GOOD'), prize('2', 'ENVELOPE #3', 1), prize('3', 'Wheat Penny', 8)];
    const read: PrizeValue = { low: 1000, high: null, source: 'melt', note: null, at: NOW, inside: '1 kilo silver bar' };
    const auto = { 'b1#envelope #2 | good': read, 'b9#envelope #3': read, 'envelope #3': read };
    const v = wheelView(wheel({ prizes }), lot(), { 'wheat penny': 10 }, auto, NOW);
    expect(v.value).toBe('Worth ≥ $8 a spin');
    expect(v.facts.find((f) => f.label === 'Envelope average')?.value).toBe('incomplete');
    expect(v.warnings).toContain('2 prizes have no value yet (counted as $0).');
  });

  it('shows the top item, its sealed share, and an incomplete average when the shelf is crowded', () => {
    const prizes = [prize('1', 'ENVELOPE #2', 1), prize('2', 'ENVELOPE #3', 1), prize('3', 'Wheat Penny', 8)];
    const items: PrizeValue[] = [
      { low: 1000, high: null, source: 'melt', note: null, at: NOW, inside: '1 kilo silver bar' },
      { low: 60, high: 90, source: 'ai', note: null, at: NOW, inside: '1985 Liberty MS 67' },
      { low: 40, high: 50, source: 'ai', note: null, at: NOW, inside: 'Peace dollar' },
    ];
    const board = { at: NOW, prizes: ['b1#envelope #2', 'b1#envelope #3'], items };
    const v = wheelView(wheel({ prizes }), lot(), { 'wheat penny': 10 }, {}, NOW, board);
    expect(v.value).toBe('Worth ≥ $8 a spin');
    expect(v.facts.find((f) => f.label === 'Envelope chase')).toEqual({ label: 'Envelope chase', value: '$1,000', detail: '1 kilo silver bar' });
    expect(v.facts.find((f) => f.label === 'Sealed share')?.value).toBe('$500');
    expect(v.facts.find((f) => f.label === 'Envelope average')?.value).toBe('incomplete');
    expect(v.warnings).toContain('2 prizes have no value yet (counted as $0).');
  });

  it('warns about partial and stale prize lists', () => {
    const v = wheelView(wheel({ complete: false }), lot(), values, {}, NOW + 3 * 60_000);
    expect(v.warnings).toEqual([
      'Whatnot sent only part of the prize list, so these odds are incomplete.',
      'Prize counts last updated 3m ago.',
    ]);
  });
});
