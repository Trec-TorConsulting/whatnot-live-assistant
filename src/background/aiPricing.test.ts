import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { askAi, askLocalAi } from './aiPricing';

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
      geminiApiKey: 'gemini-key',
      ollamaBaseUrl: 'http://127.0.0.1:11434',
      ollamaModel: 'qwen2.5vl',
      ollamaOnly: false,
    },
    wn2_onDevice: { status: 'no-api', at: Date.now(), chrome: '' },
  });
  vi.stubGlobal('chrome', { storage: { local, session: fakeArea() } });
});

afterEach(() => vi.unstubAllGlobals());

describe('askAi background routing', () => {
  const askParams = {
    instructions: 'test instructions',
    prompt: 'test prompt',
    schema: { type: 'object' },
    geminiSchema: { type: 'OBJECT' },
    usable: (text: string) => text.includes('valid'),
  };

  it('routes to local Ollama first and skips cloud Gemini when Ollama succeeds', async () => {
    stubFetch((url) => {
      if (url.includes('/api/chat')) {
        return json(200, { message: { content: '{"status": "valid"}' } });
      }
      return json(200, { candidates: [{ content: { parts: [{ text: '{"status": "from-cloud"}' }] } }] });
    });

    const res = await askAi(askParams);
    expect(res).toMatchObject({ ok: true, text: '{"status": "valid"}', model: 'ollama:qwen2.5vl' });
    expect(fetchUrls.some((u) => u.includes('/api/chat'))).toBe(true);
    expect(fetchUrls.some((u) => u.includes('generativelanguage.googleapis.com'))).toBe(false);
  });

  it('falls back to cloud Gemini when Ollama output is not usable', async () => {
    stubFetch((url) => {
      if (url.includes('/api/chat')) {
        return json(200, { message: { content: '{"status": "not-usable"}' } });
      }
      return json(200, { candidates: [{ content: { parts: [{ text: '{"status": "valid"}' }] } }] });
    });

    const res = await askAi(askParams);
    expect(res).toMatchObject({ ok: true, text: '{"status": "valid"}' });
    expect(fetchUrls.some((u) => u.includes('/api/chat'))).toBe(true);
    expect(fetchUrls.some((u) => u.includes('generativelanguage.googleapis.com'))).toBe(true);
  });

  it('skips cloud when ollamaOnly is true', async () => {
    local.data.wn2_appraisalSettings = {
      geminiApiKey: 'gemini-key',
      ollamaBaseUrl: 'http://127.0.0.1:11434',
      ollamaModel: 'qwen2.5vl',
      ollamaOnly: true,
    };

    stubFetch((url) => {
      if (url.includes('/api/chat')) {
        return json(500, { error: 'Ollama crashed' });
      }
      return json(200, { candidates: [{ content: { parts: [{ text: '{"status": "valid"}' }] } }] });
    });

    const res = await askAi(askParams);
    expect(res.ok).toBe(false);
    expect(fetchUrls.some((u) => u.includes('generativelanguage.googleapis.com'))).toBe(false);
  });
});

describe('askLocalAi', () => {
  const askParams = {
    instructions: 'test instructions',
    prompt: 'test prompt',
    schema: { type: 'object' },
    geminiSchema: { type: 'OBJECT' },
    usable: (text: string) => text.includes('valid'),
  };

  it('queries Ollama and never calls cloud Gemini even on failure', async () => {
    stubFetch((url) => {
      if (url.includes('/api/chat')) {
        return json(500, { error: 'Ollama down' });
      }
      return json(200, { candidates: [{ content: { parts: [{ text: '{"status": "valid"}' }] } }] });
    });

    const res = await askLocalAi(askParams);
    expect(res?.ok).toBe(false);
    expect(fetchUrls.some((u) => u.includes('generativelanguage.googleapis.com'))).toBe(false);
  });
});

