import type { AppraisalContext } from '../shared/appraisal';
import type { TableScanResult } from '../shared/messages';
import { getItem } from '../shared/storage';
import { TABLE_INSTRUCTIONS, TABLE_SCHEMA, TABLE_SCHEMA_GEMINI, parseTableAnswer, tablePrompt, type TableItem } from '../shared/tableScan';
import { askAi, realPrice } from './aiPricing';
import { recordUsage } from './appraisal';

// Each item is priced like a wheel prize: melt and Whatnot sold comps before the model's estimate.
export const scanTable = async ({ image, mainItem, ...context }: AppraisalContext & { image: string; mainItem: string }): Promise<TableScanResult> => {
  const answer = await askAi({
    instructions: TABLE_INSTRUCTIONS,
    prompt: tablePrompt(context, mainItem),
    schema: TABLE_SCHEMA,
    geminiSchema: TABLE_SCHEMA_GEMINI,
    image,
    usable: (text) => parseTableAnswer(text, mainItem).length > 0,
  });
  if (!answer.ok) return answer;
  if (answer.usage) void recordUsage([answer.usage], false);
  const sold = (await getItem('soldHistory')) ?? [];
  const now = Date.now();
  const items = await Promise.all(
    parseTableAnswer(answer.text, mainItem).map(async (row): Promise<TableItem> => {
      const real = await realPrice(row.name, sold, now);
      return real ? { ...row, low: real.low, high: real.high ?? real.low, source: real.source } : { ...row, source: 'ai' };
    }),
  );
  return { ok: true, items: items.sort((a, b) => b.low - a.low), model: answer.model };
};
