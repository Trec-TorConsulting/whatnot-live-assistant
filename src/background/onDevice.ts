import {
  FOCUS_INSTRUCTION,
  ITEM_TYPES,
  SERIES,
  SPECIAL_INSTRUCTION,
  appraisalContext,
  parseOthers,
  type AppraisalContext,
  type AppraisalItem,
  type CardId,
  type OtherItem,
} from '../shared/appraisal';
import {
  ON_DEVICE_OPTIONS,
  TEXT_ONLY_OPTIONS,
  languageModel,
  onDeviceStatus,
  type OnDeviceSession,
  type OnDeviceStatus,
} from '../shared/onDevice';
import { getItem, setItem } from '../shared/storage';
import { DAY, MINUTE, SECOND } from '../shared/time';

export const ON_DEVICE_MODEL = 'on-device';

// Past this, the lot is likely closing and Gemini gets a turn.
const ON_DEVICE_TIMEOUT_MS = 10 * SECOND;

// Shorter than the Gemini instructions: the small model has a small context window, and every
// output token costs time, so there are no nullable fields ("" / 0 mean unknown) and no notes.
const INSTRUCTIONS = [
  'Identify the item for sale in this Whatnot livestream frame: coins, paper money, bullion, cards, comics, toys, games, jewelry, antiques, or garage-sale goods. The show and lot titles are hints; trust the image when they disagree.',
  FOCUS_INSTRUCTION,
  'others: other pieces of that same presented lot only, priciest first; [] when the lot is one item. Group similar cheap pieces as one entry with item_name, quantity, and a per-piece estimate_low_usd / estimate_high_usd. Skip the main item, background items, and on-screen buttons.',
  'item_name: specific, e.g. "1921 Morgan Dollar", "1957 $1 Silver Certificate", "1986 Fleer Michael Jordan #57", "1960s Pyrex Butterprint Bowl".',
  'series_key: only for the precious-metal coin issue (us_90_* = US pre-1965 silver, canada_80_* = Canada 1920-1967 silver), else "other".',
  'fine_weight_oz: troy oz of pure precious metal per piece, 0 if unknown or not precious metal; 1 g = 0.03215 oz. quantity: pieces in the lot; count every identical piece (two 1 g bars = 2).',
  'hallmark, gross_grams: jewelry and flatware only: the purity stamp as shown (e.g. "14K", "925") and the scale or listed weight in grams; "" and 0 if not shown or not jewelry.',
  'card_game, card_name, card_number: trading cards only: magic, pokemon, yugioh, sports, or other; the printed card name (e.g. "Charizard"); the collector number (e.g. "4/102"); "" if not a card.',
  'grading_service, grade, cert_number: copy from a slab label (e.g. "PCGS", "MS 63", digits only); grading_service and cert_number "" if raw or unreadable. For raw items, grade is a short condition like "VF" or "Near Mint".',
  'year: 0 if unknown. mint_mark: the coin mint mark letter, "" if none or not a coin.',
  'estimate_low_usd / estimate_high_usd: per-piece price range where recent sold copies land, high at most 2x low; 0 for both only if is_collectible is false.',
  SPECIAL_INSTRUCTION,
].join('\n');

const SCHEMA = {
  type: 'object',
  properties: {
    is_collectible: { type: 'boolean' },
    item_type: { type: 'string', enum: [...ITEM_TYPES] },
    item_name: { type: 'string' },
    year: { type: 'integer' },
    mint_mark: { type: 'string' },
    series_key: { type: 'string', enum: [...Object.keys(SERIES), 'other'] },
    metal: { type: 'string', enum: ['silver', 'gold', 'platinum', 'palladium', 'copper', 'nickel', 'clad', 'paper', 'other', 'unknown'] },
    fine_weight_oz: { type: 'number' },
    hallmark: { type: 'string' },
    gross_grams: { type: 'number' },
    card_game: { type: 'string', enum: ['', 'magic', 'pokemon', 'yugioh', 'sports', 'other'] },
    card_name: { type: 'string' },
    card_number: { type: 'string' },
    quantity: { type: 'integer' },
    grading_service: { type: 'string' },
    grade: { type: 'string' },
    cert_number: { type: 'string' },
    estimate_low_usd: { type: 'number' },
    estimate_high_usd: { type: 'number' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    special: { type: 'string' },
    others: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          item_name: { type: 'string' },
          quantity: { type: 'integer' },
          estimate_low_usd: { type: 'number' },
          estimate_high_usd: { type: 'number' },
        },
        required: ['item_name', 'quantity', 'estimate_low_usd', 'estimate_high_usd'],
        additionalProperties: false,
      },
    },
  },
  required: [
    'is_collectible',
    'item_type',
    'item_name',
    'year',
    'mint_mark',
    'series_key',
    'metal',
    'fine_weight_oz',
    'hallmark',
    'gross_grams',
    'card_game',
    'card_name',
    'card_number',
    'quantity',
    'grading_service',
    'grade',
    'cert_number',
    'estimate_low_usd',
    'estimate_high_usd',
    'confidence',
    'special',
    'others',
  ],
  additionalProperties: false,
};

type Answer = Omit<
  AppraisalItem,
  'year' | 'mint_mark' | 'fine_weight_oz' | 'hallmark' | 'gross_grams' | 'card' | 'grading_service' | 'grade' | 'cert_number' | 'special'
> & {
  special: string;
  year: number;
  mint_mark: string;
  fine_weight_oz: number;
  hallmark?: string;
  gross_grams?: number;
  card_game?: string;
  card_name?: string;
  card_number?: string;
  grading_service: string;
  grade: string;
  cert_number: string;
};

const CARD_GAMES = new Set(['magic', 'pokemon', 'yugioh', 'sports', 'other']);

const cardOf = (a: Answer): CardId | null => {
  const name = (a.card_name ?? '').trim();
  const game = (a.card_game ?? '').trim();
  if (!name || !CARD_GAMES.has(game)) return null;
  return { game: game as CardId['game'], name, set: null, number: (a.card_number ?? '').trim() || null };
};

const toItem = (a: Answer): AppraisalItem => {
  const slabbed = Boolean(a.grading_service.trim());
  const grade = a.grade.trim() || null;
  return {
    is_collectible: a.is_collectible,
    item_type: a.item_type,
    item_name: a.item_name,
    year: a.year > 0 ? a.year : null,
    mint_mark: a.mint_mark.trim() || null,
    series_key: a.series_key,
    metal: a.metal,
    fine_weight_oz: a.fine_weight_oz > 0 ? a.fine_weight_oz : null,
    hallmark: (a.hallmark ?? '').trim() || null,
    gross_grams: a.gross_grams && a.gross_grams > 0 ? a.gross_grams : null,
    card: cardOf(a),
    quantity: Math.max(1, a.quantity || 1),
    is_slabbed: slabbed,
    grading_service: slabbed ? a.grading_service.trim() : null,
    grade: slabbed ? grade : null,
    grade_estimate: slabbed ? null : grade,
    cert_number: a.cert_number.replace(/\D/g, '') || null,
    estimate_low_usd: a.estimate_low_usd,
    estimate_high_usd: a.estimate_high_usd,
    confidence: a.confidence,
    special: (a.special ?? '').trim().slice(0, 120) || null,
    notes: '',
  };
};

// Creating a session loads the model and reads the system prompt; that cost is paid once per
// worker lifetime and each appraisal clones the warm session.
let warm: { api: object; session: Promise<OnDeviceSession> } | null = null;

const baseSession = () => {
  const api = languageModel()!;
  if (warm?.api === api) return warm.session;
  const session = api.create({
    ...ON_DEVICE_OPTIONS,
    initialPrompts: [{ role: 'system', content: INSTRUCTIONS }],
    temperature: 0.2,
    topK: 3,
  });
  warm = { api, session };
  session.catch(() => {
    if (warm?.session === session) warm = null;
  });
  return session;
};

const jpegBlob = (base64: string) => new Blob([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], { type: 'image/jpeg' });

// Checked when the worker starts so an appraisal never waits on it: the click uses the last answer
// and a stale one is refreshed in the background (a model set up in the side panel is picked up
// within a minute). Chrome logs an extension error on every check while an enterprise policy
// blocks the model, so "unavailable" is saved and only asked again daily or after a Chrome update.
const STATUS_TTL_MS = MINUTE;
const SETTLED_RECHECK_MS = DAY;
const SETTLED: OnDeviceStatus[] = ['unavailable', 'no-api'];
let known: { api: object | undefined; status: OnDeviceStatus; at: number } | null = null;
let checking: Promise<OnDeviceStatus> | null = null;

const chromeVersion = () => navigator.userAgent.match(/Chrome\/([\d.]+)/)?.[1] ?? '';

const savedSettled = async () => {
  const saved = await getItem('onDevice');
  const fresh = saved && Date.now() - saved.at < SETTLED_RECHECK_MS && saved.chrome === chromeVersion();
  return fresh && SETTLED.includes(saved.status) && (saved.status === 'no-api') === !languageModel() ? saved.status : null;
};

export const checkOnDevice = (force = false) =>
  (checking ??= (async () => {
    const api = languageModel();
    const settled = force ? null : await savedSettled();
    const fresh = settled ?? (await onDeviceStatus());
    known = { api, status: fresh, at: Date.now() };
    if (!settled) await setItem('onDevice', { status: fresh, at: Date.now(), chrome: chromeVersion() });
    return fresh;
  })().finally(() => {
    checking = null;
  }));

export const onDeviceState = async () => {
  if (!known || known.api !== languageModel()) return checkOnDevice();
  if (!SETTLED.includes(known.status) && Date.now() - known.at >= STATUS_TTL_MS) void checkOnDevice();
  return known.status;
};

export const warmOnDevice = async () => {
  if (!languageModel() || warm?.api === languageModel()) return;
  if ((await onDeviceState()) === 'available') await baseSession().catch(() => undefined);
};

export type OnDeviceResult = { ok: true; item: AppraisalItem; others: OtherItem[] } | { ok: false; unavailable: boolean; error: string };

export type OnDeviceText = { ok: true; text: string } | { ok: false; unavailable: boolean; error: string };

// JSON answers for wheel prizes, with an optional frame (envelope reads). Runs ahead of the click,
// so it gets a fresh session instead of sharing the warm image session's system prompt.
export const promptOnDeviceJson = async (
  instructions: string,
  prompt: string,
  schema: object,
  timeoutMs: number,
  image?: string,
): Promise<OnDeviceText> => {
  const current = await onDeviceState();
  if (current !== 'available') return { ok: false, unavailable: true, error: `on-device model ${current}` };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let session: OnDeviceSession | null = null;
  try {
    session = await languageModel()!.create({
      ...(image ? ON_DEVICE_OPTIONS : TEXT_ONLY_OPTIONS),
      initialPrompts: [{ role: 'system', content: instructions }],
      temperature: 0.2,
      topK: 3,
    });
    const input = image
      ? [{ role: 'user', content: [{ type: 'text', value: prompt }, { type: 'image', value: jpegBlob(image) }] }]
      : prompt;
    return { ok: true, text: await session.prompt(input, { responseConstraint: schema, signal: controller.signal }) };
  } catch (err) {
    if (controller.signal.aborted) return { ok: false, unavailable: false, error: `on-device model took over ${timeoutMs / SECOND}s` };
    return { ok: false, unavailable: false, error: String((err as Error)?.message ?? err) };
  } finally {
    clearTimeout(timer);
    session?.destroy();
  }
};

export const appraiseOnDevice = async (image: string, context: AppraisalContext, external?: AbortSignal): Promise<OnDeviceResult> => {
  if (external?.aborted) return { ok: false, unavailable: false, error: 'on-device cancelled' };
  const current = await onDeviceState();
  if (external?.aborted) return { ok: false, unavailable: false, error: 'on-device cancelled' };
  if (current !== 'available') return { ok: false, unavailable: true, error: `on-device model ${current}` };
  const timeout = AbortSignal.timeout(ON_DEVICE_TIMEOUT_MS);
  const signal = external ? AbortSignal.any([timeout, external]) : timeout;
  let session: OnDeviceSession | null = null;
  try {
    const base = await baseSession();
    if (signal.aborted) {
      return { ok: false, unavailable: false, error: external?.aborted ? 'on-device cancelled' : `on-device model took over ${ON_DEVICE_TIMEOUT_MS / SECOND}s` };
    }
    session = await base.clone({ signal }).catch((err: unknown) => {
      if (warm?.api === languageModel()) warm = null;
      throw err;
    });
    const text = await session.prompt(
      [{ role: 'user', content: [{ type: 'text', value: appraisalContext(context) }, { type: 'image', value: jpegBlob(image) }] }],
      { responseConstraint: SCHEMA, signal },
    );
    const parsed = JSON.parse(text) as Answer & { others?: unknown };
    return { ok: true, item: toItem(parsed), others: parseOthers(parsed.others) };
  } catch (err) {
    if (external?.aborted) return { ok: false, unavailable: false, error: 'on-device cancelled' };
    if (signal.aborted || (err as Error).name === 'AbortError') {
      return { ok: false, unavailable: false, error: `on-device model took over ${ON_DEVICE_TIMEOUT_MS / SECOND}s` };
    }
    return { ok: false, unavailable: false, error: String((err as Error)?.message ?? err) };
  } finally {
    session?.destroy();
  }
};
