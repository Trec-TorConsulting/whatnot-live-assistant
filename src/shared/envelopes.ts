// Envelope wheels hide their big prizes in numbered envelopes and show the items on camera, often
// without saying which envelope holds which. Until an envelope is opened it is equally likely to
// hold any item on the board, so for the odds the unopened envelopes count as the board's items,
// one spot each. That keeps the spin's worth and its odds exact when the counts agree.
import { isHiddenPrize, prizeKey, prizeValueKey, wheelTitleKey, wheelValueKey, type BreakSnapshot } from './breaks';
import type { PrizeValue } from './prizeValue';

export interface EnvelopeBoard {
  at: number;
  // Value keys of the envelopes the board was read for; a different set means envelopes were
  // opened since, so it's read again.
  prizes: string[];
  // Each item priced like a prize, with what it is in `inside`.
  items: PrizeValue[];
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
    const titleKey = wheelTitleKey(b.id, prize.title);
    const mine = yours[key] ?? yours[titleKey];
    const seen = isHiddenPrize(prize.title) ? null : (auto[seenKey(b.id, prize)] ?? null);
    const a = mine === undefined ? pickAuto(auto[key] ?? auto[titleKey] ?? null, seen) : null;
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

const isUnmatched = (r: WheelRow) => !r.fromBoard && r.value === null && r.left > 0 && isHiddenPrize(r.title);

// Envelopes still on the wheel with no value of their own.
export const unmatchedEnvelopes = (b: BreakSnapshot, yours: Record<string, number>, auto: Record<string, PrizeValue>) =>
  prizeRows(b, yours, auto).filter(isUnmatched);

// Named prizes still on the wheel that the video hasn't shown yet; ones you priced are skipped.
export const unseenPrizes = (b: BreakSnapshot, yours: Record<string, number>, auto: Record<string, PrizeValue>) =>
  b.prizes.filter(
    (p) =>
      p.left > 0 &&
      !isHiddenPrize(p.title) &&
      yours[wheelValueKey(b.id, p)] === undefined &&
      yours[wheelTitleKey(b.id, p.title)] === undefined &&
      !auto[seenKey(b.id, p)],
  );

export const boardIsCurrent = (board: EnvelopeBoard | null | undefined, unmatched: WheelRow[]) => {
  if (!board) return false;
  const keys = new Set(unmatched.map((r) => r.key));
  return board.prizes.length === keys.size && board.prizes.every((k) => keys.has(k));
};

// More board items than envelopes means some already went (or the read caught extras): the
// cheapest are kept so the worth stays a floor. Fewer means some envelopes' items weren't on
// camera, and those stay unpriced.
export const wheelRows = (
  b: BreakSnapshot,
  yours: Record<string, number>,
  auto: Record<string, PrizeValue>,
  board: EnvelopeBoard | null = null,
): WheelRow[] => {
  const rows = prizeRows(b, yours, auto);
  const unmatched = rows.filter(isUnmatched);
  if (!board?.items.length || !unmatched.length) return rows;
  const envelopes = unmatched.reduce((n, r) => n + r.left, 0);
  const items = board.items
    .map((item): WheelRow => {
      const key = boardKey(b.id, item.inside ?? '');
      const mine = yours[key];
      return {
        key,
        titleKey: null,
        title: 'Envelope',
        detail: '',
        inside: item.inside ?? null,
        left: 1,
        value: mine ?? item.low,
        auto: mine === undefined ? item : null,
        fromBoard: true,
      };
    })
    .sort((x, y) => x.value! - y.value!)
    .slice(0, envelopes);
  const unseen = envelopes - items.length;
  const rest: WheelRow[] = unseen
    ? [{ key: `${b.id}#board|unseen`, titleKey: null, title: 'Envelope', detail: '', inside: 'not on camera', left: unseen, value: yours[`${b.id}#board|unseen`] ?? null, auto: null, fromBoard: true }]
    : [];
  return [...rows.filter((r) => !isUnmatched(r)), ...items, ...rest];
};
