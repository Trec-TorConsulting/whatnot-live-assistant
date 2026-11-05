import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnvelopeBoard } from '../shared/envelopes';
import type { PrizeValue } from '../shared/prizeValue';
import { readEnvelopes, valuePrizes } from './prizeValues';

const fakeArea = (initial: Record<string, unknown> = {}) => {
  const data: Record<string, unknown> = { ...initial };
  return {
    data,
    get: async (key: string) => (key in data ? { [key]: data[key] } : {}),
    set: async (items: Record<string, unknown>) => void Object.assign(data, items),
  };
};

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const ctx = { showTitle: 'MORNING GOLD RUSH!', wheelTitle: 'NUGGETS AND OTHER GOLD HITS', categories: ['coins'] };
const GOLD_SPOT = 3110.35;
const SILVER_SPOT = 31.1035;
const p = (title: string, detail = '') => ({ title, detail });

let local: ReturnType<typeof fakeArea>;
let geminiPrompts: string[];

const stubFetch = (geminiPrizes: unknown, answer: unknown = { prizes: geminiPrizes }) => {
  geminiPrompts = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('gold-api')) return json(200, { price: url.includes('XAG') ? SILVER_SPOT : GOLD_SPOT });
      geminiPrompts.push(String(init?.body ?? ''));
      return json(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] });
    }),
  );
};

const values = () => local.data.wn2_prizeValues as Record<string, PrizeValue>;

beforeEach(() => {
  local = fakeArea({ wn2_appraisalSettings: { geminiApiKey: 'test-key' }, wn2_onDevice: { status: 'no-api', at: Date.now(), chrome: '' } });
  vi.stubGlobal('chrome', { storage: { local, session: fakeArea() } });
});

afterEach(() => vi.unstubAllGlobals());

describe('valuePrizes', () => {
  it('uses melt for stated metal, the AI low end for the rest, and only asks about what melt cannot price', async () => {
    stubFetch([{ i: 1, low: 120, high: 60 }]);
    await valuePrizes([p('1.51 GRAMS GOLD NUGGETS UNVAULTED', 'FAIR'), p('COSMIC VAULT SERIES 9 LUCKYRIPS RIP/SHIP')], ctx);
    const v = values();
    // 1.51 g at $3110.35/oz spot and 80% nugget purity.
    expect(v['1.51 grams gold nuggets unvaulted | fair']).toMatchObject({ source: 'melt', low: 120.8, high: null });
    expect(v['cosmic vault series 9 luckyrips rip/ship']).toMatchObject({ source: 'ai', low: 60, high: 120 });
    expect(geminiPrompts).toHaveLength(1);
    expect(geminiPrompts[0]).toContain('1. COSMIC VAULT SERIES 9 LUCKYRIPS RIP/SHIP');
    expect(geminiPrompts[0]).not.toContain('1.51 GRAMS');
  });

  it('reuses fresh values without asking again', async () => {
    stubFetch([{ i: 1, low: 10, high: 20 }]);
    await valuePrizes([p('INDIAN HEAD CENT GENUINE ICG CERT', 'FAIR')], ctx);
    await valuePrizes([p('Indian Head Cent  Genuine ICG Cert', 'fair')], ctx);
    expect(geminiPrompts).toHaveLength(1);
    expect(geminiPrompts[0]).toContain('1. INDIAN HEAD CENT GENUINE ICG CERT (condition: FAIR)');
  });

  it('values the same title in two conditions separately', async () => {
    stubFetch([
      { i: 1, low: 40, high: 60 },
      { i: 2, low: 90, high: 150 },
    ]);
    await valuePrizes([p('Morgan Dollar', 'Good - Extremely Fine'), p('Morgan Dollar', 'Uncirculated - Mint')], ctx);
    expect(values()['morgan dollar | good - extremely fine']).toMatchObject({ low: 40 });
    expect(values()['morgan dollar | uncirculated - mint']).toMatchObject({ low: 90 });
  });

  it('prices punctuation copies of one wheat cent once, and skips Item #N', async () => {
    stubFetch([{ i: 1, low: 1, high: 2 }]);
    await valuePrizes(
      [
        p('random (.01) Wheat cent (us mint) poor.://'),
        p('random (.01) Wheat cent (us .mint) poor‘.,)(()'),
        p('Item #12'),
      ],
      ctx,
    );
    expect(geminiPrompts).toHaveLength(1);
    expect(geminiPrompts[0]).not.toContain('Item #12');
    const v = values();
    expect(Object.keys(v)).toHaveLength(1);
    expect(Object.values(v)[0]).toMatchObject({ source: 'ai', low: 1 });
  });

  it('never values an envelope by its name', async () => {
    stubFetch([{ i: 1, low: 5, high: 8 }]);
    await valuePrizes([p('ENVELOPE #2', 'GOOD'), p('BUFFALO NICKEL RANDOM YEAR', 'FAIR')], ctx);
    expect(geminiPrompts).toHaveLength(1);
    expect(geminiPrompts[0]).not.toContain('ENVELOPE');
    expect(Object.keys(values())).toEqual(['buffalo nickel random year | fair']);
    await valuePrizes([p('Family Pack #7', 'Envelope'), p('Proof Quarter')], ctx);
    expect(geminiPrompts.at(-1)).not.toContain('Family Pack');
    expect(values()['proof quarter']).toBeDefined();
  });

  it('reports a failure when no model can answer', async () => {
    local.data.wn2_appraisalSettings = { geminiApiKey: '' };
    stubFetch([]);
    const r = await valuePrizes([p('VAULTBOX SELECT BOX RIP/SHIP')], ctx);
    expect(r).toMatchObject({ ok: false });
    expect(values()['vaultbox select box rip/ship']).toBeUndefined();
  });

  it('uses configured Ollama first for background prize valuation even when Ollama-only is unchecked, falling back to Gemini if Ollama fails', async () => {
    local.data.wn2_appraisalSettings = {
      geminiApiKey: 'test-key',
      ollamaBaseUrl: 'http://127.0.0.1:11434',
      ollamaModel: 'qwen2.5vl',
      ollamaOnly: false,
    };
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(url);
        if (url.includes('/api/chat')) {
          return json(200, { message: { content: JSON.stringify({ prizes: [{ i: 1, low: 45, high: 75 }] }) } });
        }
        return json(200, { candidates: [{ content: { parts: [{ text: JSON.stringify({ prizes: [{ i: 1, low: 10, high: 20 }] }) }] } }] });
      }),
    );
    await valuePrizes([p('VAULTBOX SELECT BOX RIP/SHIP')], ctx);
    expect(urls.some((u) => u.includes('/api/chat'))).toBe(true);
    expect(urls.some((u) => u.includes('generativelanguage.googleapis.com'))).toBe(false);
    expect(values()['vaultbox select box rip/ship']).toMatchObject({ source: 'ai', low: 45, high: 75, note: 'ollama:qwen2.5vl' });
  });
});

describe('readEnvelopes', () => {
  const envelopes = [p('ENVELOPE #2', 'GOOD'), p('ENVELOPE #3', '.9999'), p('ENVELOPE #4', '.9999'), p('BUFFALO NICKEL RANDOM YEAR', 'FAIR')];

  const others = [p('BUFFALO NICKEL RANDOM YEAR', 'FAIR')];
  const boards = () => local.data.wn2_envelopeBoards as Record<string, EnvelopeBoard> | undefined;

  it('prices numbered envelopes and the board, melt first, keyed to this wheel', async () => {
    stubFetch(null, {
      envelopes: [
        { prize: 'ENVELOPE #3', inside: '1 kilo silver bar', low: 900, high: 1100 },
        { prize: '', inside: '1985 Liberty MS 67', low: 60, high: 90 },
        { prize: '', inside: '5 oz silver round', low: 120, high: 150 },
      ],
    });
    const r = await readEnvelopes('5981361', 'jpeg', envelopes, others, ctx);
    expect(r).toEqual({ ok: true, matched: 0, board: 3 });
    const body = JSON.parse(geminiPrompts[0]!) as { contents: { parts: { text?: string; inline_data?: { data: string } }[] }[] };
    expect(body.contents[0]!.parts[1]!.inline_data!.data).toBe('jpeg');
    expect(body.contents[0]!.parts[0]!.text).toContain('Named wheel prizes, not in envelopes: BUFFALO NICKEL RANDOM YEAR');
    // A shelf number is not stored as that envelope's price. The kilo stays in the pool.
    expect(values()?.['5981361#envelope #3 | .9999']).toBeUndefined();
    expect(values()?.['envelope #3 | .9999']).toBeUndefined();
    const board = boards()!['5981361']!;
    expect(board.prizes).toEqual(['5981361#envelope #2 | good', '5981361#envelope #3 | .9999', '5981361#envelope #4 | .9999']);
    expect(board.items.map((i) => [i.inside, i.source, i.low])).toEqual([
      ['1 kilo silver bar', 'melt', 1000],
      ['1985 Liberty MS 67', 'ai', 60],
      ['5 oz silver round', 'melt', 155.52],
    ]);
  });

  it('only asks about envelopes it has not read yet, and keeps the last board after an empty read', async () => {
    stubFetch(null, { envelopes: [] });
    local.data.wn2_prizeValues = { '5981361#envelope #2 | good': { low: 60, high: 90, source: 'ai', note: null, at: Date.now(), inside: 'x' } };
    const last = { at: 1, prizes: ['x'], items: [] };
    local.data.wn2_envelopeBoards = { '5981361': last };
    const r = await readEnvelopes('5981361', 'jpeg', envelopes, others, ctx);
    expect(r).toEqual({ ok: true, matched: 0, board: 0 });
    expect(geminiPrompts[0]).not.toContain('ENVELOPE #2');
    expect(boards()!['5981361']).toEqual(last);
  });
});
