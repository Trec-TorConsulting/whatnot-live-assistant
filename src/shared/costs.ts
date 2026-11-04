// What a win really costs (bid, shipping, tax), what it would bring back if resold on Whatnot, and
// what everything you've bought is worth today.
import { readAmountText } from './currency';
import { formatMoney } from './money';
import { purchaseUsd, type Purchase } from './purchases';

const round = (n: number) => Math.round(n * 100) / 100;

export interface ParsedShippingInfo {
  shipping: number | null;
  tariffs: boolean;
  code: string;
  rawAmount: number | null;
  usd: number | null;
}

export const parseShippingInfo = (text: string | null | undefined): ParsedShippingInfo => {
  if (!text) return { shipping: null, tariffs: false, code: 'USD', rawAmount: null, usd: null };
  const tariffs = /\btariffs?\b/i.test(text);
  if (/free\s+shipping/i.test(text)) {
    return { shipping: 0, tariffs, code: 'USD', rawAmount: 0, usd: 0 };
  }
  if (!/shipping/i.test(text)) {
    return { shipping: null, tariffs: false, code: 'USD', rawAmount: null, usd: null };
  }
  const afterShipping = text.slice(text.search(/shipping/i));
  const parsed = readAmountText(afterShipping);
  if (!parsed) {
    return { shipping: null, tariffs, code: 'USD', rawAmount: null, usd: null };
  }
  return {
    shipping: parsed.usd,
    tariffs: parsed.tariffs || tariffs,
    code: parsed.code,
    rawAmount: parsed.amount,
    usd: parsed.usd,
  };
};

// The show's line under the bid button: "Shipping is $4.85 + Taxes" or "Free Shipping".
export const parseShipping = (text: string | null | undefined): number | null =>
  parseShippingInfo(text).shipping;

export type UsFreightZone = 'Eastern' | 'Central' | 'Mountain' | 'Pacific';

export interface FreightRow {
  zone: UsFreightZone;
  amount: number;
}

export interface ShippingRules {
  cap: number | null;
  combinesShop: boolean;
  separateTiers: string[];
  soloShip: boolean;
  bundleLimitLb: number | null;
  freight: {
    rows: FreightRow[];
    liftgate: number | null;
    exempt: string[];
  };
}

export interface ShippingRulesInput {
  notes?: string | null;
  showTitle?: string | null;
  lotTitle?: string | null;
  hostLines?: string[];
  shopListings?: { title: string; price: number }[];
}

const TIER_WORDS = ['small', 'medium', 'large', 'xl', 'xxl', 'heavy', 'oversize', 'oversized'];

const normalizeZone = (raw: string): UsFreightZone | null => {
  const low = raw.toLowerCase();
  if (low.startsWith('east')) return 'Eastern';
  if (low.startsWith('central')) return 'Central';
  if (low.startsWith('mountain')) return 'Mountain';
  if (low.startsWith('pacific') || low.startsWith('west')) return 'Pacific';
  return null;
};

export const usZoneFromIana = (iana: string | null | undefined): UsFreightZone | null => {
  if (!iana) return null;
  const z = iana.trim();
  if (
    /^(?:America\/(?:New_York|Detroit|Toronto|Iqaluit|Nassau|Indiana\/|Kentucky\/)|US\/Eastern|EST5EDT)/i.test(z)
  ) {
    return 'Eastern';
  }
  if (
    /^(?:America\/(?:Chicago|Menominee|Winnipeg|Rainy_River|Rankin_Inlet|Resolute|North_Dakota\/)|US\/Central|CST6CDT)/i.test(z)
  ) {
    return 'Central';
  }
  if (
    /^(?:America\/(?:Denver|Boise|Phoenix|Edmonton|Cambridge_Bay|Inuvik|Yellowknife)|US\/(?:Mountain|Arizona)|MST7MDT)/i.test(z)
  ) {
    return 'Mountain';
  }
  if (/^(?:America\/(?:Los_Angeles|Vancouver|Tijuana|Dawson|Whitehorse)|US\/Pacific|PST8PDT)/i.test(z)) {
    return 'Pacific';
  }
  return null;
};

const extractCap = (text: string): number | null => {
  if (!text) return null;
  let found: number | null = null;
  const forwardRe =
    /\b(?:max(?:imum)?(?:\s+bundled)?\s+shipping|shipping\s+cap(?:ped)?(?:\s+at)?|pay\s+up\s+to\s+for\s+shipping|pay\s+up\s+to)\s*[:=-]?\s*\$\s*(\d+(?:\.\d{1,2})?)/gi;
  const reverseRe =
    /\$\s*(\d+(?:\.\d{1,2})?)\s*(?:max(?:imum)?(?:\s+bundled)?\s+shipping|shipping\s+cap|cap\s+on\s+shipping)/gi;
  for (const m of text.matchAll(forwardRe)) {
    const n = parseFloat(m[1]!);
    if (Number.isFinite(n) && n > 0) found = n;
  }
  for (const m of text.matchAll(reverseRe)) {
    const n = parseFloat(m[1]!);
    if (Number.isFinite(n) && n > 0) found = n;
  }
  return found;
};

export const shippingRules = (
  inputOrNotes: ShippingRulesInput | string | null | undefined,
  lotTitleArg?: string | null,
  hostLinesArg?: string[],
  shopListingsArg?: { title: string; price: number }[],
): ShippingRules => {
  const input: ShippingRulesInput =
    typeof inputOrNotes === 'object' && inputOrNotes !== null
      ? inputOrNotes
      : {
          notes: inputOrNotes ?? null,
          lotTitle: lotTitleArg ?? null,
          hostLines: hostLinesArg ?? [],
          shopListings: shopListingsArg ?? [],
        };

  const notes = input.notes ?? '';
  const showTitle = input.showTitle ?? '';
  const lotTitle = input.lotTitle ?? '';
  const hostLines = input.hostLines ?? [];
  const shopListings = input.shopListings ?? [];
  const allText = [notes, showTitle, lotTitle, ...hostLines].filter(Boolean).join('\n');

  let cap = extractCap([notes, showTitle, lotTitle].filter(Boolean).join('\n'));
  for (const line of hostLines) {
    const lineCap = extractCap(line);
    if (lineCap !== null) cap = lineCap;
  }

  const combinesShop =
    /\b(?:shop\s+and\s+live|live\s+and\s+shop|bin\s+and\s+auction)[^.\n]*\b(?:combine|combined|bundle|bundled)\b/i.test(
      allText,
    ) ||
    /\b(?:combine|combined|bundle|bundled)[^.\n]*\b(?:shop\s+and\s+live|live\s+and\s+shop)\b/i.test(allText);

  const separateSet = new Set<string>();
  let soloShip = false;
  for (const sentence of allText.split(/[\r\n.;!]+/)) {
    if (
      !/\b(?:do(?:es)?\s+not\s+bundle|don['’]?t\s+bundle|no\s+bundl(?:e|ing)|ship(?:s|ped)?\s+(?:separately|solo|alone|by\s+itself)|cannot\s+bundle|solo\s+ship(?:ping)?)\b/i.test(
        sentence,
      )
    ) {
      continue;
    }
    let matchedTier = false;
    for (const tier of TIER_WORDS) {
      if (new RegExp(`\\b${tier}\\b`, 'i').test(sentence)) {
        separateSet.add(tier);
        matchedTier = true;
      }
    }
    if (!matchedTier && /\b(?:ships?\s+(?:solo|alone|separately|by\s+itself)|solo\s+ship(?:ping)?)\b/i.test(sentence)) {
      soloShip = true;
    }
  }

  const weightMatch = allText.match(
    /\bbundl(?:es?|ing|ed)\b[^.\n]*?\bup\s+to\s+(\d+(?:\.\d+)?)\s*(?:lbs?|pounds?)\b/i,
  );
  const bundleLimitLb = weightMatch?.[1] ? parseFloat(weightMatch[1]) : null;

  const zoneMap = new Map<UsFreightZone, number>();
  let liftgate: number | null = null;
  for (const item of shopListings) {
    if (!Number.isFinite(item.price) || item.price <= 0) continue;
    const t = item.title;
    if (/\b(?:lift\s*gate|residential)\b/i.test(t)) {
      if (liftgate === null) liftgate = item.price;
      continue;
    }
    const zm = t.match(/\b(eastern|east\s+coast|central|mountain|pacific|west\s+coast)\b/i);
    if (zm?.[1] && /\b(?:time\s*zone|shipping|freight|pallet|zone)\b/i.test(t)) {
      const z = normalizeZone(zm[1]);
      if (z && !zoneMap.has(z)) zoneMap.set(z, item.price);
    }
  }

  const noteZoneRe =
    /\b(eastern|east\s+coast|central|mountain|pacific|west\s+coast)\b[^$\n]{0,40}\$\s*(\d+(?:\.\d{1,2})?)/gi;
  for (const m of allText.matchAll(noteZoneRe)) {
    const z = normalizeZone(m[1]!);
    const amt = parseFloat(m[2]!);
    if (z && Number.isFinite(amt) && amt > 0 && !zoneMap.has(z)) {
      zoneMap.set(z, amt);
    }
  }

  if (liftgate === null) {
    const lgMatch =
      allText.match(/\b(?:lift\s*gate|residential)[^$\n]{0,40}\$\s*(\d+(?:\.\d{1,2})?)/i) ??
      allText.match(/\$\s*(\d+(?:\.\d{1,2})?)[^.\n]{0,40}\b(?:lift\s*gate|residential)\b/i);
    if (lgMatch?.[1]) {
      const amt = parseFloat(lgMatch[1]);
      if (Number.isFinite(amt) && amt > 0) liftgate = amt;
    }
  }

  const exemptSet = new Set<string>();
  const exemptRe =
    /\b([a-z]+)(?:\s+box(?:es)?)?\b[^.\n]*?\b(?:pay\s+shipping|ship(?:s)?\s+(?:for|as|by))[^.\n]*?\b(?:on\s+screen|shown)\b/gi;
  for (const m of allText.matchAll(exemptRe)) {
    const word = m[1]?.toLowerCase();
    if (word && word !== 'you' && word !== 'they' && word !== 'items' && word !== 'boxes') {
      exemptSet.add(word);
    }
  }

  const ZONE_ORDER: UsFreightZone[] = ['Eastern', 'Central', 'Mountain', 'Pacific'];
  const rows: FreightRow[] = ZONE_ORDER.filter((z) => zoneMap.has(z)).map((zone) => ({
    zone,
    amount: zoneMap.get(zone)!,
  }));

  return {
    cap,
    combinesShop,
    separateTiers: [...separateSet],
    soloShip,
    bundleLimitLb,
    freight: {
      rows,
      liftgate,
      exempt: [...exemptSet],
    },
  };
};

export const shippingRulesLine = (rules: ShippingRules | null | undefined): string | null => {
  if (!rules) return null;
  const parts: string[] = [];
  if (rules.cap !== null) {
    parts.push(`Shipping cap ${formatMoney(rules.cap)}${rules.combinesShop ? ' (live + shop combined)' : ''}`);
  } else if (rules.combinesShop) {
    parts.push('Live + shop shipping combined');
  }
  if (rules.separateTiers.length) {
    parts.push(`${rules.separateTiers.join(', ')} do not bundle`);
  } else if (rules.soloShip) {
    parts.push('Ships solo (does not bundle)');
  }
  if (rules.bundleLimitLb !== null) {
    parts.push(`Bundles up to ${rules.bundleLimitLb} lb`);
  }
  if (rules.freight.rows.length) {
    const amounts = rules.freight.rows.map((r) => r.amount);
    const min = Math.min(...amounts);
    const max = Math.max(...amounts);
    const range = min === max ? formatMoney(min) : `${formatMoney(min)}–${formatMoney(max)}`;
    parts.push(
      `Pallet freight ${range}${rules.freight.liftgate ? ` (+${formatMoney(rules.freight.liftgate)} liftgate optional)` : ''}`,
    );
  }
  return parts.length ? parts.join(' · ') : null;
};

export const shippingRulesKey = (rules: ShippingRules | null | undefined): string | null =>
  shippingRulesLine(rules);

const lotWeightLb = (title: string | null | undefined): number | null => {
  if (!title) return null;
  const rangeMatch = title.match(/\b(\d+(?:\.\d+)?)\s*(?:[-–—]|to)\s*(\d+(?:\.\d+)?)\s*(?:lbs?|pounds?)\b/i);
  if (rangeMatch?.[2]) {
    const hi = parseFloat(rangeMatch[2]);
    if (Number.isFinite(hi) && hi > 0) return hi;
  }
  const singleMatch = title.match(/\b(\d+(?:\.\d+)?)\s*(?:lbs?|pounds?)\b/i);
  if (singleMatch?.[1]) {
    const n = parseFloat(singleMatch[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
};

export interface ShippingOwedInput {
  rules?: ShippingRules | null;
  lotTitle?: string | null;
  pageShipping: number | null;
  hasWinThisShow: boolean;
  browserZone?: string | null;
  tariffs?: boolean;
}

export interface ShippingOwed {
  amount: number | null;
  reason: string | null;
  freightNote: string | null;
  shippingPaid: boolean;
  tariffs: boolean;
}

export const shippingOwed = (input: ShippingOwedInput): ShippingOwed => {
  const rules = input.rules ?? null;
  const title = input.lotTitle ?? '';
  const page = input.pageShipping;
  const tariffs = Boolean(input.tariffs);

  const isExempt = Boolean(
    rules?.freight.exempt.some((w) => new RegExp(`\\b${w}\\b`, 'i').test(title)),
  );
  const isPallet = /\bpallet\b/i.test(title) && !isExempt;

  if (isPallet && rules && rules.freight.rows.length > 0) {
    const resolvedZone =
      input.browserZone === undefined
        ? (() => {
            try {
              return Intl.DateTimeFormat().resolvedOptions().timeZone;
            } catch {
              return null;
            }
          })()
        : input.browserZone;
    const usZone = usZoneFromIana(resolvedZone);
    const matched = usZone ? rules.freight.rows.find((r) => r.zone === usZone) : undefined;
    const onScreenNote = page !== null ? `on-screen ${formatMoney(page)} is not the freight` : null;
    const liftNote = rules.freight.liftgate !== null ? `${formatMoney(rules.freight.liftgate)} liftgate optional` : null;
    if (matched) {
      const amount = round((page ?? 0) + matched.amount);
      const freightNote = [`${matched.zone} freight ${formatMoney(matched.amount)}`, onScreenNote, liftNote]
        .filter(Boolean)
        .join(' · ');
      return {
        amount,
        reason: freightNote,
        freightNote,
        shippingPaid: false,
        tariffs,
      };
    }
    const amounts = rules.freight.rows.map((r) => r.amount);
    const min = Math.min(...amounts);
    const max = Math.max(...amounts);
    const freightNote = [`freight ${formatMoney(min)} to ${formatMoney(max)}`, onScreenNote, liftNote]
      .filter(Boolean)
      .join(' · ');
    return {
      amount: page,
      reason: freightNote,
      freightNote,
      shippingPaid: false,
      tariffs,
    };
  }

  const matchedSeparateTier = rules?.separateTiers.find((tier) =>
    new RegExp(`\\b${tier}\\b`, 'i').test(title),
  );
  if (matchedSeparateTier || rules?.soloShip) {
    const reason =
      page !== null
        ? `ship ${formatMoney(page)} (this tier ships on its own)`
        : 'this tier ships on its own';
    return {
      amount: page,
      reason,
      freightNote: null,
      shippingPaid: false,
      tariffs,
    };
  }

  if (rules?.bundleLimitLb != null) {
    const weight = lotWeightLb(title);
    if (weight !== null && weight > rules.bundleLimitLb) {
      const reason =
        page !== null
          ? `ship ${formatMoney(page)} (past the ${rules.bundleLimitLb} lb bundle)`
          : `past the ${rules.bundleLimitLb} lb bundle`;
      return {
        amount: page,
        reason,
        freightNote: null,
        shippingPaid: false,
        tariffs,
      };
    }
    if (input.hasWinThisShow) {
      return {
        amount: 0,
        reason: `likely combined up to ${rules.bundleLimitLb} lb`,
        freightNote: null,
        shippingPaid: true,
        tariffs,
      };
    }
  }

  if (input.hasWinThisShow) {
    if (rules?.cap != null) {
      return {
        amount: 0,
        reason: `${formatMoney(rules.cap)} cap covers it`,
        freightNote: null,
        shippingPaid: true,
        tariffs,
      };
    }
    return {
      amount: 0,
      reason: 'shipping already paid this show',
      freightNote: null,
      shippingPaid: true,
      tariffs,
    };
  }

  if (page === null) {
    return {
      amount: null,
      reason: 'shipping unknown',
      freightNote: null,
      shippingPaid: false,
      tariffs,
    };
  }
  if (page === 0) {
    return {
      amount: 0,
      reason: 'free shipping',
      freightNote: null,
      shippingPaid: false,
      tariffs,
    };
  }
  if (rules?.cap != null && page > rules.cap) {
    return {
      amount: rules.cap,
      reason: `ship ${formatMoney(rules.cap)} (capped)`,
      freightNote: null,
      shippingPaid: false,
      tariffs,
    };
  }
  return {
    amount: page,
    reason: `ship ${formatMoney(page)}`,
    freightNote: null,
    shippingPaid: false,
    tariffs,
  };
};

export interface AllIn {
  total: number;
  shipping: number | null;
  tax: number;
  shippingPaid: boolean;
  reason?: string | null;
  freightNote?: string | null;
  tariffs?: boolean;
}

// Tax is your rate on the bid; states differ on taxing shipping, so it isn't. A win already in this
// show usually means shipping is paid, so it isn't added again unless shipping rules say otherwise.
export const allInPrice = (
  bid: number,
  shippingOrOwed: number | null | ShippingOwed,
  taxPercent: number,
  shippingPaid = false,
): AllIn => {
  const tax = round((bid * taxPercent) / 100);
  if (typeof shippingOrOwed === 'object' && shippingOrOwed !== null) {
    const owed = shippingOrOwed;
    const ship = owed.shippingPaid ? 0 : (owed.amount ?? 0);
    return {
      total: round(bid + tax + ship),
      shipping: owed.amount,
      tax,
      shippingPaid: owed.shippingPaid,
      reason: owed.reason,
      freightNote: owed.freightNote,
      tariffs: owed.tariffs,
    };
  }
  const shipping = shippingOrOwed;
  const ship = shippingPaid ? 0 : (shipping ?? 0);
  return { total: round(bid + tax + ship), shipping, tax, shippingPaid };
};

export const allInLine = (a: AllIn, taxPercent: number) => {
  const shipPart =
    a.reason ??
    (a.shippingPaid
      ? 'shipping already paid this show'
      : a.shipping === null
        ? 'shipping unknown'
        : a.shipping === 0
          ? 'free shipping'
          : `ship ${formatMoney(a.shipping)}`);
  const parts = [
    shipPart,
    taxPercent > 0 ? `tax ${formatMoney(a.tax)}` : null,
    a.tariffs ? 'tariffs not included' : null,
  ].filter(Boolean);
  return `All-in ${formatMoney(a.total)} (${parts.join(' + ')})`;
};

// --- Reselling ---

// Whatnot's seller fees: 8% commission plus 2.9% + $0.30 payment processing, on the sale price.
export const DEFAULT_FEE_PERCENT = 10.9;
export const DEFAULT_FEE_FIXED = 0.3;

export interface Flip {
  resale: number;
  fees: number;
  net: number;
  cost: number;
  profit: number;
  margin: number | null;
}

export const flipProfit = (resale: number, cost: number, feePercent = DEFAULT_FEE_PERCENT, feeFixed = DEFAULT_FEE_FIXED): Flip => {
  const fees = resale > 0 ? round((resale * feePercent) / 100 + feeFixed) : 0;
  const net = round(resale - fees);
  const profit = round(net - cost);
  return { resale, fees, net, cost, profit, margin: cost > 0 ? Math.round((profit / cost) * 100) : null };
};

export const flipLine = (f: Flip) =>
  `Resell ~${formatMoney(f.resale)}, keep ${formatMoney(f.net)} after fees: ${f.profit >= 0 ? '+' : '−'}${formatMoney(Math.abs(f.profit))}${f.margin !== null ? ` (${f.margin}%)` : ''} on ${formatMoney(f.cost)}`;

// --- Portfolio ---

export interface Portfolio {
  count: number;
  valued: number;
  cost: number;
  valuedCost: number;
  value: number;
  gain: number;
}

// An item is worth the higher of its appraisal and its metal at today's spot. Items with neither
// are counted but not valued, so the gain only compares like with like.
export const portfolioValue = (list: Purchase[], spot: Partial<Record<string, number | null>>): Portfolio => {
  let cost = 0;
  let valuedCost = 0;
  let value = 0;
  let valued = 0;
  for (const p of list) {
    const usd = purchaseUsd(p);
    if (usd === null) continue;
    cost += usd;
    const live = p.metal && p.oz ? spot[p.metal] : null;
    const melt = live && p.oz ? p.oz * live : null;
    const worth = Math.max(p.appraisedValue ?? 0, melt ?? p.meltValue ?? 0);
    if (worth > 0) {
      valued += 1;
      valuedCost += usd;
      value += worth;
    }
  }
  return { count: list.length, valued, cost: round(cost), valuedCost: round(valuedCost), value: round(value), gain: round(value - valuedCost) };
};
