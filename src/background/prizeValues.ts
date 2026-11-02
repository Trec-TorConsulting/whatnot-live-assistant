import { isHiddenPrize, prizeValueKey, wheelValueKey } from '../shared/breaks';
import { seenKey } from '../shared/envelopes';
import { createLock } from '../shared/lock';
import type { EnvelopeResult, Result } from '../shared/messages';
import {
  ENVELOPE_INSTRUCTIONS,
  ENVELOPE_SCHEMA,
  ENVELOPE_SCHEMA_GEMINI,
  PRIZE_INSTRUCTIONS,
  PRIZE_SCHEMA,
  PRIZE_SCHEMA_GEMINI,
  PRIZE_READ_INSTRUCTIONS,
  PRIZE_READ_SCHEMA,
  PRIZE_READ_SCHEMA_GEMINI,
  envelopePrompt,
  prizeReadPrompt,
  isFresh,
  parseEnvelopeAnswer,
  parsePrizeAnswer,
  prizePrompt,
  type BoardItem,
  type PrizeContext,
  type PrizeItem,
  type PrizeValue,
} from '../shared/prizeValue';
import { getItem, setItem, setSession } from '../shared/storage';
import { askAi, cents, realPrice } from './aiPricing';

// Valuing runs when the wheel loads, ahead of any bid; one batch covers a whole wheel.
const AI_BATCH = 40;
const MAX_CACHED = 1000;
// Several show tabs can load wheels at once; a later call finds the earlier one's answers cached.
const lock = createLock();

const trim = (cache: Record<string, PrizeValue>) => {
  const keys = Object.keys(cache);
  if (keys.length <= MAX_CACHED) return cache;
  const keep = keys.sort((a, b) => cache[b]!.at - cache[a]!.at).slice(0, MAX_CACHED);
  return Object.fromEntries(keep.map((k) => [k, cache[k]!]));
};

export const valuePrizes = (prizes: PrizeItem[], ctx: PrizeContext): Promise<Result> =>
  lock(async () => {
    const now = Date.now();
    const cache = (await getItem('prizeValues')) ?? {};
    // "ENVELOPE #3" names no item; any price from the title alone would be made up.
    const items = prizes
      .map((p) => ({ title: String(p.title ?? '').trim(), detail: String(p.detail ?? '').trim() }))
      .filter((p) => p.title && !isHiddenPrize(p.title));
    const stale = [...new Map(items.map((p) => [prizeValueKey(p), p])).entries()].filter(([key]) => !isFresh(cache[key], now));
    if (!stale.length) return { ok: true };

    const next = { ...cache };
    const sold = (await getItem('soldHistory')) ?? [];
    const forAi: [string, PrizeItem][] = [];
    for (const [key, prize] of stale) {
      const real = await realPrice(prize.title, sold, now);
      if (real) next[key] = { ...real, at: now };
      else forAi.push([key, prize]);
    }
    // Real prices show up right away instead of waiting on the model.
    await setItem('prizeValues', trim(next));
    if (!forAi.length) return { ok: true };

    await setSession('prizeStatus', { state: 'running', count: forAi.length, detail: null, at: Date.now() });
    for (let i = 0; i < forAi.length; i += AI_BATCH) {
      const batch = forAi.slice(i, i + AI_BATCH);
      const answer = await askAi({
        instructions: PRIZE_INSTRUCTIONS,
        prompt: prizePrompt(
          batch.map(([, prize]) => prize),
          ctx,
        ),
        schema: PRIZE_SCHEMA,
        geminiSchema: PRIZE_SCHEMA_GEMINI,
        usable: (text) => parsePrizeAnswer(text, batch.length).some(Boolean),
      });
      if (!answer.ok) {
        await setSession('prizeStatus', { state: 'failed', count: forAi.length, detail: answer.error, at: Date.now() });
        return { ok: false, error: answer.error };
      }
      parsePrizeAnswer(answer.text, batch.length).forEach((v, j) => {
        if (v) next[batch[j]![0]] = { low: cents(v.low), high: cents(v.high), source: 'ai', note: answer.model, at: Date.now() };
      });
      await setItem('prizeValues', trim(next));
    }
    await setSession('prizeStatus', { state: 'done', count: forAi.length, detail: null, at: Date.now() });
    return { ok: true };
  });

// Named prizes the video shows: the exact item on camera, priced like any prize. A title shared by
// two listed prizes (different conditions) can't be told apart on camera, so it's skipped.
export const readNamedPrizes = (breakId: string, image: string, prizes: PrizeItem[], ctx: PrizeContext): Promise<EnvelopeResult> =>
  lock(async () => {
    const now = Date.now();
    const cache = (await getItem('prizeValues')) ?? {};
    const named = prizes
      .map((p) => ({ title: String(p.title ?? '').trim(), detail: String(p.detail ?? '').trim() }))
      .filter((p) => p.title && !isHiddenPrize(p.title));
    const wanted = [...new Map(named.map((p) => [seenKey(breakId, p), p])).entries()].filter(([key]) => !isFresh(cache[key], now));
    if (!wanted.length) return { ok: true, matched: 0, board: 0 };

    const titles = wanted.map(([, p]) => p.title);
    const answer = await askAi({
      instructions: PRIZE_READ_INSTRUCTIONS,
      prompt: prizeReadPrompt(
        wanted.map(([, p]) => p),
        ctx,
      ),
      schema: PRIZE_READ_SCHEMA,
      geminiSchema: PRIZE_READ_SCHEMA_GEMINI,
      image,
      usable: (text) => parseEnvelopeAnswer(text, titles, 'prizes').matched.length > 0,
    });
    if (!answer.ok) return { ok: false, error: answer.error };

    const byTitle = new Map(parseEnvelopeAnswer(answer.text, titles, 'prizes').matched.map((r) => [r.title, r]));
    const sold = (await getItem('soldHistory')) ?? [];
    const next = { ...cache };
    let matched = 0;
    for (const [key, prize] of wanted) {
      const r = byTitle.get(prize.title);
      if (!r || wanted.filter(([, p]) => p.title === prize.title).length > 1) continue;
      const real = await realPrice(r.inside, sold, now);
      next[key] = real
        ? { ...real, inside: r.inside, at: now }
        : { low: cents(r.low), high: cents(r.high), source: 'ai', note: answer.model, inside: r.inside, at: now };
      matched++;
    }
    if (matched) await setItem('prizeValues', trim(next));
    return { ok: true, matched, board: 0 };
  });

const MAX_BOARDS = 20;

// Envelope wheels show the envelopes' items on camera. The model reads them off the frame, tying an
// item to an envelope only when its number is visible; each item is then priced like any prize,
// melt and sold comps before the model's own estimate. Items without a number become the board the
// other envelopes draw from (see shared/envelopes.ts).
export const readEnvelopes = (breakId: string, image: string, prizes: PrizeItem[], others: string[], ctx: PrizeContext): Promise<EnvelopeResult> =>
  lock(async () => {
    const now = Date.now();
    const cache = (await getItem('prizeValues')) ?? {};
    const hidden = prizes
      .map((p) => ({ title: String(p.title ?? '').trim(), detail: String(p.detail ?? '').trim() }))
      .filter((p) => p.title && isHiddenPrize(p.title));
    const wanted = [...new Map(hidden.map((p) => [wheelValueKey(breakId, p), p])).entries()].filter(([key]) => !isFresh(cache[key], now));
    if (!wanted.length) return { ok: true, matched: 0, board: 0 };

    const titles = wanted.map(([, p]) => p.title);
    await setSession('envelopeStatus', { state: 'running', count: wanted.length, detail: null, at: now });
    const answer = await askAi({
      instructions: ENVELOPE_INSTRUCTIONS,
      prompt: envelopePrompt(
        wanted.map(([, p]) => p),
        others.filter((t) => !isHiddenPrize(t)),
        ctx,
      ),
      schema: ENVELOPE_SCHEMA,
      geminiSchema: ENVELOPE_SCHEMA_GEMINI,
      image,
      usable: (text) => {
        const r = parseEnvelopeAnswer(text, titles);
        return r.matched.length + r.board.length > 0;
      },
    });
    if (!answer.ok) {
      await setSession('envelopeStatus', { state: 'failed', count: wanted.length, detail: answer.error, at: Date.now() });
      return { ok: false, error: answer.error };
    }

    const { matched, board } = parseEnvelopeAnswer(answer.text, titles);
    const sold = (await getItem('soldHistory')) ?? [];
    const price = async (item: BoardItem): Promise<PrizeValue> => {
      const real = await realPrice(item.inside, sold, now);
      return real
        ? { ...real, inside: item.inside, at: now }
        : { low: cents(item.low), high: cents(item.high), source: 'ai', note: answer.model, inside: item.inside, at: now };
    };

    const byTitle = new Map(matched.map((r) => [r.title, r]));
    const next = { ...cache };
    const left: string[] = [];
    for (const [key, prize] of wanted) {
      const r = byTitle.get(prize.title);
      if (r) next[key] = await price(r);
      else left.push(key);
    }
    if (matched.length) await setItem('prizeValues', trim(next));

    // An empty read (board off camera) keeps the last board, and the tab tries again.
    if (board.length && left.length) {
      const items: PrizeValue[] = [];
      for (const item of board) items.push(await price(item));
      const boards = { ...((await getItem('envelopeBoards')) ?? {}), [breakId]: { at: now, prizes: left, items } };
      const keep = Object.keys(boards)
        .sort((a, b) => boards[b]!.at - boards[a]!.at)
        .slice(0, MAX_BOARDS);
      await setItem('envelopeBoards', Object.fromEntries(keep.map((k) => [k, boards[k]!])));
    }
    await setSession('envelopeStatus', { state: 'done', count: matched.length + board.length, detail: null, at: Date.now() });
    return { ok: true, matched: matched.length, board: board.length };
  });
