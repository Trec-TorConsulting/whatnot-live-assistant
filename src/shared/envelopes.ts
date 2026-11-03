// Envelope wheels hide their big prizes in numbered envelopes and show the items on camera, often
// without saying which envelope holds which. Until an envelope is opened it is equally likely to
// hold any item on the board, so for the odds the unopened envelopes count as the board's items,
// one spot each. That keeps the spin's worth and its odds exact when the counts agree.
import { isHiddenSpot, isNumberedPrize, prizeKey, prizePriceKey, prizeValueKey, soldHiddenCount, wheelTitleKey, wheelValueKey, type BreakSnapshot } from './breaks';
import { manifestFrom, type PrizeValue } from './prizeValue';

export interface EnvelopeBoard {
  at: number;
  // Value keys of the envelopes the board was read for; a different set means envelopes were
  // opened since, so it's read again.
  prizes: string[];
  // Each item priced like a prize, with what it is in `inside`.
  items: PrizeValue[];
  // True after a later read dropped pool items following an envelope hit.
  revealed?: boolean;
  // Hidden spots already sold when this board was saved. A higher count on the next read is a hit.
  soldHidden?: number | null;
}

export interface WheelRow {
  // Where a value you type for this row is saved.
  key: string;
  titleKey: string | null;
  title: string;
  // The seller's condition text.
  detail: string;
  // What the video showed inside an envelope.
  inside: string | null;
  left: number;
  value: number | null;
  auto: PrizeValue | null;
  fromBoard: boolean;
  // The number is a floor: the break description was cut off or did not list every numbered hit.
  floor?: boolean;
}

export const boardKey = (breakId: string, inside: string) => `${breakId}#board|${prizeKey(inside)}`;

// What the video showed for a named prize on this wheel ("Silver Eagle" on camera as "2024 Silver
// Eagle PCGS MS 70"). Scoped to the wheel: another wheel's copy can be a different item.
export const seenKey = (breakId: string, p: { title: string; detail: string }) => `${breakId}#seen|${prizeValueKey(p)}`;

// The camera read names the exact item, so it wins unless it's only an AI guess and the prize's
// name already had a real price (melt or Whatnot sold); then the real price stays, with what the
// camera showed alongside.
export const pickAuto = (byName: PrizeValue | null, seen: PrizeValue | null): PrizeValue | null => {
  if (!seen) return byName;
  if (!byName || seen.source !== 'ai' || byName.source === 'ai') return seen;
  return { ...byName, inside: seen.inside };
};

// Yours first (by name and condition, else by name), then an automatic value at its low end.
const prizeRows = (b: BreakSnapshot, yours: Record<string, number>, auto: Record<string, PrizeValue>): WheelRow[] =>
  b.prizes.map((prize) => {
    const key = wheelValueKey(b.id, prize);
    const titleKey = wheelTitleKey(b.id, prize.title, prize.detail);
    const mine = yours[key] ?? yours[titleKey];
    const seen = auto[seenKey(b.id, prize)] ?? null;
    // Item #N is priced from the sticker read, or later from the break description. Its name is not a coin.
    if (isNumberedPrize(prize.title)) {
      const picked = mine === undefined ? seen : null;
      return {
        key,
        titleKey,
        title: prize.title,
        detail: prize.detail,
        inside: picked?.inside ?? null,
        left: prize.left,
        value: mine ?? picked?.low ?? null,
        auto: picked,
        fromBoard: false,
      };
    }
    // A hidden prize is not priced from its name. The pool average is applied in wheelRows.
    const namedAuto = auto[key] ?? auto[titleKey] ?? auto[prizePriceKey(prize)] ?? null;
    const a = mine === undefined && !isHiddenSpot(prize) ? pickAuto(namedAuto, seen) : null;
    return {
      key,
      titleKey,
      title: prize.title,
      detail: prize.detail,
      inside: a?.inside ?? null,
      left: prize.left,
      value: mine ?? a?.low ?? null,
      auto: a,
      fromBoard: false,
    };
  });

const isUnmatched = (r: WheelRow, b: BreakSnapshot) => {
  const prize = b.prizes.find((p) => p.title === r.title && p.detail === r.detail);
  return !r.fromBoard && r.value === null && r.left > 0 && !!prize && isHiddenSpot(prize);
};

// Envelopes still on the wheel with no value of their own.
export const unmatchedEnvelopes = (b: BreakSnapshot, yours: Record<string, number>, auto: Record<string, PrizeValue>) =>
  prizeRows(b, yours, auto).filter((r) => isUnmatched(r, b));

// Named prizes still on the wheel that the video hasn't shown yet; ones you priced are skipped.
export const unseenPrizes = (b: BreakSnapshot, yours: Record<string, number>, auto: Record<string, PrizeValue>) =>
  b.prizes.filter(
    (p) =>
      p.left > 0 &&
      !isHiddenSpot(p) &&
      yours[wheelValueKey(b.id, p)] === undefined &&
      yours[wheelTitleKey(b.id, p.title, p.detail)] === undefined &&
      !auto[seenKey(b.id, p)],
  );

export const boardIsCurrent = (board: EnvelopeBoard | null | undefined, unmatched: WheelRow[]) => {
  if (!board) return false;
  const keys = new Set(unmatched.map((r) => r.key));
  return board.prizes.length === keys.size && board.prizes.every((k) => keys.has(k));
};

const itemName = (inside: string | null | undefined) => (inside ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

// A shelf label prices a named spot only when it is that spot's name. Everything else is the pool.
const splitBoard = (b: BreakSnapshot, yours: Record<string, number>, items: PrizeValue[]) => {
  const pool: { item: PrizeValue; value: number | null }[] = [];
  const claimed = new Map<string, PrizeValue>();
  for (const item of items) {
    const name = itemName(item.inside);
    const named = b.prizes.find((p) => !isHiddenSpot(p) && prizeKey(p.title) === name);
    const key = named ? prizeValueKey(named) : '';
    if (named && key && !claimed.has(key)) claimed.set(key, item);
    else {
      const mine = yours[boardKey(b.id, item.inside ?? '')];
      pool.push({ item, value: mine ?? item.low });
    }
  }
  return { pool, claimed };
};

export interface EnvelopeSummary {
  topName: string | null;
  topValue: number | null;
  share: number | null;
  shareIncomplete: boolean;
  average: number | null;
  averageIsFloor: boolean;
  averageIncomplete: boolean;
  sealed: number;
  original: number | null;
  revealed: boolean;
}

// Each sealed envelope is the pool's average. The top item's share uses the count the wheel
// started with, until a reveal, so selling one sealed envelope does not make the rest worth more.
export const envelopeSummary = (
  b: BreakSnapshot,
  yours: Record<string, number>,
  _auto: Record<string, PrizeValue>,
  board: EnvelopeBoard | null = null,
): EnvelopeSummary => {
  const sealed = b.prizes.filter((p) => isHiddenSpot(p) && !isNumberedPrize(p.title)).reduce((n, p) => n + Math.max(0, p.left), 0);
  const sold = soldHiddenCount(b);
  const original = sold === null ? null : sealed + sold;
  const { pool } = splitBoard(b, yours, board?.items ?? []);
  const priced = pool.filter((p): p is { item: PrizeValue; value: number } => p.value !== null);
  const top = [...priced].sort((a, b) => b.value - a.value)[0] ?? null;
  const revealed = board?.revealed === true;
  const divisor = revealed ? sealed : original;
  const shareIncomplete = !revealed && original === null;
  // No camera pool yet is not an average of zero. A shelf larger than the wheel started with is incomplete.
  const fits = pool.length > 0 && original !== null && pool.length <= original;
  const sum = pool.reduce((n, p) => n + (p.value ?? 0), 0);
  const average = fits && original ? sum / original : null;
  const averageIsFloor = average !== null && (pool.length < original! || pool.some((p) => p.value === null));
  return {
    topName: top?.item.inside ?? null,
    topValue: top?.value ?? null,
    share: top && divisor ? top.value / divisor : null,
    shareIncomplete: shareIncomplete || (!top && sealed > 0),
    average,
    averageIsFloor,
    averageIncomplete: sealed > 0 && average === null,
    sealed,
    original,
    revealed,
  };
};

// An empty read keeps the last board. A read that drops most of the pool is ignored. A smaller
// strict subset counts as a reveal only after another envelope has sold.
export const nextEnvelopeBoard = (prev: EnvelopeBoard | null, next: EnvelopeBoard, soldHidden: number | null): EnvelopeBoard => {
  const fresh: EnvelopeBoard = { ...next, soldHidden, revealed: false };
  if (!next.items.length) return prev ? { ...prev } : fresh;
  if (!prev?.items.length) return fresh;
  const prevNames = new Set(prev.items.map((i) => itemName(i.inside)));
  const nextNames = next.items.map((i) => itemName(i.inside));
  const fewer = next.items.length < prev.items.length && nextNames.every((n) => prevNames.has(n));
  if (fewer && next.items.length * 2 < prev.items.length) return prev;
  const hitSince = soldHidden !== null && prev.soldHidden != null && soldHidden > prev.soldHidden;
  if (fewer && hitSince) return { ...fresh, revealed: true };
  if (fewer) return prev;
  const gained = nextNames.some((n) => !prevNames.has(n));
  return { ...fresh, revealed: gained ? false : (prev.revealed ?? false) };
};

// Each Item #N is an equal share of the coins named in the break description, or in the show notes
// when that description is empty or cut off, until a sticker read prices that number. A cut-off
// description counts the coins it never listed as zero.
export const numberedShare = (b: BreakSnapshot, auto: Record<string, PrizeValue>, notes?: string | null): { value: number; floor: boolean } | null => {
  const manifest = manifestFrom(b.description, notes);
  if (!manifest.items.length || b.hits === null || b.soldHasMore) return null;
  const left = b.prizes.filter((p) => isNumberedPrize(p.title)).reduce((n, p) => n + Math.max(0, p.left), 0);
  const sold = b.hits.filter((h) => !h.pending && isNumberedPrize(h.title)).length;
  const original = left + sold;
  if (!original) return null;
  let sum = 0;
  let missing = 0;
  let listed = 0;
  for (const item of manifest.items) {
    listed += item.qty;
    const priced = auto[prizePriceKey({ title: item.name, detail: '' })];
    if (!priced) missing += item.qty;
    else sum += priced.low * item.qty;
  }
  if (!listed || missing === listed) return null;
  return { value: sum / original, floor: manifest.truncated || missing > 0 || listed < original };
};

// Hidden spots take the envelope average. Named spots keep their own prices. Board items are not
// extra spots, and a crowded shelf is not trimmed down to the cheapest rows.
export const wheelRows = (
  b: BreakSnapshot,
  yours: Record<string, number>,
  auto: Record<string, PrizeValue>,
  board: EnvelopeBoard | null = null,
  notes?: string | null,
): WheelRow[] => {
  const summary = envelopeSummary(b, yours, auto, board);
  const { claimed } = splitBoard(b, yours, board?.items ?? []);
  return prizeRows(b, yours, auto).map((row) => {
    const prize = b.prizes.find((p) => p.title === row.title && p.detail === row.detail);
    if (prize && isNumberedPrize(prize.title)) {
      if (row.value !== null) return row;
      const share = numberedShare(b, auto, notes);
      if (!share) return row;
      return { ...row, value: share.value, floor: share.floor, auto: null, inside: null };
    }
    if (!prize || !isHiddenSpot(prize)) {
      const claim = claimed.get(prizeValueKey(prize ?? { title: row.title, detail: row.detail }));
      if (!claim || row.value !== null) return row;
      return { ...row, inside: claim.inside ?? row.inside, value: claim.low, auto: claim, fromBoard: false };
    }
    const mine = yours[row.key] ?? (row.titleKey ? yours[row.titleKey] : undefined);
    if (mine !== undefined) return { ...row, value: mine, auto: null };
    if (summary.average === null) return { ...row, value: null, auto: null, inside: null };
    return { ...row, value: summary.average, auto: null, inside: null };
  });
};
