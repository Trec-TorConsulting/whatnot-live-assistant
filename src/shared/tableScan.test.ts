import { describe, expect, it } from 'vitest';
import { MAX_TABLE_ITEMS, parseTableAnswer, tablePrompt } from './tableScan';

describe('tablePrompt', () => {
  it('names the piece being sold, and uses the camera until that name exists', () => {
    const titled = tablePrompt({ pageText: '', showTitle: 'Estate', lotTitle: '*c - 2 oz Item on screen #57' }, '');
    expect(titled).toContain('the piece closest to the camera');
    expect(titled).not.toContain('Item on screen');
    const named = tablePrompt({ pageText: '', showTitle: 'Estate', lotTitle: 'Junk bag #10' }, 'Manganese glass toothpick holder');
    expect(named).toContain('Being sold now (do not list): Manganese glass toothpick holder');
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
