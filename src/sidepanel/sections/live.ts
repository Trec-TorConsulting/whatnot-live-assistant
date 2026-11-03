import { BASIS_LABEL, ITEM_TYPE_LABEL, bidHeadline, guardAppraisal, lotLine, type AppraisalRecord } from '../../shared/appraisal';
import {
  DEFAULT_BUYER_SETTINGS,
  matchWatch,
  sanitizeBuyerSettings,
  sanitizeSellerNotes,
  sellerHistory,
  sellerKey,
  sellerLine,
  spentByPeriod,
  type BuyerSettings,
  type SellerNote,
} from '../../shared/buyer';
import { checksFor } from '../../shared/counterfeit';
import { flipLine, flipProfit } from '../../shared/costs';
import { closesLine, profileCaution, profileLine, sellerCloses, type SellerProfile } from '../../shared/sellerInfo';
import { DEFAULT_GUARD_SETTINGS, guardStatus, sanitizeGuardSettings, type GuardSettings } from '../../shared/guard';
import { summarizeSales, type LiveSession } from '../../shared/live';
import { send, sendToTab } from '../../shared/messages';
import { formatMoney } from '../../shared/money';
import { spentInShow, type Purchase } from '../../shared/purchases';
import {
  getBuyerSettings,
  getItem,
  getOverlayPrefs,
  getSellerNotes,
  getSession,
  getTabAppraisal,
  getTabLive,
  latestAppraisalKey,
  liveKey,
  onItemChanged,
  onSessionKeyChanged,
  setItem,
  type Monitor,
  type OverlayPrefs,
} from '../../shared/storage';
import type { ShopHit } from '../../shared/shop';
import { formatDuration } from '../../shared/time';
import { $, li, liveIdOfTab, numberOf, onActiveTab, runCommand, setNumber, toast } from '../ui';

const el = {
  title: $('#live-title'),
  meta: $('#live-meta'),
  lot: $('#live-lot'),
  notesCard: $('#notes-card'),
  notesCoupons: $('#notes-coupons'),
  notesText: $('#notes-text'),
  shopCard: $('#shop-card'),
  shopSummary: $('#shop-summary'),
  shopHits: $('#shop-hits'),
  appraise: $<HTMLButtonElement>('#live-appraise'),
  overlayShow: $<HTMLInputElement>('#overlay-show'),
  overlayReset: $<HTMLButtonElement>('#overlay-reset'),
  overlayAuto: $<HTMLInputElement>('#overlay-auto'),
  appraisalCard: $('#live-appraisal-card'),
  appraisal: $('#live-appraisal'),
  guardLot: $<HTMLInputElement>('#guard-lot'),
  guardDefault: $<HTMLInputElement>('#guard-default'),
  guardBudget: $<HTMLInputElement>('#guard-budget'),
  guardPercent: $<HTMLInputElement>('#guard-percent'),
  guardMarket: $<HTMLInputElement>('#guard-market'),
  guardConfirm: $<HTMLInputElement>('#guard-confirm'),
  guardSave: $<HTMLButtonElement>('#guard-save'),
  guardClearLot: $<HTMLButtonElement>('#guard-clear-lot'),
  guardNote: $('#guard-note'),
  guardDaily: $<HTMLInputElement>('#guard-daily'),
  guardWeekly: $<HTMLInputElement>('#guard-weekly'),
  guardMonthly: $<HTMLInputElement>('#guard-monthly'),
  guardLeft: $('#guard-left'),
  sellerCard: $('#seller-card'),
  sellerTitle: $('#seller-title'),
  sellerHistory: $('#seller-history'),
  sellerNote: $<HTMLTextAreaElement>('#seller-note'),
  sellerBlocked: $<HTMLInputElement>('#seller-blocked'),
  sellerSave: $<HTMLButtonElement>('#seller-save'),
  sellerSaved: $('#seller-saved'),
  sellerProfile: $('#seller-profile'),
  sellerCloses: $('#seller-closes'),
  flip: $('#live-flip'),
  checksBox: $<HTMLDetailsElement>('#live-checks-box'),
  checks: $('#live-checks'),
  monitorInput: $<HTMLInputElement>('#monitor-input'),
  monitorAdd: $<HTMLButtonElement>('#monitor-add'),
  monitorList: $('#monitor-list'),
  revenue: $('#stat-revenue'),
  orders: $('#stat-orders'),
  giveaways: $('#stat-giveaways'),
  viewers: $('#stat-viewers'),
  buyers: $('#stat-buyers'),
  sales: $('#stat-sales'),
};

let tabId: number | null = null;
let session: LiveSession | null = null;
let appraisal: AppraisalRecord | null = null;
let guard: GuardSettings = DEFAULT_GUARD_SETTINGS;
let purchases: Purchase[] = [];
let buyer: BuyerSettings = DEFAULT_BUYER_SETTINGS;
let sellerNotes: Record<string, SellerNote> = {};
let unsubscribe: (() => void)[] = [];

const renderAppraisal = () => {
  el.appraisalCard.hidden = !appraisal;
  if (!appraisal) return;
  const v = appraisal.valuation;
  const rows: [string, string][] = [
    ['Item', `${appraisal.name}${appraisal.grade ? ` · ${appraisal.grade}` : ''}${appraisal.quantity > 1 ? ` · x${appraisal.quantity}` : ''}`],
    ...(appraisal.itemType ? [['Type', ITEM_TYPE_LABEL[appraisal.itemType]] as [string, string]] : []),
    ['Melt', formatMoney(v.meltValue)],
    ['Market', v.marketValue !== null ? `${formatMoney(v.marketValue)} (${BASIS_LABEL[v.basis]})` : '—'],
    ...(appraisal.lot && appraisal.lot.pieces.length >= 2
      ? ([
          ['By price', appraisal.lot.pieces.map(lotLine).join(' · ')],
          ['Total', formatMoney(appraisal.lot.total)],
        ] as [string, string][])
      : []),
    ['Bid', bidHeadline(appraisal) ?? '—'],
    ['Confidence', String(appraisal.confidence)],
  ];
  if (appraisal.comps) {
    const c = appraisal.comps;
    rows.push(['Whatnot sales', c.count > 1 ? `${c.count} sold ${formatMoney(c.low)}–${formatMoney(c.high)}, median ${formatMoney(c.median)}` : `1 sold for ${formatMoney(c.low)}`]);
  }
  if (appraisal.price?.guide && appraisal.price.guide > 0 && v.basis !== 'guide') {
    rows.push(['PCGS guide', `${formatMoney(appraisal.price.guide)} (not a sale)`]);
  }
  if (v.basis === 'estimate' && appraisal.estimate) {
    rows.push(['AI estimate', `${formatMoney(appraisal.estimate.low)}–${formatMoney(appraisal.estimate.high)} each (not real sales)`]);
  }
  if (appraisal.priceNote) rows.push(['Note', appraisal.priceNote]);
  const dl = document.createElement('dl');
  dl.className = 'kv';
  for (const [k, val] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = k;
    const dd = document.createElement('dd');
    dd.textContent = val;
    if (k === 'Bid' && val.startsWith('Max bid')) dd.className = 'good';
    dl.append(dt, dd);
  }
  el.appraisal.replaceChildren(dl);

  // Resale at the market value, against the current bid on this lot (or else the suggested max).
  const lot = session?.lot && (!appraisal.lotId || appraisal.lotId === session.lot.id) ? session.lot : null;
  const guarded = guardAppraisal(appraisal);
  const cost = lot?.currentBid ?? guarded?.suggestedMax ?? null;
  const atLabel = lot?.currentBid ? 'At the current bid' : v.basis === 'estimate' ? 'At the low end of the guess' : v.basis === 'melt' ? 'At melt' : 'At your max';
  el.flip.textContent = v.marketValue && cost ? `${atLabel}: ${flipLine(flipProfit(v.marketValue, cost, buyer.feePercent))}` : '';
  const checks = checksFor({ itemType: appraisal.itemType, slabbed: Boolean(appraisal.slabbed), metal: appraisal.melt?.metal ?? null, keyDate: false });
  el.checksBox.hidden = !checks.length;
  const shown = checks.join('|');
  if (el.checks.dataset.shown !== shown) {
    el.checks.dataset.shown = shown;
    el.checks.replaceChildren(...checks.map((c) => li(c)));
  }
};

// --- Shows watched in background tabs ---

let monitors: Monitor[] = [];
const monitorLive = new Map<number, LiveSession | null>();

const refreshMonitors = async () => {
  monitors = Object.values((await getSession('monitors')) ?? {});
  await Promise.all(monitors.map(async (m) => monitorLive.set(m.tabId, (await getTabLive(m.tabId)) ?? null)));
  renderMonitors();
};

const renderMonitors = () => {
  el.monitorList.replaceChildren(
    ...monitors.map((m) => {
      const s = monitorLive.get(m.tabId);
      const lot = s?.lot;
      const left = lot?.endsAt ? lot.endsAt - Date.now() : null;
      const watch = lot ? matchWatch(lot.title, buyer.watchlist) : null;
      const text = [
        `${s?.show.host ? `@${s.show.host}` : (m.host ? `@${m.host}` : 'Show')}: ${s?.show.title ?? m.title ?? m.liveId}`,
        lot ? `${watch ? '★ ' : ''}${lot.title ?? 'Current lot'} ${formatMoney(lot.currentBid)}${left && left > 0 ? ` · ${formatDuration(left)} left` : ''}` : 'waiting for an auction',
      ].join(' — ');
      const item = li(text, watch ? 'good' : '');
      const open = Object.assign(document.createElement('button'), { className: 'secondary small', textContent: 'Open', type: 'button' });
      open.addEventListener('click', () => void runCommand(send('MONITOR_FOCUS', { liveId: m.liveId })));
      const stop = Object.assign(document.createElement('button'), { className: 'secondary small', textContent: 'Stop', type: 'button' });
      stop.addEventListener('click', () => void runCommand(send('MONITOR_REMOVE', { liveId: m.liveId })));
      item.append(' ', open, ' ', stop);
      return item;
    }),
  );
  if (!monitors.length) el.monitorList.replaceChildren(li('Not watching any other shows.', 'muted'));
};

const addMonitorFromInput = async () => {
  const raw = el.monitorInput.value.trim();
  const liveId = raw.match(/\/live\/([^/?#\s]+)/)?.[1] ?? raw;
  if (!liveId) return toast('Paste a show link first.');
  if (await runCommand(send('MONITOR_ADD', { liveId }), 'Watching in the background.')) el.monitorInput.value = '';
};

const renderNotes = () => {
  const note = session?.show.note;
  const text = note?.text?.trim() ?? '';
  const coupons = note?.coupons ?? [];
  el.notesCard.hidden = !text && !coupons.length;
  if (el.notesCard.hidden) return;
  el.notesCoupons.replaceChildren(
    ...coupons.map((code) => {
      const line = document.createElement('div');
      line.className = 'good';
      line.textContent = `Coupon ${code}`;
      return line;
    }),
  );
  el.notesText.textContent = text;
};

const renderLot = () => {
  const lot = session?.lot;
  el.lot.hidden = !lot;
  if (!lot || !session) return;
  const status = guardStatus({
    bid: lot.currentBid,
    lot,
    settings: guard,
    spentThisShow: spentInShow(purchases, session.show.liveId),
    spentByPeriod: spentByPeriod(purchases, Date.now()),
    watchMax: matchWatch(lot.title, buyer.watchlist)?.max ?? null,
    appraisal: appraisal && (!appraisal.lotId || appraisal.lotId === lot.id) ? appraisal.valuation : null,
  });
  el.lot.className = `lot ${status.level}`;
  const left = lot.endsAt ? lot.endsAt - Date.now() : null;
  el.lot.replaceChildren(
    Object.assign(document.createElement('div'), { className: 'muted small', textContent: lot.title ?? 'Current lot' }),
    Object.assign(document.createElement('div'), {
      className: 'big',
      textContent: `${formatMoney(lot.currentBid)}${status.ceiling !== null ? ` / max ${formatMoney(status.ceiling)}` : ''}`,
    }),
    Object.assign(document.createElement('div'), {
      className: 'muted small',
      textContent: [
        lot.bidCount !== null ? `${lot.bidCount} bids` : null,
        lot.leader ? `leader @${lot.leader}` : null,
        left !== null && left > 0 ? `${formatDuration(left)} left` : lot.status === 'sold' ? 'sold' : null,
      ]
        .filter(Boolean)
        .join(' · '),
    }),
    ...status.reasons.map((r) => Object.assign(document.createElement('div'), { className: 'bad-text small', textContent: r })),
  );
};

const shopLabel = (h: ShopHit) => (h.kind === 'steal' ? 'Steal' : h.kind === 'deal' ? 'Deal' : 'Must-have');

const renderShop = () => {
  const shop = session?.shop ?? null;
  el.shopCard.hidden = !shop;
  if (!shop) return;
  el.shopSummary.textContent =
    shop.status === 'error'
      ? "Couldn't read this show's shop."
      : shop.binCount
        ? `Checked ${shop.binCount} buy-it-now item${shop.binCount === 1 ? '' : 's'}.`
        : 'No buy-it-now items in this shop.';
  const rows = shop.hits.map((h) =>
    li(`${shopLabel(h)}: ${h.title} — ${formatMoney(h.price)}. ${h.reason}`, h.kind === 'steal' ? 'good' : ''),
  );
  if (!rows.length && shop.status === 'ready' && shop.binCount) rows.push(li('No deals in the buy-it-now shop.', 'muted'));
  el.shopHits.replaceChildren(...rows);
};

const renderStats = () => {
  const s = session ? summarizeSales(session.sales) : null;
  el.revenue.textContent = s ? formatMoney(s.revenue) : '—';
  el.orders.textContent = s ? String(s.orders) : '—';
  el.giveaways.textContent = s ? String(Math.max(s.giveaways, session?.giveaways.length ?? 0)) : '—';
  el.viewers.textContent = session?.show.viewers != null ? session.show.viewers.toLocaleString() : '—';
  el.buyers.replaceChildren(...(s?.topBuyers ?? []).map((b) => li(`@${b.user}: ${formatMoney(b.spend)} (${b.orders})`)));
  el.sales.replaceChildren(
    ...(session?.sales ?? [])
      .slice(-10)
      .reverse()
      .map((x) => li(`${x.title ?? 'Item'} → @${x.buyer ?? '?'} ${x.kind === 'giveaway' ? '(giveaway)' : formatMoney(x.price)}`)),
  );
};

export const renderLive = () => {
  if (!session) {
    el.title.textContent = 'No live show';
    el.meta.textContent = tabId === null ? 'Open a Whatnot live show in the active tab.' : 'Waiting for show data… (refresh the show tab if this stays empty)';
  } else {
    const show = session.show;
    el.title.textContent = show.title ?? 'Live show';
    el.meta.textContent = [
      show.host ? `@${show.host}` : null,
      show.viewers != null ? `${show.viewers.toLocaleString()} watching` : null,
      show.shareCount != null ? `${show.shareCount} shares` : null,
      show.activeGiveawayId ? 'giveaway running' : null,
      show.isFollowingHost === true ? 'following' : null,
    ]
      .filter(Boolean)
      .join(' · ');
  }
  el.appraise.disabled = tabId === null;
  renderNotes();
  renderLot();
  renderShop();
  renderAppraisal();
  renderStats();
  renderBudgetLeft();
  renderSeller();
};

const renderBudgetLeft = () => {
  const spent = spentByPeriod(purchases, Date.now());
  const left = (
    [
      ['Today', guard.dailyBudget, spent.day],
      ['This week', guard.weeklyBudget, spent.week],
      ['This month', guard.monthlyBudget, spent.month],
    ] as const
  )
    .filter(([, budget]) => budget > 0)
    .map(([label, budget, used]) => `${label}: ${formatMoney(Math.max(0, budget - used))} left of ${formatMoney(budget)}`);
  el.guardLeft.textContent = left.join(' · ');
};

let sellerShown = '';
let closesFor = '';
let sellerProfiles: Record<string, SellerProfile> = {};
const renderSeller = () => {
  const host = session?.show.host ?? null;
  el.sellerCard.hidden = !host;
  if (!host) return;
  const h = sellerHistory(purchases, host, session?.show.liveId ?? null);
  el.sellerTitle.textContent = `@${host}`;
  el.sellerHistory.textContent = sellerLine(h, Date.now()) ?? "You haven't won anything from them yet.";
  const p = sellerProfiles[sellerKey(host)];
  el.sellerProfile.textContent = p
    ? [
        profileLine(p),
        profileCaution(p),
        p.joinedAt ? `joined ${new Date(p.joinedAt).toLocaleDateString()}` : null,
        `first seen here ${new Date(p.firstSeen).toLocaleDateString()}`,
      ]
        .filter(Boolean)
        .join(' · ')
    : 'Profile numbers load when the show tab opens.';
  if (closesFor !== sellerKey(host)) {
    closesFor = sellerKey(host);
    void Promise.all([getItem('soldHistory'), getItem('appraisals')]).then(([sold, apps]) => {
      el.sellerCloses.textContent = closesLine(sellerCloses(sold ?? [], apps ?? [], host, Date.now())) ?? 'Not enough of their sales seen yet to compare with market.';
    });
  }
  // Only refill the form when the seller changes, so typing isn't overwritten every second.
  if (sellerShown === sellerKey(host)) return;
  sellerShown = sellerKey(host);
  const note = sellerNotes[sellerShown];
  el.sellerNote.value = note?.note ?? '';
  el.sellerBlocked.checked = Boolean(note?.blocked);
  el.sellerSaved.textContent = '';
};

const saveSeller = async () => {
  const host = session?.show.host;
  if (!host) return;
  const next = { ...sellerNotes };
  const key = sellerKey(host);
  const note = el.sellerNote.value.trim();
  if (note || el.sellerBlocked.checked) next[key] = { note, blocked: el.sellerBlocked.checked, at: Date.now() };
  else delete next[key];
  await setItem('sellerNotes', sanitizeSellerNotes(next));
  el.sellerSaved.textContent = 'Saved.';
};

const fillGuard = () => {
  setNumber(el.guardDefault, guard.defaultMaxBid);
  setNumber(el.guardBudget, guard.showBudget);
  setNumber(el.guardDaily, guard.dailyBudget);
  setNumber(el.guardWeekly, guard.weeklyBudget);
  setNumber(el.guardMonthly, guard.monthlyBudget);
  el.guardPercent.value = String(guard.maxBidPercent);
  el.guardMarket.checked = guard.warnOverMarket;
  el.guardConfirm.checked = guard.confirmOverMax;
  const lotId = session?.lot?.id;
  setNumber(el.guardLot, lotId ? guard.lotMax[lotId] : null);
  el.guardLot.disabled = !lotId;
  el.guardClearLot.disabled = !lotId || !guard.lotMax[lotId];
};

const saveGuard = async () => {
  const lotId = session?.lot?.id;
  const lotMax = { ...guard.lotMax };
  const lotValue = numberOf(el.guardLot);
  if (lotId) {
    if (lotValue && lotValue > 0) lotMax[lotId] = lotValue;
    else delete lotMax[lotId];
  }
  const next = sanitizeGuardSettings({
    defaultMaxBid: numberOf(el.guardDefault) ?? 0,
    showBudget: numberOf(el.guardBudget) ?? 0,
    dailyBudget: numberOf(el.guardDaily) ?? 0,
    weeklyBudget: numberOf(el.guardWeekly) ?? 0,
    monthlyBudget: numberOf(el.guardMonthly) ?? 0,
    maxBidPercent: numberOf(el.guardPercent) ?? DEFAULT_GUARD_SETTINGS.maxBidPercent,
    warnOverMarket: el.guardMarket.checked,
    confirmOverMax: el.guardConfirm.checked,
    lotMax,
  });
  await setItem('guardSettings', next);
  el.guardNote.textContent = 'Saved.';
};

const watchTab = async (id: number | null) => {
  unsubscribe.forEach((u) => u());
  unsubscribe = [];
  tabId = id;
  session = null;
  appraisal = null;
  if (id !== null) {
    [session, appraisal] = await Promise.all([getTabLive(id).then((s) => s ?? null), getTabAppraisal(id).then((a) => a ?? null)]);
    unsubscribe.push(
      onSessionKeyChanged(liveKey(id), (v) => {
        const lotChanged = (v as LiveSession | undefined)?.lot?.id !== session?.lot?.id;
        session = (v as LiveSession | undefined) ?? null;
        renderLive();
        if (lotChanged) fillGuard();
      }),
      onSessionKeyChanged(latestAppraisalKey(id), (v) => {
        appraisal = (v as AppraisalRecord | undefined) ?? null;
        renderLive();
      }),
    );
  }
  fillGuard();
  renderLive();
};

export const initLive = async () => {
  [guard, purchases, buyer, sellerNotes] = await Promise.all([
    getItem('guardSettings').then(sanitizeGuardSettings),
    getItem('purchases').then((p) => p ?? []),
    getBuyerSettings(),
    getSellerNotes(),
  ]);
  onItemChanged('buyerSettings', (v) => {
    buyer = sanitizeBuyerSettings(v);
    renderLive();
  });
  onItemChanged('sellerNotes', (v) => {
    sellerNotes = sanitizeSellerNotes(v);
    renderLive();
  });
  el.sellerSave.addEventListener('click', () => void saveSeller());
  sellerProfiles = (await getItem('sellerProfiles')) ?? {};
  onItemChanged('sellerProfiles', (v) => {
    sellerProfiles = v ?? {};
    renderLive();
  });
  el.monitorAdd.addEventListener('click', () => void addMonitorFromInput());
  el.monitorInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void addMonitorFromInput();
  });
  // Each watched tab reports its show every second; a slower read here is plenty.
  void refreshMonitors();
  setInterval(() => void refreshMonitors(), 3000);
  onItemChanged('guardSettings', (v) => {
    guard = sanitizeGuardSettings(v);
    renderLive();
  });
  onItemChanged('purchases', (v) => {
    purchases = v ?? [];
    renderLive();
  });
  onActiveTab((tab) => void watchTab(liveIdOfTab(tab) && tab?.id !== undefined ? tab.id : null));

  el.appraise.addEventListener('click', () => {
    if (tabId === null) return toast('Open a Whatnot live show first.');
    void runCommand(sendToTab(tabId, 'APPRAISE_NOW', {}), 'Appraising…');
  });
  const showOverlayPrefs = (p: OverlayPrefs) => {
    el.overlayShow.checked = !p.hidden;
    el.overlayReset.disabled = !p.pos;
    el.overlayAuto.checked = p.autoAppraise;
  };
  showOverlayPrefs(await getOverlayPrefs());
  onItemChanged('overlay', () => void getOverlayPrefs().then(showOverlayPrefs));
  el.overlayShow.addEventListener('change', async () => {
    void setItem('overlay', { ...(await getOverlayPrefs()), hidden: !el.overlayShow.checked });
  });
  el.overlayReset.addEventListener('click', async () => {
    void setItem('overlay', { ...(await getOverlayPrefs()), pos: null });
  });
  el.overlayAuto.addEventListener('change', async () => {
    void setItem('overlay', { ...(await getOverlayPrefs()), autoAppraise: el.overlayAuto.checked });
  });

  el.guardSave.addEventListener('click', () => void saveGuard());
  el.guardClearLot.addEventListener('click', () => {
    el.guardLot.value = '';
    void saveGuard();
  });
};
