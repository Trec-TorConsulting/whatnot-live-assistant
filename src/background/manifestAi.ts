import {
  MANIFEST_INSTRUCTIONS,
  MANIFEST_SCHEMA,
  MANIFEST_SCHEMA_GEMINI,
  manifestPrompt,
  parseManifestAiAnswer,
  type AiManifestResult,
} from '../shared/prizeValue';
import { getItem, setItem } from '../shared/storage';
import { askAi } from './aiPricing';

export const extractManifestAi = async (
  breakId: string,
  description?: string | null,
  notes?: string | null,
  categories: string[] = [],
): Promise<{ ok: true; manifest: AiManifestResult } | { ok: false; error: string }> => {
  if (!breakId || (!description && !notes)) {
    return { ok: false, error: 'no description or notes to extract manifest from' };
  }
  const cached = (await getItem('aiManifests')) ?? {};
  if (cached[breakId]) {
    return { ok: true, manifest: cached[breakId]! };
  }

  const prompt = manifestPrompt(description ?? null, notes ?? null, categories);
  const answer = await askAi({
    instructions: MANIFEST_INSTRUCTIONS,
    prompt,
    schema: MANIFEST_SCHEMA,
    geminiSchema: MANIFEST_SCHEMA_GEMINI,
    usable: (text) => {
      const parsed = parseManifestAiAnswer(text);
      return parsed.items.length > 0 || Boolean(parsed.floorName) || Boolean(parsed.floorValue);
    },
  });

  if (!answer.ok) {
    return { ok: false, error: answer.error };
  }

  const manifest = parseManifestAiAnswer(answer.text);
  const next = { ...cached, [breakId]: manifest };
  await setItem('aiManifests', next);
  return { ok: true, manifest };
};

