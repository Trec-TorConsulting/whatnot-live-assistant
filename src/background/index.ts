import { createLock } from '../shared/lock';
import { handleMessages, sendToTab } from '../shared/messages';
import { addSold } from '../shared/soldHistory';
import { getItem, getOverlayPrefs, setItem, setTabAppraisal, setTabLive } from '../shared/storage';
import { addManualPurchase, addWatched, ALARM_WATCH, buyerAlert, checkStartingSoon, deletePurchase, handleSignal, onNotificationClicked } from './alerts';
import { addMonitor, checkLateOrders, focusMonitor, forgetMonitorTab, removeMonitor, saveOrders, saveSellerProfile, showsSeen } from './buyerData';
import { appraise, getSpot, gradeGuide, priceLookup, quickAppraise, testGemini, testOllama, testPcgs, warmOllama } from './appraisal';
import {
  ALARM_TICK,
  ALARM_WATCHDOG,
  acquireForTask,
  claimTask,
  clearJob,
  completeTask,
  ensureScheduled,
  onBrowserStartup,
  onTabRemoved,
  onWatchdog,
  pauseJob,
  resumeJob,
  startJob,
  stopJob,
  tick,
} from './jobRunner';
import { checkOnDevice, onDeviceState, warmOnDevice } from './onDevice';
import { ALARM_OVERRIDES, refreshOverrides } from './overrides';
import { clearPickedShare, savePickedShare } from './picks';
import { readEnvelopes, readNamedPrizes, valuePrizes } from './prizeValues';
import { refLookup } from './refPrices';
import { scanTable } from './tableScan';
import { acquireShareForSession, claimShareWork, forgetTab, shareDone, startShare, stopShare, toggleShare } from './share';
import { ensureContent, reconnectWhatnotTabs } from './tabs';

const MAX_APPRAISALS = 200;
// Several show tabs can report sales at once; each read-modify-write must finish before the next.
const soldLock = createLock();

const senderTab = (sender: chrome.runtime.MessageSender, tabId?: number) => (tabId !== undefined && tabId >= 0 ? tabId : sender.tab?.id);

handleMessages({
  JOB_START: ({ kind, sellers, undo, dryRun }) =>
    startJob(kind, sellers, undo ?? { unfollow: true, unbookmark: true }, Boolean(dryRun)),
  JOB_PAUSE: () => pauseJob(),
  JOB_RESUME: () => resumeJob(),
  JOB_STOP: () => stopJob(),
  JOB_CLEAR: () => clearJob(),
  TASK_GET: (_payload, sender) => claimTask(sender),
  TASK_DONE: (payload) => completeTask(payload),
  RATE_ACQUIRE: (payload) => acquireForTask(payload),

  LIVE_UPDATE: async ({ session }, sender) => {
    if (sender.tab?.id !== undefined) await setTabLive(sender.tab.id, session);
    void warmOnDevice();
    void warmOllama();
    return { ok: true };
  },
  LIVE_SIGNAL: (payload, sender) => handleSignal(payload, sender.tab?.id),
  BUYER_ALERT: (payload, sender) => buyerAlert(payload, sender.tab?.id),
  SPOT_GET: async () => {
    const [gold, silver] = await Promise.all([getSpot('gold'), getSpot('silver')]);
    return { gold, silver };
  },
  WATCH_SHOWS: ({ shows }) => addWatched(shows),
  SELLER_PROFILE_SAVE: ({ profile }) => saveSellerProfile(profile),
  ORDERS_SAVE: ({ orders }) => saveOrders(orders),
  SHOWS_SEEN: ({ shows }) => showsSeen(shows),
  MONITOR_ADD: ({ liveId }) => addMonitor(liveId),
  MONITOR_REMOVE: ({ liveId }) => removeMonitor(liveId),
  MONITOR_FOCUS: ({ liveId }) => focusMonitor(liveId),
  SALES_RECORD: ({ items }) =>
    soldLock(async () => {
      const list = (await getItem('soldHistory')) ?? [];
      const next = addSold(list, items);
      if (next !== list) await setItem('soldHistory', next);
      return { ok: true } as const;
    }),

  SHARE_START: ({ tabId, count }, sender) => {
    const id = senderTab(sender, tabId);
    return id === undefined ? { ok: false, error: 'No tab' } : startShare(id, count);
  },
  SHARE_STOP: ({ tabId }, sender) => {
    const id = senderTab(sender, tabId);
    return id === undefined ? { ok: false, error: 'No tab' } : stopShare(id);
  },
  SHARE_TOGGLE: (_payload, sender) => (sender.tab?.id !== undefined ? toggleShare(sender.tab.id) : { ok: false, error: 'No tab' }),
  SHARE_CLAIM: (_payload, sender) => claimShareWork(sender.tab?.id),
  SHARE_ACQUIRE: ({ sessionId }) => acquireShareForSession(sessionId),
  SHARE_DONE: (payload) => shareDone(payload),

  ENSURE_CONTENT: async ({ tabId }) =>
    (await ensureContent(tabId)) ? { ok: true } : { ok: false, error: "Couldn't connect to the tab. Refresh it and try again." },
  PICK_START: async ({ tabId, target }) => {
    if (!(await ensureContent(tabId))) return { ok: false, error: "Couldn't connect to the show tab. Refresh it and try again." };
    return sendToTab(tabId, 'PICK_RUN', { target });
  },
  PICK_SAVE: (payload) => savePickedShare(payload),
  PICK_CLEAR: () => clearPickedShare(),

  APPRAISE: (payload) => appraise(payload),
  TABLE_SCAN: (payload) => scanTable(payload),
  REF_LOOKUP: ({ item }) => refLookup(item),
  QUICK_APPRAISE: ({ pageText }) => quickAppraise(pageText),
  WHEEL_VALUE: ({ prizes, context }) => valuePrizes(prizes.slice(0, 200), context),
  ENVELOPE_READ: ({ breakId, image, prizes, others, context, soldHidden }) =>
    readEnvelopes(breakId, image, prizes.slice(0, 100), others.slice(0, 100), context, soldHidden),
  PRIZE_READ: ({ breakId, image, prizes, context }) => readNamedPrizes(breakId, image, prizes.slice(0, 60), context),
  PRICE_LOOKUP: ({ item }) => priceLookup(item),
  GRADE_GUIDE: (query) => gradeGuide(query),
  APPRAISAL_SAVE: async ({ record }, sender) => {
    // Saved again once its table scan finishes; that replaces the first save.
    const list = [...((await getItem('appraisals')) ?? []).filter((r) => r.id !== record.id), record].slice(-MAX_APPRAISALS);
    await setItem('appraisals', list);
    if (sender.tab?.id !== undefined) await setTabAppraisal(sender.tab.id, record);
    return { ok: true };
  },
  // Needs activeTab, which the keyboard shortcuts grant; the video-frame path doesn't need this.
  CAPTURE_TAB: async (_payload, sender) => {
    try {
      const windowId = sender.tab?.windowId ?? chrome.windows.WINDOW_ID_CURRENT;
      return { ok: true, dataUrl: await chrome.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: 80 }) };
    } catch (err) {
      return { ok: false, error: String((err as Error).message ?? err) };
    }
  },
  TEST_GEMINI: () => testGemini(),
  TEST_OLLAMA: () => testOllama(),
  ON_DEVICE_STATUS: async ({ recheck }) => ({ status: await (recheck ? checkOnDevice(true) : onDeviceState()) }),
  TEST_PCGS: () => testPcgs(),

  PURCHASE_ADD: ({ purchase }) => addManualPurchase(purchase),
  PURCHASE_DELETE: ({ key }) => deletePurchase(key),
  OVERRIDES_REFRESH: () => refreshOverrides(),
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_TICK) void tick();
  if (alarm.name === ALARM_WATCHDOG) void onWatchdog();
  if (alarm.name === ALARM_WATCH) {
    void checkStartingSoon();
    void checkLateOrders();
  }
  if (alarm.name === ALARM_OVERRIDES) void refreshOverrides();
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void onTabRemoved(tabId);
  void forgetTab(tabId);
  void forgetMonitorTab(tabId);
  void setTabLive(tabId, null);
});

chrome.notifications.onClicked.addListener((id) => void onNotificationClicked(id));

const activeTabId = async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.id;

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-assistant') {
    const prefs = await getOverlayPrefs();
    await setItem('overlay', { ...prefs, hidden: !prefs.hidden });
    return;
  }
  const tabId = await activeTabId();
  if (tabId === undefined) return;
  if (command === 'toggle-share') await toggleShare(tabId);
  if (command === 'appraise') await sendToTab(tabId, 'APPRAISE_NOW', {}).catch(() => undefined);});

const ensureAlarms = async () => {
  if (!(await chrome.alarms.get(ALARM_WATCH))) await chrome.alarms.create(ALARM_WATCH, { periodInMinutes: 5 });
  if (!(await chrome.alarms.get(ALARM_OVERRIDES))) await chrome.alarms.create(ALARM_OVERRIDES, { periodInMinutes: 24 * 60 });
};

chrome.runtime.onStartup.addListener(() => void onBrowserStartup());
chrome.runtime.onInstalled.addListener(() => {
  // Name and address saved by the removed free giveaway entry form (0.11.0).
  void chrome.storage.local.remove('wn2_entryDetails');
  void refreshOverrides();
  void reconnectWhatnotTabs();
});

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);
void ensureScheduled();
void ensureAlarms();
// Only the availability check runs here; loading the model waits until a live show is open.
void checkOnDevice();
