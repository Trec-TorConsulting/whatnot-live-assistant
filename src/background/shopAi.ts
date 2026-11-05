// Background shop scan enrichment using local AI (Ollama or Chrome on-device).
// Never calls cloud AI, so opening a show's shop never spends Gemini tokens.
import { createLock } from '../shared/lock';
import type { ShopAiResult } from '../shared/messages';
import {
  SHOP_AI_INSTRUCTIONS,
  SHOP_AI_SCHEMA,
  SHOP_AI_SCHEMA_GEMINI,
  parseShopAiAnswer,
  shopAiPrompt,
  type ShopAiInputItem,
} from '../shared/shop';
import type { ShowType } from '../shared/showType';
import { askLocalAi, cents } from './aiPricing';

const lock = createLock();

export const evaluateShopItems = (
  items: ShopAiInputItem[],
  showTitle?: string | null,
  showType?: ShowType,
): Promise<ShopAiResult> =>
  lock(async () => {
    if (!items.length) return { ok: true, estimates: [] };
    const answer = await askLocalAi({
      instructions: SHOP_AI_INSTRUCTIONS,
      prompt: shopAiPrompt(items, showTitle, showType),
      schema: SHOP_AI_SCHEMA,
      geminiSchema: SHOP_AI_SCHEMA_GEMINI,
      usable: (text) => parseShopAiAnswer(text, items).length > 0,
    });
    if (!answer) return { ok: true, estimates: [] };
    if (!answer.ok) return { ok: false, error: answer.error };
    const estimates = parseShopAiAnswer(answer.text, items).map((e) => ({
      ...e,
      low: cents(e.low),
      high: cents(e.high),
    }));
    return { ok: true, estimates, model: answer.model };
  });

