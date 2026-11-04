import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ON_DEVICE_HEADSTART_MS, appraise, geminiJson, gradeGuide, priceLookup } from './appraisal';

const fakeArea = (initial: Record<string, unknown> = {}) => {
  const data: Record<string, unknown> = { ...initial };
  return {
    get: async (key: string) => (key in data ? { [key]: data[key] } : {}),
    set: async (items: Record<string, unknown>) => void Object.assign(data, items),
  };
};

const answer = {
  is_collectible: false,
  item_type: 'other',
  item_name: 'Nothing for sale',
  series_key: 'other',
  metal: 'other',
  quantity: 1,
  is_slabbed: false,
  estimate_low_usd: 0,
  estimate_high_usd: 0,
  confidence: 'low',
  notes: '',
};

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const ok = () => json(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] });
const overloaded = () => json(503, { error: { message: 'The model is overloaded. Please try again later.' } });
// Never answers, like an overloaded Gemini holding the connection open, until the caller gives up.
const hang = (init?: RequestInit) =>
  new Promise<Response>((_, reject) =>
    init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))),
  );

type Step = (init?: RequestInit) => Response | Promise<Response>;

// Answers each Gemini call with the next response scripted for that model (the last one repeats).
const scriptGemini = (script: Record<string, Step[]>) => {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('gold-api')) return json(200, { price: 30 });
      const model = decodeURIComponent(url.match(/models\/([^:]+):/)?.[1] ?? '');
      calls.push(model);
      const steps = script[model] ?? [overloaded];
      return steps[Math.min(calls.filter((m) => m === model).length, steps.length) - 1]!(init);
    }),
  );
  return calls;
};

const run = async () => {
  const pending = appraise({ image: 'AAAA', pageText: '', showTitle: 'Show' });
  await vi.advanceTimersByTimeAsync(31_000);
  return pending;
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('chrome', {
    storage: {
      local: fakeArea({ wn2_appraisalSettings: { geminiApiKey: 'test-key' } }),
      session: fakeArea(),
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('appraise', () => {
  it('retries a model that was only overloaded instead of giving up after one try each', async () => {
    const calls = scriptGemini({ 'gemini-2.5-flash-lite': [overloaded, ok] });
    const res = await run();
    expect(res).toMatchObject({ ok: true, model: 'gemini-2.5-flash-lite' });
    expect(calls.slice(0, 4)).toEqual(['gemini-2.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.5-flash-lite', 'gemini-2.5-flash']);
  });

  it('retries a model whose first request hung instead of dropping it', async () => {
    const calls = scriptGemini({ 'gemini-2.5-flash-lite': [hang, ok] });
    const res = await run();
    expect(res).toMatchObject({ ok: true, model: 'gemini-2.5-flash-lite' });
    expect(calls.filter((m) => m === 'gemini-2.5-flash-lite')).toHaveLength(2);
  });

  it('does not start another model while the first is still working', async () => {
    const slow = (init?: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        const timer = setTimeout(() => resolve(ok()), 6_000);
        init?.signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        });
      });
    const calls = scriptGemini({ 'gemini-2.5-flash-lite': [slow] });
    const pending = appraise({ image: 'AAAA', pageText: '', showTitle: 'Show' });
    await vi.advanceTimersByTimeAsync(8_000);
    await expect(pending).resolves.toMatchObject({ ok: true, model: 'gemini-2.5-flash-lite' });
    expect(calls).toEqual(['gemini-2.5-flash-lite']);
  });

  it('reports overload with the models it actually tried', async () => {
    const calls = scriptGemini({});
    const res = await run();
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).toMatch(/overloaded right now: \d+ tries across gemini-2\.5-flash-lite, gemini-3\.1-flash-lite, gemini-3\.5-flash-lite, gemini-2\.5-flash/);
    expect(calls.length).toBeGreaterThan(3);
  });

  it('tells you to set something up when there is neither an on-device model nor a key', async () => {
    vi.stubGlobal('chrome', { storage: { local: fakeArea(), session: fakeArea() } });
    const calls = scriptGemini({});
    const res = await run();
    expect(res).toMatchObject({ ok: false, needsKey: true });
    expect(calls).toEqual([]);
  });

  it('stops at a key error instead of trying other models', async () => {
    const calls = scriptGemini({ 'gemini-2.5-flash-lite': [() => json(403, { error: { message: 'API key not valid' } })] });
    const res = await run();
    expect(res).toMatchObject({ ok: false, needsKey: true });
    expect(calls).toEqual(['gemini-2.5-flash-lite']);
  });

  it('reads a table-scan image at low resolution and leaves a normal image alone', async () => {
    const bodyOf = () => {
      const chat = vi.mocked(fetch).mock.calls.find(([url]) => String(url).includes('generateContent'));
      return JSON.parse(String((chat?.[1] as RequestInit).body)) as {
        contents: { parts: { media_resolution?: { level: string } }[] }[];
      };
    };
    const answer = () => json(200, { candidates: [{ content: { parts: [{ text: '{"low":1}' }] } }] });
    scriptGemini({ 'gemini-2.5-flash-lite': [answer] });
    const plain = geminiJson('sys', 'prompt', { type: 'OBJECT', properties: { low: { type: 'NUMBER' } } }, 'jpeg');
    await vi.advanceTimersByTimeAsync(31_000);
    await plain;
    expect(bodyOf().contents[0]!.parts[1]?.media_resolution).toBeUndefined();

    scriptGemini({ 'gemini-2.5-flash-lite': [answer] });
    const low = geminiJson('sys', 'prompt', { type: 'OBJECT', properties: { low: { type: 'NUMBER' } } }, 'jpeg', true);
    await vi.advanceTimersByTimeAsync(31_000);
    await low;
    expect(bodyOf().contents[0]!.parts[1]?.media_resolution).toEqual({ level: 'MEDIA_RESOLUTION_LOW' });
  });

  it('adds the tokens Gemini billed to the running total', async () => {
    const usageMetadata = {
      promptTokenCount: 3000,
      candidatesTokenCount: 200,
      thoughtsTokenCount: 10,
      cachedContentTokenCount: 1000,
      promptTokensDetails: [
        { modality: 'TEXT', tokenCount: 1700 },
        { modality: 'IMAGE', tokenCount: 1300 },
      ],
    };
    const billed = () => json(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }], usageMetadata });
    scriptGemini({ 'gemini-2.5-flash-lite': [billed] });
    await run();
    await run();
    const saved = (await chrome.storage.local.get('wn2_geminiUsage')).wn2_geminiUsage;
    expect(saved).toMatchObject({ clicks: 1, input: 3000, image: 1300, cached: 1000, output: 210 });
  });
});

describe('Ollama backup', () => {
  const ollamaSettings = {
    geminiApiKey: 'test-key',
    ollamaBaseUrl: 'http://127.0.0.1:11434',
    ollamaModel: 'qwen2.5vl',
  };

  const useSettings = (settings: Record<string, unknown>) => {
    vi.stubGlobal('chrome', { storage: { local: fakeArea({ wn2_appraisalSettings: settings }), session: fakeArea() } });
  };

  const ollamaAnswer = () => json(200, { message: { content: JSON.stringify({ ...answer, item_name: 'From Ollama' }) } });

  const scriptBoth = (gemini: Step, ollama: Step) => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('gold-api')) return json(200, { price: 30 });
        calls.push(url);
        if (url.includes('/api/chat')) return ollama(init);
        return gemini(init);
      }),
    );
    return calls;
  };

  it('leaves Ollama idle when Gemini answers before the backup starts', async () => {
    useSettings(ollamaSettings);
    const calls = scriptBoth(ok, ollamaAnswer);
    const res = await run();
    expect(res).toMatchObject({ ok: true, model: 'gemini-2.5-flash-lite' });
    expect(calls.some((url) => url.includes('/api/chat'))).toBe(false);
  });

  it('uses Ollama once Gemini has had 5 seconds and still has not answered', async () => {
    useSettings(ollamaSettings);
    const calls = scriptBoth(hang, ollamaAnswer);
    const res = await run();
    expect(res).toMatchObject({ ok: true, model: 'ollama:qwen2.5vl', item: { item_name: 'From Ollama' } });
    expect(calls.some((url) => url.includes('/api/chat'))).toBe(true);
    const chat = vi.mocked(fetch).mock.calls.find(([url]) => String(url).includes('/api/chat'));
    const body = JSON.parse(String((chat?.[1] as RequestInit).body)) as { think: boolean; messages: { images?: string[] }[] };
    expect(body.think).toBe(false);
    expect(body.messages[1]?.images).toEqual(['AAAA']);
  });

  it('asks Ollama immediately when there is no Gemini key', async () => {
    useSettings({ ...ollamaSettings, geminiApiKey: '' });
    const calls = scriptBoth(ok, ollamaAnswer);
    const res = await run();
    expect(res).toMatchObject({ ok: true, model: 'ollama:qwen2.5vl' });
    expect(calls.every((url) => url.includes('/api/chat'))).toBe(true);
  });

  it('skips cloud Gemini and the on-device model when Ollama-only is on', async () => {
    useSettings({ ...ollamaSettings, ollamaOnly: true });
    const create = vi.fn();
    vi.stubGlobal('LanguageModel', { availability: async () => 'available', create });
    const calls = scriptBoth(ok, ollamaAnswer);
    const res = await run();
    expect(res).toMatchObject({ ok: true, model: 'ollama:qwen2.5vl', item: { item_name: 'From Ollama' } });
    expect(calls.every((url) => url.includes('/api/chat'))).toBe(true);
    expect(create).not.toHaveBeenCalled();
  });

  it('does not call Gemini when Ollama-only is on and the server is missing', async () => {
    useSettings({ geminiApiKey: 'test-key', ollamaOnly: true });
    const calls = scriptGemini({});
    const res = await run();
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).toMatch(/Ollama-only is on/);
    expect(calls).toEqual([]);
  });

  it('sends text questions to Ollama when Ollama-only is on', async () => {
    useSettings({ ...ollamaSettings, ollamaOnly: true });
    const calls = scriptBoth(ok, () => json(200, { message: { content: '{"low":1}' } }));
    const pending = geminiJson('sys', 'prompt', { type: 'OBJECT', properties: { low: { type: 'NUMBER' } } });
    await vi.advanceTimersByTimeAsync(31_000);
    await expect(pending).resolves.toMatchObject({ ok: true, model: 'ollama:qwen2.5vl', text: '{"low":1}' });
    expect(calls.every((url) => url.includes('/api/chat'))).toBe(true);
  });

  it('answers the same frame from cache instead of calling Ollama again', async () => {
    useSettings({ ...ollamaSettings, ollamaOnly: true });
    const calls = scriptBoth(ok, ollamaAnswer);
    expect(await run()).toMatchObject({ ok: true, item: { item_name: 'From Ollama' } });
    expect(await run()).toMatchObject({ ok: true, item: { item_name: 'From Ollama' } });
    expect(calls.filter((url) => url.includes('/api/chat'))).toHaveLength(1);
  });

  it('reads the appraisal from the thinking field when content is empty', async () => {
    useSettings({ ...ollamaSettings, ollamaOnly: true });
    scriptBoth(ok, () =>
      json(200, { message: { content: '', thinking: JSON.stringify({ ...answer, item_name: 'From thinking' }) } }),
    );
    const res = await run();
    expect(res).toMatchObject({ ok: true, model: 'ollama:qwen2.5vl', item: { item_name: 'From thinking' } });
  });

  it('explains a 403 from the Ollama server', async () => {
    useSettings({ ...ollamaSettings, ollamaOnly: true });
    scriptBoth(ok, () => json(403, {}));
    const res = await run();
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).toMatch(/OLLAMA_ORIGINS=chrome-extension:\/\/\*/);
  });

  it('reports both failures when Gemini is overloaded and Ollama is down', async () => {
    useSettings(ollamaSettings);
    const calls = scriptBoth(overloaded, () => json(404, { error: "model 'qwen2.5vl' not found" }));
    const res = await run();
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).toMatch(/overloaded/);
    expect(!res.ok && res.error).toMatch(/Ollama backup: model 'qwen2\.5vl' not found/);
    expect(calls.some((url) => url.includes('/api/chat'))).toBe(true);
  });
});

describe('appraise with the on-device model', () => {
  const nanoAnswer = {
    ...answer,
    is_collectible: true,
    item_type: 'coin',
    item_name: '1921 Morgan Dollar',
    year: 1921,
    mint_mark: '',
    series_key: 'morgan_dollar',
    metal: 'silver',
    fine_weight_oz: 0,
    grading_service: 'PCGS',
    grade: 'MS 63',
    cert_number: '#12345678',
    estimate_low_usd: 60,
    estimate_high_usd: 90,
  };

  const stubOnDevice = (prompt: () => Promise<string>) => {
    const session = { prompt: vi.fn(prompt), destroy: vi.fn(), clone: vi.fn() };
    session.clone.mockResolvedValue(session);
    vi.stubGlobal('LanguageModel', { availability: async () => 'available', create: async () => session });
    return session;
  };

  it('answers on-device without calling Gemini', async () => {
    stubOnDevice(async () => JSON.stringify(nanoAnswer));
    const calls = scriptGemini({});
    const res = await run();
    expect(calls).toEqual([]);
    expect(res).toMatchObject({
      ok: true,
      model: 'on-device',
      item: { is_slabbed: true, grading_service: 'PCGS', grade: 'MS 63', cert_number: '12345678', mint_mark: null, fine_weight_oz: null },
      others: [],
      melt: { metal: 'silver', oz: 0.7734 },
    });
  });

  it('keeps the two next-best items from a crowded frame', async () => {
    stubOnDevice(async () =>
      JSON.stringify({
        ...nanoAnswer,
        others: [
          { item_name: 'Assorted caps', quantity: 12, estimate_low_usd: 2, estimate_high_usd: 4 },
          { item_name: 'Red lantern', quantity: 1, estimate_low_usd: 5, estimate_high_usd: 8 },
          { item_name: 'Extra', quantity: 1, estimate_low_usd: 9, estimate_high_usd: 10 },
        ],
      }),
    );
    const res = await run();
    expect(res).toMatchObject({
      ok: true,
      others: [
        { item_name: 'Assorted caps', quantity: 12, estimate_low_usd: 2, estimate_high_usd: 4 },
        { item_name: 'Red lantern', quantity: 1, estimate_low_usd: 5, estimate_high_usd: 8 },
      ],
    });
    if (res.ok) expect(res.item).not.toHaveProperty('others');
  });

  it('goes straight to Gemini when the on-device model is unavailable, asking Chrome only once', async () => {
    const availability = vi.fn(async () => 'unavailable');
    vi.stubGlobal('LanguageModel', { availability, create: vi.fn() });
    const calls = scriptGemini({ 'gemini-2.5-flash-lite': [ok] });
    expect(await run()).toMatchObject({ ok: true, model: 'gemini-2.5-flash-lite' });
    expect(await run()).toMatchObject({ ok: true, model: 'gemini-2.5-flash-lite' });
    expect(availability).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(['gemini-2.5-flash-lite']);
  });

  it("doesn't ask Chrome again after a restart while a saved 'unavailable' is fresh", async () => {
    const availability = vi.fn(async () => 'unavailable');
    vi.stubGlobal('LanguageModel', { availability, create: vi.fn() });
    const { checkOnDevice } = await import('./onDevice');
    await checkOnDevice();
    vi.stubGlobal('LanguageModel', { availability, create: vi.fn() });
    expect(await checkOnDevice()).toBe('unavailable');
    expect(availability).toHaveBeenCalledTimes(1);
    expect(await checkOnDevice(true)).toBe('unavailable');
    expect(availability).toHaveBeenCalledTimes(2);
  });

  it('falls back to Gemini when the on-device model fails', async () => {
    stubOnDevice(async () => {
      throw new Error('model crashed');
    });
    const calls = scriptGemini({ 'gemini-2.5-flash-lite': [ok] });
    const res = await run();
    expect(res).toMatchObject({ ok: true, model: 'gemini-2.5-flash-lite' });
    expect(calls).toEqual(['gemini-2.5-flash-lite']);
  });

  it('asks Gemini when the on-device model is still running after its head start', async () => {
    stubOnDevice(() => new Promise(() => {}));
    const calls = scriptGemini({ 'gemini-2.5-flash-lite': [ok] });
    const pending = appraise({ image: 'AAAA', pageText: '', showTitle: 'Show' });
    await vi.advanceTimersByTimeAsync(ON_DEVICE_HEADSTART_MS - 100);
    expect(calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(100);
    await expect(pending).resolves.toMatchObject({ ok: true, model: 'gemini-2.5-flash-lite' });
    expect(calls).toEqual(['gemini-2.5-flash-lite']);
  });

  it('keeps the on-device answer when it lands before Gemini answers', async () => {
    let release: (value: string) => void = () => {};
    stubOnDevice(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const calls = scriptGemini({ 'gemini-2.5-flash-lite': [hang] });
    const pending = appraise({ image: 'AAAA', pageText: '', showTitle: 'Show' });
    await vi.advanceTimersByTimeAsync(ON_DEVICE_HEADSTART_MS);
    expect(calls).toEqual(['gemini-2.5-flash-lite']);
    release(JSON.stringify(nanoAnswer));
    await expect(pending).resolves.toMatchObject({ ok: true, model: 'on-device', item: { item_name: '1921 Morgan Dollar' } });
  });
});

describe('cloud provider backup', () => {
  const openaiAnswer = () =>
    json(200, { choices: [{ message: { content: JSON.stringify({ ...answer, item_name: 'From OpenAI' }) } }] });

  const scriptHosts = (openai: Step, gemini: Step = overloaded) => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('gold-api')) return json(200, { price: 30 });
        calls.push(url);
        if (url.includes('api.openai.com')) return openai(init);
        return gemini(init);
      }),
    );
    return calls;
  };

  it('reads a scripted OpenAI answer and names that model', async () => {
    vi.stubGlobal('chrome', {
      storage: {
        local: fakeArea({ wn2_appraisalSettings: { preferredProvider: 'openai', openaiApiKey: 'sk-test' } }),
        session: fakeArea(),
      },
    });
    const calls = scriptHosts(openaiAnswer);
    const res = await run();
    expect(res).toMatchObject({ ok: true, model: 'openai:gpt-5-nano', item: { item_name: 'From OpenAI' } });
    expect(calls.some((url) => url.includes('api.openai.com/v1/chat/completions'))).toBe(true);
    const chat = vi.mocked(fetch).mock.calls.find(([url]) => String(url).includes('api.openai.com'));
    const body = JSON.parse(String((chat?.[1] as RequestInit).body)) as { model: string; messages: { content: unknown }[] };
    expect(body.model).toBe('gpt-5-nano');
    expect(JSON.stringify(body.messages)).toContain('AAAA');
  });

  it('does not call another cloud provider when Gemini answers before five seconds', async () => {
    vi.stubGlobal('chrome', {
      storage: {
        local: fakeArea({ wn2_appraisalSettings: { geminiApiKey: 'test-key', openaiApiKey: 'sk-test' } }),
        session: fakeArea(),
      },
    });
    const calls = scriptHosts(openaiAnswer, ok);
    const res = await run();
    expect(res).toMatchObject({ ok: true, model: 'gemini-2.5-flash-lite' });
    expect(calls.some((url) => url.includes('api.openai.com'))).toBe(false);
  });

  it('asks OpenAI on the same click when Gemini is overloaded', async () => {
    vi.stubGlobal('chrome', {
      storage: {
        local: fakeArea({ wn2_appraisalSettings: { geminiApiKey: 'test-key', openaiApiKey: 'sk-test' } }),
        session: fakeArea(),
      },
    });
    scriptHosts(openaiAnswer);
    const res = await run();
    expect(res).toMatchObject({ ok: true, model: 'openai:gpt-5-nano', item: { item_name: 'From OpenAI' } });
  });

  it('uses a saved key when the preferred provider key is blank', async () => {
    vi.stubGlobal('chrome', {
      storage: {
        local: fakeArea({ wn2_appraisalSettings: { preferredProvider: 'openai', openaiApiKey: '', geminiApiKey: 'test-key' } }),
        session: fakeArea(),
      },
    });
    const calls = scriptHosts(openaiAnswer, ok);
    const res = await run();
    expect(res).toMatchObject({ ok: true, model: 'gemini-2.5-flash-lite' });
    expect(calls.some((url) => url.includes('api.openai.com'))).toBe(false);
  });

  it('names every saved provider when all of them are overloaded', async () => {
    vi.stubGlobal('chrome', {
      storage: {
        local: fakeArea({ wn2_appraisalSettings: { geminiApiKey: 'test-key', openaiApiKey: 'sk-test' } }),
        session: fakeArea(),
      },
    });
    scriptHosts(overloaded);
    const res = await run();
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).toMatch(/Gemini/);
    expect(!res.ok && res.error).toMatch(/OpenAI/);
  });

  it('sends text questions through the same cloud order', async () => {
    vi.stubGlobal('chrome', {
      storage: {
        local: fakeArea({ wn2_appraisalSettings: { preferredProvider: 'openai', openaiApiKey: 'sk-test' } }),
        session: fakeArea(),
      },
    });
    const calls = scriptHosts(() => json(200, { choices: [{ message: { content: '{"low":1}' } }] }));
    const pending = geminiJson('sys', 'prompt', { type: 'OBJECT', properties: { low: { type: 'NUMBER' } } });
    await vi.advanceTimersByTimeAsync(31_000);
    await expect(pending).resolves.toMatchObject({ ok: true, model: 'openai:gpt-5-nano', text: '{"low":1}' });
    expect(calls.some((url) => url.includes('api.openai.com'))).toBe(true);
  });
});

describe('priceLookup', () => {
  const morgan = {
    item_type: 'coin' as const,
    item_name: '1881-S Morgan Dollar',
    year: 1881,
    mint_mark: 'S',
    is_slabbed: true,
    grading_service: 'PCGS',
    grade: 'MS 65',
    grade_number: 65,
    pcgs_number: '7130',
    cert_number: '12345678',
  };
  const coin = (name: string, year: number, mint: string) => ({
    Name: name,
    Year: year,
    MintMark: mint,
    PriceGuideValue: 200,
    Grade: '65',
    PCGSNo: '7130',
    AuctionList: [
      { Price: 180, Date: '2026-06-01' },
      { Price: 220, Date: '2026-07-01' },
    ],
  });

  beforeEach(() => {
    vi.useRealTimers();
    vi.stubGlobal('chrome', {
      storage: { local: fakeArea({ wn2_appraisalSettings: { pcgsToken: 'tok' } }), session: fakeArea() },
    });
  });

  it('does not call PCGS for a grade the slab did not print', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = await priceLookup({ ...morgan, is_slabbed: false, grading_service: null, grade: null, cert_number: null });
    expect(res).toMatchObject({ ok: false, reason: 'no-id' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a cert that names a different coin and does not use its price', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, coin('1921 Peace Dollar', 1921, ''))));
    const res = await priceLookup(morgan);
    expect(res).toMatchObject({ ok: false, reason: 'mismatch' });
    if (!res.ok) expect(res.error).toMatch(/Peace Dollar/);
  });

  it('uses a cert whose coin matches what was read', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, coin('1881-S Morgan Dollar', 1881, 'S'))));
    const res = await priceLookup(morgan);
    expect(res).toMatchObject({ ok: true, source: 'cert', guide: 200, name: '1881-S Morgan Dollar' });
  });

  it('looks up a slab grade only when CoinFacts names the same coin', async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(url);
        return json(200, coin('1921 Peace Dollar', 1921, ''));
      }),
    );
    const raw = await priceLookup({ ...morgan, cert_number: null, year: 1921, mint_mark: '', item_name: '1921 Morgan Dollar', grade: 'VF-XF', is_slabbed: false, grading_service: null });
    expect(raw).toMatchObject({ ok: false, reason: 'no-id' });
    expect(urls).toEqual([]);

    const mismatch = await priceLookup({
      ...morgan,
      cert_number: null,
      year: 1921,
      mint_mark: '',
      item_name: '1921 Morgan Dollar',
      pcgs_number: '7356',
      grade: 'MS 64',
      grade_number: 64,
    });
    expect(mismatch).toMatchObject({ ok: false, reason: 'mismatch' });
    expect(urls.some((url) => url.includes('GetCoinFactsByGrade'))).toBe(true);
    expect(urls.some((url) => url.includes('GetCoinFactsByCertNo'))).toBe(false);
  });
});

describe('gradeGuide', () => {
  const quarter = {
    pcgsNo: 5791,
    gradeNo: 8,
    year: 1932,
    mint: 'D',
    denom: '25c',
  };

  beforeEach(() => {
    vi.stubGlobal('chrome', {
      storage: { local: fakeArea({ wn2_appraisalSettings: { pcgsToken: 'tok' } }), session: fakeArea() },
    });
  });

  it('does not call PCGS without a token or for a grade it cannot price', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('chrome', { storage: { local: fakeArea(), session: fakeArea() } });
    expect(await gradeGuide(quarter)).toMatchObject({ ok: false, reason: 'no-token' });
    vi.stubGlobal('chrome', {
      storage: { local: fakeArea({ wn2_appraisalSettings: { pcgsToken: 'tok' } }), session: fakeArea() },
    });
    expect(await gradeGuide({ ...quarter, gradeNo: 7 })).toMatchObject({ ok: false, reason: 'no-id' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a spec that is a different coin', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, { Name: '1921 $1', Year: 1921, MintMark: '', Denomination: '$1', PriceGuideValue: 40 })));
    const res = await gradeGuide(quarter);
    expect(res).toMatchObject({ ok: false, reason: 'mismatch' });
  });

  it('returns the price guide and a median of recent sales', async () => {
    const recent = (daysAgo: number) => new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json(200, {
          Name: '1932-D 25C',
          Year: 1932,
          MintMark: 'D',
          Denomination: '25C',
          Grade: '8',
          PriceGuideValue: 175,
          AuctionList: [
            { Price: 150, Date: recent(40) },
            { Price: 160, Date: recent(10) },
          ],
        }),
      ),
    );
    const res = await gradeGuide(quarter);
    expect(res).toMatchObject({ ok: true, guide: 175, auctions: { count: 2, median: 155 } });
  });
});
