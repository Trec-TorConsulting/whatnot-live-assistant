// Shared by wheel prizes, table scans, and background shop scans: when an Ollama server is
// configured (even with Ollama-only unchecked), background work uses local AI first so cloud
// Gemini stays free for fast live appraisals, and falls back to cloud AI only if local fails.
import { prizeMelt } from '../shared/prizeValue';
import { findComps, summarizeComps, type SoldItem } from '../shared/soldHistory';
import { getAppraisalSettings } from '../shared/storage';
import { SECOND } from '../shared/time';
import { geminiJson, getSpot, localOllamaJson, type CallUsage } from './appraisal';
import { ON_DEVICE_MODEL, promptOnDeviceJson } from './onDevice';

// These run ahead of a bid or after the answer is on screen, so the on-device model gets longer
// than it does on an appraisal click.
const ON_DEVICE_TIMEOUT_MS = 20 * SECOND;

export type AiAnswer = { ok: true; text: string; model: string; usage?: CallUsage } | { ok: false; error: string };

export interface AiAsk {
  instructions: string;
  prompt: string;
  schema: object;
  geminiSchema: object;
  image?: string;
  // Table scans only. Envelope handwriting stays at the model's default image resolution.
  lowImage?: boolean;
  // A local answer with nothing usable falls through to the next model.
  usable: (text: string) => boolean;
}

// Ollama-only skips cloud and on-device and asks the local server. When Ollama is configured
// with Ollama-only unchecked, background tasks still try local Ollama first before cloud AI.
export const askAi = async ({ instructions, prompt, schema, geminiSchema, image, lowImage, usable }: AiAsk): Promise<AiAnswer> => {
  if ((await getAppraisalSettings()).ollamaOnly) {
    const remote = await geminiJson(instructions, prompt, geminiSchema, image, lowImage);
    return remote.ok ? remote : { ok: false, error: remote.error };
  }
  const ollama = await localOllamaJson(instructions, prompt, geminiSchema, image);
  if (ollama?.ok && usable(ollama.text)) return { ok: true, text: ollama.text, model: ollama.model };
  const local = await promptOnDeviceJson(instructions, prompt, schema, ON_DEVICE_TIMEOUT_MS, image);
  if (local.ok && usable(local.text)) return { ok: true, text: local.text, model: ON_DEVICE_MODEL };
  const remote = await geminiJson(instructions, prompt, geminiSchema, image, lowImage, Boolean(ollama));
  if (remote.ok) return remote;
  const localError = ollama ? (ollama.ok ? 'Ollama gave no usable values' : ollama.error) : local.ok ? 'on-device model gave no values' : local.error;
  return { ok: false, error: remote.needsKey ? `${localError}, and there is no cloud AI key to fall back on` : remote.error };
};

// Background enrichment (like shop scan item info & estimates) that runs only on local AI
// (Ollama or Chrome on-device) so opening a show never burns cloud tokens.
export const askLocalAi = async ({ instructions, prompt, schema, geminiSchema, image, usable }: AiAsk): Promise<AiAnswer | null> => {
  const ollama = await localOllamaJson(instructions, prompt, geminiSchema, image);
  if (ollama?.ok && usable(ollama.text)) return { ok: true, text: ollama.text, model: ollama.model };
  const local = await promptOnDeviceJson(instructions, prompt, schema, ON_DEVICE_TIMEOUT_MS, image);
  if (local.ok && usable(local.text)) return { ok: true, text: local.text, model: ON_DEVICE_MODEL };
  if (!ollama) return null;
  return { ok: false, error: ollama.ok ? 'Ollama gave no usable values' : ollama.error };
};

export const cents = (n: number) => Math.round(n * 100) / 100;

export interface RealPrice {
  low: number;
  high: number | null;
  source: 'melt' | 'sold';
  note: string | null;
}

// Melt when the name states metal and weight, then Whatnot sold comps.
export const realPrice = async (title: string, sold: SoldItem[], now: number): Promise<RealPrice | null> => {
  const melt = prizeMelt(title);
  const spot = melt ? await getSpot(melt.metal) : null;
  if (melt && spot) return { low: cents(spot * melt.oz * melt.purity), high: null, source: 'melt', note: melt.note };
  const comps = summarizeComps(findComps([title], sold, now));
  if (comps) return { low: comps.low, high: comps.high, source: 'sold', note: `${comps.count} sold` };
  return null;
};
