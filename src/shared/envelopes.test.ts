import { describe, expect, it } from 'vitest';
import type { BreakPrize, BreakSnapshot } from './breaks';
import { boardIsCurrent, unmatchedEnvelopes, unseenPrizes, wheelRows, type EnvelopeBoard } from './envelopes';
import type { PrizeValue } from './prizeValue';
import { emptyWheel, wheelOdds } from './wheel';

const prize = (title: string, left: number, detail = ''): BreakPrize => ({ id: title, title, detail, left });
const item = (inside: string, low: number, source: PrizeValue['source'] = 'ai'): PrizeValue => ({ low, high: null, source, note: null, at: 0, inside });

// Shaped like the live envelope wheel (jesusmac09032, Oct 2026): numbered envelopes plus nickels.
const wheel = (envelopes = 3): BreakSnapshot => ({
  id: 'b1',
  title: '100 SPOT BIG WIN KILO',
  format: 'MYSTERY',
  status: 'filling',
  sold: 0,
  total: envelopes + 7,
  prizes: [...Array.from({ length: envelopes }, (_, i) => prize(`ENVELOPE #${i + 2}`, 1)), prize('BUFFALO NICKEL RANDOM YEAR', 7, 'FAIR')],
  complete: true,
  hits: [],
  soldOffset: 0,
  soldCursor: null,
  soldHasMore: false,
  titleKeys: {},
  fetchedAt: 0,
});

const nickels = { 'buffalo nickel random year | fair': 2 };
const board = (items: PrizeValue[], prizes = ['b1#envelope #2', 'b1#envelope #3', 'b1#envelope #4']): EnvelopeBoard => ({ at: 0, prizes, items });
const worth = (rows: ReturnType<typeof wheelRows>) =>
  wheelOdds({ ...emptyWheel('b1'), slots: rows.map((r) => ({ label: r.title, total: r.left, left: r.left, value: r.value })) });

describe('wheelRows', () => {
  it('counts each unopened envelope as one board item', () => {
    const rows = wheelRows(wheel(), nickels, {}, board([item('1 kilo silver', 1000, 'melt'), item('1985 Liberty MS 67', 60), item('5 oz silver', 150)]));
    expect(rows.map((r) => [r.title, r.inside, r.left, r.value])).toEqual([
      ['BUFFALO NICKEL RANDOM YEAR', null, 7, 2],
      ['Envelope', '1985 Liberty MS 67', 1, 60],
      ['Envelope', '5 oz silver', 1, 150],
      ['Envelope', '1 kilo silver', 1, 1000],
    ]);
    const o = worth(rows);
    expect(o.expectedValue).toBeCloseTo((14 + 1210) / 10);
    expect(o.topPrize).toMatchObject({ value: 1000, chance: 0.1 });
  });

  it('keeps only the cheapest items when the board shows more than are left, and leaves missing ones unpriced', () => {
    const items = [item('1 kilo silver', 1000), item('1985 Liberty MS 67', 60), item('5 oz silver', 150)];
    expect(wheelRows(wheel(2), nickels, {}, board(items)).filter((r) => r.fromBoard).map((r) => r.value)).toEqual([60, 150]);
    const short = wheelRows(wheel(3), nickels, {}, board([item('1 kilo silver', 1000)])).filter((r) => r.fromBoard);
    expect(short.map((r) => [r.inside, r.left, r.value])).toEqual([
      ['1 kilo silver', 1, 1000],
      ['not on camera', 2, null],
    ]);
  });

  it('leaves envelopes with their own value alone, and lets you override a board item', () => {
    const auto = { 'b1#envelope #2': item('2.5 dollar gold Indian set', 2000) };
    const rows = wheelRows(wheel(), { ...nickels, 'b1#board|5 oz silver': 175 }, auto, board([item('5 oz silver', 150), item('1985 Liberty MS 67', 60)]));
    expect(rows.map((r) => [r.title, r.inside, r.value])).toEqual([
      ['ENVELOPE #2', '2.5 dollar gold Indian set', 2000],
      ['BUFFALO NICKEL RANDOM YEAR', null, 2],
      ['Envelope', '1985 Liberty MS 67', 60],
      ['Envelope', '5 oz silver', 175],
    ]);
  });

  it('shows plain unpriced envelopes until a board is read', () => {
    const rows = wheelRows(wheel(), nickels, {});
    expect(rows.filter((r) => r.value === null).map((r) => r.title)).toEqual(['ENVELOPE #2', 'ENVELOPE #3', 'ENVELOPE #4']);
  });
});

describe('boardIsCurrent', () => {
  it('needs a new read once an envelope is opened', () => {
    const b = board([item('5 oz silver', 150)]);
    expect(boardIsCurrent(b, unmatchedEnvelopes(wheel(), {}, {}))).toBe(true);
    expect(boardIsCurrent(b, unmatchedEnvelopes(wheel(2), {}, {}))).toBe(false);
    expect(boardIsCurrent(null, unmatchedEnvelopes(wheel(), {}, {}))).toBe(false);
  });
});

describe('named prizes read off the video', () => {
  const named = (): BreakSnapshot => ({ ...wheel(0), prizes: [prize('Silver Eagle', 2), prize('Graded Morgan', 1), prize('Morgan', 1, 'MS 63'), prize('Morgan', 1, 'MS 65')] });

  it('uses what the camera showed unless the name already had a real price', () => {
    const auto = {
      'silver eagle': item('', 30, 'melt'),
      'graded morgan': item('', 60),
      'b1#seen|silver eagle': item('2024 Silver Eagle PCGS MS 70', 80),
      'b1#seen|graded morgan': item('1881-S Morgan PCGS MS 65', 150),
    };
    const rows = wheelRows(named(), {}, auto);
    expect(rows.slice(0, 2).map((r) => [r.title, r.inside, r.value])).toEqual([
      ['Silver Eagle', '2024 Silver Eagle PCGS MS 70', 30],
      ['Graded Morgan', '1881-S Morgan PCGS MS 65', 150],
    ]);
  });

  it('lists the named prizes still waiting on a camera read', () => {
    const auto = { 'b1#seen|silver eagle': item('2024 Silver Eagle', 80) };
    expect(unseenPrizes(named(), { 'graded morgan': 70 }, auto).map((p) => `${p.title} ${p.detail}`.trim())).toEqual(['Morgan MS 63', 'Morgan MS 65']);
    expect(unseenPrizes(wheel(), {}, {}).map((p) => p.title)).toEqual(['BUFFALO NICKEL RANDOM YEAR']);
  });
});
