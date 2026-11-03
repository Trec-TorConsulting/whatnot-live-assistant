// Shared by wheel prizes and table scans: the on-device model first, Gemini when it is missing or
// fails, and real prices (melt, Whatnot sold) ahead of any model estimate.
import { prizeMelt } from '../shared/prizeValue';
import { findComps, summarizeComps, type SoldItem } from '../shared/soldHistory';
import { getAppraisalSettings } from '../shared/storage';
import { SECOND } from '../shared/time';
import { geminiJson, getSpot, type CallUsage } from './appraisal';
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
  // An on-device answer with nothing usable falls through to Gemini.
  usable: (text: string) => boolean;
}

// Ollama-only skips both and asks the local server, same as an appraisal.
export const askAi = async ({ instructions, prompt, schema, geminiSchema, image, usable }: AiAsk): Promise<AiAnswer> => {
  if ((await getAppraisalSettings()).ollamaOnly) {
    const remote = await geminiJson(instructions, prompt, geminiSchema, image);
    return remote.ok ? remote : { ok: false, error: remote.error };
  }
  const local = await promptOnDeviceJson(instructions, prompt, schema, ON_DEVICE_TIMEOUT_MS, image);
  if (local.ok && usable(local.text)) return { ok: true, text: local.text, model: ON_DEVICE_MODEL };
  const remote = await geminiJson(instructions, prompt, geminiSchema, image);
  if (remote.ok) return remote;
  const localError = local.ok ? 'on-device model gave no values' : local.error;
  return { ok: false, error: remote.needsKey ? `${localError}, and there is no cloud AI key to fall back on` : remote.error };
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
