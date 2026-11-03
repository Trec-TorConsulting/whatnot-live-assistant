import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAppraisalSettings } from './storage';

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
