import { sanitizeAlertSettings, type AlertSettings, type WatchedShow } from './alerts';
import { sanitizeBuyerSettings, sanitizeSellerNotes, type BuyerSettings, type SellerNote } from './buyer';
import { sanitizeCollection, type CollectionSettings } from './collection';
import type { ShowMatch } from './discover';
import type { Order } from './orders';
import type { SellerProfile } from './sellerInfo';
import type { EnvelopeBoard } from './envelopes';
import type { AppraisalItem, AppraisalRecord, OtherItem } from './appraisal';
import { sanitizeGuardSettings, type GuardSettings } from './guard';
import type { LiveSession } from './live';
import type { OnDeviceStatus } from './onDevice';
import { EMPTY_OVERRIDES, type OverridesConfig, type OverridesState } from './overrides';
import type { Purchase } from './purchases';
import { emptyRateState, type RateState } from './rateLimit';
import { sanitizeSettings, type Settings } from './settings';
import { sanitizeShareSettings, type ShareSettings } from './shareSettings';
import type { RefPrice } from './refPrice';
import type { SoldItem } from './soldHistory';
import type { Job, ShareTarget } from './types';
import type { AiManifestResult, PrizeValue } from './prizeValue';
import type { WheelState } from './wheel';

export const CLOUD_PROVIDERS = ['gemini', 'openai', 'anthropic', 'openrouter'] as const;
export type CloudProvider = (typeof CLOUD_PROVIDERS)[number];

export const CLOUD_PROVIDER_LABEL: Record<CloudProvider, string> = {
  gemini: 'Gemini',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  openrouter: 'OpenRouter',
};

const isCloudProvider = (value: unknown): value is CloudProvider =>
  value === 'gemini' || value === 'openai' || value === 'anthropic' || value === 'openrouter';

const providerKeyField = {
  gemini: 'geminiApiKey',
  openai: 'openaiApiKey',
  anthropic: 'anthropicApiKey',
  openrouter: 'openrouterApiKey',
} as const;

const providerModelField = {
  gemini: 'geminiModel',
  openai: 'openaiModel',
  anthropic: 'anthropicModel',
  openrouter: 'openrouterModel',
} as const;

export interface AppraisalSettings {
  preferredProvider: CloudProvider;
  geminiApiKey: string;
  geminiModel: string;
  resolvedModel: string;
  openaiApiKey: string;
  openaiModel: string;
  anthropicApiKey: string;
  anthropicModel: string;
  openrouterApiKey: string;
  openrouterModel: string;
  pcgsToken: string;
  // Greysheet (CDN) API credentials for wholesale and CPG prices (BYOK).
  greysheetApiKey: string;
  greysheetToken: string;
  // Free tokens for PSA cert checks and Discogs record prices; blank skips them.
  psaToken: string;
  discogsToken: string;
  // Backup vision server. Both must be set or the backup stays off.
  ollamaBaseUrl: string;
  ollamaModel: string;
  // Skip cloud Gemini and Chrome's on-device model. Appraisals go straight to Ollama.
  ollamaOnly: boolean;
}

export interface Profile {
  username: string;
}

// The on-page assistant panel: hidden, and where you dragged it (null = bottom-left corner).
export interface OverlayPrefs {
  hidden: boolean;
  pos: { left: number; top: number } | null;
  // Appraise each new auction as it starts, instead of only when you press Appraise.
  autoAppraise: boolean;
}

export const DEFAULT_OVERLAY_PREFS: OverlayPrefs = { hidden: false, pos: null, autoAppraise: false };

// Gemini tokens billed for appraisals answered by Gemini, summed since `since`.
// input includes image and cached tokens; output includes thinking tokens.
export interface GeminiUsage {
  since: number;
  clicks: number;
  input: number;
  image: number;
  cached: number;
  output: number;
}

export const emptyGeminiUsage = (): GeminiUsage => ({ since: Date.now(), clicks: 0, input: 0, image: 0, cached: 0, output: 0 });

export interface ShareStats {
  since: number;
  shows: Record<string, { title: string; host: string | null; shares: number; lastAt: number }>;
}

// tabId is the show tab you're watching (sessions are keyed by it); the clicking happens in a
// separate background tab, workerTabId, so your tab is never touched.
export interface ShareSession {
  id: string;
  tabId: number;
  workerTabId: number | null;
  liveId: string;
  target: ShareTarget;
  quiet: boolean;
  remaining: number | null;
  done: number;
  status: 'running' | 'waiting' | 'stopped';
  waitUntil: number | null;
  message: string | null;
  startedAt: number;
}

interface LocalSchema {
  settings: Settings;
  job: Job | null;
  rate: RateState;
  shareSettings: ShareSettings;
  guardSettings: GuardSettings;
  alertSettings: AlertSettings;
  buyerSettings: BuyerSettings;
  // Your private notes and blocklist, by lowercase seller username.
  sellerNotes: Record<string, SellerNote>;
  // Public profile numbers by lowercase seller username, refreshed daily.
  sellerProfiles: Record<string, SellerProfile>;
  orders: Record<string, Order>;
  showMatches: ShowMatch[];
  // A small video frame from when you won, by purchase key.
  purchasePhotos: Record<string, string>;
  collection: CollectionSettings;
  appraisalSettings: AppraisalSettings;
  profile: Profile;
  overlay: OverlayPrefs;
  overridesConfig: OverridesConfig;
  overrides: OverridesState;
  purchases: Purchase[];
  appraisals: AppraisalRecord[];
  soldHistory: SoldItem[];
  watched: WatchedShow[];
  shareStats: ShareStats;
  geminiUsage: GeminiUsage;
  // General or Scan as you picked it on the panel, by live show id; unpicked shows use scansByDefault.
  scanOverrides: Record<string, { scan: boolean; at: number }>;
  // Card, record, and cert lookups by query, so the same item isn't looked up twice in a day.
  refCache: Record<string, { at: number; refs: RefPrice[] }>;
  notified: Record<string, number>;
  onDevice: { status: OnDeviceStatus; at: number; chrome: string };
  // What each wheel prize is worth to you, keyed by prizeKey(title), so it carries across shows.
  wheelValues: Record<string, number>;
  // Automatic prize values (melt, sold comps, AI), same keys; yours in wheelValues win.
  prizeValues: Record<string, PrizeValue>;
  // Items an envelope wheel shows on camera, by break id.
  envelopeBoards: Record<string, EnvelopeBoard>;
  // Manifest and floor rules extracted by background AI from notes/description, by break id.
  aiManifests: Record<string, AiManifestResult>;
}

type Key = keyof LocalSchema;

const PREFIX = 'wn2_';
const storageKey = (key: string) => `${PREFIX}${key}`;

export const getItem = async <K extends Key>(key: K): Promise<LocalSchema[K] | undefined> => {
  const k = storageKey(key);
  const data = await chrome.storage.local.get(k);
  return data[k] as LocalSchema[K] | undefined;
};

export const setItem = async <K extends Key>(key: K, value: LocalSchema[K]): Promise<void> => {
  await chrome.storage.local.set({ [storageKey(key)]: value });
};

export const onItemChanged = <K extends Key>(key: K, cb: (value: LocalSchema[K] | undefined) => void) => {
  const k = storageKey(key);
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && k in changes) cb(changes[k]?.newValue as LocalSchema[K] | undefined);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
};

export const getSettings = async () => sanitizeSettings(await getItem('settings'));
export const getShareSettings = async () => sanitizeShareSettings(await getItem('shareSettings'));
export const getGuardSettings = async () => sanitizeGuardSettings(await getItem('guardSettings'));
export const getAlertSettings = async () => sanitizeAlertSettings(await getItem('alertSettings'));
export const getBuyerSettings = async () => sanitizeBuyerSettings(await getItem('buyerSettings'));
export const getSellerNotes = async () => sanitizeSellerNotes(await getItem('sellerNotes'));
export const getCollection = async () => sanitizeCollection(await getItem('collection'));export const getRateState = async () => (await getItem('rate')) ?? emptyRateState();
export const getOverrides = async () => (await getItem('overrides')) ?? EMPTY_OVERRIDES;
export const getProfile = async (): Promise<Profile> => ({ username: '', ...(await getItem('profile')) });
export const getOverlayPrefs = async (): Promise<OverlayPrefs> => ({ ...DEFAULT_OVERLAY_PREFS, ...(await getItem('overlay')) });

export const providerKey = (settings: AppraisalSettings, provider: CloudProvider) => settings[providerKeyField[provider]];

export const providerModel = (settings: AppraisalSettings, provider: CloudProvider) => settings[providerModelField[provider]];

// Preferred provider first, then the dropdown order, skipping blank keys.
export const providersWithKeys = (settings: AppraisalSettings): CloudProvider[] => {
  const rest = CLOUD_PROVIDERS.filter((provider) => provider !== settings.preferredProvider);
  return [settings.preferredProvider, ...rest].filter((provider) => providerKey(settings, provider).trim());
};

export const withProviderCredentials = (
  settings: AppraisalSettings,
  provider: CloudProvider,
  key: string,
  model: string,
): AppraisalSettings => ({
  ...settings,
  preferredProvider: provider,
  [providerKeyField[provider]]: key,
  [providerModelField[provider]]: model,
});

export const getAppraisalSettings = async (): Promise<AppraisalSettings> => {
  const stored = await getItem('appraisalSettings');
  const settings: AppraisalSettings = {
    preferredProvider: 'gemini',
    geminiApiKey: '',
    geminiModel: '',
    resolvedModel: '',
    openaiApiKey: '',
    openaiModel: '',
    anthropicApiKey: '',
    anthropicModel: '',
    openrouterApiKey: '',
    openrouterModel: '',
    pcgsToken: '',
    greysheetApiKey: '',
    greysheetToken: '',
    psaToken: '',
    discogsToken: '',
    ollamaBaseUrl: '',
    ollamaModel: '',
    ollamaOnly: false,
    ...stored,
  };
  settings.preferredProvider = isCloudProvider(stored?.preferredProvider) ? stored.preferredProvider : 'gemini';
  return settings;
};

// Session storage: per-tab live state and short-lived caches that shouldn't outlive the browser.
interface SessionSchema {
  spot: Record<string, { price: number; at: number }>;
  modelCooldowns: Record<string, number>;
  shareSessions: Record<string, ShareSession>;
  wheels: Record<string, WheelState>;
  prizeStatus: PrizeStatus;
  envelopeStatus: PrizeStatus;
  // Same JPEG, same appraisal. The image itself is not stored.
  frameCache: Record<string, { at: number; item: AppraisalItem; others: OtherItem[]; model: string }>;
  // Shows you're watching in muted background tabs, by live show id.
  monitors: Record<string, Monitor>;
}

export interface Monitor {
  liveId: string;
  tabId: number;
  title: string | null;
  host: string | null;
  at: number;
}

export interface PrizeStatus {
  state: 'running' | 'done' | 'failed';
  count: number;
  detail: string | null;
  at: number;
}

export const liveKey = (tabId: number) => `live_${tabId}`;
export const latestAppraisalKey = (tabId: number) => `appraisal_${tabId}`;

const sessionStore = () => chrome.storage?.session ?? chrome.storage?.local;

export const getSession = async <K extends keyof SessionSchema>(key: K): Promise<SessionSchema[K] | undefined> => {
  const store = sessionStore();
  if (!store) return undefined;
  const k = storageKey(key);
  return (await store.get(k))[k] as SessionSchema[K] | undefined;
};

export const setSession = async <K extends keyof SessionSchema>(key: K, value: SessionSchema[K]) => {
  const store = sessionStore();
  if (!store) return;
  await store.set({ [storageKey(key)]: value });
};

export const removeSession = async <K extends keyof SessionSchema>(key: K) => {
  const store = sessionStore();
  if (!store) return;
  await store.remove(storageKey(key));
};

export const getTabLive = async (tabId: number) => {
  const store = sessionStore();
  if (!store) return undefined;
  const k = storageKey(liveKey(tabId));
  return (await store.get(k))[k] as LiveSession | undefined;
};

export const setTabLive = (tabId: number, session: LiveSession | null) => {
  const store = sessionStore();
  if (!store) return Promise.resolve();
  return session ? store.set({ [storageKey(liveKey(tabId))]: session }) : store.remove(storageKey(liveKey(tabId)));
};

export const getTabAppraisal = async (tabId: number) => {
  const store = sessionStore();
  if (!store) return undefined;
  const k = storageKey(latestAppraisalKey(tabId));
  return (await store.get(k))[k] as AppraisalRecord | undefined;
};

export const setTabAppraisal = (tabId: number, record: AppraisalRecord) => {
  const store = sessionStore();
  if (!store) return Promise.resolve();
  return store.set({ [storageKey(latestAppraisalKey(tabId))]: record });
};

export const onSessionKeyChanged = (key: string, cb: (value: unknown) => void) => {
  const k = storageKey(key);
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'session' && k in changes) cb(changes[k]?.newValue);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
};
