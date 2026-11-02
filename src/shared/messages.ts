import type { WatchedShow } from './alerts';
import type { ShowSeen } from './discover';
import type { Order } from './orders';
import type { SellerProfile } from './sellerInfo';
import type { AppraisalContext, AppraisalItem, AppraisalRecord, Melt, OtherItem, PriceInfo, QuickResult } from './appraisal';
import type { LiveSession, LiveSignal } from './live';
import type { OnDeviceStatus } from './onDevice';
import type { PrizeContext, PrizeItem } from './prizeValue';
import type { Purchase } from './purchases';
import type { SoldItem } from './soldHistory';
import type { RefLookupResult } from './refPrice';
import type { TableItem } from './tableScan';
import type { ShareSession } from './storage';
import type { ActionKind, Halt, JobKind, SellerReport, SellerTask, ShareTarget, UndoOptions } from './types';

export type Result = { ok: true } | { ok: false; error: string };

// matched: envelopes tied to an item by number; board: items seen without a number.
export type EnvelopeResult = { ok: true; matched: number; board: number } | { ok: false; error: string };

export type AcquireResult =
  | { granted: true }
  | { granted: false; stop: true }
  | { granted: false; stop: false; retryAt: number; reason: string };

export type GeminiResult =
  | { ok: true; item: AppraisalItem; others: OtherItem[]; melt: Melt | null; model: string }
  | { ok: false; error: string; needsKey?: boolean };

export type TableScanResult = { ok: true; items: TableItem[]; model: string } | { ok: false; error: string };

export type PriceLookupResult =
  | (PriceInfo & { ok: true; source: string; cached: boolean; name: string; grade: string; link: string | null; usage: PcgsUsage })
  | { ok: false; reason: 'no-token' | 'no-id' | 'mismatch' | 'no-data' | 'error'; error?: string; usage?: PcgsUsage };

export interface PcgsUsage {
  day: string;
  calls: number;
}

export type TestResult = { ok: true; detail: string } | { ok: false; error: string };

export interface DiagnosticsReport {
  url: string;
  page: 'profile' | 'live' | 'other';
  loggedOutPrompt: boolean;
  warning: string | null;
  follow: { state: string; label: string } | null;
  showCards: { liveId: string; state: string | null; label: string; startsText: string | null }[];
  expandButton: boolean;
  share: { button: boolean; targets: Record<string, boolean> };
  video: { width: number; height: number } | null;
  bidButtons: string[];
  hookInstalled: boolean;
  live: Pick<LiveSession, 'eventCounts' | 'samples' | 'graphqlOps' | 'show' | 'lot' | 'breakId' | 'wheel'> | null;
  overrides: string[];
}

export interface MessageMap {
  // Bulk follow/bookmark jobs
  JOB_START: { req: { kind: JobKind; sellers: string[]; undo?: UndoOptions; dryRun?: boolean }; res: Result };
  JOB_PAUSE: { req: Record<string, never>; res: Result };
  JOB_RESUME: { req: Record<string, never>; res: Result };
  JOB_STOP: { req: Record<string, never>; res: Result };
  JOB_CLEAR: { req: Record<string, never>; res: Result };
  TASK_GET: { req: Record<string, never>; res: SellerTask | null };
  TASK_DONE: { req: { jobId: string; index: number; report: SellerReport }; res: Result };
  RATE_ACQUIRE: { req: { jobId: string; index: number; kind: ActionKind }; res: AcquireResult };

  // Live show data from content scripts
  LIVE_UPDATE: { req: { session: LiveSession }; res: Result };
  // photo: a small JPEG data URL of the video when one of your wins came in.
  LIVE_SIGNAL: { req: { liveId: string; showTitle: string | null; host: string | null; signal: LiveSignal; photo?: string }; res: Result };
  WATCH_SHOWS: { req: { shows: Omit<WatchedShow, 'notifiedAt'>[] }; res: Result };
  SALES_RECORD: { req: { items: SoldItem[] }; res: Result };
  // Outbid, closing, watchlist, and mention alerts, shown as a notification when the show tab is hidden.
  BUYER_ALERT: { req: { id: string; title: string; message: string }; res: Result };
  SPOT_GET: { req: Record<string, never>; res: { gold: number | null; silver: number | null } };
  SELLER_PROFILE_SAVE: { req: { profile: Omit<SellerProfile, 'firstSeen'> }; res: Result };
  ORDERS_SAVE: { req: { orders: Order[] }; res: Result };
  SHOWS_SEEN: { req: { shows: ShowSeen[] }; res: Result };

  // Watching other shows in muted background tabs
  MONITOR_ADD: { req: { liveId: string }; res: Result };
  MONITOR_REMOVE: { req: { liveId: string }; res: Result };
  MONITOR_FOCUS: { req: { liveId: string }; res: Result };

  // Auto share
  SHARE_START: { req: { tabId: number; count: number | null }; res: Result };
  SHARE_STOP: { req: { tabId: number }; res: Result };
  SHARE_TOGGLE: { req: Record<string, never>; res: Result };
  SHARE_CLAIM: { req: Record<string, never>; res: ShareSession | null };
  SHARE_STATUS: { req: { text: string; sharing: boolean }; res: Result };
  SHARE_ACQUIRE: { req: { sessionId: string }; res: AcquireResult };
  SHARE_DONE: { req: { sessionId: string; ok: boolean; error?: string; halt?: Halt; title?: string | null; host?: string | null }; res: Result };

  // Tab connection and button picking
  PING: { req: Record<string, never>; res: Result };
  ENSURE_CONTENT: { req: { tabId: number }; res: Result };
  PICK_START: { req: { tabId: number; target: ShareTarget }; res: Result };
  PICK_RUN: { req: { target: ShareTarget }; res: Result };
  PICK_SAVE: { req: { target: ShareTarget; shareButton: string; targetSelector: string | null }; res: Result };
  PICK_CLEAR: { req: Record<string, never>; res: Result };

  // Appraisal
  APPRAISE_NOW: { req: Record<string, never>; res: Result };  APPRAISE: { req: AppraisalContext & { image: string }; res: GeminiResult };
  TABLE_SCAN: { req: AppraisalContext & { image: string; mainItem: string }; res: TableScanResult };
  QUICK_APPRAISE: { req: { pageText: string }; res: QuickResult & { melt: Melt | null } };
  PRICE_LOOKUP: { req: { item: Partial<AppraisalItem> }; res: PriceLookupResult };
  REF_LOOKUP: { req: { item: Partial<AppraisalItem> }; res: RefLookupResult };
  APPRAISAL_SAVE: { req: { record: AppraisalRecord }; res: Result };
  WHEEL_VALUE: { req: { prizes: PrizeItem[]; context: PrizeContext }; res: Result };
  ENVELOPE_READ: { req: { breakId: string; image: string; prizes: PrizeItem[]; others: PrizeItem[]; context: PrizeContext; soldHidden: number | null }; res: EnvelopeResult };
  PRIZE_READ: { req: { breakId: string; image: string; prizes: PrizeItem[]; context: PrizeContext }; res: EnvelopeResult };
  CAPTURE_TAB: { req: Record<string, never>; res: { ok: true; dataUrl: string } | { ok: false; error: string } };
  TEST_GEMINI: { req: Record<string, never>; res: TestResult };
  TEST_OLLAMA: { req: Record<string, never>; res: TestResult };
  ON_DEVICE_STATUS: { req: { recheck?: boolean }; res: { status: OnDeviceStatus } };
  TEST_PCGS: { req: Record<string, never>; res: TestResult };

  // Purchases
  PURCHASE_ADD: { req: { purchase: Omit<Purchase, 'key'> }; res: Result };
  PURCHASE_DELETE: { req: { key: string }; res: Result };

  // Diagnostics and selector overrides
  DIAGNOSE: { req: { highlight: boolean }; res: DiagnosticsReport };
  OVERRIDES_REFRESH: { req: Record<string, never>; res: Result };
}

export type MessageType = keyof MessageMap;
export type Req<K extends MessageType> = MessageMap[K]['req'];
export type Res<K extends MessageType> = MessageMap[K]['res'];

interface Envelope<K extends MessageType = MessageType> {
  type: K;
  payload: Req<K>;
}

export const STALE_CONTEXT = 'The extension was reloaded. Refresh this page to reconnect.';

const wrapError = (err: unknown) => {
  const message = String((err as Error)?.message ?? err);
  return new Error(/context invalidated/i.test(message) ? STALE_CONTEXT : message);
};

export const send = async <K extends MessageType>(type: K, payload: Req<K>): Promise<Res<K>> => {
  try {
    return (await chrome.runtime.sendMessage({ type, payload } satisfies Envelope<K>)) as Res<K>;
  } catch (err) {
    throw wrapError(err);
  }
};

export const sendToTab = async <K extends MessageType>(tabId: number, type: K, payload: Req<K>): Promise<Res<K>> => {
  try {
    return (await chrome.tabs.sendMessage(tabId, { type, payload } satisfies Envelope<K>)) as Res<K>;
  } catch (err) {
    throw wrapError(err);
  }
};

export type Handlers = {
  [K in MessageType]?: (payload: Req<K>, sender: chrome.runtime.MessageSender) => Promise<Res<K>> | Res<K>;
};

export const handleMessages = (handlers: Handlers) => {
  chrome.runtime.onMessage.addListener((msg: Envelope, sender, sendResponse) => {
    const handler = msg && typeof msg.type === 'string' ? handlers[msg.type] : undefined;
    if (!handler) return false;
    Promise.resolve()
      .then(() => (handler as (p: unknown, s: chrome.runtime.MessageSender) => unknown)(msg.payload, sender))
      .then(sendResponse, (err: unknown) => sendResponse({ ok: false, error: String((err as Error)?.message ?? err) }));
    return true;
  });
};
