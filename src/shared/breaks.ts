// Whatnot's wheel is a Mystery break: each spin is an auctioned spot, and the prizes are the break's
// spot options. Logged-in viewers can read them with QueryBreak; an option's description ends in
// "Qty: N" with the copies still on the wheel (confirmed: the counts sum to the spots left), and an
// option without a Qty is a single prize.
export const BREAK_OPERATION = 'QueryBreak';

// Sold spots come back oldest first, with the prize each spin hit and what the spin sold for
// (listing.price; confirmed against a live $99 win). $soldAfter pages forward from the last one seen,
// so each refresh only carries new spins. The alias keeps the app's own sold-spot queries out.
export const BREAK_QUERY = `query QueryBreak($id: ID!, $soldAfter: String, $optionsAfter: String) {
  getBreak(breakId: $id) {
    id
    title
    format
    status
    soldSpotCount
    totalBreakSpots
    paginatedSpotOptions(first: 100, after: $optionsAfter) { pageInfo { hasNextPage endCursor } edges { node { id title available description } } }
    soldSpots: paginatedSpots(first: 100, after: $soldAfter, filters: [{ field: "SOLD_STATUS", values: ["SOLD"] }]) {
      pageInfo { hasNextPage endCursor }
      edges { node { id title buyer { username } listing { price { amount } } } }
    }
  }
}`;

export const MAX_HITS = 600;

export interface BreakPrize {
  id: string;
  title: string;
  // The option's description minus its "Qty: N" line: the condition sellers must list ("FAIR", or a
  // coin grade group like "Good - Extremely Fine").
  detail: string;
  left: number;
}

export interface BreakHit {
  spotId: string;
  title: string;
  buyer: string | null;
  price: number | null;
  // Sold but not randomized yet: the spot still carries its number ("#28") instead of a prize.
  pending: boolean;
  seenAt: number;
}

export interface BreakSnapshot {
  id: string;
  title: string | null;
  format: string | null;
  status: string | null;
  sold: number | null;
  total: number | null;
  prizes: BreakPrize[];
  // False when Whatnot has more prize pages than one request returns, so the odds would be off.
  complete: boolean;
  // Relay cursor for the last prize page folded in. The next fetch passes it as optionsAfter.
  prizesCursor?: string | null;
  // Spins in the order they sold; null when the response had no sold spots (the app's own queries).
  hits: BreakHit[] | null;
  // How many of the oldest spins were dropped to keep the history under MAX_HITS.
  soldOffset: number;
  soldCursor: string | null;
  soldHasMore: boolean;
  // prizeKey(title) -> value keys of every prize seen with that title. A spin only names the
  // title, so a title listed in two conditions is valued at the cheaper one.
  titleKeys: Record<string, string[]>;
  fetchedAt: number;
}

const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : typeof v === 'number' ? String(v) : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const QTY_RE = /qty:\s*(\d+)/i;

export const prizeQuantity = (description: unknown): number => {
  const m = typeof description === 'string' ? description.match(QTY_RE) : null;
  return m?.[1] ? parseInt(m[1], 10) : 1;
};

export const prizeDetail = (description: unknown) =>
  typeof description === 'string' ? description.replace(QTY_RE, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) : '';

export const prizeKey = (title: string) => title.trim().toLowerCase().replace(/\s+/g, ' ');

// Same title in two conditions is two different prizes.
export const prizeValueKey = (p: { title: string; detail: string }) => prizeKey(p.detail ? `${p.title} | ${p.detail}` : p.title);

// Envelope wheels list their big prizes as "ENVELOPE #3" (or "LOPE 3", "MYSTERY BAG #1") and show
// what each one holds on camera. The title names no item, so it can't be valued by name.
const HIDDEN_PRIZE_RE =
  /^(?:(?:mystery|secret|bonus|special|big|top|grand|gold(?:en)?|red|blue|green|black|white|pink|purple)\s+)*(?:envelopes?|envelops?|envs?|e?lopes?|velopes?|bags?|pouch(?:es)?|tickets?|slips?|box(?:es)?|mystery|chase|hits?|prizes?|wins?)\s*(?:#|no\.?|number)?\s*(?:\d{1,3}|[a-z])?$/i;

export const isHiddenPrize = (title: string) => HIDDEN_PRIZE_RE.test(title.trim());

// "Family Pack #7" with detail "Envelope" is hidden even though the title is a product name.
export const isHiddenSpot = (p: { title: string; detail?: string }) => isHiddenPrize(p.title) || isHiddenPrize(p.detail ?? '');

// The shared name of a hidden spot, without emoji or the trailing envelope number.
export const prizeStem = (title: string) =>
  title
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/[\uFE0F\u200D]/g, '')
    .replace(/\s*(?:#|no\.?|number)?\s*\d{1,3}\s*$/i, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

// Sold hits rarely repeat the word "envelope". A hit counts when its stem matches a hidden prize
// still listed on this break. Null while sold pages remain, so the jackpot share stays incomplete.
export const soldHiddenCount = (b: BreakSnapshot): number | null => {
  if (b.hits === null || b.soldHasMore) return null;
  const stems = new Set(b.prizes.filter((p) => isHiddenSpot(p)).map((p) => prizeStem(p.title)));
  return b.hits.filter((h) => !h.pending && stems.has(prizeStem(h.title))).length;
};

// Envelope #3 on another wheel holds something else, so a hidden prize's value belongs to its wheel.
export const scopedKey = (breakId: string, title: string, key: string) => (isHiddenPrize(title) ? `${breakId}#${key}` : key);
export const wheelValueKey = (breakId: string, p: { title: string; detail: string }) =>
  isHiddenSpot(p) ? `${breakId}#${prizeValueKey(p)}` : prizeValueKey(p);
export const wheelTitleKey = (breakId: string, title: string, detail = '') =>
  isHiddenSpot({ title, detail }) ? `${breakId}#${prizeKey(title)}` : prizeKey(title);

const PENDING_RE = /^#\d+$/;

// Returns null for responses without the prize list (the app also asks for sold spots alone).
export const parseBreakResponse = (body: unknown, now = Date.now()): BreakSnapshot | null => {
  const b = obj(obj(obj(body)?.data)?.getBreak);
  const id = str(b?.id);
  const options = obj(b?.paginatedSpotOptions);
  if (!b || !id || !options || !Array.isArray(options.edges)) return null;
  const prizes: BreakPrize[] = [];
  for (const edge of options.edges) {
    const node = obj(obj(edge)?.node);
    const title = str(node?.title);
    if (!node || !title || node.available === false) continue;
    const left = prizeQuantity(node.description);
    if (left > 0) prizes.push({ id: str(node.id) ?? title, title: title.trim(), detail: prizeDetail(node.description), left });
  }
  const soldSpots = obj(b.soldSpots);
  const soldPage = obj(soldSpots?.pageInfo);
  let hits: BreakHit[] | null = null;
  if (soldSpots && Array.isArray(soldSpots.edges)) {
    hits = [];
    for (const edge of soldSpots.edges) {
      const node = obj(obj(edge)?.node);
      const spotId = str(node?.id);
      const title = str(node?.title);
      if (!node || !spotId || !title) continue;
      const cents = num(obj(obj(node.listing)?.price)?.amount);
      const price = cents !== null ? cents / 100 : null;
      const t = title.trim();
      hits.push({ spotId, title: t, buyer: str(obj(node.buyer)?.username), price, pending: PENDING_RE.test(t), seenAt: now });
    }
  }
  return {
    id,
    title: str(b.title),
    format: str(b.format),
    status: str(b.status),
    sold: num(b.soldSpotCount),
    total: num(b.totalBreakSpots),
    prizes,
    complete: obj(options.pageInfo)?.hasNextPage !== true,
    prizesCursor: str(obj(options.pageInfo)?.endCursor),
    hits,
    soldOffset: 0,
    soldCursor: str(soldPage?.endCursor),
    soldHasMore: soldPage?.hasNextPage === true,
    titleKeys: titleKeysOf(prizes, {}),
    fetchedAt: now,
  };
};

const titleKeysOf = (prizes: BreakPrize[], known: Record<string, string[]>) => {
  const out = { ...known };
  for (const p of prizes) {
    const t = prizeKey(p.title);
    const k = prizeValueKey(p);
    if (!out[t]?.includes(k)) out[t] = [...(out[t] ?? []), k];
  }
  return out;
};

// Sold-spot cursors are Relay offset cursors, base64 "arrayconnection:<index>".
const OFFSET_CURSOR_RE = /^arrayconnection:(\d+)$/;
const isOffsetCursor = (c: string | null) => {
  if (!c) return false;
  try {
    return OFFSET_CURSOR_RE.test(atob(c));
  } catch {
    return false;
  }
};
const cursorAfter = (index: number) => (index < 0 ? null : btoa(`arrayconnection:${index}`));

// A refresh only carries spins after the last cursor, so new ones are appended and known ones
// updated. A spin that sold before it was randomized has to be read again, so the cursor goes back
// to just before the first one still waiting.
const mergePrizes = (prev: BreakPrize[], page: BreakPrize[]) => {
  const fresh = new Map(page.map((p) => [p.id, p]));
  const seen = new Set<string>();
  const out: BreakPrize[] = [];
  for (const p of [...prev, ...page]) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(fresh.get(p.id) ?? p);
  }
  return out;
};

// `append` is a later prize page. `replace` is page one of a new read, which drops the old list.
export const mergeWheel = (prev: BreakSnapshot | null, next: BreakSnapshot, mode: 'replace' | 'append' = 'replace'): BreakSnapshot => {
  const same = prev?.id === next.id ? prev : null;
  const prizes = mode === 'append' && same ? mergePrizes(same.prizes, next.prizes) : next.prizes;
  const titleKeys = titleKeysOf(prizes, same?.titleKeys ?? {});
  if (next.hits === null) {
    return { ...next, prizes, hits: same?.hits ?? null, soldOffset: same?.soldOffset ?? 0, soldCursor: same?.soldCursor ?? null, soldHasMore: false, titleKeys };
  }
  const incoming = new Map(next.hits.map((h) => [h.spotId, h]));
  const known = (same?.hits ?? []).map((h) => {
    const fresh = incoming.get(h.spotId);
    if (!fresh) return h;
    incoming.delete(h.spotId);
    return { ...fresh, seenAt: h.seenAt };
  });
  let hits = [...known, ...next.hits.filter((h) => incoming.has(h.spotId))];
  let soldOffset = same?.soldOffset ?? 0;
  if (hits.length > MAX_HITS) {
    soldOffset += hits.length - MAX_HITS;
    hits = hits.slice(hits.length - MAX_HITS);
  }
  let soldCursor = next.soldCursor ?? same?.soldCursor ?? null;
  const firstPending = hits.findIndex((h) => h.pending);
  if (firstPending >= 0) soldCursor = isOffsetCursor(soldCursor) ? cursorAfter(soldOffset + firstPending - 1) : null;
  return { ...next, prizes, hits, soldOffset, soldCursor, titleKeys };
};

export const spotsLeft = (b: BreakSnapshot) => (b.total !== null && b.sold !== null ? Math.max(0, b.total - b.sold) : null);

export const pendingSpins = (b: BreakSnapshot) => (b.hits ?? []).filter((h) => h.pending).length;
