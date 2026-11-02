// Envelope wheels list prizes as "ENVELOPE #3" and show the items on camera, so those prizes are
// read off the video instead of valued by name. The read runs as soon as the wheel loads, ahead of
// any bid, again while nothing usable was seen (the board may not be in frame yet), and after an
// envelope is opened, since its item leaves the board.
import { isHiddenPrize, type BreakSnapshot } from '../shared/breaks';
import { boardIsCurrent, unmatchedEnvelopes, unseenPrizes, type EnvelopeBoard } from '../shared/envelopes';
import type { LiveSession } from '../shared/live';
import { send } from '../shared/messages';
import type { PrizeValue } from '../shared/prizeValue';
import { MINUTE, SECOND } from '../shared/time';
import { captureFrame } from './appraise';
import { isShareWorker } from './live';
import { findStreamVideo } from './selectors';

// Larger than an appraisal frame: handwritten notes across a whole board are small.
const FRAME_PX = 1280;
const QUICK_TRIES = 6;
const QUICK_RETRY_MS = 20 * SECOND;
const SLOW_RETRY_MS = 2 * MINUTE;

let breakId = '';
let wanted = '';
let tries = 0;
let nextAt = 0;
let busy = false;

export const checkEnvelopes = (
  b: BreakSnapshot,
  s: LiveSession | null,
  values: Record<string, number>,
  autoValues: Record<string, PrizeValue>,
  board: EnvelopeBoard | null,
  now = Date.now(),
) => {
  if (busy || isShareWorker() || document.hidden) return;
  const unmatched = unmatchedEnvelopes(b, values, autoValues);
  if (!unmatched.length || boardIsCurrent(board, unmatched)) return;
  // A new wheel, or envelopes opened since the last read, gets the quick retries again.
  const key = `${b.id}|${unmatched.map((r) => r.key).join(',')}`;
  if (b.id !== breakId || key !== wanted) {
    breakId = b.id;
    wanted = key;
    tries = 0;
    nextAt = 0;
  }
  if (now < nextAt) return;
  const video = findStreamVideo();
  const image = video ? captureFrame(video, FRAME_PX) : null;
  if (!image) return;
  tries++;
  nextAt = now + (tries < QUICK_TRIES ? QUICK_RETRY_MS : SLOW_RETRY_MS);
  busy = true;
  void send('ENVELOPE_READ', {
    breakId: b.id,
    image,
    prizes: unmatched.map(({ title, detail }) => ({ title, detail })),
    others: b.prizes.filter((p) => !isHiddenPrize(p.title)).map((p) => p.title),
    context: { showTitle: s?.show.title ?? null, wheelTitle: b.title, categories: s?.show.categories ?? [] },
  })
    .catch(() => undefined)
    .finally(() => {
      busy = false;
    });
};

// Named prizes the video hasn't shown yet are read off the frame too, once envelopes are settled.
// Each read that finds some starts the count again; a few reads that find none in a row means the
// rest aren't on camera, so it stops until the wheel's prize list changes.
const NAMED_TRIES = 3;
const NAMED_RETRY_MS = 30 * SECOND;
let namedKey = '';
let namedTries = 0;
let namedNextAt = 0;

export const checkNamedPrizes = (
  b: BreakSnapshot,
  s: LiveSession | null,
  values: Record<string, number>,
  autoValues: Record<string, PrizeValue>,
  now = Date.now(),
) => {
  if (busy || isShareWorker() || document.hidden) return;
  const unseen = unseenPrizes(b, values, autoValues);
  if (!unseen.length) return;
  const key = `${b.id}|${unseen.map((p) => `${p.title}|${p.detail}`).join(',')}`;
  if (key !== namedKey) {
    namedKey = key;
    namedTries = 0;
    namedNextAt = 0;
  }
  if (namedTries >= NAMED_TRIES || now < namedNextAt) return;
  const video = findStreamVideo();
  const image = video ? captureFrame(video, FRAME_PX) : null;
  if (!image) return;
  namedTries++;
  namedNextAt = now + NAMED_RETRY_MS;
  busy = true;
  void send('PRIZE_READ', {
    breakId: b.id,
    image,
    prizes: unseen.map(({ title, detail }) => ({ title, detail })),
    context: { showTitle: s?.show.title ?? null, wheelTitle: b.title, categories: s?.show.categories ?? [] },
  })
    .catch(() => undefined)
    .finally(() => {
      busy = false;
    });
};
