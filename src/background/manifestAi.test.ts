import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractManifestAi } from './manifestAi';

const fakeArea = (initial: Record<string, unknown> = {}) => {
  const data: Record<string, unknown> = { ...initial };
  return {
    data,
    get: async (key: string) => (key in data ? { [key]: data[key] } : {}),
    set: async (items: Record<string, unknown>) => void Object.assign(data, items),
  };
};

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

let local: ReturnType<typeof fakeArea>;
let fetchUrls: string[];

const stubFetch = (handler: (url: string, init?: RequestInit) => Response | Promise<Response>) => {
  fetchUrls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      fetchUrls.push(url);
      return handler(url, init);
    }),
  );
};

beforeEach(() => {
  local = fakeArea({
    wn2_appraisalSettings: {
      geminiApiKey: 'test-key',
      ollamaBaseUrl: 'http://127.0.0.1:11434',
      ollamaModel: 'qwen2.5vl',
      ollamaOnly: false,
    },
    wn2_onDevice: { status: 'no-api', at: Date.now(), chrome: '' },
  });
  vi.stubGlobal('chrome', { storage: { local, session: fakeArea() } });
});

afterEach(() => vi.unstubAllGlobals());

describe('extractManifestAi', () => {
  it('extracts structured items and floor rules using local Ollama first', async () => {
    stubFetch((url) => {
      if (url.includes('/api/chat')) {
        return json(200, {
          message: {
            content: JSON.stringify({
              items: [
                { name: '1881-S Morgan Dollar MS 64', qty: 10 },
                { name: '2024 Silver Eagle', qty: 40 },
              ],
              floor_name: '1 oz silver round',
              floor_value: 30,
            }),
          },
        });
      }
      return json(500, { error: 'cloud fallback not expected' });
    });

    const res = await extractManifestAi(
      'break-123',
      'Wheel game: 10 morgan dollars, 40 silver eagles, floor is 1oz silver round ($30 min)',
      null,
      ['coins'],
    );

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.manifest.items).toEqual([
      { name: '1881-S Morgan Dollar MS 64', qty: 10 },
      { name: '2024 Silver Eagle', qty: 40 },
    ]);
    expect(res.manifest.floorName).toBe('1 oz silver round');
    expect(res.manifest.floorValue).toBe(30);

    // Verified saved to storage
    const manifests = local.data.wn2_aiManifests as Record<string, unknown>;
    expect(manifests['break-123']).toEqual(res.manifest);

    // Second call returns from cache without fetching
    fetchUrls = [];
    const cachedRes = await extractManifestAi('break-123', 'Wheel game...', null);
    expect(cachedRes.ok).toBe(true);
    expect(fetchUrls).toHaveLength(0);
  });

  it('fails cleanly when neither description nor notes exist', async () => {
    const res = await extractManifestAi('break-empty', null, null);
    expect(res.ok).toBe(false);
  });
});

