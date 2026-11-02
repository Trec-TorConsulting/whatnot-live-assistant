// Warns before a bid goes past your ceiling. It never bids: an over-limit click is held once and
// goes through if you click again within a few seconds.
import { spentByPeriod } from '../shared/buyer';
import { DEFAULT_GUARD_SETTINGS, guardStatus, parseBidButton, sanitizeGuardSettings, type GuardSettings } from '../shared/guard';
import { formatMoney } from '../shared/money';
import { spentInShow, type Purchase } from '../shared/purchases';
import { getItem, onItemChanged } from '../shared/storage';
import { MINUTE, SECOND } from '../shared/time';
import { guardAppraisal } from '../shared/appraisal';
import { latestAppraisal } from './appraise';
import { allInLine, allInPrice, parseShipping } from '../shared/costs';
import { bidderNote, buyerSettings, currentSpot, watchFor, youOnLot } from './buyer';
import { onRetire } from './lifecycle';
import { liveSession, onLive } from './live';
import { overlay, type QuickBidButton } from './overlay';
import { fillMaxBid, quickBidAmount, type QuickBidKind } from './quickBid';
import {
  findBidButtons,
  findCustomBidButton,
  findMaxBidInput,
  findSetMaxBidButton,
  findShippingText,
  findWinningUser,
  labelOf,
} from './selectors';

const ARM_MS = 4 * SECOND;
const APPRAISAL_FRESH_MS = 15 * MINUTE;

let settings: GuardSettings = DEFAULT_GUARD_SETTINGS;
let purchases: Purchase[] = [];
let armed: { el: Element; until: number } | null = null;

const relevantRecord = (lotId: string | null) => {
  const a = latestAppraisal();
  if (!a) return null;
  if (a.lotId && lotId) return a.lotId === lotId ? a : null;
  return Date.now() - a.at < APPRAISAL_FRESH_MS ? a : null;
};

const statusFor = (bid: number | null) => {
  const session = liveSession();
  const lot = session?.lot ?? null;
  return guardStatus({
    bid,
    lot,
    settings,
    spentThisShow: session ? spentInShow(purchases, session.show.liveId) : 0,
    spentByPeriod: spentByPeriod(purchases, Date.now()),
    watchMax: watchFor(lot)?.max ?? null,
    appraisal: guardAppraisal(relevantRecord(lot?.id ?? null)),
  });
};

// Only for an appraisal of this lot that read a metal weight; spot is today's, not the appraisal's.
const perOzLine = (bid: number | null, lotId: string | null) => {
  const melt = relevantRecord(lotId)?.melt;
  if (!bid || !melt?.total || !melt.spot) return null;
  const oz = melt.total / melt.spot;
  if (oz <= 0) return null;
  const live = (melt.metal === 'gold' || melt.metal === 'silver' ? currentSpot()?.[melt.metal] : null) ?? melt.spot;
  const perOz = bid / oz;
  const premium = Math.round((perOz / live - 1) * 100);
  return `${formatMoney(perOz)}/oz ${melt.metal} · spot ${formatMoney(live)} (${premium >= 0 ? '+' : ''}${premium}%)`;
};

export const refreshGuard = () => {
  const lot = liveSession()?.lot ?? null;
  if (!lot || lot.status === 'sold') {
    overlay.setGuard(null);
    overlay.setQuickBids([]);
    return;
  }
  const s = statusFor(lot.currentBid);
  const session = liveSession();
  const withLeader = { ...lot, leader: lot.leader ?? findWinningUser() };
  const you = youOnLot(withLeader);
  const tax = buyerSettings().taxPercent;
  const shippingPaid = Boolean(session && purchases.some((p) => p.liveId === session.show.liveId));
  const allIn = lot.currentBid !== null ? allInLine(allInPrice(lot.currentBid, parseShipping(findShippingText()), tax, shippingPaid), tax) : null;
  overlay.setGuard({
    lotTitle: lot.title,
    bid: formatMoney(lot.currentBid),
    ceiling: s.ceiling !== null ? formatMoney(s.ceiling) : null,
    level: s.level,
    reasons: s.reasons,
    you,
    watch: watchFor(lot)?.text ?? null,
    perOz: perOzLine(lot.currentBid, lot.id),
    allIn,
    // Only worth a line when it's your money on the lot, or the leader is the host or a moderator.
    pusher: you !== 'leading' ? bidderNote(withLeader.leader, you !== null) : null,
  });
  overlay.setQuickBids(
    lot.status === 'active' && findCustomBidButton()
      ? [
          quickBidButton('plus1', '+$1', lot.currentBid, s.ceiling, lot.id),
          quickBidButton('plus5', '+$5', lot.currentBid, s.ceiling, lot.id),
          ...(s.ceiling ? [quickBidButton('max', `Max ${formatMoney(s.ceiling)}`, lot.currentBid, s.ceiling, lot.id)] : []),
        ]
      : [],
  );
};

// Judged at the amount it would type in. Without a max, budget, or appraised market value there's
// nothing to judge by, so it stays neutral rather than green.
const quickBidButton = (kind: QuickBidKind, label: string, currentBid: number | null, ceiling: number | null, lotId: string | null): QuickBidButton => {
  const amount = quickBidAmount(kind, currentBid, ceiling);
  const market = settings.warnOverMarket ? (guardAppraisal(relevantRecord(lotId))?.marketValue ?? null) : null;
  if (amount === null || (ceiling === null && !market)) return { kind, label, verdict: null, note: null };
  const s = statusFor(amount);
  if (s.level === 'over') return { kind, label, verdict: 'over', note: s.reasons[0] ?? `${formatMoney(amount)} is over your limit` };
  const within = ceiling !== null ? `within your max of ${formatMoney(ceiling)}` : `under the appraised market value of ${formatMoney(market)}`;
  return { kind, label, verdict: 'ok', note: `${formatMoney(amount)} is ${within}` };
};

export const quickBid = async (kind: QuickBidKind) => {
  const lot = liveSession()?.lot ?? null;
  const ceiling = statusFor(lot?.currentBid ?? null).ceiling;
  const amount = quickBidAmount(kind, lot?.currentBid ?? null, ceiling);
  if (amount === null) return overlay.notice(kind === 'max' ? 'Set a max (bid guard or watchlist) first.' : 'No current bid to add to.');
  const res = await fillMaxBid(amount);
  if (res !== 'filled') return overlay.notice(res === 'no-auction' ? 'No auction open to bid on.' : "Couldn't open Whatnot's Custom bid box.");
  const s = statusFor(amount);
  overlay.notice(
    s.level === 'over'
      ? `${formatMoney(amount)} typed in, but ${s.reasons[0] ?? "it's over your limit"}. Set Max Bid will ask twice.`
      : `Max bid ${formatMoney(amount)} typed in. Press Set Max Bid to confirm.`,
    6000,
  );
};

// Whatnot's own bid buttons, and Set Max Bid in the Custom box (its amount is in the box).
const bidAmountFor = (button: Element): number | null | undefined => {
  if (button === findSetMaxBidButton()) {
    const v = parseFloat((findMaxBidInput()?.value ?? '').replace(/[$,\s]/g, ''));
    return Number.isFinite(v) ? v : null;
  }
  if (!findBidButtons().includes(button as HTMLElement)) return undefined;
  return parseBidButton(labelOf(button)) ?? liveSession()?.lot?.currentBid ?? null;
};

const onClick = (e: MouseEvent) => {
  if (!settings.confirmOverMax || !e.isTrusted) return;
  const target = e.target as Element | null;
  const button = target?.closest('button, [role="button"]');
  if (!button) return;
  const amount = bidAmountFor(button);
  if (amount === undefined) return;
  const s = statusFor(amount);
  if (s.level !== 'over') return;
  if (armed && armed.el === button && Date.now() < armed.until) {
    armed = null;
    return;
  }
  e.preventDefault();
  e.stopImmediatePropagation();
  armed = { el: button, until: Date.now() + ARM_MS };
  overlay.notice(`${s.reasons[0] ?? 'Over your limit'}. Click again within ${ARM_MS / SECOND}s to bid anyway.`, ARM_MS);
};

export const startBidGuard = async () => {
  [settings, purchases] = await Promise.all([
    getItem('guardSettings').then(sanitizeGuardSettings),
    getItem('purchases').then((p) => p ?? []),
  ]);
  onItemChanged('guardSettings', (v) => {
    settings = sanitizeGuardSettings(v);
    refreshGuard();
  });
  onItemChanged('purchases', (v) => {
    purchases = v ?? [];
    refreshGuard();
  });
  onLive((_s, signals) => {
    if (signals.some((x) => x.kind === 'lot' || x.kind === 'sale')) refreshGuard();
  });
  window.addEventListener('click', onClick, true);
  onRetire(() => window.removeEventListener('click', onClick, true));
};
