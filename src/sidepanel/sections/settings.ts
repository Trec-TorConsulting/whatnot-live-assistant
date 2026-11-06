import { send } from '../../shared/messages';
import { downloadOnDeviceModel, type OnDeviceStatus } from '../../shared/onDevice';
import { parseOverrides } from '../../shared/overrides';
import {
  CLOUD_PROVIDER_LABEL,
  emptyGeminiUsage,
  getAppraisalSettings,
  getItem,
  getOverrides,
  getProfile,
  onItemChanged,
  providerKey,
  providerModel,
  setItem,
  withProviderCredentials,
  type CloudProvider,
  type GeminiUsage,
} from '../../shared/storage';
import { $, toast } from '../ui';

const el = {
  username: $<HTMLInputElement>('#profile-username'),
  profileSave: $<HTMLButtonElement>('#profile-save'),
  cloudProvider: $<HTMLSelectElement>('#cloud-provider'),
  cloudKey: $<HTMLInputElement>('#cloud-key'),
  cloudModel: $<HTMLInputElement>('#cloud-model'),
  pcgsToken: $<HTMLInputElement>('#pcgs-token'),
  greysheetApiKey: $<HTMLInputElement>('#greysheet-api-key'),
  greysheetToken: $<HTMLInputElement>('#greysheet-token'),
  psaToken: $<HTMLInputElement>('#psa-token'),
  discogsToken: $<HTMLInputElement>('#discogs-token'),
  ollamaUrl: $<HTMLInputElement>('#ollama-url'),
  ollamaModel: $<HTMLInputElement>('#ollama-model'),
  ollamaOnly: $<HTMLInputElement>('#ollama-only'),
  appraisalSave: $<HTMLButtonElement>('#appraisal-save'),
  cloudTest: $<HTMLButtonElement>('#cloud-test'),
  ollamaTest: $<HTMLButtonElement>('#ollama-test'),
  pcgsTest: $<HTMLButtonElement>('#pcgs-test'),
  greysheetTest: $<HTMLButtonElement>('#greysheet-test'),
  appraisalNote: $('#appraisal-note'),
  geminiUsage: $('#gemini-usage'),
  geminiUsageReset: $<HTMLButtonElement>('#gemini-usage-reset'),
  soldCount: $('#sold-count'),
  overridesUrl: $<HTMLInputElement>('#overrides-url'),
  overridesInline: $<HTMLTextAreaElement>('#overrides-inline'),
  overridesSave: $<HTMLButtonElement>('#overrides-save'),
  overridesStatus: $('#overrides-status'),
  onDeviceStatus: $('#ondevice-status'),
  onDeviceSetup: $<HTMLButtonElement>('#ondevice-setup'),
  onDeviceRecheck: $<HTMLButtonElement>('#ondevice-recheck'),
};

const ON_DEVICE_TEXT: Record<OnDeviceStatus, string> = {
  available: 'On-device AI is ready. Appraisals use it first.',
  downloadable: 'On-device AI (Gemini Nano) is the fastest appraiser but is not downloaded yet. One-time download; Chrome needs about 22 GB free disk.',
  downloading: 'On-device AI is downloading…',
  unavailable:
    'On-device AI is unavailable in this Chrome, usually because an organization policy (GenAILocalFoundationalModelSettings) turns it off, or the hardware is too small. chrome://on-device-internals shows which. Gemini is used.',
  'no-api': 'This Chrome has no on-device AI (needs Chrome 138 or newer). Gemini is used.',
};

// Asks the background, which caches Chrome's answer: checking here directly logs an extension
// error on every panel open while a policy blocks the model.
const renderOnDevice = async (recheck = false) => {
  const res = await send('ON_DEVICE_STATUS', { recheck }).catch(() => null);
  const status = res?.status ?? 'unavailable';
  el.onDeviceStatus.textContent = ON_DEVICE_TEXT[status];
  el.onDeviceStatus.className = `small ${status === 'available' ? 'ok-text' : 'muted'}`;
  el.onDeviceSetup.hidden = status !== 'downloadable' && status !== 'downloading';
  el.onDeviceRecheck.hidden = status !== 'unavailable';
};

const setUpOnDevice = async () => {
  el.onDeviceSetup.disabled = true;
  try {
    await downloadOnDeviceModel((fraction) => {
      el.onDeviceStatus.textContent = `Downloading on-device AI… ${Math.floor(fraction * 100)}%`;
    });
    toast('On-device AI is ready.');
  } catch (err) {
    toast(`On-device AI setup failed: ${(err as Error).message}`);
  } finally {
    el.onDeviceSetup.disabled = false;
    await renderOnDevice(true);
  }
};

const renderGeminiUsage = (usage: GeminiUsage | undefined) => {
  el.geminiUsageReset.hidden = !usage?.clicks;
  if (!usage?.clicks) {
    el.geminiUsage.textContent = 'Gemini tokens per appraisal show here after the first one Gemini answers.';
    return;
  }
  const avg = (n: number) => Math.round(n / usage.clicks).toLocaleString();
  el.geminiUsage.textContent =
    `Gemini tokens per appraisal: ${avg(usage.input)} in (${avg(usage.image)} image, ${avg(usage.cached)} cached) and ${avg(usage.output)} out, ` +
    `averaged over ${usage.clicks.toLocaleString()} since ${new Date(usage.since).toLocaleDateString()}.`;
};

const isValidSelector = (s: string) => {
  try {
    document.createDocumentFragment().querySelector(s);
    return true;
  } catch {
    return false;
  }
};

const renderOverrides = async () => {
  const o = await getOverrides();
  const keys = Object.keys(o.value);
  el.overridesStatus.replaceChildren(
    Object.assign(document.createElement('div'), {
      textContent:
        o.source === 'none'
          ? 'No overrides active; built-in selectors are used.'
          : `Active (${o.source}): ${keys.length ? keys.join(', ') : 'nothing valid'}${o.fetchedAt ? ` · updated ${new Date(o.fetchedAt).toLocaleString()}` : ''}`,
    }),
    ...o.errors.map((e) => Object.assign(document.createElement('div'), { className: 'bad-text', textContent: e })),
  );
};

// localhost is already allowed. Any other host needs a click here, which is a user gesture.
const PROVIDER_ORIGIN: Record<Exclude<CloudProvider, 'gemini'>, string> = {
  openai: 'https://api.openai.com/*',
  anthropic: 'https://api.anthropic.com/*',
  openrouter: 'https://openrouter.ai/*',
};

const grantProvider = async (provider: CloudProvider, key: string): Promise<'ok' | 'denied'> => {
  if (provider === 'gemini' || !key) return 'ok';
  const pattern = PROVIDER_ORIGIN[provider];
  if (await chrome.permissions.contains({ origins: [pattern] })) return 'ok';
  return (await chrome.permissions.request({ origins: [pattern] })) ? 'ok' : 'denied';
};

const grantOllama = async (raw: string): Promise<'ok' | 'bad-url' | 'denied'> => {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return 'bad-url';
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'bad-url';
  // Any port on this machine is already in the manifest, so Save does not prompt for it.
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return 'ok';
  const pattern = `${url.origin}/*`;
  if (await chrome.permissions.contains({ origins: [pattern] })) return 'ok';
  return (await chrome.permissions.request({ origins: [pattern] })) ? 'ok' : 'denied';
};

let loaded: Awaited<ReturnType<typeof getAppraisalSettings>>;

const providerOnScreen = (): CloudProvider =>
  el.cloudProvider.value === 'openai' || el.cloudProvider.value === 'anthropic' || el.cloudProvider.value === 'openrouter'
    ? el.cloudProvider.value
    : 'gemini';

const showProvider = (provider: CloudProvider) => {
  el.cloudProvider.value = provider;
  el.cloudKey.value = providerKey(loaded, provider);
  el.cloudModel.value = providerModel(loaded, provider);
  el.cloudKey.placeholder = provider === 'gemini' ? 'AIza…' : provider === 'openai' ? 'sk-…' : '';
};

const saveAppraisal = async () => {
  const ollamaBaseUrl = el.ollamaUrl.value.trim();
  if (ollamaBaseUrl) {
    const access = await grantOllama(ollamaBaseUrl);
    if (access === 'bad-url') {
      el.appraisalNote.textContent = 'Ollama URL should look like http://192.168.4.10:31434';
      el.appraisalNote.className = 'small bad-text';
      return false;
    }
    if (access === 'denied') {
      el.appraisalNote.textContent = 'Chrome blocked that Ollama server. Allow access to use it as a backup.';
      el.appraisalNote.className = 'small bad-text';
      return false;
    }
  }
  const provider = providerOnScreen();
  const key = el.cloudKey.value.trim();
  const granted = await grantProvider(provider, key);
  if (granted === 'denied') {
    el.appraisalNote.textContent = `Chrome blocked ${CLOUD_PROVIDER_LABEL[provider]}. Allow access to use it.`;
    el.appraisalNote.className = 'small bad-text';
    return false;
  }
  const next = withProviderCredentials(loaded, provider, key, el.cloudModel.value.trim());
  next.pcgsToken = el.pcgsToken.value.trim();
  next.greysheetApiKey = el.greysheetApiKey.value.trim();
  next.greysheetToken = el.greysheetToken.value.trim();
  next.psaToken = el.psaToken.value.trim();
  next.discogsToken = el.discogsToken.value.trim();
  next.ollamaBaseUrl = ollamaBaseUrl;
  next.ollamaModel = el.ollamaModel.value.trim();
  next.ollamaOnly = el.ollamaOnly.checked;
  await setItem('appraisalSettings', next);
  loaded = next;
  return true;
};

export const initSettings = async () => {
  const [profile, appraisal, config] = await Promise.all([getProfile(), getAppraisalSettings(), getItem('overridesConfig')]);
  el.username.value = profile.username;
  loaded = appraisal;
  showProvider(appraisal.preferredProvider);
  el.pcgsToken.value = appraisal.pcgsToken;
  el.greysheetApiKey.value = appraisal.greysheetApiKey;
  el.greysheetToken.value = appraisal.greysheetToken;
  el.psaToken.value = appraisal.psaToken;
  el.discogsToken.value = appraisal.discogsToken;
  el.ollamaUrl.value = appraisal.ollamaBaseUrl;
  el.ollamaModel.value = appraisal.ollamaModel;
  el.ollamaOnly.checked = appraisal.ollamaOnly;
  el.overridesUrl.value = config?.url ?? '';
  el.overridesInline.value = config?.inline ?? '';
  await renderOverrides();
  onItemChanged('overrides', () => void renderOverrides());
  void renderOnDevice();
  el.onDeviceSetup.addEventListener('click', () => void setUpOnDevice());
  el.onDeviceRecheck.addEventListener('click', () => void renderOnDevice(true));
  const renderSold = (n: number) =>
    (el.soldCount.textContent = `${n.toLocaleString()} Whatnot sales saved from shows you watched, used as price comparisons.`);
  renderSold(((await getItem('soldHistory')) ?? []).length);
  onItemChanged('soldHistory', (v) => renderSold(v?.length ?? 0));
  renderGeminiUsage(await getItem('geminiUsage'));
  onItemChanged('geminiUsage', renderGeminiUsage);
  el.geminiUsageReset.addEventListener('click', () => void setItem('geminiUsage', emptyGeminiUsage()));

  el.profileSave.addEventListener('click', async () => {
    await setItem('profile', { username: el.username.value.trim().replace(/^@/, '') });
    toast('Saved.');
  });

  el.appraisalSave.addEventListener('click', async () => {
    if (!(await saveAppraisal())) return;
    const missingModel = el.ollamaUrl.value.trim() && !el.ollamaModel.value.trim();
    const onlyWithoutServer = el.ollamaOnly.checked && (!el.ollamaUrl.value.trim() || !el.ollamaModel.value.trim());
    el.appraisalNote.textContent = onlyWithoutServer
          ? 'Saved. Add the Ollama server and a vision model. Cloud AI stays off until you do.'
      : missingModel
        ? 'Saved. Add a vision model name so the backup can run.'
        : 'Saved.';
    el.appraisalNote.className = 'small muted';
  });

  const runTest = async (kind: 'TEST_GEMINI' | 'TEST_OLLAMA' | 'TEST_PCGS' | 'TEST_GREYSHEET') => {
    if (!(await saveAppraisal())) return;
    el.appraisalNote.textContent = 'Testing…';
    el.appraisalNote.className = 'small muted';
    const res = await send(kind, {}).catch((err: Error) => ({ ok: false as const, error: err.message }));
    el.appraisalNote.textContent = res.ok ? res.detail : res.error;
    el.appraisalNote.className = `small ${res.ok ? 'ok-text' : 'bad-text'}`;
  };
  el.cloudProvider.addEventListener('change', () => showProvider(providerOnScreen()));
  el.cloudTest.addEventListener('click', async () => {
    if (!(await saveAppraisal())) return;
    el.appraisalNote.textContent = 'Testing…';
    el.appraisalNote.className = 'small muted';
    const res = await send('TEST_PROVIDER', { provider: providerOnScreen() }).catch((err: Error) => ({
      ok: false as const,
      error: err.message,
    }));
    el.appraisalNote.textContent = res.ok ? res.detail : res.error;
    el.appraisalNote.className = `small ${res.ok ? 'ok-text' : 'bad-text'}`;
  });
  el.ollamaTest.addEventListener('click', () => void runTest('TEST_OLLAMA'));
  el.pcgsTest.addEventListener('click', () => void runTest('TEST_PCGS'));
  el.greysheetTest.addEventListener('click', () => void runTest('TEST_GREYSHEET'));

  el.overridesSave.addEventListener('click', async () => {
    const inline = el.overridesInline.value;
    const { errors } = parseOverrides(inline, isValidSelector);
    if (errors.some((e) => /Not valid JSON|must be a JSON object/.test(e))) return toast(errors[0] ?? 'Invalid JSON');
    await setItem('overridesConfig', { url: el.overridesUrl.value.trim(), inline });
    const res = await send('OVERRIDES_REFRESH', {}).catch((err: Error) => ({ ok: false as const, error: err.message }));
    toast(res.ok ? (errors.length ? `Saved. ${errors.length} problem(s) in the pasted JSON.` : 'Overrides applied.') : res.error);
    await renderOverrides();
  });
};
