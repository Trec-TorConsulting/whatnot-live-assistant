import { describe, expect, it } from 'vitest';
import { MAX_TABLE_ITEMS, parseTableAnswer, tablePrompt } from './tableScan';

describe('tablePrompt', () => {
  it('names the piece being sold, and uses the camera until that name exists', () => {
    const titled = tablePrompt({ pageText: '', showTitle: 'Estate', lotTitle: '*c - 2 oz Item on screen #57' }, '');
    expect(titled).toContain('the piece closest to the camera');
    expect(titled).not.toContain('Item on screen');
    const named = tablePrompt({ pageText: '', showTitle: 'Estate', lotTitle: 'Junk bag #10' }, 'Manganese glass toothpick holder');
    expect(named).toContain('Being sold now (do not list): Manganese glass toothpick holder');

    const longRunnerNotes = [
      `${'Welcome to our weekly outdoor flea walk! '.repeat(20)}\nPut in R for Run and P for Pass.`,
      'Vendor price $1 will run for $6, $2 for $7, $3 for $8, $4 for $9, anything $5 and up will be doubled.',
      'No cancellations, no refunds, no returns. Everything sold as-is, untested, not cleaned. /coupon SAVE10',
    ].join('\n');
    const runnerTable = tablePrompt(
      {
        pageText: '',
        showTitle: 'Deal Hunting',
        lotTitle: 'Cannons As seen',
        showNotes: longRunnerNotes,
      },
      'Cannons As seen',
    );
    expect(runnerTable).toContain('Current lot title: Cannons');
    expect(runnerTable).toContain('Being sold now (do not list): Cannons');
    expect(runnerTable).toContain('anything $5 and up will be doubled');
    expect(runnerTable).toContain('No cancellations, no refunds, no returns');
    expect(runnerTable).not.toContain('SAVE10');
  });
});

describe('parseTableAnswer', () => {
  it('keeps named, priced items and drops the item being sold', () => {
    const text = JSON.stringify({
      items: [
        { name: 'Sterling flatware set', quantity: 1, where: 'back left', low: 120, high: 200 },
        { name: 'Pyrex Butterprint Bowl', quantity: 2, where: 'front', low: 30, high: 15 },
        { name: 'Cast iron skillet', quantity: 1, where: 'center', low: 0, high: 0 },
        { name: '', quantity: 1, where: 'x', low: 5, high: 10 },
        { name: 'griswold skillet #8', quantity: 1, where: 'center', low: 40, high: 70 },
      ],
    });
    expect(parseTableAnswer(text, 'Griswold Skillet #8')).toEqual([
      { name: 'Sterling flatware set', quantity: 1, where: 'back left', low: 120, high: 200 },
      { name: 'Pyrex Butterprint Bowl', quantity: 2, where: 'front', low: 15, high: 30 },
    ]);
  });

  it('caps the list and survives bad answers', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ name: `Item ${i}`, quantity: 1, where: '', low: 10, high: 20 }));
    expect(parseTableAnswer(JSON.stringify({ items: many }), '')).toHaveLength(MAX_TABLE_ITEMS);
    expect(parseTableAnswer('not json', '')).toEqual([]);
    expect(parseTableAnswer('{"items": 3}', '')).toEqual([]);
  });
});
