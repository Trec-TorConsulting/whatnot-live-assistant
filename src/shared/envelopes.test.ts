import { describe, expect, it } from 'vitest';
import type { BreakPrize, BreakSnapshot } from './breaks';
import { boardIsCurrent, envelopeSummary, nextEnvelopeBoard, numberedShare, unmatchedEnvelopes, unseenPrizes, wheelRows, type EnvelopeBoard } from './envelopes';
import { prizePriceKey } from './breaks';
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
  it('values every sealed envelope at the pool average', () => {
    const items = [item('1 kilo silver', 1000, 'melt'), item('1985 Liberty MS 67', 60), item('5 oz silver', 150)];
    const rows = wheelRows(wheel(), nickels, {}, board(items));
    const average = (1000 + 60 + 150) / 3;
    expect(rows.filter((r) => r.title.startsWith('ENVELOPE')).map((r) => r.value)).toEqual([average, average, average]);
    expect(rows.filter((r) => r.fromBoard)).toEqual([]);
    const o = worth(rows);
    expect(o.expectedValue).toBeCloseTo((14 + 1210) / 10);
    expect(envelopeSummary(wheel(), nickels, {}, board(items))).toMatchObject({ topName: '1 kilo silver', topValue: 1000, share: 1000 / 3, average, averageIncomplete: false });
  });

  it('keeps the top item and leaves the average incomplete when the shelf is still larger', () => {
    const items = [item('1 kilo silver', 1000), item('1985 Liberty MS 67', 60), item('5 oz silver', 150)];
    const crowded = envelopeSummary(wheel(2), nickels, {}, board(items, ['b1#envelope #2', 'b1#envelope #3']));
    expect(crowded.averageIncomplete).toBe(true);
    expect(crowded.topValue).toBe(1000);
    expect(wheelRows(wheel(2), nickels, {}, board(items, ['b1#envelope #2', 'b1#envelope #3'])).filter((r) => r.title.startsWith('ENVELOPE')).map((r) => r.value)).toEqual([null, null]);
  });

  it('counts gaps as zero so the average is a floor', () => {
    const summary = envelopeSummary(wheel(3), nickels, {}, board([item('1 kilo silver', 1000)]));
    expect(summary.average).toBeCloseTo(1000 / 3);
    expect(summary.averageIsFloor).toBe(true);
    expect(wheelRows(wheel(3), nickels, {}, board([item('1 kilo silver', 1000)])).find((r) => r.title === 'ENVELOPE #2')?.value).toBeCloseTo(1000 / 3);
  });

  it('keeps a typed envelope value and a typed board price', () => {
    const rows = wheelRows(wheel(), { ...nickels, 'b1#envelope #2': 2000, 'b1#board|5 oz silver': 175 }, {}, board([item('5 oz silver', 150), item('1985 Liberty MS 67', 60)]));
    expect(rows.find((r) => r.title === 'ENVELOPE #2')?.value).toBe(2000);
    expect(rows.find((r) => r.title === 'ENVELOPE #3')?.value).toBeCloseTo((175 + 60) / 3);
  });

  it('does not raise the envelopes left when a sealed one sells', () => {
    const items = [item('1 kilo silver', 1000), item('floor', 20)];
    const keys = ['b1#envelope #2', 'b1#envelope #3'];
    const start = wheel(2);
    const before = wheelRows(start, {}, {}, board(items, keys)).find((r) => r.title === 'ENVELOPE #2')?.value;
    const sold: BreakSnapshot = {
      ...start,
      prizes: start.prizes.map((p) => (p.title === 'ENVELOPE #3' ? { ...p, left: 0 } : p)),
      hits: [{ spotId: 's', title: 'ENVELOPE #3', buyer: 'a', price: 10, pending: false, seenAt: 1 }],
    };
    const after = wheelRows(sold, {}, {}, board(items, ['b1#envelope #2'])).find((r) => r.title === 'ENVELOPE #2')?.value;
    expect(before).toBeCloseTo(510);
    expect(after).toBeCloseTo(510);
  });

  it('leaves the jackpot share incomplete while sold pages remain', () => {
    const b = { ...wheel(2), soldHasMore: true };
    const summary = envelopeSummary(b, {}, {}, board([item('1 kilo silver', 1000), item('floor', 20)], ['b1#envelope #2', 'b1#envelope #3']));
    expect(summary.share).toBeNull();
    expect(summary.shareIncomplete).toBe(true);
    expect(summary.average).toBeNull();
  });

  it('prices a labeled instant hit on its spot and keeps it out of the envelope average', () => {
    const b: BreakSnapshot = {
      ...wheel(0),
      prizes: [prize('ENVELOPE #2', 1), prize('ENVELOPE #3', 1), prize('Silver Eagle', 1)],
    };
    const rows = wheelRows(b, {}, {}, board([item('Silver Eagle', 80), item('1 kilo silver', 1000), item('floor', 20)], ['b1#envelope #2', 'b1#envelope #3']));
    expect(rows.find((r) => r.title === 'Silver Eagle')?.value).toBe(80);
    expect(rows.find((r) => r.title === 'ENVELOPE #2')?.value).toBeCloseTo(510);
  });

  it('values the next spin from the envelope average and each instant hit', () => {
    const mix = (hits: number): BreakSnapshot => ({
      ...wheel(0),
      prizes: [prize('ENVELOPE #1', 2), ...(hits ? [prize('Silver Eagle', hits)] : [])],
      total: 2 + hits,
    });
    const pool = board([item('a', 200), item('b', 36)], ['b1#envelope #1']);
    const withHits = worth(wheelRows(mix(18), { 'silver eagle': 8 }, {}, pool));
    expect(withHits.expectedValue).toBeCloseTo(19);
    const cheaper = worth(wheelRows(mix(17), { 'silver eagle': 8 }, {}, pool));
    expect(cheaper.expectedValue).toBeGreaterThan(19);
    expect(worth(wheelRows(mix(0), {}, {}, pool)).expectedValue).toBeCloseTo(118);
  });

  it('shows plain unpriced envelopes until a board is read', () => {
    const rows = wheelRows(wheel(), nickels, {});
    expect(rows.filter((r) => r.value === null).map((r) => r.title)).toEqual(['ENVELOPE #2', 'ENVELOPE #3', 'ENVELOPE #4']);
  });
});

describe('nextEnvelopeBoard', () => {
  const piece = (inside: string): PrizeValue => item(inside, 1);
  const prev = { at: 1, prizes: ['a'], items: [piece('gold'), piece('silver'), piece('floor')], soldHidden: 0, revealed: false };

  it('keeps the last board on an empty read or a collapse, and reveals a real shrink', () => {
    expect(nextEnvelopeBoard(prev, { at: 2, prizes: ['a'], items: [] }, 1).items).toHaveLength(3);
    expect(nextEnvelopeBoard(prev, { at: 2, prizes: ['a'], items: [piece('gold')] }, 1)).toBe(prev);
    const revealed = nextEnvelopeBoard(prev, { at: 2, prizes: ['a'], items: [piece('gold'), piece('silver')] }, 1);
    expect(revealed.revealed).toBe(true);
    expect(revealed.items.map((i) => i.inside)).toEqual(['gold', 'silver']);
    expect(nextEnvelopeBoard(prev, { at: 2, prizes: ['a'], items: [piece('gold'), piece('silver')] }, 0)).toBe(prev);
  });

  it('divides the top item by the envelopes still sealed after a reveal', () => {
    const b = wheel(1);
    const revealed = { ...board([item('floor', 20)], ['b1#envelope #2']), revealed: true };
    expect(envelopeSummary(b, {}, {}, revealed).share).toBe(20);
  });
});

describe('numbered hits named in the break description', () => {
  const disguised = (description: string): BreakSnapshot => ({
    ...wheel(0),
    description,
    hits: [],
    prizes: [prize('Item #1', 1), prize('Item #2', 1), prize('random (.01) Wheat cent (us mint) poor.://', 4)],
  });

  it('splits the listed coins across every Item #N and prices the wheat cent once', () => {
    const description = '👉🏼1x 2024 1oz silver pr70 (temperance) (ngc) good 👉🏼1x 2024 1oz silver pr70 (temperance) (ngc) goo'.padEnd(1000, ' ');
    const b = disguised(description);
    const silver = prizePriceKey({ title: '2024 1oz silver pr70 (temperance) (ngc)', detail: '' });
    const wheat = prizePriceKey({ title: 'random (.01) Wheat cent (us mint) poor.://', detail: '' });
    const auto = { [silver]: item('2024 silver', 90, 'melt'), [wheat]: item('wheat', 1, 'sold') };
    const rows = wheelRows(b, {}, auto);
    expect(numberedShare(b, auto)).toMatchObject({ value: 45, floor: true });
    expect(rows.find((r) => r.title === 'Item #1')).toMatchObject({ value: 45, floor: true });
    expect(rows.find((r) => r.title.startsWith('random'))?.value).toBe(1);
    const odds = wheelOdds({
      ...emptyWheel('b1'),
      price: 30,
      slots: rows.map((r) => ({ label: r.title, total: r.left, left: r.left, value: r.value, floor: r.floor })),
    });
    expect(odds.expectedIsFloor).toBe(true);
    expect(odds.verdict).toBe('unclear');
  });

  it('lets the sticker price that number and leaves the other numbers on the description', () => {
    const b = disguised('👉🏼1x 2024 1oz silver pr70 (temperance) (ngc) good');
    const silver = prizePriceKey({ title: '2024 1oz silver pr70 (temperance) (ngc)', detail: '' });
    const auto = { [silver]: item('silver', 40, 'melt'), 'b1#seen|item #1': item('2024 Temperance PR70', 80) };
    const rows = wheelRows(b, {}, auto);
    expect(rows.find((r) => r.title === 'Item #1')).toMatchObject({ value: 80, inside: '2024 Temperance PR70' });
    expect(rows.find((r) => r.title === 'Item #2')?.value).toBeCloseTo(20);
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
