export type JobKind = 'follow_bookmark' | 'unfollow_unbookmark';

export type ActionKind = 'follow' | 'unfollow' | 'bookmark' | 'unbookmark' | 'share';

export type ShareTarget = 'copy' | 'x' | 'facebook';

export interface UndoOptions {
  unfollow: boolean;
  unbookmark: boolean;
}

export type FollowOutcome = 'done' | 'already' | 'not_found' | 'failed' | 'skipped';

export type HaltCode = 'not_logged_in' | 'warning' | 'clicks_not_sticking';

export interface Halt {
  code: HaltCode;
  detail: string;
}

export interface SellerReport {
  follow: FollowOutcome;
  bookmarksChanged: number;
  bookmarksAlready: number;
  bookmarksFailed: number;
  capped: boolean;
  showsNotLoaded?: boolean;
  error?: string;
  halt?: Halt;
  deferUntil?: number;
  deferReason?: string;
  stopped?: boolean;
}

export interface SellerResult extends SellerReport {
  seller: string;
  finishedAt: number;
}

export type JobStatus = 'running' | 'waiting' | 'paused' | 'done' | 'stopped';

export interface InFlight {
  index: number;
  tabId: number;
  startedAt: number;
  deadlineAt: number;
  claimedDocumentId: string | null;
}

export interface Job {
  id: string;
  kind: JobKind;
  undo: UndoOptions;
  dryRun: boolean;
  sellers: string[];
  index: number;
  status: JobStatus;
  nextRunAt: number | null;
  waitReason: string | null;
  pauseReason: string | null;
  inFlight: InFlight | null;
  workerTabId: number | null;
  results: SellerResult[];
  sellersSinceBreak: number;
  consecutiveFailures: number;
  startedAt: number;
  updatedAt: number;
}

export interface SellerTask {
  jobId: string;
  index: number;
  kind: JobKind;
  undo: UndoOptions;
  dryRun: boolean;
  seller: string;
  maxBookmarksPerSeller: number;
}

export const isActiveJob = (job: Job | null | undefined): boolean =>
  Boolean(job && (job.status === 'running' || job.status === 'waiting' || job.status === 'paused'));
