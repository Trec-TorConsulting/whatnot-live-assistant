import { afterEach, describe, expect, it, vi } from 'vitest';

const markup = `
  <input id="profile-username" />
  <button id="profile-save" type="button"></button>
  <select id="cloud-provider">
    <option value="gemini">Gemini</option>
    <option value="openai">OpenAI</option>
    <option value="anthropic">Anthropic</option>
    <option value="openrouter">OpenRouter</option>
  </select>
  <input id="cloud-key" type="password" />
  <input id="cloud-model" />
  <input id="pcgs-token" type="password" />
  <input id="psa-token" type="password" />
  <input id="discogs-token" type="password" />
  <input id="ollama-url" />
  <input id="ollama-model" />
  <input id="ollama-only" type="checkbox" />
  <button id="appraisal-save" type="button"></button>
  <button id="cloud-test" type="button"></button>
  <button id="ollama-test" type="button"></button>
  <button id="pcgs-test" type="button"></button>
  <div id="appraisal-note"></div>
  <p id="gemini-usage"></p>
  <button id="gemini-usage-reset" type="button"></button>
  <p id="sold-count"></p>
  <input id="overrides-url" />
  <textarea id="overrides-inline"></textarea>
  <button id="overrides-save" type="button"></button>
  <div id="overrides-status"></div>
  <p id="ondevice-status"></p>
  <button id="ondevice-setup" type="button"></button>
  <button id="ondevice-recheck" type="button"></button>
  <div id="toast" hidden></div>
`;

const provider = () => document.querySelector<HTMLSelectElement>('#cloud-provider')!;
const key = () => document.querySelector<HTMLInputElement>('#cloud-key')!;
const note = () => document.querySelector('#appraisal-note')!;

const boot = async (stored: Record<string, unknown> = {}, allow = true) => {
  document.body.innerHTML = markup;
  const data: Record<string, unknown> = { wn2_appraisalSettings: stored };
  const set = vi.fn(async (items: Record<string, unknown>) => void Object.assign(data, items));
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: async (name: string) => (name in data ? { [name]: data[name] } : {}),
        set,
      },
      onChanged: { addListener() {}, removeListener() {} },
    },
    runtime: { sendMessage: vi.fn(async () => ({ status: 'unavailable', ok: true, detail: 'ok' })) },
    permissions: {
      contains: async () => false,
      request: async () => allow,
    },
  });
  vi.resetModules();
  const { initSettings } = await import('./settings');
  await initSettings();
  return { data, set };
};

const saved = (data: Record<string, unknown>) => data.wn2_appraisalSettings as Record<string, string>;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('cloud provider dropdown', () => {
  it('lists the four providers and shows an existing Gemini key', async () => {
    await boot({ geminiApiKey: 'gem-key' });
    expect([...provider().options].map((option) => option.textContent)).toEqual(['Gemini', 'OpenAI', 'Anthropic', 'OpenRouter']);
    expect(provider().value).toBe('gemini');
    expect(key().value).toBe('gem-key');
  });

  it('keeps the OpenAI key when Gemini is saved afterwards', async () => {
    const { data } = await boot({ geminiApiKey: 'gem-key', openaiApiKey: 'sk-old' });
    provider().value = 'openai';
    provider().dispatchEvent(new Event('change'));
    expect(key().value).toBe('sk-old');
    key().value = 'sk-new';
    document.querySelector<HTMLButtonElement>('#appraisal-save')!.click();
    await vi.waitFor(() => expect(saved(data).openaiApiKey).toBe('sk-new'));
    expect(saved(data).geminiApiKey).toBe('gem-key');
    expect(saved(data).preferredProvider).toBe('openai');

    provider().value = 'gemini';
    provider().dispatchEvent(new Event('change'));
    expect(key().value).toBe('gem-key');
    document.querySelector<HTMLButtonElement>('#appraisal-save')!.click();
    await vi.waitFor(() => expect(saved(data).preferredProvider).toBe('gemini'));
    expect(saved(data).openaiApiKey).toBe('sk-new');
  });

  it('clears only the provider on screen', async () => {
    const { data } = await boot({ geminiApiKey: 'gem-key', openaiApiKey: 'sk-old' });
    provider().value = 'openai';
    provider().dispatchEvent(new Event('change'));
    key().value = '';
    document.querySelector<HTMLButtonElement>('#appraisal-save')!.click();
    await vi.waitFor(() => expect(saved(data).openaiApiKey).toBe(''));
    expect(saved(data).geminiApiKey).toBe('gem-key');
  });

  it('does not save when the provider host permission is denied', async () => {
    const { set } = await boot({ geminiApiKey: 'gem-key' }, false);
    provider().value = 'openai';
    provider().dispatchEvent(new Event('change'));
    key().value = 'sk-new';
    document.querySelector<HTMLButtonElement>('#appraisal-save')!.click();
    await vi.waitFor(() => expect(note().textContent).toMatch(/blocked OpenAI/));
    expect(set).not.toHaveBeenCalled();
  });
});
