import { handleMessages, send, STALE_CONTEXT } from '../shared/messages';
import type { SellerTask } from '../shared/types';
import { isNewLot, type LiveSession, type LiveSignal } from '../shared/live';
import { appraiseNow, appraiseTableNow, newAuction, watchAppraisal } from './appraise';
import { hideWorkerBanner, showWorkerBanner } from './banner';
import { quickBid, refreshGuard, startBidGuard } from './bidGuard';
import { resetBuyer, startBuyer } from './buyer';
import { CHAT_MAX, chatLine, pasteToChat, type ChatResult } from './chat';
import { diagnose } from './diagnostics';
import { claimPage, contextAlive, every, onRetire } from './lifecycle';
import { isShareWorker, markShareWorker, onLive, resetForPath, startLiveBridge } from './live';
import { startCasePack } from './casePack';
import { startEstate } from './estate';
import { appraiseShopListing, dismissShopHit, ensureShopListener, focusShopHit, rescanShop, resetShop, setShopFilter, startShopWatch } from './shop';
import { overlay } from './overlay';
import { loadOverrides } from './overridesState';
import { startPicker } from './picker';
import { startPageScan } from './pageScan';
import { startProfileWatch } from './profileWatch';
import { isLivePath } from './selectors';
import { runSellerTask } from './sellerTask';
import { isSharing, runShareWorker, stopLocalShare } from './share';
import { pickScan, resetShowType, startShowType } from './showType';
import { activeWheel, refreshWheel, startWheelStatus } from './wheel';
import { getOverlayPrefs, onItemChanged, setItem } from '../shared/storage';
import { SECOND, sleep } from '../shared/time';

const describeTask = (task: SellerTask) => {
  const action = task.kind === 'follow_bookmark' ? 'Follow + Bookmark' : 'Unfollow / Unbookmark';
  return `Whatnot Assistant: ${task.dryRun ? 'previewing' : 'running'} ${action} for @${task.seller}. Leave this tab open.`;
};

const runBulkTaskIfAssigned = async () => {
  let task: SellerTask | null = null;
  try {
    task = await send('TASK_GET', {});
  } catch {
    return;
  }
  if (!task) return;
  showWorkerBanner(describeTask(task));
  const report = await runSellerTask(task);
  hideWorkerBanner();
  await send('TASK_DONE', { jobId: task.jobId, index: task.index, report }).catch(() => undefined);
};

const CHAT_NOTICE: Record<ChatResult, (n: number) => string> = {
  filled: (n) => `In the chat box (${n}/${CHAT_MAX}). Press Enter there to send.`,
  copied: (n) => `Chat box not found. Copied (${n}/${CHAT_MAX}); paste it into chat.`,
  failed: () => "Couldn't reach the chat box or the clipboard.",
};

const sendToChat = async (text: string) => overlay.notice(CHAT_NOTICE[await pasteToChat(text)](text.length));
// The share tab opened for this show asks for its job; a moment of retrying covers the gap
// between the tab opening and the session being saved.
const runShareIfAssigned = async () => {
  if (!isLivePath()) return;
  for (let i = 0; i < 3; i++) {
    const session = await send('SHARE_CLAIM', {}).catch(() => null);
    if (session) {
      markShareWorker();
      resetShop();
      await runShareWorker(session);
      return;
    }
    await sleep(SECOND);
  }
};

// The guard's ceiling and the bid button colors use the appraisal, so they shouldn't wait for the next bid.
watchAppraisal(refreshGuard);
const appraiseAndGuard = (auto = false) => appraiseNow({ auto }).finally(refreshGuard);

// A new auction is a new item. Auto clears the last answer and appraises the moment the auction
// starts, or right away for one already running when you open the show; a newly pinned item waits
// for its auction. Manual keeps the answer until you press Appraise. Wheel spins have their own card.
// pinned: seen before its auction started, so the start that follows is the same item.
let lastLot: { liveId: string; id: string | null; title: string | null; pinned: boolean } | null = null;
const onNewLot = (session: LiveSession, signals: LiveSignal[]) => {
  const lot = session.lot;
  const lotSignals = signals.filter((s) => s.kind === 'lot');
  if (!lot || !lotSignals.length) return;
  // Repeat auctions from one listing share its id, so only Whatnot's start event tells them apart.
  const started = lotSignals.some((s) => s.started);
  const prev = lastLot?.liveId === session.show.liveId ? lastLot : null;
  const sameItem = Boolean(prev) && !isNewLot(prev, lot);
  const fresh = started ? !(prev?.pinned && sameItem) : !sameItem;
  const underway = lot.currentBid !== null || lot.endsAt !== null || Boolean(lot.bidCount);
  if (!fresh) {
    if (prev) lastLot = { ...prev, id: prev.id ?? lot.id, title: prev.title ?? lot.title, pinned: prev.pinned && !started };
    if (!started) return;
  } else {
    // The first lot after opening a show keeps an answer you asked for before the feed caught up.
    if (lastLot) {
      newAuction(overlay.autoAppraise());
      refreshGuard();
    }
    lastLot = { liveId: session.show.liveId, id: lot.id, title: lot.title, pinned: !started && !underway };
  }
  const running = started || (!prev && underway);
  if (running && overlay.autoAppraise() && !contextAlive()) {
    overlay.notice(STALE_CONTEXT, 10 * SECOND);
    return;
  }
  if (running && overlay.autoAppraise() && !isShareWorker() && !activeWheel(session) && lot.status !== 'sold' && lot.status !== 'unsold') {
    void appraiseAndGuard(true);
  }
};

// Whatnot navigates client-side, so features follow the path rather than the initial load.
let lastPath = '';
const syncToPath = () => {
  if (location.pathname === lastPath) return;
  lastPath = location.pathname;
  resetForPath();
  if (isLivePath()) {
    overlay.mount({
      appraise: () => void appraiseAndGuard(),
      tableScan: () => void appraiseTableNow(),
      pasteToChat: (view) => void sendToChat(chatLine(view)),
      chatText: (text) => void sendToChat(text.slice(0, CHAT_MAX)),
      quickBid: (kind) => void quickBid(kind),
      savePrefs: (prefs) => void setItem('overlay', prefs),
      pickScan: (scan) => void pickScan(scan),
      shopRescan: () => rescanShop(),
      shopAppraise: (id) => void appraiseShopListing(id),
      shopFocus: (title) => void focusShopHit(title),
      shopDismiss: (id) => dismissShopHit(id),
      shopFilter: (mode) => setShopFilter(mode),
    });
    resetBuyer();
    refreshGuard();
    refreshWheel();
    resetShowType();
    startShopWatch();
  } else {
    overlay.unmount();
    resetShop();
    stopLocalShare();
  }
};

const main = async () => {
  if (window.top !== window) return;
  claimPage();
  onRetire(() => overlay.detach());
  handleMessages({
    PING: () => ({ ok: true }),
    DIAGNOSE: ({ highlight }) => diagnose(highlight),
    PICK_RUN: ({ target }) => (isLivePath() ? startPicker(target) : { ok: false, error: 'Open a live show to pick its buttons.' }),
    SHARE_STATUS: ({ text, sharing }) => {
      if (!isSharing()) overlay.setShare(text, sharing);
      return { ok: true };
    },
    APPRAISE_NOW: () => {
      if (!isLivePath()) return { ok: false, error: 'Open a live show to appraise.' };
      void appraiseAndGuard();
      return { ok: true };
    },
    TABLE_SCAN_NOW: () => {
      if (!isLivePath()) return { ok: false, error: 'Open a live show to scan the table.' };
      void appraiseTableNow();
      return { ok: true };
    },
    SHOP_RESCAN: () => {
      if (!isLivePath()) return { ok: false, error: 'Open a live show to rescan the shop.' };
      rescanShop();
      return { ok: true };
    },
    SHOP_APPRAISE: async ({ id }) => {
      if (!isLivePath()) return { ok: false };
      const appraisal = await appraiseShopListing(id);
      return { ok: Boolean(appraisal), appraisal: appraisal ?? undefined };
    },
    SHOP_FOCUS: ({ title }) => {
      if (!isLivePath()) return { ok: false, error: 'Open a live show to search the shop.' };
      void focusShopHit(title);
      return { ok: true };
    },
    SHOP_DISMISS: ({ id }) => {
      dismissShopHit(id);
      return { ok: true };
    },
    SHOP_FILTER: ({ mode }) => {
      setShopFilter(mode);
      return { ok: true };
    },
  });
  await loadOverrides();
  ensureShopListener();
  await startLiveBridge();
  // Before the guard, so on each lot update the guard reads who's leading after the buyer has seen it.
  await startBuyer({ onChange: refreshGuard });
  await startBidGuard();
  startEstate();
  startCasePack();
  await startWheelStatus();
  await startShowType();
  overlay.setPrefs(await getOverlayPrefs());
  onItemChanged('overlay', (v) => overlay.setPrefs(v));
  onLive(onNewLot);
  startProfileWatch();
  startPageScan();
  syncToPath();
  every(syncToPath, 1000);
  void runShareIfAssigned();
  await runBulkTaskIfAssigned();
};

void main();
