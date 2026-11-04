// Flea-market runner shows: R-for-run / P-for-pass + vendor price ladder detection,
// host/mod vendor price quote, shipping callout (with seller-paid giveaway shipping stems),
// named "… As seen" item titles, prompt supplement for ladder/rules past the 700-char cap,
// and the one-scan-per-gap idle stall scan gate.
import { isTemplate } from './estate';
import { formatMoney } from './money';
import { couponsIn, noteForPrompt } from './showNotes';

export interface PriceRung {
  vendor: number;
  run: number;
}

export interface PriceLadder {
  rungs: PriceRung[];
  doubleFrom: number | null;
  wrapAdd: number | null;
}

export interface RunnerChatQuote {
  vendor: number;
  text: string;
}

export interface ComputedRunQuote {
  vendor: number;
  start: number;
  wrap: number;
  merchandiseTotal: number;
  shipping: number | null;
  allIn: number | null;
}

export interface RunnerView {
  ladder: string;
  quote: string | null;
  shippingNote: string | null;
}

const RUN_PASS_RE =
  /\br\b\s*(?:for|=|to|is|-|–|—)\s*run\b[\s\S]*?\bp\b\s*(?:for|=|to|is|-|–|—)\s*pass\b|\bp\b\s*(?:for|=|to|is|-|–|—)\s*pass\b[\s\S]*?\br\b\s*(?:for|=|to|is|-|–|—)\s*run\b|\b(?:put\s+in|type|chat|answer|drop)\s+r\s+(?:or|\/|and)\s+p\b/i;

const WRAP_WORD_RE = /\b(?:glass|glassware|multiple(?:\s+items?)?|bundles?|bubble\s*wrap|fragile)\b/i;
const DOUBLE_WORD_RE = /\b(?:doubl(?:ed|e|es)|twice|2\s*x)\b/i;

const parseAmount = (a?: string, b?: string): number | null => {
  const raw = a ?? b;
  if (!raw) return null;
  const n = parseFloat(raw.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};

export const hasRunPassInstruction = (notes: string | null | undefined): boolean =>
  Boolean(notes && RUN_PASS_RE.test(notes));

export const parsePriceLadder = (notes: string | null | undefined): PriceLadder | null => {
  if (!notes) return null;
  const rungMap = new Map<number, number>();
  let doubleFrom: number | null = null;
  let wrapAdd: number | null = null;

  // Split into clauses by newline, semicolon, or period, and also scan comma-separated clauses.
  const lines = notes.split(/[\r\n;.]+/);
  for (const rawLine of lines) {
    const clauses = rawLine.split(/,(?=\s*(?:and\s+)?(?:vendor|anything|items?|large|glass|multiple|bubble|\$|\d+\s+dollars?))/i);
    for (const clause of clauses) {
      const c = clause.trim();
      if (!c) continue;

      if (WRAP_WORD_RE.test(c) && !/\b(?:will\s+run\s+for|runs?\s+for)\b/i.test(c)) {
        const m =
          c.match(/(?:\+|add(?:s|ed)?|extra|plus)\s*(?:\$\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s+dollars?)/i) ??
          c.match(/(?:\$\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s+dollars?)\s*(?:extra|add(?:ed)?|more|for\s+(?:wrap|bubble|glass|multiple))/i);
        const amt = parseAmount(m?.[1], m?.[2]);
        if (amt !== null && wrapAdd === null) {
          wrapAdd = amt;
        }
        continue;
      }

      if (DOUBLE_WORD_RE.test(c)) {
        const m = c.match(/(?:\$\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s+dollars?)/i);
        const amt = parseAmount(m?.[1], m?.[2]);
        if (amt !== null && doubleFrom === null) {
          doubleFrom = amt;
        }
        // A line might have rungs before "and anything $5 and up is doubled" if comma split didn't catch it
        const beforeDouble = c.split(/\b(?:anything|items?|\$\s*\d+|\d+\s+dollars?)\s*(?:and\s+(?:up|over|more|above)|\+)[^\n]*\b(?:doubl|twice|2x)/i)[0] ?? '';
        if (!beforeDouble.trim()) continue;
      }

      const rungRe =
        /(?:\$\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s+dollars?)\s*(?:will\s+run\s+for|runs?\s+for|run\s+for|starts?\s+at|for|->|→|=|:)\s*(?:\$\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s+dollars?)/gi;
      for (const m of c.matchAll(rungRe)) {
        const vendor = parseAmount(m[1], m[2]);
        const run = parseAmount(m[3], m[4]);
        if (vendor !== null && run !== null && !rungMap.has(vendor)) {
          rungMap.set(vendor, run);
        }
      }
    }
  }

  if (rungMap.size === 0) return null;
  const rungs = [...rungMap.entries()]
    .map(([vendor, run]) => ({ vendor, run }))
    .sort((a, b) => a.vendor - b.vendor);
  return { rungs, doubleFrom, wrapAdd };
};

export const runnerPassOn = (notes: string | null | undefined): boolean =>
  hasRunPassInstruction(notes) && parsePriceLadder(notes) !== null;

export const formatPriceLadder = (ladder: PriceLadder | null): string | null => {
  if (!ladder || !ladder.rungs.length) return null;
  const rungParts = ladder.rungs.map((r) => `${formatMoney(r.vendor)} → ${formatMoney(r.run)}`);
  const parts = [
    ...rungParts,
    ladder.doubleFrom !== null ? `${formatMoney(ladder.doubleFrom)}+ doubled` : null,
    ladder.wrapAdd !== null ? `+${formatMoney(ladder.wrapAdd)} glass/multiple` : null,
  ].filter(Boolean);
  return parts.join(' · ');
};

const IGNORE_QUOTE_LINE_RE =
  /\b(?:ship|shipping|postage|tip|tips|tipping|coupon|promo|code|givvy|giveaway)\b/i;

export const vendorQuoteFromChat = (
  text: string | null | undefined,
  isHost: boolean,
  isModerator: boolean,
  knownShipping?: number | null,
): RunnerChatQuote | null => {
  if (!isHost && !isModerator) return null;
  const t = text?.trim() ?? '';
  if (!t || IGNORE_QUOTE_LINE_RE.test(t)) return null;
  const amounts: number[] = [];
  const amountRe = /\$\s*(\d+(?:,\d{3})*(?:\.\d+)?)\b|\b(\d+(?:\.\d+)?)\s+dollars?\b/gi;
  for (const m of t.matchAll(amountRe)) {
    const val = parseAmount(m[1], m[2]);
    if (val !== null) amounts.push(val);
  }
  if (amounts.length !== 1) return null;
  const vendor = amounts[0]!;
  if (knownShipping != null && Math.abs(vendor - knownShipping) < 0.005) return null;
  return { vendor, text: t };
};

export const computeRunQuote = (
  quote: RunnerChatQuote | null | undefined,
  ladder: PriceLadder | null | undefined,
  shipping: number | null = null,
): ComputedRunQuote | null => {
  if (!quote || !ladder) return null;
  const exact = ladder.rungs.find((r) => Math.abs(r.vendor - quote.vendor) < 0.005);
  let start: number | null = null;
  if (exact) {
    start = exact.run;
  } else if (ladder.doubleFrom !== null && quote.vendor >= ladder.doubleFrom) {
    start = quote.vendor * 2;
  }
  if (start === null) return null;
  const needsWrap = ladder.wrapAdd !== null && WRAP_WORD_RE.test(quote.text);
  const wrap = needsWrap && ladder.wrapAdd !== null ? ladder.wrapAdd : 0;
  const merchandiseTotal = start + wrap;
  const cleanShip = shipping !== null && Number.isFinite(shipping) && shipping > 0 ? shipping : null;
  const allIn = cleanShip !== null ? Math.round((merchandiseTotal + cleanShip) * 100) / 100 : null;
  return {
    vendor: quote.vendor,
    start,
    wrap,
    merchandiseTotal,
    shipping: cleanShip,
    allIn,
  };
};

export const formatRunQuote = (q: ComputedRunQuote | null): string | null => {
  if (!q) return null;
  const parts = [`Vendor ${formatMoney(q.vendor)}`, `start ${formatMoney(q.start)}`];
  if (q.wrap > 0) {
    parts.push(`+${formatMoney(q.wrap)} wrap (${formatMoney(q.merchandiseTotal)})`);
  }
  if (q.shipping !== null && q.allIn !== null) {
    parts.push(`+${formatMoney(q.shipping)} ship = ${formatMoney(q.allIn)}`);
  }
  return parts.join(' · ');
};

export const runnerShippingCallout = (p: {
  shipping: number | null;
  runStart?: number | null;
  activeBid?: number | null;
  hasActiveLot?: boolean;
  shippingPaid?: boolean;
}): string | null => {
  if (p.shippingPaid) return null;
  const ship = p.shipping;
  if (ship === null || !Number.isFinite(ship) || ship <= 0) return null;
  const active = Boolean(p.hasActiveLot);
  const ref = active ? (p.activeBid ?? null) : (p.runStart ?? null);
  if (ref === null || !Number.isFinite(ref) || ref <= 0) return null;
  if (ship * 2 < ref) return null;
  const word = active ? 'bid' : 'start';
  return `Shipping ${formatMoney(ship)} is at least half the ${formatMoney(ref)} ${word}`;
};

export const runnerShippingPaid = (p: {
  purchases?: { liveId: string | null; price: number; kind?: string }[];
  liveId?: string | null;
  giveawayShippingWon?: boolean;
}): boolean => {
  if (p.giveawayShippingWon) return true;
  if (!p.liveId || !p.purchases?.length) return false;
  return p.purchases.some(
    (x) => x.liveId === p.liveId && x.kind !== 'giveaway' && typeof x.price === 'number' && x.price > 0,
  );
};

export const giveawayStem = (title: string | null | undefined): string | null => {
  const raw = title?.trim() ?? '';
  if (!raw) return null;
  const stem = raw
    .replace(/#\s*\d+\b/g, ' ')
    .replace(/\blot\s+\d+\b/gi, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9\s]/gi, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  return stem.length >= 2 ? stem : null;
};

const SELLER_PAYS_SHIPPING_RE =
  /\b(?:seller\s+pays?\s+(?:for\s+)?shipping|we\s+pay\s+(?:for\s+)?shipping|free\s+shipping|pays?\s+shipping\s+on\s+giveaways?|shipping\s+(?:is\s+)?(?:paid|covered|included)(?:\s+by\s+seller)?)\b/i;

const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

export const giveawayShippingStems = (body: unknown): string[] => {
  const stems = new Set<string>();
  const walk = (node: unknown, depth: number) => {
    if (depth > 8 || stems.size >= 50) return;
    if (Array.isArray(node)) {
      for (const n of node) walk(n, depth + 1);
      return;
    }
    const o = obj(node);
    if (!o) return;
    const type = str(
      o.transactionType ?? o.transaction_type ?? obj(o.listing)?.transactionType ?? obj(o.product)?.transactionType,
    );
    if (type && /giveaway/i.test(type)) {
      const title = str(o.title ?? o.name ?? o.productName ?? obj(o.product)?.title ?? obj(o.listing)?.title);
      const desc = [
        str(o.description),
        str(o.subtitle),
        str(o.subTitle),
        str(obj(o.product)?.description),
        str(obj(o.listing)?.description),
        str(obj(o.content)?.text),
      ]
        .filter(Boolean)
        .join('\n');
      if (title && desc && SELLER_PAYS_SHIPPING_RE.test(desc)) {
        const stem = giveawayStem(title);
        if (stem) stems.add(stem);
      }
    }
    for (const v of Object.values(o)) if (v && typeof v === 'object') walk(v, depth + 1);
  };
  walk(body, 0);
  return [...stems];
};

export const giveawayMatchesStem = (
  saleTitle: string | null | undefined,
  stems: readonly string[],
): boolean => {
  if (!stems.length) return false;
  const stem = giveawayStem(saleTitle);
  if (!stem) return false;
  return stems.some((s) => stem === s || stem.startsWith(`${s} `) || s.startsWith(`${stem} `));
};

const GENERIC_RUNNER_WORDS = new Set([
  'item', 'items', 'lot', 'lots', 'box', 'boxes', 'bag', 'bags', 'pull', 'pulls',
  'choice', 'random', 'vintage', 'antique', 'table', 'shelf', 'screen', 'electronic', 'electronics',
]);

export const runnerItemName = (title: string | null | undefined, runnerOn: boolean): string | null => {
  if (!runnerOn || !title) return null;
  const m = title.trim().match(/^(.+?)\s+\bas\s+(?:seen|shown)(?:\s+on\s+screen)?(?:\s*#\s*\d+)?\s*$/i);
  if (!m?.[1]) return null;
  const prefix = m[1].replace(/#\s*\d+\b/g, '').trim();
  if (!prefix || prefix.length < 2) return null;
  if (isTemplate(prefix)) return null;
  const words = prefix
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length || words.every((w) => GENERIC_RUNNER_WORDS.has(w))) return null;
  return prefix;
};

const BUYING_RULES_LINE_RE =
  /\b(?:no\s+(?:cancellations?|cancels?|refunds?|returns?)|all\s+sales\s+final|as[- ]?is|untested|not\s+(?:cleaned|washed|tested))\b/i;

const LADDER_LINE_RE =
  /(?:\$\s*\d+|\d+\s+dollars?)[^\n]*(?:will\s+run\s+for|runs?\s+for|->|→|\bdoubl(?:ed|e)\b)|(?:\+|add(?:s|ed)?|extra)\s*\$\s*\d+[^\n]*\b(?:glass|multiple|bubble)/i;

export const runnerNoteSupplement = (notes: string | null | undefined): string => {
  if (!notes || !runnerPassOn(notes)) return '';
  const capped = noteForPrompt(notes);
  const coupons = couponsIn(notes);
  const kept: string[] = [];
  for (const rawLine of notes.split(/\r?\n/)) {
    const cleaned = noteForPrompt(rawLine);
    if (!cleaned) continue;
    if (!BUYING_RULES_LINE_RE.test(cleaned) && !LADDER_LINE_RE.test(cleaned)) continue;
    let safe = cleaned;
    for (const c of coupons) {
      safe = safe.replace(new RegExp(`\\b${c}\\b`, 'gi'), '').trim();
    }
    if (!safe || capped.includes(safe) || kept.includes(safe)) continue;
    kept.push(safe);
  }
  return kept.join('\n');
};

export const buildRunnerView = (input: {
  notes?: string | null;
  quote?: RunnerChatQuote | null;
  shipping?: number | null;
  activeBid?: number | null;
  hasActiveLot?: boolean;
  shippingPaid?: boolean;
}): RunnerView | null => {
  if (!runnerPassOn(input.notes)) return null;
  const ladder = parsePriceLadder(input.notes);
  const ladderText = formatPriceLadder(ladder);
  if (!ladderText) return null;
  const computed = !input.hasActiveLot ? computeRunQuote(input.quote, ladder, input.shipping ?? null) : null;
  const quoteText = formatRunQuote(computed);
  const shippingNote = runnerShippingCallout({
    shipping: input.shipping ?? null,
    runStart: computed?.start ?? null,
    activeBid: input.activeBid ?? null,
    hasActiveLot: input.hasActiveLot,
    shippingPaid: input.shippingPaid,
  });
  return {
    ladder: ladderText,
    quote: quoteText,
    shippingNote,
  };
};

export const runnerViewFromSession = (
  session: {
    show: { liveId: string; note?: { text?: string | null } | null };
    lot: { status?: string; currentBid: number | null } | null;
    runnerQuote?: RunnerChatQuote | null;
    runnerGiveawayShippingWon?: boolean;
    shippingQuote?: number | null;
  },
  extra: {
    shipping?: number | null;
    purchases?: { liveId: string | null; price: number; kind?: string }[];
  } = {},
): RunnerView | null => {
  const hasActiveLot = Boolean(session.lot && session.lot.status !== 'sold');
  const shippingPaid = runnerShippingPaid({
    purchases: extra.purchases,
    liveId: session.show.liveId,
    giveawayShippingWon: session.runnerGiveawayShippingWon,
  });
  return buildRunnerView({
    notes: session.show.note?.text,
    quote: session.runnerQuote ?? null,
    shipping: extra.shipping !== undefined ? extra.shipping : (session.shippingQuote ?? null),
    activeBid: session.lot?.currentBid ?? null,
    hasActiveLot,
    shippingPaid,
  });
};

export interface IdleScanGateState {
  gapId: number;
  hadActiveLot: boolean;
  scannedGapId: number | null;
}

export const emptyIdleScanGate = (): IdleScanGateState => ({
  gapId: 0,
  hadActiveLot: false,
  scannedGapId: null,
});

export interface IdleScanCheckInput {
  runnerOn: boolean;
  scanOn: boolean;
  hasActiveLot: boolean;
  documentVisible: boolean;
  isShareWorker: boolean;
}

export const stepIdleScanGate = (
  state: IdleScanGateState,
  input: IdleScanCheckInput,
): { state: IdleScanGateState; shouldScan: boolean; gapId: number } => {
  let gapId = state.gapId;
  if (input.hasActiveLot && !state.hadActiveLot) {
    gapId += 1;
  }
  const shouldScan =
    input.runnerOn &&
    input.scanOn &&
    !input.hasActiveLot &&
    input.documentVisible &&
    !input.isShareWorker &&
    state.scannedGapId !== gapId;
  const next: IdleScanGateState = {
    gapId,
    hadActiveLot: input.hasActiveLot,
    scannedGapId: shouldScan ? gapId : state.scannedGapId,
  };
  return { state: next, shouldScan, gapId };
};

export const isIdleScanResultCurrent = (
  state: IdleScanGateState,
  resultGapId: number,
  hasActiveLot: boolean,
): boolean => !hasActiveLot && state.gapId === resultGapId;
