// Whatnot's live page talks Phoenix channels: `chat:<showId>` on the live socket carries chat and
// show state (confirmed: new_msg, latest_messages, livestream_update); `commerce:<showId>` on the
// auction socket carries lots, bids and sales for logged-in viewers. Commerce payloads are read
// tolerantly by field name, and unrecognized events are sampled for diagnostics.
import { BREAK_OPERATION, mergeWheel, parseBreakResponse, type BreakSnapshot } from './breaks';
import {
  contentsLine,
  isGenericCaseLot,
  notesRatio,
  packCount,
  perPiece,
  pushCaseRun,
  type CaseRun,
  type ContentsPin,
} from './casePack';
import { rateFrom, type SessionCurrency } from './currency';
import {
  electronicsPinFrom,
  isGenericDeviceClass,
  isPullBucket,
  lotNumber as electronicsLotNumber,
  type PullRun,
} from './electronics';
import { isTemplate, lotNumber, pinFrom, type EstateRun } from './estate';
import { moneyCurrency, moneyValue } from './money';
import {
  giveawayMatchesStem,
  giveawayShippingStems,
  vendorQuoteFromChat,
  type RunnerChatQuote,
} from './runner';
import { readShowNote, type ShowNote } from './showNotes';
import { detectShowType } from './showType';
import type { ShopScan } from './shop';

export interface PhoenixMessage {
  topic: string;
  event: string;
  payload: unknown;
}

export interface ChatMessage {
  id: string;
  user: string;
  text: string;
  isHost: boolean;
  isModerator: boolean;
  type: string | null;
  at: number;
}

export type LotStatus = 'active' | 'sold' | 'unsold' | 'unknown';

export interface Lot {
  id: string | null;
  title: string | null;
  subtitle?: string | null;
  currentBid: number | null;
  currency?: string | null;
  bidCount: number | null;
  leader: string | null;
  endsAt: number | null;
  status: LotStatus;
  nextBid: number | null;
  breakId: string | null;
  updatedAt: number;
}

export type SaleKind = 'auction' | 'buy_now' | 'giveaway' | 'unknown';

export interface Sale {
  key: string;
  productId: string | null;
  title: string | null;
  price: number | null;
  currency?: string | null;
  buyer: string | null;
  kind: SaleKind;
  at: number;
}

export interface ShowState {
  liveId: string;
  title: string | null;
  host: string | null;
  status: string | null;
  viewers: number | null;
  shareCount: number | null;
  activeGiveawayId: string | null;
  pinnedProductId: string | null;
  startedAt: number | null;
  isFollowingHost: boolean | null;
  categories: string[];
  note: ShowNote | null;
}

export interface EventSample {
  topic: string;
  event: string;
  sample: string;
}

export interface LiveSession {
  show: ShowState;
  lot: Lot | null;
  breakId: string | null;
  wheel: BreakSnapshot | null;
  sales: Sale[];
  chat: ChatMessage[];
  giveaways: { id: string; startedAt: number }[];
  eventCounts: Record<string, number>;
  samples: EventSample[];
  graphqlOps: Record<string, number>;
  shop: ShopScan | null;
  /** Lot number to a host, mod, or appraisal name. Dies with the session. */
  estatePins: Record<string, string>;
  /** Buyer requests, capped at 20. */
  estateWants: string[];
  /** Recent template hammers, newest first, capped at 12. */
  estateRuns: EstateRun[];
  /** Rules already shown, so the next lot does not add them again. */
  estateRulesKey: string | null;
  /** Pull lot number to a host, mod, or appraisal name. Dies with the session. */
  electronicsPins: Record<string, string>;
  /** Electronics buyer requests, capped at 20. */
  electronicsWants: string[];
  /** Recent pull-bucket hammers, newest first, capped at 12. */
  electronicsRuns: PullRun[];
  /** Electronics rules already shown, so the next lot does not add them again. */
  electronicsRulesKey: string | null;
  /** Host or mod vendor price quote on a runner show; cleared when a new lot starts. */
  runnerQuote: RunnerChatQuote | null;
  /** Stemmed titles of giveaway listings whose description says the seller pays shipping. */
  runnerGiveawayStems: string[];
  /** True when the signed-in user won a giveaway matching one of runnerGiveawayStems in this show. */
  runnerGiveawayShippingWon: boolean;
  /** Lot number to host/mod case-pack contents pin on a wholesale show. */
  casePins: Record<string, ContentsPin>;
  /** Recent case-pack hammers on a wholesale show, newest first, capped at 12. */
  caseRuns: CaseRun[];
  /** Non-USD currency and conversion rate from Whatnot's own "est. $" pairs on this show. */
  currency: SessionCurrency | null;
  /** Shipping rules already shown on this show. */
  shippingRulesKey: string | null;
  /** Shipping quote read off the page, so the side panel can show it. */
  shippingQuote: number | null;
  updatedAt: number;
}

export type LiveSignal =
  | { kind: 'giveaway_started'; giveawayId: string }
  | { kind: 'chat'; message: ChatMessage }
  | { kind: 'sale'; sale: Sale }
  | { kind: 'lot'; lot: Lot; started?: boolean };

const MAX_CHAT = 100;
const MAX_SALES = 500;
const MAX_SAMPLES = 12;

export const emptySession = (liveId: string, now = Date.now()): LiveSession => ({
  show: {
    liveId,
    title: null,
    host: null,
    status: null,
    viewers: null,
    shareCount: null,
    activeGiveawayId: null,
    pinnedProductId: null,
    startedAt: null,
    isFollowingHost: null,
    categories: [],
    note: null,
  },
  lot: null,
  breakId: null,
  wheel: null,
  sales: [],
  chat: [],
  giveaways: [],
  eventCounts: {},
  samples: [],
  graphqlOps: {},
  shop: null,
  estatePins: {},
  estateWants: [],
  estateRuns: [],
  estateRulesKey: null,
  electronicsPins: {},
  electronicsWants: [],
  electronicsRuns: [],
  electronicsRulesKey: null,
  runnerQuote: null,
  runnerGiveawayStems: [],
  runnerGiveawayShippingWon: false,
  casePins: {},
  caseRuns: [],
  currency: null,
  shippingRulesKey: null,
  shippingQuote: null,
  updatedAt: now,
});

export const sessionForPath = (prev: LiveSession | null, liveId: string | null): LiveSession | null => {
  if (!liveId) return null;
  if (!prev || prev.show.liveId !== liveId) return emptySession(liveId);
  return prev;
};

export const decodePhoenixFrame = (raw: unknown): PhoenixMessage | null => {
  if (typeof raw !== 'string' || raw.length < 2 || raw.length > 5_000_000) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  let topic: unknown;
  let event: unknown;
  let payload: unknown;
  if (Array.isArray(data) && data.length === 5) {
    [, , topic, event, payload] = data;
  } else if (data && typeof data === 'object') {
    ({ topic, event, payload } = data as Record<string, unknown>);
  }
  if (typeof topic !== 'string' || typeof event !== 'string') return null;
  if (topic === 'phoenix' || event === 'phx_reply' || event === 'heartbeat' || event === 'presence_diff') return null;
  return { topic, event, payload };
};

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : typeof v === 'number' ? String(v) : null);
const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};
const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

const username = (v: unknown): string | null => {
  if (typeof v === 'string') return v || null;
  const o = obj(v);
  return o ? str(o.username ?? o.userName ?? o.name ?? o.handle) : null;
};

const first = (o: Record<string, unknown>, keys: string[]): [string, unknown] | null => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return [k, o[k]];
  return null;
};

const timeValue = (v: unknown, now: number, remaining = false): number | null => {
  if (typeof v === 'string' && !/^\d+(\.\d+)?$/.test(v)) {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : null;
  }
  const n = num(v);
  if (n === null) return null;
  if (remaining) return now + (n > 1000 ? n : n * 1000);
  if (n > 1e12) return n;
  if (n > 1e9) return n * 1000;
  return null;
};

export const parseChatMessage = (raw: unknown, now: number): ChatMessage | null => {
  const m = obj(raw);
  if (!m) return null;
  const text = str(m.message ?? m.text ?? m.body);
  const user = obj(m.user);
  if (!text) return null;
  return {
    id: str(m.id) ?? `${now}-${text.slice(0, 20)}`,
    user: username(user) ?? 'unknown',
    text,
    isHost: Boolean(user?.isHost),
    isModerator: Boolean(user?.isModerator || user?.isNominatedModerator),
    type: str(m.type),
    at: timeValue(m.insertedAt ?? m.createdAt ?? m.timestamp, now) ?? now,
  };
};

// System chat lines (non-null type) sometimes announce wins: "bob won 1964 Kennedy Half for $12!"
const CHAT_SALE_RE = /^@?([\w.-]+)\s+(?:won|bought|purchased)\s+(.+?)(?:\s+for\s+\$([\d,.]+))?!?$/i;

export const saleFromChat = (m: ChatMessage, liveId: string): Sale | null => {
  if (m.type === null) return null;
  const match = m.text.match(CHAT_SALE_RE);
  if (!match?.[1] || !match[2]) return null;
  const price = match[3] ? parseFloat(match[3].replace(/,/g, '')) : null;
  const giveaway = /giveaway|givvy|givy/i.test(`${m.type} ${m.text}`);
  return makeSale(liveId, {
    productId: null,
    title: match[2],
    price: giveaway ? 0 : price,
    buyer: match[1],
    kind: giveaway ? 'giveaway' : 'auction',
    at: m.at,
  });
};

const makeSale = (liveId: string, s: Omit<Sale, 'key'>): Sale => ({
  ...s,
  key: [liveId, s.productId ?? s.title ?? '', s.buyer ?? '', s.price ?? ''].join('|').toLowerCase(),
});

interface CommerceRead {
  lot: Partial<Lot> | null;
  sale: Omit<Sale, 'key'> | null;
  giveawayId: string | null;
  breakId: string | null;
}

const collectObjects = (root: unknown, maxDepth = 4) => {
  const out: Record<string, unknown>[] = [];
  const queue: [unknown, number][] = [[root, 0]];
  while (queue.length && out.length < 40) {
    const [node, depth] = queue.shift()!;
    if (Array.isArray(node)) {
      if (depth < maxDepth) node.slice(0, 10).forEach((n) => queue.push([n, depth + 1]));
      continue;
    }
    const o = obj(node);
    if (!o) continue;
    out.push(o);
    if (depth < maxDepth) Object.values(o).forEach((v) => typeof v === 'object' && queue.push([v, depth + 1]));
  }
  return out;
};

const BID_KEYS = ['currentBid', 'current_bid', 'highBid', 'high_bid', 'currentPrice', 'current_price', 'bidAmount', 'bid_amount'];
const SOLD_PRICE_KEYS = ['soldPrice', 'sold_price', 'salePrice', 'finalPrice', 'final_price', 'winningBid', 'winning_bid', 'price'];
const ID_KEYS = ['liveProductId', 'productId', 'product_id', 'listingId', 'listing_id', 'id'];
const TITLE_KEYS = ['title', 'productName', 'listingTitle', 'name'];
const SUBTITLE_KEYS = ['subtitle', 'subTitle', 'condition', 'productCondition'];
const END_KEYS = ['endTime', 'end_time', 'endsAt', 'ends_at', 'auctionEndTime', 'endAt'];
const REMAINING_KEYS = ['timeRemaining', 'secondsRemaining', 'secondsLeft', 'time_left'];
const BUYER_KEYS = ['purchaserUser', 'buyer', 'winner', 'winningUser', 'purchaser', 'buyerUser', 'winnerUser'];
const LEADER_KEYS = ['currentBidUser', 'highBidder', 'leader', 'leadingBidder', 'bidder'];
const BID_COUNT_KEYS = ['currentBidCount', 'bidCount', 'bid_count', 'numBids', 'bidsCount'];
// Only the live auction carries these; the parent listing's auctionMinimum is its default start
// ($1 on a $99-minimum wheel), so it would understate what a bid costs.
const NEXT_BID_KEYS = ['nextBidPrice', 'nextBidCents'];

// Confirmed on new_bid: product.highestBid = { price: { amount }, priceCents, user: { username } }.
const highestBid = (o: Record<string, unknown>) => {
  const hb = obj(o.highestBid);
  if (!hb) return { bid: null, currency: null, leader: null };
  const cents = num(hb.priceCents);
  return {
    bid: moneyValue(hb.price) ?? (cents !== null ? cents / 100 : null),
    currency: moneyCurrency(hb.price),
    leader: username(hb.user),
  };
};

export const readCommerce = (event: string, payload: unknown, now: number): CommerceRead => {
  const read: CommerceRead = { lot: null, sale: null, giveawayId: null, breakId: null };
  const isGiveaway = /giveaway/i.test(event);
  const soldEvent = /sold|won|winner|purchase|order_placed|checkout/i.test(event);

  // giveaway_started: { id, product: { id, productId } }; the live product id is what
  // livestream_update reports as activeGiveawayLiveProductId, productId is the catalog item.
  if (/giveaway_started/i.test(event)) {
    const p = obj(payload);
    read.giveawayId = str(p?.id) ?? str(obj(p?.product)?.id) ?? str(p?.liveProductId);
  }

  for (const o of collectObjects(payload)) {
    const idHit = first(o, ID_KEYS);
    const titleHit = first(o, TITLE_KEYS);
    const bidHit = first(o, BID_KEYS);
    const soldHit = first(o, SOLD_PRICE_KEYS);
    const endHit = first(o, END_KEYS);
    const remainingHit = first(o, REMAINING_KEYS);
    const top = highestBid(o);
    const buyer = username(first(o, BUYER_KEYS)?.[1]);
    const leader = username(first(o, LEADER_KEYS)?.[1]) ?? top.leader;
    const status = str(o.status ?? o.state ?? o.auctionStatus ?? o.productStatus);
    const breakId = str(obj(o.breakInfo)?.breakId);
    if (breakId && !read.breakId) read.breakId = breakId;
    const looksLikeLot = Boolean(bidHit || top.bid !== null || endHit || remainingHit || (titleHit && (idHit || soldHit)));
    if (!looksLikeLot && !buyer) continue;

    const id = idHit ? str(idHit[1]) : null;
    const title = titleHit ? str(titleHit[1]) : null;
    const bid = bidHit ? moneyValue(bidHit[1], bidHit[0]) : top.bid;
    const bidCurrency = (bidHit ? moneyCurrency(bidHit[1]) : null) ?? top.currency ?? moneyCurrency(o.price);
    const soldPrice = soldHit ? moneyValue(soldHit[1], soldHit[0]) : null;
    const soldCurrency = (soldHit ? moneyCurrency(soldHit[1]) : null) ?? bidCurrency;
    const sold = soldEvent || /sold|won|complete|closed|purchased/i.test(status ?? '');

    if (!read.lot && (bidHit || top.bid !== null || endHit || remainingHit || titleHit)) {
      const nextBidHit = first(o, NEXT_BID_KEYS);
      const subtitleHit = first(o, SUBTITLE_KEYS);
      read.lot = {
        id,
        title,
        subtitle: subtitleHit ? str(subtitleHit[1]) : null,
        currentBid: bid,
        ...(bidCurrency ? { currency: bidCurrency } : {}),
        nextBid: nextBidHit ? moneyValue(nextBidHit[1], nextBidHit[0]) : null,
        breakId,
        bidCount: num(first(o, BID_COUNT_KEYS)?.[1]),
        leader,
        endsAt: endHit ? timeValue(endHit[1], now) : remainingHit ? timeValue(remainingHit[1], now, true) : null,
        status: sold ? 'sold' : /unsold|cancel|pass/i.test(status ?? '') ? 'unsold' : 'active',
      };
    }

    if (!read.sale && sold && (buyer || leader) && (soldPrice !== null || bid !== null || isGiveaway)) {
      const kind: SaleKind = isGiveaway
        ? 'giveaway'
        : /buy_?now|bin|purchase|order/i.test(`${event} ${str(o.transactionType) ?? ''}`)
          ? 'buy_now'
          : 'auction';
      read.sale = {
        productId: id,
        title,
        price: kind === 'giveaway' ? 0 : (soldPrice ?? bid),
        ...(soldCurrency ? { currency: soldCurrency } : {}),
        buyer: buyer ?? leader,
        kind,
        at: now,
      };
    }
  }
  return read;
};

const pushCapped = <T>(list: T[], item: T, max: number) => {
  const next = [...list, item];
  return next.length > max ? next.slice(next.length - max) : next;
};

const addSale = (session: LiveSession, sale: Sale, signals: LiveSignal[], viewerUsername?: string | null) => {
  if (session.sales.some((s) => s.key === sale.key)) return session;
  signals.push({ kind: 'sale', sale });
  let estateRuns = session.estateRuns;
  let electronicsRuns = session.electronicsRuns;
  let caseRuns = session.caseRuns;
  let runnerGiveawayShippingWon = session.runnerGiveawayShippingWon;
  let currency = session.currency;
  if (sale.currency && sale.currency !== 'USD' && !currency) {
    currency = { code: sale.currency, rate: null };
  }
  if (sale.kind === 'giveaway') {
    const buyerMatches =
      !viewerUsername || (sale.buyer && sale.buyer.toLowerCase() === viewerUsername.toLowerCase());
    if (buyerMatches && giveawayMatchesStem(sale.title, session.runnerGiveawayStems)) {
      runnerGiveawayShippingWon = true;
    }
  } else if (sale.price != null && sale.price > 0 && sale.title) {
    if (isPullBucket(sale.title, session.show.title)) {
      const number = electronicsLotNumber(sale.title);
      electronicsRuns = [{ number, name: number != null ? (session.electronicsPins[String(number)] ?? null) : null, price: sale.price }, ...electronicsRuns].slice(0, 12);
    }
    if (isTemplate(sale.title)) {
      const number = lotNumber(sale.title);
      estateRuns = [{ number, name: number != null ? (session.estatePins[String(number)] ?? null) : null, price: sale.price }, ...estateRuns].slice(0, 12);
    }
    const isWholesale =
      detectShowType(session.show.title, session.show.categories, session.show.note?.text ?? '') === 'wholesale';
    if (isWholesale) {
      const number = lotNumber(sale.title);
      const pinKey = number != null ? String(number) : (sale.productId ?? null);
      const pin = pinKey ? (session.casePins[pinKey] ?? null) : null;
      const count =
        pin?.count ??
        packCount(sale.title, session.lot?.subtitle).count ??
        notesRatio(session.show.note?.text);
      const generic = isGenericCaseLot(sale.title);
      if (generic || count !== null || pin !== null) {
        const name = pin?.name ?? (!generic ? sale.title : null);
        const unitPrice = count !== null ? perPiece(sale.price, count) : null;
        caseRuns = pushCaseRun(caseRuns, {
          number,
          name,
          count,
          price: sale.price,
          unitPrice,
        });
      }
    }
  }
  return {
    ...session,
    sales: pushCapped(session.sales, sale, MAX_SALES),
    estateRuns,
    electronicsRuns,
    caseRuns,
    currency,
    runnerGiveawayShippingWon,
  };
};

const noteChat = (session: LiveSession, m: ChatMessage): LiveSession => {
  let next = session;
  const rQuote = vendorQuoteFromChat(m.text, m.isHost, m.isModerator, next.shippingQuote);
  if (rQuote) next = { ...next, runnerQuote: rQuote };
  const title = next.lot?.title;
  const number = title && isTemplate(title) ? lotNumber(title) : null;
  const pin = number != null ? pinFrom(m.text, m.isHost, m.isModerator) : null;
  if (pin && number != null) next = { ...next, estatePins: { ...next.estatePins, [String(number)]: pin } };
  const eNumber = title && isPullBucket(title, next.show.title) ? electronicsLotNumber(title) : null;
  const ePin = eNumber != null ? electronicsPinFrom(m.text, m.isHost, m.isModerator) : null;
  if (ePin && eNumber != null) next = { ...next, electronicsPins: { ...next.electronicsPins, [String(eNumber)]: ePin } };
  if (
    (m.isHost || m.isModerator) &&
    title &&
    isGenericCaseLot(title) &&
    detectShowType(next.show.title, next.show.categories, next.show.note?.text ?? '') === 'wholesale'
  ) {
    const cPin = contentsLine(m.text);
    if (cPin) {
      const cNum = lotNumber(title);
      const key = cNum != null ? String(cNum) : (next.lot?.id ?? 'current');
      next = { ...next, casePins: { ...next.casePins, [key]: cPin } };
    }
  }
  return next;
};

export const noteEstateName = (session: LiveSession, name: string | null | undefined): LiveSession => {
  const title = session.lot?.title;
  const number = title && isTemplate(title) ? lotNumber(title) : null;
  const clean = name?.trim();
  if (number == null || !clean || isTemplate(clean)) return session;
  return { ...session, estatePins: { ...session.estatePins, [String(number)]: clean } };
};

export const noteEstateRules = (session: LiveSession, key: string | null): LiveSession =>
  key && key !== session.estateRulesKey ? { ...session, estateRulesKey: key } : session;

export const noteElectronicsName = (session: LiveSession, name: string | null | undefined): LiveSession => {
  const title = session.lot?.title;
  const number = title && isPullBucket(title) ? electronicsLotNumber(title) : null;
  const clean = name?.trim();
  if (number == null || !clean || isPullBucket(clean) || isGenericDeviceClass(clean)) return session;
  return { ...session, electronicsPins: { ...session.electronicsPins, [String(number)]: clean } };
};

export const noteElectronicsRules = (session: LiveSession, key: string | null): LiveSession =>
  key && key !== session.electronicsRulesKey ? { ...session, electronicsRulesKey: key } : session;

export const noteShippingQuote = (session: LiveSession, shipping: number | null): LiveSession =>
  shipping != null && shipping !== session.shippingQuote ? { ...session, shippingQuote: shipping } : session;

export const noteShippingRules = (session: LiveSession, key: string | null): LiveSession =>
  key && key !== session.shippingRulesKey ? { ...session, shippingRulesKey: key } : session;

export const noteCurrencyPair = (
  session: LiveSession,
  pair: { amount: number; code: string; usd: number | null; tariffs?: boolean } | null | undefined,
): LiveSession => {
  if (!pair || !pair.code || pair.code.toUpperCase() === 'USD') return session;
  const code = pair.code.toUpperCase();
  const prev = session.currency?.code === code ? session.currency : null;
  const prevBasis = prev?.basis ?? 0;
  let rate = prev?.rate ?? null;
  let basis = prevBasis;
  if (pair.usd != null && pair.amount > 0 && pair.amount >= prevBasis) {
    const computed = rateFrom([{ amount: pair.amount, usd: pair.usd, code }]);
    if (computed !== null) {
      rate = computed;
      basis = pair.amount;
    }
  }
  const tariffs = Boolean(pair.tariffs || prev?.tariffs);
  if (prev && prev.rate === rate && (prev.basis ?? 0) === basis && Boolean(prev.tariffs) === tariffs) {
    return session;
  }
  return {
    ...session,
    currency: { code, rate, ...(basis > 0 ? { basis } : {}), ...(tariffs ? { tariffs: true } : {}) },
  };
};

export const noteRunnerGiveawayStems = (session: LiveSession, bodyOrStems: unknown): LiveSession => {
  const incoming = Array.isArray(bodyOrStems)
    ? bodyOrStems.filter((x): x is string => typeof x === 'string')
    : giveawayShippingStems(bodyOrStems);
  if (!incoming.length) return session;
  const merged = [...new Set([...session.runnerGiveawayStems, ...incoming])];
  if (merged.length === session.runnerGiveawayStems.length) return session;
  return { ...session, runnerGiveawayStems: merged };
};

const sampleEvent = (session: LiveSession, msg: PhoenixMessage): LiveSession => {
  const key = `${msg.topic.split(':')[0]}:${msg.event}`;
  const eventCounts = { ...session.eventCounts, [key]: (session.eventCounts[key] ?? 0) + 1 };
  let samples = session.samples;
  if (!samples.some((s) => s.event === msg.event && s.topic.split(':')[0] === msg.topic.split(':')[0]) && samples.length < MAX_SAMPLES) {
    let sample = '';
    try {
      sample = JSON.stringify(msg.payload).slice(0, 1500);
    } catch {
      sample = '[unserializable]';
    }
    samples = [...samples, { topic: msg.topic.split(':')[0] ?? msg.topic, event: msg.event, sample }];
  }
  return { ...session, eventCounts, samples };
};

const CATEGORY_KEYS = ['primaryCategory', 'category', 'categories', 'subcategory', 'subCategory', 'categoryNodes', 'tags'];

// Show sockets send taxonomy ids ("t__905") and format flags ("primary_show_format_auction")
// beside snake_case tags ("us_coins"); only the tags mean anything to a model.
const categoryLabel = (raw: string) => {
  const s = raw.trim();
  if (!s || s.length > 60 || /^[a-z]*_*\d+$/i.test(s) || /^(?:primary_)?show_format_/i.test(s)) return null;
  return /^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(s) ? s.replace(/_/g, ' ') : s;
};

// The category field names aren't confirmed, so this accepts strings, { label | name } objects,
// arrays of either, and GraphQL { edges: [{ node }] } lists. Parent categories come first.
export const readCategories = (p: Record<string, unknown>): string[] => {
  const out: string[] = [];
  const add = (v: unknown, depth = 0): void => {
    if (depth > 5 || out.length >= 6) return;
    if (typeof v === 'string') {
      const s = categoryLabel(v);
      if (s && !out.includes(s)) out.push(s);
      return;
    }
    if (Array.isArray(v)) return v.slice(0, 6).forEach((x) => add(x, depth + 1));
    const o = obj(v);
    if (!o) return;
    if (o.edges) return add(o.edges, depth + 1);
    if (o.node) return add(o.node, depth + 1);
    if (o.parent || o.parentCategory) add(o.parent ?? o.parentCategory, depth + 1);
    add(str(o.label ?? o.name ?? o.displayName ?? o.title), depth + 1);
  };
  CATEGORY_KEYS.forEach((k) => add(p[k]));
  return out;
};

const applyShowFields = (session: LiveSession, p: Record<string, unknown>, signals: LiveSignal[], now: number) => {
  const prev = session.show;
  const categories = readCategories(p);
  const giveawayId = p.activeGiveawayLiveProductId === undefined ? prev.activeGiveawayId : str(p.activeGiveawayLiveProductId);
  const show: ShowState = {
    ...prev,
    title: str(p.title) ?? prev.title,
    host: str(p.hostUsername) ?? username(p.user) ?? prev.host,
    status: str(p.status) ?? prev.status,
    viewers: num(p.activeViewers) ?? prev.viewers,
    shareCount: num(p.shareCounts ?? p.shareCount) ?? prev.shareCount,
    activeGiveawayId: giveawayId,
    pinnedProductId: p.pinnedProductId === undefined ? prev.pinnedProductId : str(p.pinnedProductId),
    startedAt: timeValue(p.startTime, now) ?? prev.startedAt,
    isFollowingHost: typeof obj(p.user)?.isFollowing === 'boolean' ? Boolean(obj(p.user)?.isFollowing) : prev.isFollowingHost,
    categories: categories.length ? categories : (prev.categories ?? []),
  };
  let giveaways = session.giveaways;
  // The first update is a baseline: a giveaway already running when you arrive isn't news.
  if (giveawayId && giveawayId !== prev.activeGiveawayId && prev.status !== null) {
    signals.push({ kind: 'giveaway_started', giveawayId });
  }
  if (giveawayId && !giveaways.some((g) => g.id === giveawayId)) giveaways = [...giveaways, { id: giveawayId, startedAt: now }];
  return { ...session, show, giveaways };
};

// A different item from the last lot seen. Ids win when both have one; an id arriving for a lot
// first seen by title alone is the same item.
export const isNewLot = (prev: Pick<Lot, 'id' | 'title'> | null, lot: Pick<Lot, 'id' | 'title'>): boolean => {
  if (!lot.id && !lot.title) return false;
  if (!prev) return true;
  if (prev.id && lot.id) return prev.id !== lot.id;
  return Boolean(prev.title && lot.title && prev.title !== lot.title);
};

// started: Whatnot's auction_started, always a fresh auction. Spots and repeat auctions from one
// listing share its productId, so the id alone would carry the last auction's bid and leader over.
const applyLot = (session: LiveSession, patch: Partial<Lot>, signals: LiveSignal[], now: number, started = false): LiveSession => {
  const prev = session.lot;
  const sameLot = !started && prev && (!patch.id || !prev.id || patch.id === prev.id);
  const base: Lot = sameLot && prev
    ? prev
    : {
        id: null,
        title: null,
        subtitle: null,
        currentBid: null,
        bidCount: null,
        leader: null,
        endsAt: null,
        status: 'unknown',
        nextBid: null,
        breakId: null,
        updatedAt: now,
      };
  const lot: Lot = {
    id: patch.id ?? base.id,
    title: patch.title ?? base.title,
    subtitle: patch.subtitle ?? base.subtitle ?? null,
    currentBid: patch.currentBid ?? base.currentBid,
    ...(patch.currency ?? base.currency ? { currency: patch.currency ?? base.currency } : {}),
    bidCount: patch.bidCount ?? base.bidCount,
    leader: patch.leader ?? base.leader,
    endsAt: patch.endsAt ?? base.endsAt,
    status: patch.status && patch.status !== 'unknown' ? patch.status : base.status,
    nextBid: patch.nextBid ?? base.nextBid ?? null,
    breakId: patch.breakId ?? base.breakId ?? null,
    updatedAt: now,
  };
  let currency = session.currency;
  if (lot.currency && lot.currency !== 'USD' && !currency) {
    currency = { code: lot.currency, rate: null };
  }
  const changed = started || isNewLot(prev, lot);
  signals.push(started ? { kind: 'lot', lot, started } : { kind: 'lot', lot });
  return { ...session, lot, currency, ...(changed ? { runnerQuote: null } : {}) };
};

export const reduceSocket = (
  session: LiveSession,
  msg: PhoenixMessage,
  now = Date.now(),
  viewerUsername?: string | null,
): { session: LiveSession; signals: LiveSignal[] } => {
  const signals: LiveSignal[] = [];
  let next = sampleEvent(session, msg);
  const channel = msg.topic.split(':')[0];
  const p = obj(msg.payload) ?? {};

  // Show state also arrives on the live socket's auction channel; read as commerce, its title and id
  // would look like a lot.
  if (msg.event === 'livestream_update') {
    next = applyShowFields(next, p, signals, now);
  } else if (msg.event === 'livestream_shared') {
    const shareCount = num(p.shareCounts);
    if (shareCount !== null) next = { ...next, show: { ...next.show, shareCount } };
  } else if (channel === 'chat') {
    if (msg.event === 'new_msg' || msg.event === 'latest_messages') {
      const raws = msg.event === 'latest_messages' && Array.isArray(p.messages) ? p.messages : [msg.payload];
      for (const raw of raws) {
        const m = parseChatMessage(raw, now);
        if (!m || next.chat.some((c) => c.id === m.id)) continue;
        next = { ...next, chat: pushCapped(next.chat, m, MAX_CHAT) };
        if (msg.event === 'new_msg') {
          signals.push({ kind: 'chat', message: m });
          next = noteChat(next, m);
        }
        const sale = saleFromChat(m, next.show.liveId);
        if (sale) next = addSale(next, sale, signals, viewerUsername);
      }
    }
  } else {
    const read = readCommerce(msg.event, msg.payload, now);
    if (read.breakId && read.breakId !== next.breakId) next = { ...next, breakId: read.breakId };
    if (read.lot) next = applyLot(next, read.lot, signals, now, /^auction_started$/i.test(msg.event));
    if (read.sale) next = addSale(next, makeSale(next.show.liveId, read.sale), signals, viewerUsername);
    if (read.giveawayId && read.giveawayId !== next.show.activeGiveawayId) {
      signals.push({ kind: 'giveaway_started', giveawayId: read.giveawayId });
      next = {
        ...next,
        show: { ...next.show, activeGiveawayId: read.giveawayId },
        giveaways: [...next.giveaways, { id: read.giveawayId, startedAt: now }],
      };
    }
  }
  return { session: { ...next, updatedAt: now }, signals };
};

// optionsAfter is set only for our own paged fetch. Undefined means the page's own QueryBreak,
// whose partial pages must not replace a list we already have.
export const reduceGraphql = (session: LiveSession, operation: string, body: unknown, now = Date.now(), optionsAfter?: string | null) => {
  const graphqlOps = { ...session.graphqlOps, [operation]: (session.graphqlOps[operation] ?? 0) + 1 };
  let next: LiveSession = { ...session, graphqlOps };
  const note = readShowNote(body, session.show.liveId);
  if (note !== undefined) next = { ...next, show: { ...next.show, note } };
  if (body) next = noteRunnerGiveawayStems(next, body);
  const live = obj(obj(obj(body)?.data)?.liveStream);
  if (operation === 'LiveStream' && live && (!live.id || live.id === session.show.liveId)) {
    // Page-load data only sets the baseline, so it never raises alerts.
    next = applyShowFields(next, live, [], now);
  }
  if (operation === BREAK_OPERATION) {
    const wheel = parseBreakResponse(body, now);
    const ours = optionsAfter !== undefined;
    const sameBreak = !!wheel && (!session.breakId || wheel.id === session.breakId);
    if (wheel && sameBreak && (ours || wheel.complete || !session.wheel)) {
      next = { ...next, breakId: wheel.id, wheel: mergeWheel(session.wheel, wheel, optionsAfter ? 'append' : 'replace') };
    }
  }
  return { ...next, updatedAt: now };
};

export interface SalesSummary {
  revenue: number;
  orders: number;
  giveaways: number;
  topBuyers: { user: string; spend: number; orders: number }[];
}

export const summarizeSales = (sales: Sale[]): SalesSummary => {
  const buyers = new Map<string, { spend: number; orders: number }>();
  let revenue = 0;
  let orders = 0;
  let giveaways = 0;
  for (const s of sales) {
    if (s.kind === 'giveaway') {
      giveaways += 1;
      continue;
    }
    orders += 1;
    revenue += s.price ?? 0;
    if (s.buyer) {
      const b = buyers.get(s.buyer) ?? { spend: 0, orders: 0 };
      b.spend += s.price ?? 0;
      b.orders += 1;
      buyers.set(s.buyer, b);
    }
  }
  const topBuyers = Array.from(buyers, ([user, b]) => ({ user, ...b }))
    .sort((a, b) => b.spend - a.spend || b.orders - a.orders)
    .slice(0, 5);
  return { revenue, orders, giveaways, topBuyers };
};

// Snapshot sent to the side panel: recent chat and sales only, so session storage stays small.
export const snapshotSession = (s: LiveSession): LiveSession => ({
  ...s,
  chat: s.chat.slice(-20),
  sales: s.sales.slice(-200),
});
