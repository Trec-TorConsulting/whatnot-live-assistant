import { describe, expect, it, vi } from 'vitest';
import { appraiseListingText } from './shopAppraisal';

vi.mock('./appraisal', () => ({
  quickAppraise: vi.fn(async (text: string) => {
    if (/silver round/i.test(text)) {
      return {
        read: { name: 'Silver Round', metal: 'silver' as const, oz: 1, quantity: 1, grade: null, source: 'test' },
        melt: { total: 32.5, perPiece: 32.5, metal: 'silver' as const, oz: 1, spot: 32.5 },
      };
    }
    return { read: null, cert: null, melt: null };
  }),
}));

vi.mock('./aiPricing', () => ({
  realPrice: vi.fn(async () => null),
  askAi: vi.fn(async () => ({ ok: true, text: JSON.stringify({ marketValue: 50 }) })),
}));

vi.mock('./refPrices', () => ({
  refLookup: vi.fn(async () => ({ ok: true, refs: [], notes: [] })),
}));

vi.mock('../shared/storage', () => ({
  getItem: vi.fn(async () => []),
}));

describe('appraiseListingText', () => {
  it('prices silver bullion listing via spot melt and calculates spread', async () => {
    const result = await appraiseListingText({
      id: 'listing-1',
      title: '1 oz Fine Silver Round',
      subtitle: '.999 pure',
      price: 25,
    });
    expect(result.listingId).toBe('listing-1');
    expect(result.marketValue).toBe(32.5);
    expect(result.valueSource).toBe('melt');
    expect(result.delta).toBe(7.5);
    expect(result.marginPercent).toBe(30);
    expect(result.isDeal).toBe(true);
    expect(result.isOverpriced).toBe(false);
  });

  it('falls back to AI estimate when no melt or reference match exists', async () => {
    const result = await appraiseListingText({
      id: 'listing-2',
      title: 'Vintage Star Wars Figure Boba Fett',
      subtitle: 'Complete with blaster',
      price: 80,
    });
    expect(result.listingId).toBe('listing-2');
    expect(result.marketValue).toBe(50);
    expect(result.valueSource).toBe('ai');
    expect(result.delta).toBe(-30);
    expect(result.isOverpriced).toBe(true);
    expect(result.isDeal).toBe(false);
  });
});
