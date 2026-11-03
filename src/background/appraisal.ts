import {
  APPRAISAL_INSTRUCTIONS,
  APPRAISAL_SCHEMA,
  ITEM_TYPE_LABEL,
  SERIES,
  SPOT_SYMBOLS,
  appraisalContext,
  capFineOz,
  estimateOf,
  jewelryFineOz,
  isMetal,
  isPcgsPriceable,
  matchesCoin,
  meltFor,
  parseOthers,
  quickRead,
  summarizeAuctions,
  type AppraisalContext,
  type AppraisalItem,
  type Metal,
} from '../shared/appraisal';
import type { GeminiResult, PcgsUsage, PriceLookupResult, TestResult } from '../shared/messages';
import {
  CLOUD_PROVIDER_LABEL,
  emptyGeminiUsage,
  getAppraisalSettings,
  getItem,
  getSession,
  providerKey,
  providerModel,
  providersWithKeys,
  setItem,
  setSession,
  type AppraisalSettings,
  type CloudProvider,
  type GeminiUsage,
} from '../shared/storage';
import { DAY, MINUTE, SECOND } from '../shared/time';
import { ON_DEVICE_MODEL, appraiseOnDevice, type OnDeviceResult } from './onDevice';

// --- Spot prices (gold-api.com), cached in session storage so they stay warm across wakeups ---

const SPOT_TTL_MS = 5 * MINUTE;
const spotInFlight: Partial<Record<string, Promise<number | null>>> = {};

export const fetchWithTimeout = async (url: string, init: RequestInit, timeoutMs: number) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const signal = init.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal;
  try {
    return await fetch(url, { ...init, signal });
  } finally {
    clearTimeout(timer);
  }
};

const refreshSpot = (symbol: string) => {
  spotInFlight[symbol] ??= (async () => {
    try {
      const res = await fetchWithTimeout(`https://api.gold-api.com/price/${symbol}`, {}, 8 * SECOND);
      const data = (await res.json()) as { price?: unknown };
      if (typeof data.price !== 'number') return null;
      const store = (await getSession('spot')) ?? {};
      store[symbol] = { price: data.price, at: Date.now() };
      await setSession('spot', store);
      return data.price;
    } catch {
      return null;
    } finally {
      delete spotInFlight[symbol];
    }
  })();
  return spotInFlight[symbol]!;
};

// A cached price comes back immediately (refreshed in the background when stale).
export const getSpot = async (metal: Metal) => {
  const symbol = SPOT_SYMBOLS[metal];
  const cached = (await getSession('spot'))?.[symbol];
  if (cached && Date.now() - cached.at < SPOT_TTL_MS) return cached.price;
  if (cached) {
    void refreshSpot(symbol);
    return cached.price;
  }
  return refreshSpot(symbol);
};

export const warmSpots = () => Promise.all([getSpot('silver'), getSpot('gold')]);

export const quickAppraise = async (pageText: string) => {
  const result = quickRead(pageText);
  const spot = result.read ? await getSpot(result.read.metal) : null;
  return { ...result, melt: result.read && spot ? meltFor(result.read.metal, result.read.oz, result.read.quantity, spot) : null };
};

// --- PCGS Public API: 100 calls/day, so every answer is cached and calls are counted ---

const PCGS_BASE = 'https://api.pcgs.com/publicapi/coindetail';
const PCGS_DAILY_LIMIT = 100;
const PCGS_RESERVE = 5;
const PRICE_CACHE_KEY = 'wn2_price_cache';
const PCGS_USAGE_KEY = 'wn2_pcgs_usage';
const PRICE_CACHE_TTL_MS = DAY;
const PRICE_CACHE_MAX = 400;

type PcgsData = Record<string, unknown> & {
  Name?: string;
  Year?: number | string;
  MintMark?: string | null;
  Denomination?: string;
  Grade?: string;
  Designation?: string;
  PCGSNo?: string | number;
  PriceGuideValue?: number;
  AuctionList?: { Price?: unknown; Date?: unknown; IsCAC?: unknown }[];
  Auctions?: { Price?: unknown; Date?: unknown; IsCAC?: unknown }[];
  CoinFactsLink?: string;
  ServerMessage?: string;
  IsValidRequest?: boolean;
};

const todayKey = () => new Date().toISOString().slice(0, 10);

export const readPcgsUsage = async (): Promise<PcgsUsage> => {
  const usage = (await chrome.storage.local.get(PCGS_USAGE_KEY))[PCGS_USAGE_KEY] as PcgsUsage | undefined;
  return usage?.day === todayKey() ? usage : { day: todayKey(), calls: 0 };
};

const setPcgsUsage = (usage: PcgsUsage) => chrome.storage.local.set({ [PCGS_USAGE_KEY]: usage });

const readPriceCache = async () =>
  ((await chrome.storage.local.get(PRICE_CACHE_KEY))[PRICE_CACHE_KEY] ?? {}) as Record<string, { at: number; data: PcgsData }>;

const storePcgs = async (key: string, data: PcgsData) => {
  const cache = await readPriceCache();
  cache[key] = { at: Date.now(), data };
  const keys = Object.keys(cache);
  if (keys.length > PRICE_CACHE_MAX) {
    keys
      .sort((a, b) => cache[a]!.at - cache[b]!.at)
      .slice(0, keys.length - PRICE_CACHE_MAX)
      .forEach((k) => delete cache[k]);
  }
  await chrome.storage.local.set({ [PRICE_CACHE_KEY]: cache });
};

const pcgsGet = async (
  token: string,
  path: string,
  cacheKey: string,
  ttlMs = PRICE_CACHE_TTL_MS,
): Promise<{ data: PcgsData; cached?: boolean } | { error: string }> => {
  const entry = (await readPriceCache())[cacheKey];
  if (entry && Date.now() - entry.at < ttlMs) return { data: entry.data, cached: true };
  const usage = await readPcgsUsage();
  if (usage.calls >= PCGS_DAILY_LIMIT - PCGS_RESERVE) {
    return { error: `PCGS daily limit reached (${usage.calls}/${PCGS_DAILY_LIMIT}); cached prices still work` };
  }
  try {
    await setPcgsUsage({ ...usage, calls: usage.calls + 1 });
    const res = await fetchWithTimeout(`${PCGS_BASE}/${path}`, { headers: { Authorization: `bearer ${token}` } }, 5 * SECOND);
    const data = (await res.json().catch(() => ({}))) as PcgsData;
    if (res.status === 401 || res.status === 500) return { error: 'PCGS rejected the token. Generate a new one.' };
    if (res.status === 429) {
      // PCGS's own counter is authoritative; stop calling until tomorrow.
      await setPcgsUsage({ day: todayKey(), calls: PCGS_DAILY_LIMIT });
      return { error: 'PCGS daily limit (100 calls) used up; cached prices still work' };
    }
    if (!res.ok) return { error: `PCGS HTTP ${res.status}` };
    if (data.IsValidRequest === false) return { error: data.ServerMessage || 'PCGS: invalid request' };
    await storePcgs(cacheKey, data);
    return { data };
  } catch (err) {
    return { error: (err as Error).name === 'AbortError' ? 'PCGS took over 5s' : String((err as Error).message ?? err) };
  }
};

export const priceLookup = async (item: Partial<AppraisalItem>): Promise<PriceLookupResult> => {
  if (item.item_type && !isPcgsPriceable(item.item_type)) {
    const label = item.item_type === 'other' ? 'this item' : (ITEM_TYPE_LABEL[item.item_type]?.toLowerCase() ?? 'this item');
    return { ok: false, reason: 'no-id', error: `PCGS prices coins only, so ${label} uses the AI estimate.` };
  }
  const { pcgsToken: token } = await getAppraisalSettings();
  if (!token) return { ok: false, reason: 'no-token' };

  const cert = String(item.cert_number ?? '').replace(/\D/g, '');
  const isPcgsSlab = item.is_slabbed && /pcgs/i.test(item.grading_service ?? '');
  let source = '';
  let result: Awaited<ReturnType<typeof pcgsGet>> | null = null;

  if (isPcgsSlab && cert.length >= 6) {
    source = 'cert';
    result = await pcgsGet(token, `GetCoinFactsByCertNo/${cert}?retrieveAllData=true`, `cert:${cert}`, 7 * PRICE_CACHE_TTL_MS);
    // A misread cert is some other coin. Don't use its price, and don't fall through to a guessed spec number.
    if (result && 'data' in result && !matchesCoin(result.data, item, false)) {
      return { ok: false, reason: 'mismatch', error: `PCGS cert ${cert} is ${result.data.Name || 'a different coin'}, not this coin` };
    }
  }

  // A raw "VF-XF" midpoint is not a grade PCGS can price. Only a grade read off a holder is.
  const gradeNo = parseInt(String(item.grade_number ?? ''), 10);
  const pcgsNo = String(item.pcgs_number ?? '').replace(/\D/g, '');
  const slabGradeRead = Boolean(item.is_slabbed && item.grading_service?.trim() && item.grade?.trim() && gradeNo >= 1 && gradeNo <= 70);
  if ((!result || 'error' in result) && pcgsNo && slabGradeRead) {
    const plus = Boolean(item.plus_grade);
    source = 'grade';
    result = await pcgsGet(token, `GetCoinFactsByGrade?PCGSNo=${pcgsNo}&GradeNo=${gradeNo}&PlusGrade=${plus}`, `grade:${pcgsNo}:${gradeNo}:${plus}`);
    if ('data' in result && !matchesCoin(result.data, item)) {
      return { ok: false, reason: 'mismatch', error: `PCGS #${pcgsNo} is ${result.data.Name}, not this coin` };
    }
  }

  if (!result) return { ok: false, reason: 'no-id' };
  if ('error' in result) return { ok: false, reason: 'error', error: result.error, usage: await readPcgsUsage() };

  const data = result.data;
  if (data.ServerMessage && /no data/i.test(data.ServerMessage)) return { ok: false, reason: 'no-data' };

  const now = Date.now();
  let auctions = summarizeAuctions(data.AuctionList, now);
  // CoinFacts sometimes omits auctions; one APR call fills them in while quota allows.
  if (!auctions && data.PCGSNo && (await readPcgsUsage()).calls < PCGS_DAILY_LIMIT * 0.8) {
    const grade = parseInt(String(data.Grade ?? '').replace(/\D/g, ''), 10) || gradeNo;
    const plus = /\+/.test(data.Grade ?? '') || Boolean(item.plus_grade);
    if (grade) {
      const apr = await pcgsGet(
        token,
        `GetAPRByGrade?PCGSNo=${data.PCGSNo}&GradeNo=${grade}&PlusGrade=${plus}&NumberOfRecords=20`,
        `apr:${data.PCGSNo}:${grade}:${plus}`,
      );
      if ('data' in apr) auctions = summarizeAuctions(apr.data.Auctions, now);
    }
  }

  return {
    ok: true,
    source,
    cached: Boolean(result.cached),
    name: data.Name ?? '',
    grade: [data.Grade, data.Designation].filter(Boolean).join(' '),
    guide: Number(data.PriceGuideValue) > 0 ? Number(data.PriceGuideValue) : null,
    auctions,
    link: data.CoinFactsLink ?? null,
    usage: await readPcgsUsage(),
  };
};

const SHELDON = new Set([1, 2, 3, 4, 6, 8, 10, 12, 15, 20, 25, 30, 35, 40, 45, 50, 53, 55, 58, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70]);

const DENOM_OK: Record<string, RegExp> = {
  '1c': /\b1c\b|\bcent\b/i,
  '5c': /\b5c\b|\bnickel\b/i,
  '10c': /\b10c\b|\bdime\b/i,
  '25c': /\b25c\b|\bquarter\b/i,
  '50c': /\b50c\b|\bhalf\b/i,
  '$1': /\$1|\bdollar\b|\beagle\b/i,
};

const mintOf = (data: PcgsData): string | null => {
  if (typeof data.MintMark === 'string') return data.MintMark.toUpperCase().replace(/[^A-Z]/g, '').replace(/^P$/, '');
  const name = String(data.Name ?? '');
  const marked = name.match(/\b(?:1[6-9]\d\d|20\d\d)\s*-\s*(CC|[PDOSWpdosw])\b/i);
  if (marked) return marked[1]!.toUpperCase().replace(/^P$/, '');
  // A hyphen we could not read is not Philadelphia.
  if (/\b(?:1[6-9]\d\d|20\d\d)\s*-/.test(name)) return null;
  if (/\b(?:1[6-9]\d\d|20\d\d)\b/.test(name)) return '';
  return null;
};

const yearOf = (data: PcgsData): number | null => {
  const n = parseInt(String(data.Year ?? ''), 10);
  if (n) return n;
  const m = String(data.Name ?? '').match(/\b(1[6-9]\d\d|20\d\d)\b/);
  return m ? parseInt(m[1]!, 10) : null;
};

export interface GradeGuideQuery {
  pcgsNo: number;
  gradeNo: number;
  year: number;
  mint: string;
  denom: string;
}

// Price guide for a grade the listing states. One CoinFacts call, cached with the slab lookups.
// Year, mint, and denomination have to match so a wrong spec number cannot price a different coin.
export const gradeGuide = async (query: GradeGuideQuery): Promise<PriceLookupResult> => {
  const gradeNo = query.gradeNo;
  const pcgsNo = String(query.pcgsNo ?? '').replace(/\D/g, '');
  const denom = DENOM_OK[query.denom];
  if (!pcgsNo || !SHELDON.has(gradeNo) || !denom || !query.year) return { ok: false, reason: 'no-id' };
  const { pcgsToken: token } = await getAppraisalSettings();
  if (!token) return { ok: false, reason: 'no-token' };
  const result = await pcgsGet(token, `GetCoinFactsByGrade?PCGSNo=${pcgsNo}&GradeNo=${gradeNo}&PlusGrade=false`, `grade:${pcgsNo}:${gradeNo}:false`);
  if ('error' in result) return { ok: false, reason: 'error', error: result.error, usage: await readPcgsUsage() };
  const data = result.data;
  if (data.ServerMessage && /no data/i.test(data.ServerMessage)) return { ok: false, reason: 'no-data', usage: await readPcgsUsage() };
  const blob = `${data.Name ?? ''} ${data.Denomination ?? ''}`;
  const mint = mintOf(data);
  const wantMint = String(query.mint ?? '').toUpperCase().replace(/[^A-Z]/g, '').replace(/^P$/, '');
  if (yearOf(data) !== query.year || mint !== wantMint || !denom.test(blob)) {
    return { ok: false, reason: 'mismatch', error: `PCGS #${pcgsNo} is ${data.Name || 'a different coin'}`, usage: await readPcgsUsage() };
  }
  return {
    ok: true,
    source: 'grade',
    cached: Boolean(result.cached),
    name: data.Name ?? '',
    grade: [data.Grade, data.Designation].filter(Boolean).join(' '),
    guide: Number(data.PriceGuideValue) > 0 ? Number(data.PriceGuideValue) : null,
    auctions: summarizeAuctions(data.AuctionList, Date.now()),
    link: data.CoinFactsLink ?? null,
    usage: await readPcgsUsage(),
  };
};

export const testPcgs = async (): Promise<TestResult> => {
  const { pcgsToken } = await getAppraisalSettings();
  if (!pcgsToken) return { ok: false, error: 'No PCGS token saved yet' };
  // Sample coin from the PCGS API docs; cached for a day so repeat tests are free.
  const res = await pcgsGet(pcgsToken, 'GetCoinFactsByGrade?PCGSNo=98836&GradeNo=66&PlusGrade=false', 'grade:98836:66:false');
  const usage = await readPcgsUsage();
  return 'error' in res ? { ok: false, error: res.error } : { ok: true, detail: `${res.data.Name} · ${usage.calls}/${PCGS_DAILY_LIMIT} calls today` };
};

// --- Gemini vision ---

// Cheapest first by Gemini API paid-tier price per 1M input/output tokens (Oct 2026):
// 2.5 Flash-Lite $0.10/$0.40, 3.1 Flash-Lite $0.25/$1.50, 2.5 Flash $0.30/$2.50.
// Avoid "-latest" aliases: they point at the newest, priciest Flash.
const MODELS_BY_PRICE = ['gemini-2.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.5-flash-lite', 'gemini-2.5-flash'];
const DEFAULT_MODEL = MODELS_BY_PRICE[0]!;
const RETRYABLE_STATUS = new Set([404, 429, 500, 503, 504]);
// "Overloaded" and other server errors are per request, not per model, and aren't billed, so the
// same model is worth asking again after a short pause.
const TRANSIENT_STATUS = new Set([500, 503, 504]);
// The last step repeats until the deadline; jitter keeps retries from landing in lockstep.
const RETRY_BACKOFF_MS = [1 * SECOND, 2 * SECOND, 4 * SECOND];
const backoffMs = (attempt: number) => RETRY_BACKOFF_MS[Math.min(attempt, RETRY_BACKOFF_MS.length - 1)]! * (0.5 + Math.random());
// Every raced request is billed, so a backup model starts only when the leader is clearly stuck.
const HEDGE_MS = 5 * SECOND;
const MAX_IN_FLIGHT = 3;
// An overloaded Gemini sometimes holds a request open instead of answering 503.
const ATTEMPT_MS = 15 * SECOND;
const DEADLINE_MS = 30 * SECOND;
const MODEL_COOLDOWN_MS: Record<number, number> = { 429: 10 * MINUTE, 503: MINUTE, 404: DAY };
const plainConfigModels = new Set<string>();

interface GeminiBody {
  error?: { message?: string; details?: { retryDelay?: string }[] };
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  models?: { name: string; supportedGenerationMethods?: string[] }[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    cachedContentTokenCount?: number;
    promptTokensDetails?: { modality?: string; tokenCount?: number }[];
  };
}

export type CallUsage = Omit<GeminiUsage, 'since' | 'clicks'>;

const usageOf = (body: GeminiBody | null | undefined): CallUsage => {
  const u = body?.usageMetadata;
  return {
    input: u?.promptTokenCount ?? 0,
    image: (u?.promptTokensDetails ?? []).filter((d) => d.modality === 'IMAGE').reduce((sum, d) => sum + (d.tokenCount ?? 0), 0),
    cached: u?.cachedContentTokenCount ?? 0,
    output: (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0),
  };
};

// A table scan belongs to the click that started it, so it adds tokens without adding a click.
export const recordUsage = async (calls: CallUsage[], newClick = true) => {
  const total = { ...((await getItem('geminiUsage')) ?? emptyGeminiUsage()) };
  if (newClick) total.clicks += 1;
  for (const call of calls) {
    total.input += call.input;
    total.image += call.image;
    total.cached += call.cached;
    total.output += call.output;
  }
  await setItem('geminiUsage', total);
};

const geminiFetch = (path: string, apiKey: string, init: RequestInit, timeoutMs: number) =>
  fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/${path}`,
    { ...init, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey } },
    timeoutMs,
  );

const errorMessage = (res: Response, body: GeminiBody | null) => body?.error?.message ?? `Gemini HTTP ${res.status}`;
const isKeyError = (res: Response, message: string) =>
  [400, 401, 403].includes(res.status) && /api key|permission|unregistered/i.test(message);

// Gemini's 429s carry a RetryInfo detail like { retryDelay: "37s" }.
const retryDelayMs = (body: GeminiBody | null) => {
  const info = body?.error?.details?.find((d) => typeof d?.retryDelay === 'string');
  const seconds = info?.retryDelay ? parseFloat(info.retryDelay) : NaN;
  return Number.isFinite(seconds) ? seconds * SECOND : null;
};

const coolDownModel = async (model: string, status: number, retryAfterMs: number | null) => {
  const ms = retryAfterMs ?? MODEL_COOLDOWN_MS[status];
  if (!ms) return;
  const cooldowns = (await getSession('modelCooldowns')) ?? {};
  cooldowns[model] = Date.now() + ms;
  await setSession('modelCooldowns', cooldowns);
};

const modelFor = (s: AppraisalSettings) => s.geminiModel.trim() || DEFAULT_MODEL;

// Thinking adds seconds per answer; Gemini 2.5 takes a budget, newer models take a level.
const thinkingConfigFor = (model: string) => (/gemini-2\.5/.test(model) ? { thinkingBudget: 0 } : { thinkingLevel: 'minimal' });
// Cheapest model this key can call; used when the configured name is retired. Unknown models
// rank Flash-Lite before Flash, oldest first, since newer generations have cost more.
const pickCheapModel = async (apiKey: string) => {
  const res = await geminiFetch('models?pageSize=200', apiKey, {}, 15 * SECOND);
  if (!res.ok) return null;
  const { models = [] } = ((await res.json().catch(() => ({}))) as GeminiBody) ?? {};
  const names = models
    .filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''));
  const known = MODELS_BY_PRICE.find((m) => names.includes(m));
  if (known) return known;
  return (
    names
      .filter((n) => /flash/.test(n) && !/image|tts|live|audio|exp|preview|thinking|latest/.test(n))
      .sort((a, b) => Number(/lite/.test(b)) - Number(/lite/.test(a)) || a.localeCompare(b, undefined, { numeric: true }))[0] ?? null
  );
};

export const testProvider = async (provider: CloudProvider): Promise<TestResult> => {
  if (provider === 'gemini') return testGemini();
  const settings = await getAppraisalSettings();
  const key = providerKey(settings, provider).trim();
  const label = CLOUD_PROVIDER_LABEL[provider];
  if (!key) return { ok: false, error: `No ${label} key saved yet` };
  const url =
    provider === 'openai'
      ? 'https://api.openai.com/v1/models'
      : provider === 'anthropic'
        ? 'https://api.anthropic.com/v1/models'
        : 'https://openrouter.ai/api/v1/models';
  const headers: Record<string, string> =
    provider === 'anthropic'
      ? { 'x-api-key': key, 'anthropic-version': '2023-06-01' }
      : { Authorization: `Bearer ${key}` };
  try {
    const res = await fetchWithTimeout(url, { headers }, 15 * SECOND);
    if (res.ok) return { ok: true, detail: `${label} key works` };
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    return { ok: false, error: body?.error?.message ?? `${label} HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: (err as Error).name === 'AbortError' ? `${label} did not answer in 15s` : String((err as Error).message ?? err) };
  }
};

export const testGemini = async (): Promise<TestResult> => {
  const settings = await getAppraisalSettings();
  if (!settings.geminiApiKey) return { ok: false, error: 'No Gemini key saved yet' };
  const model = modelFor(settings);
  try {
    const res = await geminiFetch(`models/${encodeURIComponent(model)}`, settings.geminiApiKey, {}, 15 * SECOND);
    if (res.ok) return { ok: true, detail: `Key works with ${model}` };
    const message = errorMessage(res, (await res.json().catch(() => null)) as GeminiBody | null);
    if (res.status === 404) {
      const alt = await pickCheapModel(settings.geminiApiKey);
      if (alt) {
        await setItem('appraisalSettings', { ...settings, resolvedModel: alt });
        return { ok: true, detail: `${model} isn't available; switched to ${alt}` };
      }
    }
    return { ok: false, error: message };
  } catch (err) {
    return { ok: false, error: (err as Error).name === 'AbortError' ? 'Gemini did not answer in 15s' : String((err as Error).message ?? err) };
  }
};

interface RunResult {
  name: string;
  res?: Response;
  body?: GeminiBody;
  text?: string;
  error?: string;
  timedOut?: boolean;
}

interface RaceOutcome {
  // A good answer, or a failure that no other model would fix (bad key, bad request).
  result: RunResult | null;
  failures: RunResult[];
  elapsedMs: number;
}

// Starts the first model, then races the next one whenever the leader is slow or fails with a
// retryable status. Models that were merely overloaded or hung go to the back of the line after a
// short backoff and keep retrying until the deadline, so a busy minute doesn't end the appraisal
// after one try per model. First good answer wins.
const raceModels = (
  candidates: string[],
  run: (name: string, signal: AbortSignal) => Promise<RunResult>,
  external?: AbortSignal,
  deadlineMs = DEADLINE_MS,
) =>
  new Promise<RaceOutcome>((resolve) => {
    const started = Date.now();
    const queue = [...candidates];
    const controllers: AbortController[] = [];
    const retries: Record<string, number> = {};
    const failures: RunResult[] = [];
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let pending = 0;
    let done = false;
    let hedgeTimer: ReturnType<typeof setTimeout> | undefined;
    let onExternalAbort = () => {};
    const finish = (result: RunResult | null) => {
      if (done) return;
      done = true;
      external?.removeEventListener('abort', onExternalAbort);
      clearTimeout(hedgeTimer);
      clearTimeout(deadline);
      timers.forEach(clearTimeout);
      controllers.forEach((c) => c.abort());
      resolve({ result, failures, elapsedMs: Date.now() - started });
    };
    onExternalAbort = () => finish(null);
    const retryLater = (name: string) => {
      const attempt = retries[name] ?? 0;
      const delay = backoffMs(attempt);
      if (Date.now() + delay >= started + deadlineMs) return;
      retries[name] = attempt + 1;
      const timer = setTimeout(() => {
        timers.delete(timer);
        queue.push(name);
        launch();
      }, delay);
      timers.add(timer);
    };
    const launch = () => {
      if (done || pending >= MAX_IN_FLIGHT) return;
      const name = queue.shift();
      if (!name) {
        if (pending === 0 && timers.size === 0) finish(null);
        return;
      }
      const controller = new AbortController();
      controllers.push(controller);
      pending += 1;
      clearTimeout(hedgeTimer);
      hedgeTimer = setTimeout(launch, HEDGE_MS);
      void run(name, controller.signal).then((result) => {
        pending -= 1;
        if (done) return;
        if (result.res?.ok) return finish(result);
        failures.push(result);
        if (result.res && !RETRYABLE_STATUS.has(result.res.status)) return finish(result);
        if (!result.res || TRANSIENT_STATUS.has(result.res.status)) retryLater(name);
        launch();
      });
    };
    const deadline = setTimeout(() => finish(null), Math.max(1, deadlineMs));
    if (external?.aborted) return finish(null);
    external?.addEventListener('abort', onExternalAbort);
    launch();
  });

const failureMessage = ({ failures, elapsedMs }: RaceOutcome, label = 'Gemini') => {
  const tried = [...new Set(failures.map((f) => f.name))].join(', ');
  const statuses = failures.map((f) => f.res?.status);
  const seconds = Math.round(elapsedMs / SECOND);
  if (!failures.length) return `${label} did not answer within ${seconds}s. Try again.`;
  if (statuses.every((s) => s === 429)) return `${label} is rate-limiting this key (${tried}). Try again in a few minutes.`;
  if (statuses.some((s) => s !== undefined && TRANSIENT_STATUS.has(s))) {
    return `${label} is overloaded right now: ${failures.length} tries across ${tried} in ${seconds}s. Try again in a minute.`;
  }
  if (failures.every((f) => f.timedOut)) return `${label} did not answer in time (${tried}). Try again.`;
  const last = failures[failures.length - 1]!;
  return last.error ?? (last.res ? errorMessage(last.res, last.body ?? null) : `${label} did not answer (${tried}). Try again.`);
};

// Jewelry melt comes only from the stamp and scale weight read off the frame; a model's own weight
// guess for a ring or chain is not something to bid on.
const withMelt = async (item: AppraisalItem) => {
  const known = SERIES[item.series_key];
  const piece = !known && !isPcgsPriceable(item.item_type) ? jewelryFineOz(item) : null;
  const metal = known?.metal ?? piece?.metal ?? item.metal;
  const oz = known?.oz ?? piece?.oz ?? (item.item_type === 'jewelry_watch' ? null : capFineOz(item.item_name ?? '', item.fine_weight_oz ?? null));
  const quantity = Math.max(1, item.quantity || 1);
  const spot = oz && isMetal(metal) ? await getSpot(metal) : null;
  const melt = spot && oz && isMetal(metal) ? meltFor(metal, oz, quantity, spot) : null;
  return { item: { ...item, quantity }, melt };
};

// A fast on-device answer is free, so cloud stays quiet for this long. After that the two run
// together and the first good answer is the one we show. Waiting out a slow on-device model
// (often the whole 10s timeout) was holding every appraisal before a cloud model even started.
export const ON_DEVICE_HEADSTART_MS = 2 * SECOND;

const fromLocal = async (local: Extract<OnDeviceResult, { ok: true }>): Promise<GeminiResult> => ({
  ok: true,
  ...(await withMelt(local.item)),
  others: local.others,
  model: ON_DEVICE_MODEL,
});

const noBackup = (local: Extract<OnDeviceResult, { ok: false }>): GeminiResult =>
  local.unavailable
    ? { ok: false, needsKey: true, error: 'Set up the on-device model, add a cloud AI key, or add an Ollama server first' }
    : { ok: false, error: `On-device model failed (${local.error}) and there is no cloud or Ollama backup` };

// On-device starts immediately. Saved cloud providers run next, preferred first, if on-device
// fails or is still quiet after the head start. Another saved provider and Ollama start if the
// preferred provider fails or is still quiet after HEDGE_MS. The first good answer wins.
const appraiseUncached = async ({ image, ...context }: AppraisalContext & { image: string }): Promise<GeminiResult> => {
  const settings = await getAppraisalSettings();
  if (settings.ollamaOnly) {
    if (!ollamaReady(settings)) return { ok: false, error: 'Ollama-only is on. Add the server URL and a vision model in Settings.' };
    return appraiseWithOllama(settings, image, context, AbortSignal.timeout(DEADLINE_MS), Date.now() + DEADLINE_MS);
  }

  const providers = providersWithKeys(settings);
  const ollama = ollamaReady(settings);
  const cloud = (signal: AbortSignal): Promise<GeminiResult> | null => {
    if (!providers.length && !ollama) return null;
    const deadlineAt = Date.now() + DEADLINE_MS;
    if (!providers.length) return appraiseWithOllama(settings, image, context, signal, deadlineAt);
    return raceCloud(
      providers.map((provider) => (jobSignal, deadline) => appraiseProvider(settings, provider, image, context, jobSignal, deadline)),
      ollama ? (jobSignal, deadline) => appraiseWithOllama(settings, image, context, jobSignal, deadline) : null,
      signal,
    );
  };

  const abortLocal = new AbortController();
  const localPromise = appraiseOnDevice(image, context, abortLocal.signal);
  let headStartTimer: ReturnType<typeof setTimeout> | undefined;
  const headStart = new Promise<null>((resolve) => {
    headStartTimer = setTimeout(() => resolve(null), ON_DEVICE_HEADSTART_MS);
  });
  const early = await Promise.race([localPromise.then((result) => ({ result }) as const), headStart]);
  clearTimeout(headStartTimer);

  if (early) {
    if (early.result.ok) return fromLocal(early.result);
    return (await cloud(AbortSignal.timeout(DEADLINE_MS))) ?? noBackup(early.result);
  }

  const abortCloud = new AbortController();
  const backup = cloud(abortCloud.signal);
  if (!backup) {
    const local = await localPromise;
    return local.ok ? fromLocal(local) : noBackup(local);
  }

  return new Promise((resolve) => {
    let won = false;
    let localDone = false;
    let cloudDone = false;
    let cloudResult: GeminiResult | undefined;
    const finishCloud = () => {
      if (won || !localDone || !cloudDone || !cloudResult) return;
      won = true;
      resolve(cloudResult);
    };
    localPromise.then((local) => {
      localDone = true;
      if (won) return;
      if (local.ok) {
        won = true;
        abortCloud.abort();
        resolve(fromLocal(local));
        return;
      }
      finishCloud();
    });
    backup.then((result) => {
      cloudDone = true;
      cloudResult = result;
      if (won) return;
      if (result.ok) {
        won = true;
        abortLocal.abort();
        resolve(result);
        return;
      }
      finishCloud();
    });
  });
};

// Same pixels, same answer. A moving video misses. A second click on a held frame does not
// wait on the model again. Melt is recomputed so a stale spot price is not what we show.
const FRAME_TTL_MS = 10 * MINUTE;
const FRAME_MAX = 20;

const frameHash = async (image: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(image));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

const readFrame = async (image: string) => {
  const hit = (await getSession('frameCache'))?.[await frameHash(image)];
  if (!hit || Date.now() - hit.at > FRAME_TTL_MS) return null;
  return hit;
};

const writeFrame = async (image: string, result: Extract<GeminiResult, { ok: true }>) => {
  const cache = { ...((await getSession('frameCache')) ?? {}) };
  const now = Date.now();
  for (const [key, entry] of Object.entries(cache)) if (now - entry.at > FRAME_TTL_MS) delete cache[key];
  cache[await frameHash(image)] = { at: now, item: result.item, others: result.others, model: result.model };
  const extra = Object.keys(cache).sort((a, b) => cache[a]!.at - cache[b]!.at).slice(0, Math.max(0, Object.keys(cache).length - FRAME_MAX));
  extra.forEach((key) => delete cache[key]);
  await setSession('frameCache', cache);
};

export const appraise = async (input: AppraisalContext & { image: string }): Promise<GeminiResult> => {
  void warmSpots();
  // The show type changes the reading hint, so the same frame under another type is a miss.
  const frameKey = `${input.showType ?? 'general'}|${input.image}`;
  const hit = await readFrame(frameKey);
  if (hit) return { ok: true, ...(await withMelt(hit.item)), others: hit.others, model: hit.model };
  const result = await appraiseUncached(input);
  if (result.ok) await writeFrame(frameKey, result);
  return result;
};

// One model's attempt; models that reject the fast settings get the plain request from now on.
const geminiRunner =
  (settings: AppraisalSettings, bodyFor: (name: string, fast: boolean) => string) =>
  async (name: string, signal: AbortSignal): Promise<RunResult> => {
    const call = (fast: boolean) =>
      geminiFetch(`models/${encodeURIComponent(name)}:generateContent`, settings.geminiApiKey, { method: 'POST', body: bodyFor(name, fast), signal }, ATTEMPT_MS);
    try {
      const fast = !plainConfigModels.has(name);
      let res = await call(fast);
      let body = (await res.json().catch(() => ({}))) as GeminiBody;
      // Models that reject the thinking setting get the plain request from now on.
      if (fast && res.status === 400 && !isKeyError(res, errorMessage(res, body))) {
        plainConfigModels.add(name);
        res = await call(false);
        body = (await res.json().catch(() => ({}))) as GeminiBody;
      }
      if (!res.ok) void coolDownModel(name, res.status, retryDelayMs(body));
      return { name, res, body };
    } catch (err) {
      if ((err as Error).name === 'AbortError') return { name, error: `${name} took too long`, timedOut: !signal.aborted };
      return { name, error: String((err as Error).message ?? err) };
    }
  };

const candidateModels = async (settings: AppraisalSettings) => {
  const all = [...new Set([modelFor(settings), ...MODELS_BY_PRICE, settings.resolvedModel].filter((m): m is string => Boolean(m)))];
  const cooldowns = (await getSession('modelCooldowns')) ?? {};
  const cooling = (m: string) => (cooldowns[m] ?? 0) > Date.now();
  // Models that failed recently go last rather than being skipped: overload clears in seconds.
  return [...all.filter((m) => !cooling(m)), ...all.filter(cooling)];
};

const appraiseWithGemini = async (
  settings: AppraisalSettings,
  image: string,
  context: AppraisalContext,
  signal?: AbortSignal,
  deadlineAt = Date.now() + DEADLINE_MS,
): Promise<GeminiResult> => {
  const parts = [{ text: appraisalContext(context) }, { inline_data: { mime_type: 'image/jpeg', data: image } }];
  const bodyFor = (name: string, fast: boolean) =>
    JSON.stringify({
      systemInstruction: { parts: [{ text: APPRAISAL_INSTRUCTIONS }] },
      contents: [{ role: 'user', parts }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: APPRAISAL_SCHEMA,
        ...(fast ? { thinkingConfig: thinkingConfigFor(name) } : {}),
      },
    });
  const outcome = await raceModels(await candidateModels(settings), geminiRunner(settings, bodyFor), signal, deadlineAt - Date.now());
  const winner = outcome.result;
  const res = winner?.res;
  const body = winner?.body ?? null;

  if (!res) return { ok: false, error: failureMessage(outcome) };
  if (!res.ok) {
    const message = errorMessage(res, body);
    return { ok: false, needsKey: isKeyError(res, message), error: message };
  }

  const calls = [usageOf(body)];
  const candidate = body?.candidates?.[0];
  let item: AppraisalItem;
  let others: ReturnType<typeof parseOthers>;
  try {
    ({ item, others } = parsedAnswer(answerText(body)));
  } catch {
    void recordUsage(calls);
    return { ok: false, error: `Gemini gave no usable answer (${candidate?.finishReason ?? body?.promptFeedback?.blockReason ?? 'empty answer'})` };
  }

  const model = winner?.name ?? modelFor(settings);
  const priced = await withMelt(item);
  if (item.is_collectible && !priced.melt && !estimateOf(item)) {
    const followUp = await priceFollowUp(settings.geminiApiKey, model, priced.item);
    Object.assign(priced.item, followUp.price);
    if (followUp.usage) calls.push(followUp.usage);
  }
  void recordUsage(calls);
  return { ok: true, ...priced, others, model };
};

export type GeminiJson = { ok: true; text: string; model: string; usage?: CallUsage } | { ok: false; error: string; needsKey?: boolean };

// JSON with the same model racing, retries and cooldowns as appraisals. An image is read at the
// model's default resolution: these run ahead of the click, and small handwriting needs it.
export const geminiJson = async (system: string, prompt: string, schema: object, image?: string): Promise<GeminiJson> => {
  const settings = await getAppraisalSettings();
  if (settings.ollamaOnly) return ollamaJson(settings, system, prompt, schema, image);
  const providers = providersWithKeys(settings);
  const ollama = ollamaReady(settings);
  if (!providers.length && !ollama) return { ok: false, needsKey: true, error: 'no cloud key' };
  if (!providers.length) return ollamaJson(settings, system, prompt, schema, image);
  return raceCloud(
    providers.map(
      (provider) => (signal, deadlineAt) =>
        askProvider(settings, provider, system, prompt, schema, image, signal, deadlineAt),
    ),
    ollama ? (signal, deadlineAt) => ollamaJson(settings, system, prompt, schema, image, deadlineAt, signal) : null,
  );
};

const answerText = (body: GeminiBody | null) =>
  (body?.candidates?.[0]?.content?.parts ?? [])
    .filter((p) => !p.thought && typeof p.text === 'string')
    .map((p) => p.text)
    .join('');

const parseJsonObject = (text: string) => {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('no json');
    return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
  }
};

const parsedAnswer = (text: string) => {
  const parsed = parseJsonObject(text) as AppraisalItem & { others?: unknown };
  const others = parseOthers(parsed.others);
  delete parsed.others;
  return { item: parsed, others };
};

const PRICE_SCHEMA = {
  type: 'OBJECT',
  properties: { estimate_low_usd: { type: 'NUMBER' }, estimate_high_usd: { type: 'NUMBER' } },
  required: ['estimate_low_usd', 'estimate_high_usd'],
};

const pricePrompt = (item: AppraisalItem) =>
  [
    'Give the per-piece US price range where most recent sold copies of this item land (eBay sold or Whatnot), not asking prices. Keep high at most about 2x low; if unsure, center it on what similar items commonly sell for. Do not answer 0.',
    `Item: ${item.item_name}`,
    item.grade || item.grade_estimate ? `Condition: ${item.grade ?? item.grade_estimate}` : '',
    item.notes ? `Notes: ${item.notes}` : '',
  ]
    .filter(Boolean)
    .join('\n');

// Small models sometimes identify an item but skip its price. A text-only second ask is cheap
// (no image) and only runs when nothing else could value the item.
const priceFollowUp = async (
  apiKey: string,
  model: string,
  item: AppraisalItem,
): Promise<{ price: Partial<Pick<AppraisalItem, 'estimate_low_usd' | 'estimate_high_usd'>>; usage: CallUsage | null }> => {
  const prompt = pricePrompt(item);
  try {
    const res = await geminiFetch(
      `models/${encodeURIComponent(model)}:generateContent`,
      apiKey,
      {
        method: 'POST',
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json',
            responseSchema: PRICE_SCHEMA,
            ...(plainConfigModels.has(model) ? {} : { thinkingConfig: thinkingConfigFor(model) }),
          },
        }),
      },
      8 * SECOND,
    );
    if (!res.ok) return { price: {}, usage: null };
    const body = (await res.json()) as GeminiBody;
    const usage = usageOf(body);
    try {
      const price = JSON.parse(answerText(body)) as Pick<AppraisalItem, 'estimate_low_usd' | 'estimate_high_usd'>;
      return { price: estimateOf(price) ? price : {}, usage };
    } catch {
      return { price: {}, usage };
    }
  } catch {
    return { price: {}, usage: null };
  }
};

// --- Ollama backup ---

const GEMINI_JSON_TYPES: Record<string, string> = {
  OBJECT: 'object',
  ARRAY: 'array',
  STRING: 'string',
  NUMBER: 'number',
  INTEGER: 'integer',
  BOOLEAN: 'boolean',
};

// Gemini's schema dialect (uppercase types, nullable) restated as JSON Schema for Ollama.
const toJsonSchema = (schema: unknown): unknown => {
  if (Array.isArray(schema)) return schema.map(toJsonSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const src = schema as Record<string, unknown>;
  const nullable = src.nullable === true;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(src)) {
    if (key === 'nullable') continue;
    out[key] = key === 'type' && typeof value === 'string' ? (GEMINI_JSON_TYPES[value] ?? value.toLowerCase()) : toJsonSchema(value);
  }
  if (nullable && typeof out.type === 'string') out.type = [out.type, 'null'];
  return out;
};

const ollamaBase = (raw: string) => {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
};

const ollamaReady = (settings: AppraisalSettings) => Boolean(ollamaBase(settings.ollamaBaseUrl) && settings.ollamaModel.trim());

// Tests stub chrome without the permissions API. A missing API means "don't block the call".
const ollamaPermitted = async (base: string) => {
  const hostname = new URL(base).hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
  if (typeof chrome.permissions?.contains !== 'function') return true;
  try {
    return await chrome.permissions.contains({ origins: [`${new URL(base).origin}/*`] });
  } catch {
    return false;
  }
};

interface OllamaChat {
  error?: string;
  message?: { content?: unknown; thinking?: unknown };
}

// An empty 403 is Ollama's CORS check. It allows curl (no Origin) and rejects
// Chrome, which always sends Origin: chrome-extension://<id>.
const ollamaHttpError = (status: number, body: OllamaChat | null) => {
  if (body?.error) return body.error;
  if (status === 403) return 'Ollama refused this extension. Set OLLAMA_ORIGINS=chrome-extension://* on the Ollama server behind this port, then restart it.';
  return `Ollama HTTP ${status}`;
};

const asText = (value: unknown) => {
  if (typeof value === 'string') return value;
  return value && typeof value === 'object' ? JSON.stringify(value) : '';
};

// qwen3-vl writes the JSON into thinking and leaves content empty, even with think turned off.
const ollamaText = (body: OllamaChat | null) => {
  const content = asText(body?.message?.content).trim();
  const thinking = asText(body?.message?.thinking).trim();
  if (!content) return thinking;
  try {
    parseJsonObject(content);
    return content;
  } catch {
    return thinking || content;
  }
};

// Loads the weights before the click. Ollama keeps the system-prompt cache while this model
// stays resident; a text ping is enough to load it and does not sit on the GPU during an appraisal.
let warming: Promise<void> | null = null;
let warmedModel = '';

export const warmOllama = () => {
  if (warming) return;
  warming = (async () => {
    const settings = await getAppraisalSettings();
    const model = settings.ollamaModel.trim();
    const base = ollamaBase(settings.ollamaBaseUrl);
    if (!base || !model || warmedModel === `${base}|${model}`) return;
    if (!(await ollamaPermitted(base))) return;
    const deadlineAt = Date.now() + 20 * SECOND;
    const { res } = await ollamaChat(
      base,
      {
        model,
        stream: false,
        think: false,
        keep_alive: '30m',
        options: { temperature: 0, num_predict: 1 },
        messages: [{ role: 'user', content: 'ok' }],
      },
      AbortSignal.timeout(20 * SECOND),
      deadlineAt,
    );
    if (res.ok) warmedModel = `${base}|${model}`;
  })()
    .catch(() => undefined)
    .finally(() => {
      warming = null;
    });
};

const ollamaChat = async (base: string, payload: object, signal: AbortSignal, deadlineAt: number) => {
  const res = await fetchWithTimeout(
    `${base}/api/chat`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal },
    Math.max(SECOND, deadlineAt - Date.now()),
  );
  const body = (await res.json().catch(() => null)) as OllamaChat | null;
  return { res, body };
};

const ollamaPrice = async (base: string, model: string, item: AppraisalItem, signal: AbortSignal, deadlineAt: number) => {
  if (deadlineAt - Date.now() < 2 * SECOND) return {};
  try {
    const { res, body } = await ollamaChat(
      base,
      {
        model,
        stream: false,
        think: false,
        format: toJsonSchema(PRICE_SCHEMA),
        keep_alive: '30m',
        options: { temperature: 0.2, num_predict: 80 },
        messages: [{ role: 'user', content: pricePrompt(item) }],
      },
      signal,
      deadlineAt,
    );
    if (!res.ok) return {};
    const price = JSON.parse(ollamaText(body)) as Pick<AppraisalItem, 'estimate_low_usd' | 'estimate_high_usd'>;
    return estimateOf(price) ? price : {};
  } catch {
    return {};
  }
};

// JSON for wheel prizes when cloud Gemini is turned off.
const ollamaJson = async (
  settings: AppraisalSettings,
  system: string,
  prompt: string,
  schema: object,
  image?: string,
  deadlineAt = Date.now() + DEADLINE_MS,
  signal?: AbortSignal,
): Promise<GeminiJson> => {
  const base = ollamaBase(settings.ollamaBaseUrl);
  const model = settings.ollamaModel.trim();
  if (!base || !model) return { ok: false, error: 'Ollama-only is on. Add the server URL and a model in Settings.' };
  if (!(await ollamaPermitted(base))) return { ok: false, error: `This extension can't reach ${base}. Save the server again and allow access.` };
  const own = AbortSignal.timeout(Math.max(1, deadlineAt - Date.now()));
  const used = signal ? AbortSignal.any([signal, own]) : own;
  const payload = (structured: boolean) => ({
    model,
    stream: false,
    keep_alive: '30m',
    options: { temperature: 0.2, num_predict: 1024 },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt, ...(image ? { images: [image] } : {}) },
    ],
    ...(structured ? { think: false, format: toJsonSchema(schema) } : { format: 'json' }),
  });
  try {
    let { res, body } = await ollamaChat(base, payload(true), used, deadlineAt);
    if (res.status === 400 && /think|format|schema/i.test(body?.error ?? '')) {
      ({ res, body } = await ollamaChat(base, payload(false), used, deadlineAt));
    }
    if (!res.ok) return { ok: false, error: ollamaHttpError(res.status, body) };
    const text = ollamaText(body).trim();
    if (!text) return { ok: false, error: 'Ollama gave no usable answer' };
    return { ok: true, text, model: `ollama:${model}` };
  } catch (err) {
    if (signal?.aborted) return { ok: false, error: 'Ollama stopped' };
    if ((err as Error).name === 'AbortError') return { ok: false, error: 'Ollama took too long' };
    return { ok: false, error: `Can't reach Ollama at ${base}` };
  }
};

const appraiseWithOllama = async (
  settings: AppraisalSettings,
  image: string,
  context: AppraisalContext,
  signal: AbortSignal,
  deadlineAt: number,
): Promise<GeminiResult> => {
  const base = ollamaBase(settings.ollamaBaseUrl);
  const model = settings.ollamaModel.trim();
  if (!base || !model) return { ok: false, error: 'Add the Ollama server URL and a vision model first' };
  if (!(await ollamaPermitted(base))) return { ok: false, error: `This extension can't reach ${base}. Save the server again and allow access.` };
  const payload = (structured: boolean) => ({
    model,
    stream: false,
    keep_alive: '30m',
    options: { temperature: 0.2, num_predict: 1024 },
    messages: [
      { role: 'system', content: APPRAISAL_INSTRUCTIONS },
      { role: 'user', content: appraisalContext(context), images: [image] },
    ],
    ...(structured ? { think: false, format: toJsonSchema(APPRAISAL_SCHEMA) } : { format: 'json' }),
  });
  try {
    let { res, body } = await ollamaChat(base, payload(true), signal, deadlineAt);
    // Older servers reject `think` or a JSON schema. A plain JSON format still constrains the answer.
    if (res.status === 400 && /think|format|schema/i.test(body?.error ?? '')) {
      ({ res, body } = await ollamaChat(base, payload(false), signal, deadlineAt));
    }
    if (!res.ok) return { ok: false, error: ollamaHttpError(res.status, body) };
    let item: AppraisalItem;
    let others: ReturnType<typeof parseOthers>;
    try {
      ({ item, others } = parsedAnswer(ollamaText(body)));
    } catch {
      return { ok: false, error: 'Ollama gave no usable answer' };
    }
    const priced = await withMelt(item);
    if (item.is_collectible && !priced.melt && !estimateOf(item)) {
      Object.assign(priced.item, await ollamaPrice(base, model, priced.item, signal, deadlineAt));
    }
    return { ok: true, ...priced, others, model: `ollama:${model}` };
  } catch (err) {
    if (signal.aborted) return { ok: false, error: 'Ollama stopped' };
    if ((err as Error).name === 'AbortError') return { ok: false, error: 'Ollama took too long' };
    return { ok: false, error: `Can't reach Ollama at ${base}` };
  }
};

type Failable = { ok: boolean; error?: string; needsKey?: boolean };

const AUTO_MODELS: Record<Exclude<CloudProvider, 'gemini'>, string[]> = {
  openai: ['gpt-5-nano', 'gpt-5.4-nano'],
  anthropic: ['claude-haiku-5-5', 'claude-haiku-4-5'],
  openrouter: ['openai/gpt-5-nano', 'anthropic/claude-haiku-5.5'],
};

const plainCloud = new Set<string>();

const modelsFor = async (settings: AppraisalSettings, provider: CloudProvider) => {
  if (provider === 'gemini') return candidateModels(settings);
  const typed = providerModel(settings, provider).trim();
  const all = [...new Set([typed, ...AUTO_MODELS[provider]].filter((name): name is string => Boolean(name)))];
  const cooldowns = (await getSession('modelCooldowns')) ?? {};
  const cooling = (name: string) => (cooldowns[name] ?? 0) > Date.now();
  return [...all.filter((name) => !cooling(name)), ...all.filter(cooling)];
};

const namedModel = (provider: CloudProvider, model: string) => (provider === 'gemini' ? model : `${provider}:${model}`);

interface ForeignBody {
  error?: { message?: string };
  choices?: { message?: { content?: string } }[];
  content?: { text?: string }[];
}

const foreignText = (provider: CloudProvider, body: ForeignBody | null) =>
  provider === 'anthropic' ? (body?.content ?? []).map((part) => part.text ?? '').join('') : (body?.choices?.[0]?.message?.content ?? '');

const foreignBody = (
  provider: Exclude<CloudProvider, 'gemini'>,
  model: string,
  system: string,
  prompt: string,
  schema: object,
  image: string | undefined,
  plain: boolean,
) => {
  const schemaJson = toJsonSchema(schema);
  if (provider === 'anthropic') {
    const content = [
      ...(image ? [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } }] : []),
      { type: 'text', text: prompt },
    ];
    return JSON.stringify({
      model,
      max_tokens: 2048,
      ...(system ? { system } : {}),
      messages: [{ role: 'user', content }],
      ...(plain ? {} : { output_config: { format: { type: 'json_schema', schema: schemaJson } } }),
    });
  }
  const user = image
    ? [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image}` } },
      ]
    : prompt;
  return JSON.stringify({
    model,
    messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: user }],
    ...(plain
      ? {}
      : {
          reasoning_effort: 'minimal',
          response_format: { type: 'json_schema', json_schema: { name: 'answer', strict: false, schema: schemaJson } },
        }),
  });
};

const askProvider = async (
  settings: AppraisalSettings,
  provider: CloudProvider,
  system: string,
  prompt: string,
  schema: object,
  image: string | undefined,
  signal: AbortSignal | undefined,
  deadlineAt: number,
): Promise<GeminiJson> => {
  const label = CLOUD_PROVIDER_LABEL[provider];
  if (provider === 'gemini') {
    const parts = image ? [{ text: prompt }, { inline_data: { mime_type: 'image/jpeg', data: image } }] : [{ text: prompt }];
    const bodyFor = (name: string, fast: boolean) =>
      JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
          responseSchema: schema,
          ...(fast ? { thinkingConfig: thinkingConfigFor(name) } : {}),
        },
      });
    const outcome = await raceModels(await modelsFor(settings, provider), geminiRunner(settings, bodyFor), signal, deadlineAt - Date.now());
    const res = outcome.result?.res;
    if (!res) return { ok: false, error: failureMessage(outcome, label) };
    const body = outcome.result?.body ?? null;
    if (!res.ok) {
      const message = errorMessage(res, body);
      return { ok: false, needsKey: isKeyError(res, message), error: message };
    }
    return { ok: true, text: answerText(body), model: outcome.result!.name, usage: usageOf(body) };
  }

  const key = providerKey(settings, provider).trim();
  const url =
    provider === 'openai'
      ? 'https://api.openai.com/v1/chat/completions'
      : provider === 'anthropic'
        ? 'https://api.anthropic.com/v1/messages'
        : 'https://openrouter.ai/api/v1/chat/completions';
  const headers: Record<string, string> =
    provider === 'anthropic'
      ? { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' }
      : { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };
  const run = async (name: string, runSignal: AbortSignal): Promise<RunResult> => {
    const plain = plainCloud.has(`${provider}:${name}`);
    const call = (bare: boolean) =>
      fetchWithTimeout(
        url,
        { method: 'POST', headers, body: foreignBody(provider, name, system, prompt, schema, image, bare), signal: runSignal },
        Math.min(ATTEMPT_MS, Math.max(1, deadlineAt - Date.now())),
      );
    try {
      let res = await call(plain);
      let body = (await res.json().catch(() => ({}))) as ForeignBody;
      if (!plain && res.status === 400) {
        plainCloud.add(`${provider}:${name}`);
        res = await call(true);
        body = (await res.json().catch(() => ({}))) as ForeignBody;
      }
      if (!res.ok) void coolDownModel(name, res.status, null);
      return { name, res, text: foreignText(provider, body), error: body.error?.message };
    } catch (err) {
      if ((err as Error).name === 'AbortError') return { name, error: `${name} took too long`, timedOut: !runSignal.aborted };
      return { name, error: String((err as Error).message ?? err) };
    }
  };
  const outcome = await raceModels(await modelsFor(settings, provider), run, signal, deadlineAt - Date.now());
  const res = outcome.result?.res;
  if (!res) return { ok: false, error: failureMessage(outcome, label) };
  if (!res.ok) {
    const message = outcome.result?.error || `${label} HTTP ${res.status}`;
    return { ok: false, needsKey: isKeyError(res, message), error: message.includes(label) ? message : `${label}: ${message}` };
  }
  const text = outcome.result?.text ?? '';
  if (!text) return { ok: false, error: `${label} gave no usable answer` };
  return { ok: true, text, model: namedModel(provider, outcome.result!.name) };
};

const appraiseProvider = async (
  settings: AppraisalSettings,
  provider: CloudProvider,
  image: string,
  context: AppraisalContext,
  signal: AbortSignal,
  deadlineAt: number,
): Promise<GeminiResult> => {
  if (provider === 'gemini') return appraiseWithGemini(settings, image, context, signal, deadlineAt);
  const asked = await askProvider(settings, provider, APPRAISAL_INSTRUCTIONS, appraisalContext(context), APPRAISAL_SCHEMA, image, signal, deadlineAt);
  if (!asked.ok) return asked;
  let item: AppraisalItem;
  let others: ReturnType<typeof parseOthers>;
  try {
    ({ item, others } = parsedAnswer(asked.text));
  } catch {
    return { ok: false, error: `${CLOUD_PROVIDER_LABEL[provider]} gave no usable answer` };
  }
  const priced = await withMelt(item);
  if (item.is_collectible && !priced.melt && !estimateOf(item)) {
    const follow = await askProvider(settings, provider, '', pricePrompt(item), PRICE_SCHEMA, undefined, signal, deadlineAt);
    if (follow.ok) {
      try {
        const price = JSON.parse(follow.text) as Pick<AppraisalItem, 'estimate_low_usd' | 'estimate_high_usd'>;
        if (estimateOf(price)) Object.assign(priced.item, price);
      } catch {
        // The identification still stands without a guessed price.
      }
    }
  }
  return { ok: true, ...priced, others, model: asked.model };
};

// Preferred provider first. One other saved provider may run beside it, and Ollama starts at the
// same hedge. The first good answer inside the deadline wins. external aborts the race when an
// on-device answer already won, so the backup does not keep calling models.
const raceCloud = <T extends Failable>(
  jobs: Array<(signal: AbortSignal, deadlineAt: number) => Promise<T>>,
  ollama: ((signal: AbortSignal, deadlineAt: number) => Promise<T>) | null,
  external?: AbortSignal,
): Promise<T> => {
  const deadlineAt = Date.now() + DEADLINE_MS;
  return new Promise((resolve) => {
    let settled = false;
    let cursor = 0;
    let active = 0;
    const controllers: AbortController[] = [];
    const errors: T[] = [];
    let ollamaController: AbortController | null = null;
    let ollamaStarted = false;
    let ollamaDone = !ollama;
    let ollamaError: T | null = null;
    let hedge: ReturnType<typeof setTimeout> | undefined;
    let onExternalAbort = () => {};

    const finish = (result: T) => {
      if (settled) return;
      settled = true;
      external?.removeEventListener('abort', onExternalAbort);
      clearTimeout(hedge);
      controllers.forEach((controller) => controller.abort());
      ollamaController?.abort();
      resolve(result);
    };
    const combined = (): T => {
      const cloud = errors.map((failure) => failure.error).filter(Boolean).join(' ');
      const error = ollamaError?.error ? `${cloud} Ollama backup: ${ollamaError.error}`.trim() : cloud || 'No cloud provider answered';
      return { ok: false, error, needsKey: errors.length > 0 && errors.every((failure) => failure.needsKey) } as T;
    };
    onExternalAbort = () => finish(combined());
    const maybeFinish = () => {
      if (settled || active > 0 || !ollamaDone) return;
      if (cursor < jobs.length && Date.now() < deadlineAt) {
        launch();
        return;
      }
      finish(combined());
    };
    const startOllama = () => {
      if (!ollama || ollamaStarted || settled) return;
      ollamaStarted = true;
      ollamaDone = false;
      ollamaController = new AbortController();
      void ollama(ollamaController.signal, deadlineAt).then((result) => {
        if (settled) return;
        if (result.ok) return finish(result);
        ollamaError = result;
        ollamaDone = true;
        maybeFinish();
      });
    };
    const launch = () => {
      if (settled || active >= 2 || cursor >= jobs.length || Date.now() >= deadlineAt) {
        maybeFinish();
        return;
      }
      const job = jobs[cursor]!;
      cursor += 1;
      const controller = new AbortController();
      controllers.push(controller);
      active += 1;
      if (cursor === 1) {
        hedge = setTimeout(() => {
          if (settled) return;
          startOllama();
          if (cursor === 1) launch();
        }, HEDGE_MS);
      }
      void job(controller.signal, deadlineAt).then((result) => {
        active -= 1;
        if (settled) return;
        if (result.ok) return finish(result);
        errors.push(result);
        clearTimeout(hedge);
        startOllama();
        launch();
      });
    };
    if (external?.aborted) {
      finish(combined());
      return;
    }
    external?.addEventListener('abort', onExternalAbort);
    launch();
  });
};

export const testOllama = async (): Promise<TestResult> => {
  const settings = await getAppraisalSettings();
  const base = ollamaBase(settings.ollamaBaseUrl);
  const model = settings.ollamaModel.trim();
  if (!base || !model) return { ok: false, error: 'Add the Ollama server URL and a vision model first' };
  if (!(await ollamaPermitted(base))) return { ok: false, error: `This extension can't reach ${base}. Save the server again and allow access.` };
  try {
    const res = await fetchWithTimeout(`${base}/api/tags`, {}, 8 * SECOND);
    const body = (await res.json().catch(() => null)) as { models?: { name: string }[]; error?: string } | null;
    if (!res.ok) return { ok: false, error: ollamaHttpError(res.status, body) };
    const wanted = model.toLowerCase();
    const names = (body?.models ?? []).map((m) => m.name);
    const found = names.some((name) => {
      const lower = name.toLowerCase();
      return lower === wanted || lower.startsWith(`${wanted}:`) || lower.split(':')[0] === wanted;
    });
    if (!found) {
      const listed = names.slice(0, 6).join(', ');
      return { ok: false, error: listed ? `${model} is not on that server. Installed: ${listed}` : `${model} is not on that server` };
    }
    return { ok: true, detail: `Ollama is up with ${model}` };
  } catch (err) {
    return { ok: false, error: (err as Error).name === 'AbortError' ? 'Ollama did not answer in 8s' : `Can't reach Ollama at ${base}` };
  }
};
