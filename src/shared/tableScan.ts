// Flea-market and yard-sale frames: after the item being sold is appraised, a second look scans the
// whole table for what else is worth money. It runs after the answer is on screen, so it never
// delays the max bid.
import type { AppraisalContext } from './appraisal';

export const MAX_TABLE_ITEMS = 8;

export interface TableItem {
  name: string;
  quantity: number;
  // Where it sits in the frame, so you can spot it.
  where: string;
  // Per piece.
  low: number;
  high: number;
  source: 'melt' | 'sold' | 'ai';
}

export const TABLE_INSTRUCTIONS = [
  'This is a frame from a Whatnot flea market, yard sale, or estate show. Scan the whole frame, including the table, bins, shelves, and background, for the items worth the most money.',
  `items: up to ${MAX_TABLE_ITEMS}, priciest first. Only items you can see well enough to identify; skip anything you would only be guessing at. Do not list the item being sold now (given in the request). Group similar cheap goods as one entry with a quantity, and skip chat, buttons, and price tags overlaid on the video.`,
  'name: specific: year or era, brand or maker, model, and metal and weight when shown, e.g. "1960s Pyrex Butterprint Bowl", "Sterling silver flatware set", "1 oz silver round". where: 2-4 words on where it sits in the frame, e.g. "back left shelf", "front tray".',
  'low / high: per-piece US price range where recent sold copies land (eBay sold or Whatnot sold), not asking prices. Be conservative: if unsure, lean low. Keep high at most 2x low. Never answer 0.',
].join('\n');

const ITEM_FIELDS = ['name', 'quantity', 'where', 'low', 'high'];

export const TABLE_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          quantity: { type: 'integer' },
          where: { type: 'string' },
          low: { type: 'number' },
          high: { type: 'number' },
        },
        required: ITEM_FIELDS,
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
};

export const TABLE_SCHEMA_GEMINI = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          quantity: { type: 'INTEGER' },
          where: { type: 'STRING' },
          low: { type: 'NUMBER' },
          high: { type: 'NUMBER' },
        },
        required: ITEM_FIELDS,
      },
    },
  },
  required: ['items'],
};

export const tablePrompt = ({ showTitle, lotTitle, categories = [] }: AppraisalContext, mainItem: string) =>
  [
    `Show: ${showTitle || 'unknown'}`,
    categories.length ? `Whatnot category: ${categories.join(' > ')}` : '',
    lotTitle ? `Current lot title: ${lotTitle}` : '',
    `Being sold now (do not list): ${mainItem || 'unknown'}`,
  ]
    .filter(Boolean)
    .join('\n');

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// The model's rows, cleaned: named, priced, not the item being sold, at most MAX_TABLE_ITEMS.
export const parseTableAnswer = (text: string, mainItem: string): Omit<TableItem, 'source'>[] => {
  let rows: unknown;
  try {
    rows = (JSON.parse(text) as { items?: unknown }).items;
  } catch {
    return [];
  }
  if (!Array.isArray(rows)) return [];
  const out: Omit<TableItem, 'source'>[] = [];
  for (const row of rows) {
    const r = row as { name?: unknown; quantity?: unknown; where?: unknown; low?: unknown; high?: unknown };
    const name = typeof r.name === 'string' ? r.name.trim().slice(0, 100) : '';
    const nums = [r.low, r.high].filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0);
    if (!name || !nums.length || (mainItem && same(name, mainItem))) continue;
    out.push({
      name,
      quantity: typeof r.quantity === 'number' && r.quantity >= 1 ? Math.min(999, Math.round(r.quantity)) : 1,
      where: typeof r.where === 'string' ? r.where.trim().slice(0, 40) : '',
      low: Math.min(...nums),
      high: Math.max(...nums),
    });
    if (out.length >= MAX_TABLE_ITEMS) break;
  }
  return out;
};
