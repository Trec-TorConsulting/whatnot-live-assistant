import { detectShowType, scansByDefault, type ShowType } from '../shared/showType';
import { getItem, onItemChanged, setItem } from '../shared/storage';
import { liveSession, onLive } from './live';
import { overlay } from './overlay';

const MAX_PICKS = 100;

let picks: Record<string, { scan: boolean; at: number }> = {};
let shown = '';

const current = () => {
  const s = liveSession();
  const liveId = s?.show.liveId ?? null;
  const detected = detectShowType(s?.show.title ?? document.title.split(' · ')[0], s?.show.categories ?? []);
  const pick = liveId ? picks[liveId]?.scan : undefined;
  return { liveId, detected, scan: typeof pick === 'boolean' ? pick : scansByDefault(detected) };
};

export const currentShowType = (): ShowType => current().detected;

// Scan: after the answer, a second pass lists what else on the table is worth money.
export const currentScan = () => current().scan;

const refresh = () => {
  const { liveId, scan } = current();
  const key = `${liveId}|${scan}`;
  if (key === shown) return;
  shown = key;
  overlay.setScan(liveId ? { scan } : null);
};

export const pickScan = async (scan: boolean) => {
  const { liveId, detected } = current();
  if (!liveId) return;
  const next = { ...picks };
  // Picking the default forgets the pick, so a later re-detection of the show still applies.
  if (scan === scansByDefault(detected)) delete next[liveId];
  else next[liveId] = { scan, at: Date.now() };
  const keep = Object.keys(next)
    .sort((a, b) => next[b]!.at - next[a]!.at)
    .slice(0, MAX_PICKS);
  picks = Object.fromEntries(keep.map((k) => [k, next[k]!]));
  refresh();
  await setItem('scanOverrides', picks);
};

export const startShowType = async () => {
  picks = (await getItem('scanOverrides')) ?? {};
  onItemChanged('scanOverrides', (v) => {
    picks = v ?? {};
    refresh();
  });
  onLive(() => refresh());
  refresh();
};

export const resetShowType = () => {
  shown = '';
  refresh();
};
