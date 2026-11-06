import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAppraisalSettings, getBuyerSettings } from './storage';

const fakeArea = (initial: Record<string, unknown> = {}) => {
  const data: Record<string, unknown> = { ...initial };
  return {
    data,
    get: async (key: string) => (key in data ? { [key]: data[key] } : {}),
    set: async (items: Record<string, unknown>) => void Object.assign(data, items),
  };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getAppraisalSettings', () => {
  it('reads Gemini as preferred when only a Gemini key is stored, and keeps an OpenAI key', async () => {
    vi.stubGlobal('chrome', {
      storage: { local: fakeArea({ wn2_appraisalSettings: { geminiApiKey: 'gem-key' } }) },
    });
    const geminiOnly = await getAppraisalSettings();
    expect(geminiOnly.preferredProvider).toBe('gemini');
    expect(geminiOnly.geminiApiKey).toBe('gem-key');

    vi.stubGlobal('chrome', {
      storage: {
        local: fakeArea({ wn2_appraisalSettings: { geminiApiKey: 'gem-key', openaiApiKey: 'sk-test' } }),
      },
    });
    const both = await getAppraisalSettings();
    expect(both.preferredProvider).toBe('gemini');
    expect(both.geminiApiKey).toBe('gem-key');
    expect(both.openaiApiKey).toBe('sk-test');
  });
});

describe('getBuyerSettings', () => {
  it('returns default settings with an empty wishlist when nothing is stored', async () => {
    vi.stubGlobal('chrome', {
      storage: { local: fakeArea({}) },
    });
    const settings = await getBuyerSettings();
    expect(settings.wishlist).toEqual([]);
    expect(settings.watchlist).toEqual([]);
    expect(settings.outbid).toBe(true);
  });

  it('deserializes and sanitizes stored wishlist entries with keywords and ceilings', async () => {
    vi.stubGlobal('chrome', {
      storage: {
        local: fakeArea({
          wn2_buyerSettings: {
            wishlist: [
              { text: 'charizard base $120' },
              { text: '1881-s morgan $45' },
              { text: 'walking liberty' },
            ],
          },
        }),
      },
    });
    const settings = await getBuyerSettings();
    expect(settings.wishlist).toHaveLength(3);
    expect(settings.wishlist[0]).toEqual({
      keywords: ['charizard', 'base'],
      max: 120,
      text: 'charizard base $120',
    });
    expect(settings.wishlist[1]).toEqual({
      keywords: ['1881', 's', 'morgan'],
      max: 45,
      text: '1881-s morgan $45',
    });
    expect(settings.wishlist[2]).toEqual({
      keywords: ['walking', 'liberty'],
      max: null,
      text: 'walking liberty',
    });
  });
});
