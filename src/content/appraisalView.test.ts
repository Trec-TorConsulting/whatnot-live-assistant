import { describe, expect, it } from 'vitest';
import { computeValue, type AppraisalRecord } from '../shared/appraisal';
import { appraisalView, listingView } from './appraisalView';

const record = (over: Partial<AppraisalRecord> = {}): AppraisalRecord => {
  const base: AppraisalRecord = {
    id: 'a1',
    at: 0,
    liveId: 'live1',
    showTitle: 'Coin Night',
    lotId: 'lot1',
    lotTitle: null,
    name: '1893-S Morgan Dollar',
    itemType: 'coin',
    year: 1893,
    mintMark: 'S',
    slabbed: false,
    special: null,
    grade: 'VF',
    quantity: 1,
    confidence: 'high',
    model: 'gemini',
    melt: null,
    price: null,
    priceNote: 'Add a PCGS token in Settings for real sale prices.',
    estimate: { low: 3000, high: 5000 },
    comps: null,
    valuation: computeValue({ quantity: 1, melt: null, price: null, estimate: { low: 3000, high: 5000 } }),
    notes: 'Authenticity cannot be checked on camera.',
    elapsedMs: 2100,
    ...over,
  };
  return base;
};

describe('appraisalView', () => {
  it('leads with the low end of a guess and calls out a key date with its mintage', () => {
    const v = appraisalView(record(), 'done', []);
    expect(v.highlight).toBe('Guess, low end $3,000');
    expect(v.reasons).toEqual(['Key date: 1893-S Morgan dollar, only 100,000 minted; the king of Morgans.']);
    expect(v.subtitle).toBe('Coin · VF');
    expect(v.cautions).toEqual(['Key dates are often faked or altered; raw ones are a risk.', 'No real sales found: the value is an AI guess.']);
  });

  it('leaves out timing, the PCGS token hint, and notes on a confident answer', () => {
    const v = appraisalView(record(), 'done', []);
    const all = JSON.stringify(v);
    expect(all).not.toMatch(/2\.1s|PCGS token|Authenticity/);
  });

  it('puts the value, the AI range, and the model under the max bid', () => {
    expect(appraisalView(record(), 'done', []).valueLine).toBe('Worth about $4,000 · AI range $3,000–$5,000 · by gemini');
    const two = appraisalView(
      record({ quantity: 2, model: 'on-device', valuation: computeValue({ quantity: 2, melt: null, price: null, estimate: { low: 3000, high: 5000 } }) }),
      'done',
      [],
    );
    expect(two.valueLine).toBe('Worth about $8,000 · AI range $6,000–$10,000 · by on-device AI');
    const sold = appraisalView(
      record({
        model: 'ollama:qwen3-vl',
        estimate: null,
        valuation: computeValue({ quantity: 1, melt: null, price: { guide: 40, auctions: { count: 2, median: 12, lastAt: 0, lastPrice: 12 } } }),
      }),
      'done',
      [],
    );
    expect(sold.valueLine).toBe('Worth $12 · by Ollama qwen3-vl');
  });

  it('has no value line for a melt-only quick read', () => {
    const melt = { metal: 'silver' as const, spot: 30, oz: 1, perPiece: 30, total: 30 };
    const v = appraisalView(record({ model: null, estimate: null, confidence: 'quick', melt, valuation: computeValue({ quantity: 1, melt, price: null }) }), 'quick', []);
    expect(v.valueLine).toBeNull();
    expect(v.highlight).toBe('Melt $30');
  });

  it('drops the raw-key-date caution for a slabbed coin', () => {
    expect(appraisalView(record({ slabbed: true, grade: 'PCGS VF 30' }), 'done', []).cautions).not.toContain(
      'Key dates are often faked or altered; raw ones are a risk.',
    );
  });

  it('shows the AI note, labeled, when the table has nothing', () => {
    const v = appraisalView(record({ name: '1986 Fleer Michael Jordan #57', itemType: 'trading_card', year: 1986, mintMark: null, special: 'Jordan rookie card' }), 'done', []);
    expect(v.reasons).toEqual(['AI note: Jordan rookie card']);
  });

  it('labels the numbers behind the value', () => {
    const comps = { count: 4, low: 30, high: 45, median: 38, examples: [] };
    const melt = { metal: 'silver' as const, spot: 30, oz: 0.7734, perPiece: 23.2, total: 23.2 };
    const v = appraisalView(
      record({ name: '1921 Morgan Dollar', year: 1921, mintMark: '', estimate: null, comps, melt, valuation: computeValue({ quantity: 1, melt, price: null, comps }) }),
      'done',
      [],
    );
    expect(v.reasons).toEqual([]);
    expect(v.facts).toEqual([
      { label: 'Market', value: '$38', detail: 'Whatnot sales you watched' },
      { label: 'Whatnot sold', value: '4 sold $30–$45', detail: 'median $38' },
      { label: 'Melt', value: '$23.20', detail: '0.773 oz silver each' },
    ]);
    expect(v.cautions).toEqual([]);
  });

  it('lists the top items and their total when a frame has several', () => {
    const v = appraisalView(
      record({
        name: 'Intex Explorer K2',
        itemType: 'tools_household',
        year: null,
        mintMark: null,
        grade: null,
        special: null,
        estimate: { low: 30, high: 50 },
        valuation: computeValue({ quantity: 1, melt: null, price: null, estimate: { low: 30, high: 50 } }),
        lot: {
          total: 66,
          pieces: [
            { name: 'Intex Explorer K2', quantity: 1, total: 40, guess: true },
            { name: 'Assorted caps', quantity: 12, total: 24, guess: true },
            { name: 'Red lantern', quantity: 1, total: 2, guess: true },
          ],
        },
      }),
      'done',
      [],
    );
    expect(v.subtitle).toBe('Household / garage sale · +2 more');
    expect(v.highlight).toBe('Guess, low end $30');
    expect(v.facts).toEqual([
      { label: 'By price', value: 'Intex Explorer K2 $40 AI', detail: 'Assorted caps ×12 $24 AI · Red lantern $2 AI' },
      { label: 'Total', value: '$66', detail: 'Other items are AI guesses, counted at the low end.' },
      { label: 'Market', value: '$40', detail: 'AI guess $30–$50 each' },
    ]);
  });

  it('says when a different item is worth more than the one the max bid is for', () => {
    const v = appraisalView(
      record({
        name: 'Wool cap',
        itemType: 'tools_household',
        year: null,
        mintMark: null,
        grade: null,
        special: null,
        notes: null,
        estimate: null,
        priceNote: null,
        valuation: computeValue({ quantity: 1, melt: null, price: null, comps: { count: 2, median: 12, low: 10, high: 14, examples: [] } }),
        lot: {
          total: 42,
          pieces: [
            { name: 'Intex Explorer K2', quantity: 1, total: 30, guess: true },
            { name: 'Wool cap', quantity: 1, total: 12, guess: false },
          ],
        },
      }),
      'done',
      [],
    );
    expect(v.cautions).toEqual(['Priciest in this lot is Intex Explorer K2 $30 AI. Max bid is for this item.']);
    expect(v.highlight).toBe('Max bid $9.60');
  });

  it('only explains a low-confidence answer, and gives it no bid number', () => {
    const v = appraisalView(record({ confidence: 'low' }), 'done', []);
    expect(v.cautions).toContain('Not sure what this is: Authenticity cannot be checked on camera.');
    expect(v.highlight).toBeNull();
    expect(v.valueLine).toBe('by gemini');
  });

  it('labels a PCGS guide instead of a max bid', () => {
    const v = appraisalView(
      record({
        name: '1921 Morgan Dollar',
        year: 1921,
        mintMark: '',
        estimate: null,
        price: { guide: 50, auctions: null },
        valuation: computeValue({ quantity: 1, melt: null, price: { guide: 50, auctions: null } }),
      }),
      'done',
      [],
    );
    expect(v.highlight).toBe('Guide $50');
    expect(v.facts).toContainEqual({ label: 'PCGS guide', value: '$50', detail: 'price guide, not a sale' });
    expect(v.cautions).not.toContain('No sales, price guide, or metal value, so no max bid.');
  });
});

describe('listingView', () => {
  it('shows a key date from the lot title before the video is read', () => {
    expect(listingView('1909-S VDB Lincoln Cent')?.reasons).toEqual(['Key date: 1909-S VDB Lincoln cent, only 484,000 minted.']);
    expect(listingView('Mystery silver lot')).toBeNull();
    expect(listingView(null)).toBeNull();
  });
});
