import { isHiddenPrize, isHiddenSpot, isNumberedPrize, prizeIdentity, prizePriceKey, wheelValueKey } from '../shared/breaks';
import { nextEnvelopeBoard, seenKey } from '../shared/envelopes';
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
  clarifyPrizeName,
  prizePrompt,
  type BoardItem,
  type PrizeContext,
  type PrizeItem,
  type PrizeValue,
} from '../shared/prizeValue';
import { getItem, setItem, setSession } from '../shared/storage';
import { askAi, cents, realPrice } from './aiPricing';

// Valuing runs when the wheel loads, ahead of any bid; small batches prevent context degradation.
const AI_BATCH = 20;
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
      .filter((p) => p.title && !isHiddenSpot(p));
    const stale = [...new Map(items.map((p) => [prizePriceKey(p), p])).entries()].filter(([key]) => !isFresh(cache[key], now));
    if (!stale.length) return { ok: true };

    const next = { ...cache };
    const sold = (await getItem('soldHistory')) ?? [];
    const forAi: [string, PrizeItem][] = [];
    for (const [key, prize] of stale) {
      const name = clarifyPrizeName(prize.title);
      const real = await realPrice(name, sold, now);
      if (real) next[key] = { ...real, at: now };
      else forAi.push([key, { title: name, detail: clarifyPrizeName(prize.detail) }]);
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
      .filter((p) => p.title && !isHiddenSpot(p));
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
export const readEnvelopes = (
  breakId: string,
  image: string,
  prizes: PrizeItem[],
  others: PrizeItem[],
  ctx: PrizeContext,
  soldHidden: number | null = null,
): Promise<EnvelopeResult> =>
  lock(async () => {
    const now = Date.now();
    const cache = (await getItem('prizeValues')) ?? {};
    const hidden = prizes
      .map((p) => ({ title: String(p.title ?? '').trim(), detail: String(p.detail ?? '').trim() }))
      .filter((p) => p.title && isHiddenSpot(p));
    const wanted = [...new Map(hidden.map((p) => [wheelValueKey(breakId, p), p])).entries()].filter(
      ([key, prize]) => !isFresh(cache[key], now) && !isFresh(cache[seenKey(breakId, prize)], now),
    );
    if (!wanted.length) return { ok: true, matched: 0, board: 0 };

    const titles = wanted.map(([, p]) => p.title);
    const named = others.map((p) => ({ title: String(p.title ?? '').trim(), detail: String(p.detail ?? '').trim() })).filter((p) => p.title);
    await setSession('envelopeStatus', { state: 'running', count: wanted.length, detail: null, at: now });
    const answer = await askAi({
      instructions: ENVELOPE_INSTRUCTIONS,
      prompt: envelopePrompt(
        wanted.map(([, p]) => p),
        [...new Map(others.map((p) => p.title).filter((t) => t.trim() && !isHiddenPrize(t)).map((t) => [prizeIdentity(t), t])).values()],
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

    const { matched, board } = parseEnvelopeAnswer(answer.text, titles, 'envelopes', named.map((p) => p.title));
    const sold = (await getItem('soldHistory')) ?? [];
    const price = async (item: BoardItem): Promise<PrizeValue> => {
      const real = await realPrice(item.inside, sold, now);
      return real
        ? { ...real, inside: item.inside, at: now }
        : { low: cents(item.low), high: cents(item.high), source: 'ai', note: answer.model, inside: item.inside, at: now };
    };

    // A shelf number is not an envelope assignment. Named labels price that spot and leave the pool.
    const next = { ...cache };
    let namedHits = 0;
    const assignable = [...named, ...hidden.filter((p) => isNumberedPrize(p.title))];
    for (const r of matched) {
      const copies = assignable.filter((p) => p.title === r.title);
      if (copies.length !== 1) continue;
      next[seenKey(breakId, copies[0]!)] = await price(r);
      namedHits++;
    }
    if (namedHits) await setItem('prizeValues', trim(next));

    const left = wanted.map(([key]) => key);
    // An empty read (board off camera) keeps the last board, and the tab tries again.
    if (board.length && left.length) {
      const items: PrizeValue[] = [];
      for (const item of board) items.push(await price(item));
      const boards = (await getItem('envelopeBoards')) ?? {};
      const saved = nextEnvelopeBoard(boards[breakId] ?? null, { at: now, prizes: left, items }, soldHidden);
      if (saved !== boards[breakId]) {
        const nextBoards = { ...boards, [breakId]: saved };
        const keep = Object.keys(nextBoards)
          .sort((a, b) => nextBoards[b]!.at - nextBoards[a]!.at)
          .slice(0, MAX_BOARDS);
        await setItem('envelopeBoards', Object.fromEntries(keep.map((k) => [k, nextBoards[k]!])));
      }
    }
    await setSession('envelopeStatus', { state: 'done', count: matched.length + board.length, detail: null, at: Date.now() });
    return { ok: true, matched: namedHits, board: board.length };
  });
