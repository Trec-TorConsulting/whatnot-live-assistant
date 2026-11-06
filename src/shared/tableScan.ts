// Flea-market and yard-sale frames: after the item being sold is appraised, a second look scans the
// whole table for what else is worth money. It runs after the answer is on screen, so it never
// delays the max bid.
import type { AppraisalContext } from './appraisal';
import { isTemplate } from './estate';
import { runnerItemName, runnerNoteSupplement, runnerPassOn } from './runner';
import { noteForPrompt } from './showNotes';

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
  warning?: string | null;
}

export const TABLE_INSTRUCTIONS = [
  'This is a frame from a Whatnot livestream (coins, bullion, currency, cards, collectibles, or estate goods). Scan the whole visible scene including the table, trays, shelves, and background for the most valuable items.',
  `items: up to ${MAX_TABLE_ITEMS}, ranked priciest first. Identify coins, bullion, slabs, currency, and high-value items with estimated market resale value. Do not list the item currently being auctioned (given in request) unless it is a table-wide scan. Skip chat, UI buttons, and viewer counters.`,
  'name: specific: year/era, denomination, mint mark, metal, weight, grade, or brand/model (e.g. "1 Kilo Poured Silver Skull", "1923 $1 Silver Certificate", "PCGS MS65 Morgan Dollar", "1/4 oz Gold Eagle").',
  'where: 2-4 words indicating spatial location in the frame (e.g. "bottom right", "middle shelf right", "center tray", "top shelf center", "left rack").',
  'low / high: realistic per-piece market value range in USD from recent completed sales or bullion melt. Be conservative.',
  'warning: alert if this piece is a replica, souvenir card (e.g. "BEP souvenir card replica, not genuine note"), clad/plated novelty bar ("100 mills / plated novelty, not solid bullion"), or fantasy issue (e.g. "Zombucks fantasy token"), and price it at realistic souvenir value ($5-$40). Null or empty string if genuine collectible.',
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
          warning: { type: 'string' },
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
          warning: { type: 'STRING' },
        },
        required: ITEM_FIELDS,
      },
    },
  },
  required: ['items'],
};

export const tableSubject = (mainItem: string | null | undefined, lotTitle?: string | null, showNotes?: string | null) => {
  const name = mainItem?.trim() ?? '';
  const runnerNamed = lotTitle ? runnerItemName(lotTitle, runnerPassOn(showNotes)) : null;
  if (runnerNamed && (!name || name.toLowerCase() === lotTitle?.trim().toLowerCase())) {
    return runnerNamed;
  }
  if (!name || isTemplate(name) || (lotTitle && name.toLowerCase() === lotTitle.trim().toLowerCase() && isTemplate(lotTitle))) {
    return 'the piece closest to the camera';
  }
  return name;
};

export const tablePrompt = ({ showTitle, lotTitle, categories = [], showNotes }: AppraisalContext, mainItem: string) => {
  const baseNotes = noteForPrompt(showNotes);
  const runnerSupp = runnerNoteSupplement(showNotes);
  const notes = [baseNotes, runnerSupp].filter(Boolean).join('\n');
  const runnerNamed = lotTitle ? runnerItemName(lotTitle, runnerPassOn(showNotes)) : null;
  const template = !runnerNamed && Boolean(lotTitle && isTemplate(lotTitle));
  const shownLot = runnerNamed ?? lotTitle;
  return [
    `Show: ${showTitle || 'unknown'}`,
    categories.length ? `Whatnot category: ${categories.join(' > ')}` : '',
    template ? '' : shownLot ? `Current lot title: ${shownLot}` : '',
    notes ? `Seller show notes (rules and what is in the show; the image still wins):\n${notes}` : '',
    `Being sold now (do not list): ${tableSubject(mainItem, lotTitle, showNotes)}`,
  ]
    .filter(Boolean)
    .join('\n');
};

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
    const r = row as { name?: unknown; quantity?: unknown; where?: unknown; low?: unknown; high?: unknown; warning?: unknown };
    const name = typeof r.name === 'string' ? r.name.trim().slice(0, 100) : '';
    const nums = [r.low, r.high].filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0);
    if (!name || !nums.length || (mainItem && same(name, mainItem))) continue;
    let warning = typeof r.warning === 'string' && r.warning.trim() ? r.warning.trim().slice(0, 100) : null;
    if (!warning) {
      if (/bep|souvenir card/i.test(name)) {
        warning = 'BEP souvenir card replica, not genuine currency';
      } else if (/100 mills|gold[- ]clad|silver[- ]clad/i.test(name)) {
        warning = 'Clad/plated novelty, not solid bullion';
      } else if (/zombucks|fantasy/i.test(name)) {
        warning = 'Fantasy round/token, not legal tender';
      }
    }
    out.push({
      name,
      quantity: typeof r.quantity === 'number' && r.quantity >= 1 ? Math.min(999, Math.round(r.quantity)) : 1,
      where: typeof r.where === 'string' ? r.where.trim().slice(0, 40) : '',
      low: Math.min(...nums),
      high: Math.max(...nums),
      ...(warning ? { warning } : {}),
    });
    if (out.length >= MAX_TABLE_ITEMS) break;
  }
  return out;
};
