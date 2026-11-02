// On a wheel show each spin is its own auction, so the overlay shows whether the next spin is worth
// its bid instead of an appraisal. Same values as the side panel: yours first, then automatic ones
// at the low end of their range.
import { spotsLeft, type BreakSnapshot } from '../shared/breaks';
import { envelopeSummary, unmatchedEnvelopes, wheelRows, type EnvelopeBoard } from '../shared/envelopes';
import type { LiveSession, Lot } from '../shared/live';
import { formatMoney } from '../shared/money';
import type { PrizeValue } from '../shared/prizeValue';
import { getItem, onItemChanged } from '../shared/storage';
import { MINUTE, SECOND } from '../shared/time';
import { emptyWheel, wheelOdds } from '../shared/wheel';
import { checkEnvelopes, checkNamedPrizes } from './envelopes';
import { every } from './lifecycle';
import { liveSession, onLive } from './live';
import { overlay, type WheelFact, type WheelView } from './overlay';

const STALE_MS = MINUTE;
const TOP_PRIZES = 3;

export const activeWheel = (s: LiveSession | null): BreakSnapshot | null => (s?.wheel && s.wheel.id === s.breakId ? s.wheel : null);

const pct = (p: number) => `${(p * 100).toFixed(p > 0 && p < 0.1 ? 1 : 0)}%`;

export const wheelView = (
  b: BreakSnapshot,
  lot: Lot | null,
  values: Record<string, number>,
  autoValues: Record<string, PrizeValue>,
  now = Date.now(),
  board: EnvelopeBoard | null = null,
): WheelView => {
  const rows = wheelRows(b, values, autoValues, board);
  // A spin's price is its auction: the current bid, or the opening bid before anyone bids.
  const spin = lot?.breakId === b.id ? lot : null;
  const price = spin ? (spin.currentBid ?? spin.nextBid) : null;
  const o = wheelOdds({
    ...emptyWheel(b.id, b.fetchedAt),
    price,
    slots: rows.map((r) => ({ label: r.title, total: r.left, left: r.left, value: r.value })),
  });
  const left = spotsLeft(b);
  const hasPrice = price !== null && price > 0;

  // Kept to one short line so the card doesn't change height as bids come in.
  const verdict =
    o.verdict === 'empty'
      ? 'No spots left'
      : !hasPrice
        ? 'Waiting for the next spin’s bid'
        : o.verdict === 'worth'
          ? `Worth it: ${o.expectedIsFloor ? '≥ ' : ''}${formatMoney(o.edge)} over the bid`
          : o.verdict === 'not_worth'
            ? o.spinsUntilWorth === null
              ? 'Not worth it: every prize is below the bid'
              : `Not worth it yet: ${o.spinsUntilWorth} more cheap ${o.spinsUntilWorth === 1 ? 'hit' : 'hits'} needed`
            : 'Unclear: some prizes have no value yet';

  // A spin that sold but hasn't been spun yet only has its spot number, not a prize.
  const lastHit = b.hits?.filter((h) => !h.pending).pop() ?? null;
  const unpriced = rows.filter((r) => r.value === null).length;
  const unread = board?.items.length ? 0 : unmatchedEnvelopes(b, values, autoValues).length;
  const pool = envelopeSummary(b, values, autoValues, board);
  const envelopeFacts: WheelFact[] =
    pool.sealed > 0
      ? [
          { label: 'Top item', value: pool.topValue !== null ? formatMoney(pool.topValue) : '—', detail: pool.topName },
          { label: 'Sealed share', value: pool.share !== null && !pool.shareIncomplete ? formatMoney(pool.share) : 'incomplete', detail: null },
          {
            label: 'Envelope average',
            value: pool.average !== null && !pool.averageIncomplete ? `${pool.averageIsFloor ? '≥ ' : ''}${formatMoney(pool.average)}` : 'incomplete',
            detail: null,
          },
        ]
      : [];
  const age = now - b.fetchedAt;

  // The same prize can be listed as separate options; its odds are all its copies together.
  const byPrize = new Map<string, { title: string; value: number; left: number }>();
  for (const r of rows) {
    if (r.value === null || r.left <= 0) continue;
    const seen = byPrize.get(r.key);
    const title = seen?.title ?? [r.title, r.inside ?? r.detail].filter(Boolean).join(' · ');
    byPrize.set(r.key, { title, value: r.value, left: (seen?.left ?? 0) + r.left });
  }
  const top = [...byPrize.values()].sort((x, y) => y.value - x.value || y.left - x.left).slice(0, TOP_PRIZES);

  return {
    title: [b.title ?? 'Wheel', left !== null && b.total !== null ? `${left} of ${b.total} spots left` : `${o.spotsLeft} spots left`].join(' · '),
    value: o.expectedValue !== null ? `Worth ${o.expectedIsFloor ? '≥ ' : ''}${formatMoney(o.expectedValue)} a spin` : 'Wheel is empty',
    verdict,
    level: o.verdict === 'worth' ? 'worth' : o.verdict === 'not_worth' ? 'not_worth' : 'unclear',
    // Always the same rows in the same order, with a dash for what isn't known yet.
    facts: [
      { label: 'Beats the bid', value: o.chanceBeatPrice !== null ? `${pct(o.chanceBeatPrice)} chance` : '—', detail: null },
      ...Array.from({ length: TOP_PRIZES }, (_, i) => {
        const p = top[i];
        return {
          label: `#${i + 1} prize`,
          value: p && o.spotsLeft ? `${formatMoney(p.value)} · ${pct(p.left / o.spotsLeft)} chance` : '—',
          detail: p ? `${p.title}${p.left > 1 ? ` (${p.left} left)` : ''}` : null,
        };
      }),
      {
        label: 'Last spin',
        value: lastHit
          ? [lastHit.price !== null ? formatMoney(lastHit.price) : null, lastHit.buyer ? `@${lastHit.buyer}` : null].filter(Boolean).join(' · ') || '—'
          : '—',
        detail: lastHit?.title ?? null,
      },
      ...envelopeFacts,
    ] satisfies WheelFact[],
    warnings: [
      unpriced ? `${unpriced} ${unpriced === 1 ? 'prize has' : 'prizes have'} no value yet (counted as $0).` : null,
      unread ? `${unread} ${unread === 1 ? 'envelope' : 'envelopes'} not read off the video yet; retrying while the board is on camera.` : null,
      rows.some((r) => r.inside && r.auto) ? 'Some prizes were AI-read from the video; check them against the board.' : null,
      !b.complete ? 'Whatnot sent only part of the prize list, so these odds are incomplete.' : null,
      age >= STALE_MS ? `Prize counts last updated ${Math.round(age / MINUTE)}m ago.` : null,
    ].filter((w): w is string => Boolean(w)),
  };
};

let values: Record<string, number> = {};
let autoValues: Record<string, PrizeValue> = {};
let boards: Record<string, EnvelopeBoard> = {};
let shown = '';

// Live updates arrive with every chat message; the panel only redraws when the status changes.
export const refreshWheel = () => {
  const s = liveSession();
  const b = activeWheel(s);
  const board = b ? (boards[b.id] ?? null) : null;
  if (b) {
    checkEnvelopes(b, s, values, autoValues, board);
    checkNamedPrizes(b, s, values, autoValues);
  }
  const view = b ? wheelView(b, s?.lot ?? null, values, autoValues, Date.now(), board) : null;
  const key = JSON.stringify(view);
  if (key === shown) return;
  shown = key;
  overlay.setWheel(view);
};

export const startWheelStatus = async () => {
  [values, autoValues, boards] = await Promise.all([
    getItem('wheelValues').then((v) => v ?? {}),
    getItem('prizeValues').then((v) => v ?? {}),
    getItem('envelopeBoards').then((v) => v ?? {}),
  ]);
  onItemChanged('wheelValues', (v) => {
    values = v ?? {};
    refreshWheel();
  });
  onItemChanged('prizeValues', (v) => {
    autoValues = v ?? {};
    refreshWheel();
  });
  onItemChanged('envelopeBoards', (v) => {
    boards = v ?? {};
    refreshWheel();
  });
  onLive(() => refreshWheel());
  every(refreshWheel, 5 * SECOND);
};
