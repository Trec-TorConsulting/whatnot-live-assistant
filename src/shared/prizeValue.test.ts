import { describe, expect, it } from 'vitest';
import { clarifyPrizeName, envelopePrompt, isFresh, manifestFrom, parseEnvelopeAnswer, parseManifest, parsePrizeAnswer, prizeMelt, prizePrompt, prizeReadPrompt } from './prizeValue';
import { DAY } from './time';

describe('prizeMelt', () => {
  it('reads metal and weight from prize titles on a real wheel', () => {
    expect(prizeMelt('1.51 GRAMS GOLD NUGGETS UNVAULTED')).toMatchObject({ metal: 'gold', purity: 0.8 });
    expect(prizeMelt('1.51 GRAMS GOLD NUGGETS UNVAULTED')!.oz).toBeCloseTo(1.51 / 31.1035, 6);
    expect(prizeMelt('BATMANS EMBLEM GOLD AGORO .10 GRAM')).toMatchObject({ metal: 'gold', purity: 1 });
    expect(prizeMelt('BATMANS EMBLEM GOLD AGORO .10 GRAM')!.oz).toBeCloseTo(0.1 / 31.1035, 6);
    expect(prizeMelt('1 GRAM 14kt GOLD GRAIN / SHOT')).toMatchObject({ purity: 0.583 });
    expect(prizeMelt('1/10 oz Gold Eagle')).toMatchObject({ oz: 0.1 });
  });

  it('reads a fraction of gold, and does not melt clad or gilt', () => {
    expect(prizeMelt(clarifyPrizeName('1/1000 gold (patriot) good'))).toMatchObject({ metal: 'gold', oz: 0.001 });
    expect(prizeMelt('2oz gilt copper')).toBeNull();
    expect(prizeMelt('2005 Kennedy half clad')).toBeNull();
    expect(clarifyPrizeName('2x 2024 1oz silver (Ase) ms69 (ngc) good')).toBe('2x 2024 1oz silver (American Silver Eagle) ms69 (ngc)');
    expect(clarifyPrizeName('1 × 1964 .01 Lincoln cent clad , pcgs pr69, us mint good')).toBe('1 × 1964 Lincoln cent clad , pcgs pr69, us mint');
    expect(clarifyPrizeName('1 × 2006 .10 Rosevelt clad , pcgs pr69')).toContain('Roosevelt');
  });

  it('leaves boxes, chases and coins to other sources', () => {
    expect(prizeMelt('NOAHS ARK 1OZ GOLD CHASE BREAKMINT RIP/SHIP')).toBeNull();
    expect(prizeMelt('UNVAULTED GOLD NUGGET .5 GRAM ICG CERT')).toMatchObject({ metal: 'gold', purity: 0.8 });
    expect(prizeMelt('INDIAN HEAD CENT GENUINE ICG CERT')).toBeNull();
    expect(prizeMelt('1999 gold nugget 1 gram')).toMatchObject({ purity: 0.8 });
    expect(prizeMelt('1 kilo silver bar')!.oz).toBeCloseTo(1000 / 31.1035, 4);
    expect(prizeMelt('1 KG SILVER')).toMatchObject({ metal: 'silver' });
  });
});

describe('parsePrizeAnswer', () => {
  it('maps 1-based answers back and takes the smaller number as the low', () => {
    const text = JSON.stringify({ prizes: [{ i: 2, low: 60, high: 40 }, { i: 1, low: 5, high: 8 }, { i: 9, low: 1, high: 2 }, { i: 3, low: 0, high: 0 }] });
    expect(parsePrizeAnswer(text, 3)).toEqual([{ low: 5, high: 8 }, { low: 40, high: 60 }, null]);
  });

  it('returns nothing for a broken answer', () => {
    expect(parsePrizeAnswer('not json', 2)).toEqual([null, null]);
  });
});

describe('envelopes', () => {
  const titles = ['ENVELOPE #2', 'ENVELOPE #3', 'ENVELOPE #4'];

  it('keeps envelope links in the pool and drops a number that is not on this wheel', () => {
    const text = JSON.stringify({
      envelopes: [
        { prize: 'envelope  #2', inside: '1 kilo silver bar', low: 1200, high: 1300 },
        { prize: '#3', inside: '1985 Liberty MS 67', low: 90, high: 60 },
        { prize: '', inside: '5 oz silver round', low: 150, high: 180 },
        { prize: 'ENVELOPE #9', inside: 'from an opened envelope', low: 5, high: 6 },
        { prize: '', inside: '', low: 5, high: 6 },
        { prize: 'ENVELOPE #2', inside: 'a second answer', low: 1, high: 2 },
      ],
    });
    expect(parseEnvelopeAnswer(text, titles)).toEqual({
      matched: [],
      board: [
        { inside: '1 kilo silver bar', low: 1200, high: 1300 },
        { inside: '1985 Liberty MS 67', low: 60, high: 90 },
        { inside: '5 oz silver round', low: 150, high: 180 },
        { inside: 'a second answer', low: 1, high: 2 },
      ],
    });
    expect(parseEnvelopeAnswer('nope', titles)).toEqual({ matched: [], board: [] });
  });

  it('assigns a sticker number to Item #N and leaves an envelope number in the pool', () => {
    const text = JSON.stringify({
      envelopes: [
        { prize: '#12', inside: '2024 1oz silver Temperance NGC PR70', low: 80, high: 90 },
        { prize: 'ENVELOPE #2', inside: '1 kilo silver bar', low: 1000, high: 1100 },
        { prize: '#9', inside: 'not on this wheel', low: 5, high: 6 },
      ],
    });
    expect(parseEnvelopeAnswer(text, ['Item #12', 'Item #13', 'ENVELOPE #2'])).toEqual({
      matched: [{ title: 'Item #12', inside: '2024 1oz silver Temperance NGC PR70', low: 80, high: 90 }],
      board: [{ inside: '1 kilo silver bar', low: 1000, high: 1100 }],
    });
  });

  it('stops a cut-off description when the list repeats', () => {
    const listed = '👉🏼1x 2024 1oz silver pr70 (temperance) (ngc) good 👉🏼2x 1/1000 gold (patriot) good 👉🏼1x 2024 1oz silver pr70 (temperance) (ngc) goo';
    const description = listed.padEnd(1000, ' ');
    const manifest = parseManifest(description);
    expect(manifest.truncated).toBe(true);
    expect(manifest.items.map((item) => [item.qty, item.name])).toEqual([
      [1, '2024 1oz silver pr70 (temperance) (ngc)'],
      [2, '1/1000 oz gold (patriot) good'],
    ]);
  });

  it('reads a line list from show notes and does not repeat a complete break description', () => {
    expect(manifestFrom('', '298x 1964 90% silver dime\n16x old holder chase').items).toEqual([
      { qty: 298, name: '1964 90% silver dime' },
      { qty: 16, name: 'old holder chase' },
    ]);
    const description = '👉🏼1x 2024 1oz silver pr70 (temperance) (ngc) good';
    expect(manifestFrom(description, '1x 2024 1oz silver pr70 (temperance) (ngc)\n5x gold bar').items.map((item) => item.name)).toEqual([
      '2024 1oz silver pr70 (temperance) (ngc)',
    ]);
  });

  it('tells the model the show rules', () => {
    expect(prizePrompt([{ title: 'A', detail: '' }], { showTitle: 'S', wheelTitle: null, categories: [], notes: 'Sudden death. Everything is 90% silver.' })).toContain(
      'Show notes: Sudden death. Everything is 90% silver.',
    );
  });

  it('matches a labeled instant hit and leaves a shelf number in the pool', () => {
    const text = JSON.stringify({
      envelopes: [
        { prize: '#2', inside: '1 kilo silver bar', low: 1000, high: 1100 },
        { prize: 'Silver Eagle', inside: '2024 Silver Eagle', low: 40, high: 50 },
        { prize: 'ENVELOPE #9', inside: 'opened', low: 5, high: 6 },
      ],
    });
    expect(parseEnvelopeAnswer(text, titles, 'envelopes', ['Silver Eagle'])).toEqual({
      matched: [{ title: 'Silver Eagle', inside: '2024 Silver Eagle', low: 40, high: 50 }],
      board: [{ inside: '1 kilo silver bar', low: 1000, high: 1100 }],
    });
  });

  it('lists each envelope once, by its exact name, and the named prizes to skip', () => {
    const prizes = [
      { title: 'ENVELOPE #7', detail: 'GOOD EXTREMELY GOOD' },
      { title: 'ENVELOPE #7', detail: 'FAIR' },
      { title: 'ENVELOPE #8', detail: '' },
    ];
    expect(envelopePrompt(prizes, ['BUFFALO NICKEL RANDOM YEAR '], { showTitle: null, wheelTitle: '100 SPOT BIG WIN KILO', categories: [] })).toBe(
      'Wheel: 100 SPOT BIG WIN KILO\nEnvelopes:\n- ENVELOPE #7\n- ENVELOPE #8\nNamed wheel prizes, not in envelopes: BUFFALO NICKEL RANDOM YEAR',
    );
  });
});

it('numbers prizes in the prompt and keeps cached values by source', () => {
  const prizes = [
    { title: 'A', detail: '' },
    { title: 'Morgan Dollar', detail: 'Good - Extremely Fine' },
  ];
  expect(prizePrompt(prizes, { showTitle: 'Gold rush', wheelTitle: null, categories: [] })).toBe(
    'Show: Gold rush\nPrizes:\n1. A\n2. Morgan Dollar (condition: Good - Extremely Fine)',
  );
  expect(isFresh({ low: 1, high: 2, source: 'ai', note: null, at: 0 }, 6 * DAY)).toBe(true);
  expect(isFresh({ low: 1, high: null, source: 'melt', note: null, at: 0 }, 2 * DAY)).toBe(false);
});

describe('reading named prizes off the video', () => {
  it('matches a prize copied with or without its condition', () => {
    const text = JSON.stringify({
      prizes: [
        { prize: 'Silver Eagle (BU)', inside: '2024 Silver Eagle', low: 35, high: 40 },
        { prize: 'graded morgan', inside: '1881-S Morgan PCGS MS 65', low: 150, high: 200 },
        { prize: 'Not on the wheel', inside: 'Gold bar', low: 900, high: 950 },
      ],
    });
    expect(parseEnvelopeAnswer(text, ['Silver Eagle', 'Graded Morgan'], 'prizes').matched.map((r) => [r.title, r.inside])).toEqual([
      ['Silver Eagle', '2024 Silver Eagle'],
      ['Graded Morgan', '1881-S Morgan PCGS MS 65'],
    ]);
  });

  it('lists each prize once with its condition', () => {
    const p = prizeReadPrompt([{ title: 'Silver Eagle', detail: 'BU' }, { title: 'Silver Eagle', detail: 'BU' }, { title: 'Graded Morgan', detail: '' }], { showTitle: 'S', wheelTitle: 'W', categories: [] });
    expect(p).toContain('- Silver Eagle (BU)\n- Graded Morgan');
    expect(p.match(/Silver Eagle/g)).toHaveLength(1);
  });
});
