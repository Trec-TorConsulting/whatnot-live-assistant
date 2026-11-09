// Wheel games where each hit removes that prize: the odds shift after every spin, so a spin is
// worth buying once its expected value beats the spin price. Sampling without replacement keeps the
// expected value of the next spin unchanged on average, so waiting never helps by itself; the edge
// only appears after cheap prizes happen to come off.
import { formatMoney } from './money';
export interface WheelSlot {
  label: string;
  total: number;
  left: number;
  value: number | null;
  // True when this value is only a floor, as with a break description that was cut off.
  floor?: boolean;
}

export interface WheelSpin {
  slot: number;
  at: number;
}

export interface WheelState {
  liveId: string;
  price: number | null;
  slots: WheelSlot[];
  spins: WheelSpin[];
  updatedAt: number;
}

export interface SlotOdds {
  index: number;
  label: string;
  left: number;
  total: number;
  value: number | null;
  chance: number;
  floor?: boolean;
}

export type WheelVerdict = 'worth' | 'not_worth' | 'unclear' | 'empty';

// One end of the wheel: the best prizes, or the cheapest prize you can still win.
export interface WheelEnd {
  label: string;
  value: number | null;
  valueHigh?: number | null;
  left: number;
  chance: number;
  // Spin price minus this value. Positive means a hit loses that much.
  loss: number | null;
  indexes: number[];
}

export interface WheelOdds {
  spotsLeft: number;
  slots: SlotOdds[];
  // With unpriced prizes left, this counts them as $0, so it's a floor rather than the real value.
  expectedValue: number | null;
  expectedIsFloor: boolean;
  edge: number | null;
  chanceBeatPrice: number | null;
  topPrize: { label: string; value: number; chance: number } | null;
  // Best priced prizes. Null when nothing left has a value.
  top: WheelEnd | null;
  // Lowest priced prizes you can still win, when they cost less than the top.
  floor: WheelEnd | null;
  verdict: WheelVerdict;
  // The fewest further spins before a spin could be worth its price (cheapest prizes hit first).
  // 0 means worth it now; null means it never can be, or it can't be known.
  spinsUntilWorth: number | null;
}

export const prizeSlotLabel = (r: { title: string; detail?: string; inside?: string | null }) =>
  [r.title, r.inside || r.detail || ''].map((s) => s.trim()).filter(Boolean).join(' · ');

// What a hit does to you at the current spin price.
export const hitOutcome = (loss: number | null): string | null => {
  if (loss === null) return null;
  if (Math.abs(loss) < 0.005) return 'even with the price';
  return loss > 0 ? `lose ${formatMoney(loss)}` : `gain ${formatMoney(-loss)}`;
};

export const emptyWheel = (liveId: string, now = Date.now()): WheelState => ({ liveId, price: null, slots: [], spins: [], updatedAt: now });

const SLOT_LINE_RE = /^(.*?)(?:\s+x\s*(\d+)|\s+(\d+)\s*x)?(?:\s+\$\s*([\d,]+(?:\.\d{1,2})?)|\s+\$?\?)?$/i;

const FLOOR_RULE_PATTERNS = [
  /\byou(?:\s+either)?\s+get\s+(?:a|an\s+)?(.+?)\s+or\s+(?:the\s+)?(?:hit|winner|top|chase|grand\s+prize|board\s+pick|pick(?:\s+a?\s+item)?(?:\s+off\s+the\s+board)?)\b/i,
  /\bmulti[\s-]*floors?\s*(?:are|is|:|=)\s*(.+?)(?:\.|\n|chase|top|hit|$)/i,
  /\bfloors?\s*(?:are|is|:|=)\s*(.+?)(?:\.|\n|chase|top|hit|$)/i,
  /\b(?:floor|floors)\s*[:=-]\s*(.+?)(?:\.|\n|chase|top|hit|$)/i,
];

// Parses floor items from show notes describing games, e.g.
// "You either get a wheat cent, buffalo nickel or the hit" -> ['wheat cent', 'buffalo nickel']
export const extractFloorsFromNotes = (notes: string | null | undefined, aiFloor?: string | null): string[] => {
  const floors: string[] = [];
  const seen = new Set<string>();

  if (aiFloor) {
    const key = aiFloor.toLowerCase().trim();
    if (key.length >= 2) {
      seen.add(key);
      floors.push(key);
    }
  }

  if (notes) {
    for (const re of FLOOR_RULE_PATTERNS) {
      const match = notes.match(re);
      if (!match?.[1]) continue;
      const parts = match[1]
        .split(/,|\/|\s+or\s+/i)
        .map((s) => s.replace(/\b(?:either|a|an|the)\b/gi, ' ').replace(/\s+/g, ' ').trim())
        .filter((s) => s.length >= 2 && !/^(?:hit|winner|chase|top|grand\s+prize|board\s+pick)$/i.test(s));

      for (const part of parts) {
        const key = part.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          floors.push(key);
        }
      }
      if (floors.length) break;
    }
  }

  return floors;
};

export const isFloorSlot = (label: string, floorPatterns: string[] = []): boolean => {
  if (/\b(?:multi[\s-]*floor|floor)\b/i.test(label)) return true;
  if (!floorPatterns.length) return false;
  const clean = label.toLowerCase().replace(/\s+/g, ' ');
  const normClean = clean.replace(/\b(penny|pennies)\b/g, 'cent');
  return floorPatterns.some((pattern) => {
    const p = pattern.toLowerCase().trim();
    const normP = p.replace(/\b(penny|pennies)\b/g, 'cent');
    return clean.includes(p) || normClean.includes(normP) || new RegExp(`\\b${normP}\\b`, 'i').test(normClean);
  });
};

// One prize per line: "Silver Eagle x2 $35", "Wheat penny 10x $1", or "Mystery x3 ?" for unpriced.
export const parseWheelSlots = (text: string): WheelSlot[] => {
  const slots: WheelSlot[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(SLOT_LINE_RE);
    const label = m?.[1]?.trim();
    if (!m || !label) continue;
    const total = Math.max(1, Math.min(999, parseInt(m[2] ?? m[3] ?? '1', 10)));
    const value = m[4] ? parseFloat(m[4].replace(/,/g, '')) : null;
    const isFloor = /\b(?:multi[\s-]*floor|floor)\b/i.test(label);
    slots.push({ label, total, left: total, value, ...(isFloor ? { floor: true } : {}) });
  }
  return slots;
};

export const formatWheelSlots = (slots: WheelSlot[]) =>
  slots.map((s) => `${s.label}${s.total > 1 ? ` x${s.total}` : ''} ${s.value !== null ? `$${s.value}` : '?'}`).join('\n');

export const hitSlot = (wheel: WheelState, index: number, now = Date.now()): WheelState => {
  const slot = wheel.slots[index];
  if (!slot || slot.left <= 0) return wheel;
  return {
    ...wheel,
    slots: wheel.slots.map((s, i) => (i === index ? { ...s, left: s.left - 1 } : s)),
    spins: [...wheel.spins, { slot: index, at: now }],
    updatedAt: now,
  };
};

export const undoSpin = (wheel: WheelState, now = Date.now()): WheelState => {
  const last = wheel.spins[wheel.spins.length - 1];
  if (!last) return wheel;
  return {
    ...wheel,
    slots: wheel.slots.map((s, i) => (i === last.slot ? { ...s, left: Math.min(s.total, s.left + 1) } : s)),
    spins: wheel.spins.slice(0, -1),
    updatedAt: now,
  };
};

export const resetSpins = (wheel: WheelState, now = Date.now()): WheelState => ({
  ...wheel,
  slots: wheel.slots.map((s) => ({ ...s, left: s.total })),
  spins: [],
  updatedAt: now,
});

const cents = (n: number) => Math.round(n * 100) / 100;

const endOf = (group: SlotOdds[], price: number | null): WheelEnd => {
  const ranked = [...group].sort((a, b) => b.left - a.left || a.label.localeCompare(b.label));
  const names = [...new Set(ranked.map((s) => s.label))];
  const values = group.map((s) => s.value).filter((v): v is number => v !== null);
  const minValue = values.length ? Math.min(...values) : null;
  const maxValue = values.length ? Math.max(...values) : null;
  const totalLeft = group.reduce((n, s) => n + s.left, 0);
  const totalChance = group.reduce((n, s) => n + s.chance, 0);
  const weightedSum = group.reduce((sum, s) => sum + (s.value ?? 0) * s.left, 0);
  const avgValue = totalLeft > 0 ? cents(weightedSum / totalLeft) : minValue;
  const label =
    names.length === 1
      ? names[0]!
      : names.length <= 3
        ? names.join(', ')
        : `${names[0]}, ${names[1]} + ${names.length - 2} more`;
  return {
    label,
    value: minValue,
    valueHigh: maxValue !== null && maxValue !== minValue ? maxValue : undefined,
    left: totalLeft,
    chance: totalChance,
    loss: price !== null && avgValue !== null ? cents(price - avgValue) : null,
    indexes: group.map((s) => s.index),
  };
};

// The top is every prize at the highest known value. The floor is every prize at the lowest known
// value, the bottom you can still win. When slots are marked as floor (e.g. from multi-floor show
// rules, reverse wheel notes, or explicit floor labels), all floor slots are grouped together.
const wheelEnds = (live: SlotOdds[], price: number | null) => {
  const priced = live.filter((s) => s.value !== null);
  const amounts = priced.map((s) => s.value!);
  const max = amounts.length ? Math.max(...amounts) : null;
  const min = amounts.length ? Math.min(...amounts) : null;
  const topSlots = max === null ? [] : priced.filter((s) => s.value === max);

  const explicitFloors = live.filter((s) => s.floor || /\b(?:multi[\s-]*floor|floor)\b/i.test(s.label));
  let floorSlots: SlotOdds[];
  if (explicitFloors.length) {
    floorSlots = explicitFloors;
  } else {
    floorSlots = min === null || min === max ? [] : priced.filter((s) => s.value === min);
  }

  return {
    top: topSlots.length ? endOf(topSlots, price) : null,
    floor: floorSlots.length ? endOf(floorSlots, price) : null,
  };
};

const spinsUntilWorth = (slots: WheelSlot[], price: number): number | null => {
  const values = slots.flatMap((s) => Array<number>(s.left).fill(s.value ?? 0)).sort((a, b) => a - b);
  let sum = values.reduce((a, b) => a + b, 0);
  for (let removed = 0; removed < values.length; removed++) {
    if (sum / (values.length - removed) >= price) return removed;
    sum -= values[removed]!;
  }
  return null;
};

export const wheelOdds = (wheel: WheelState): WheelOdds => {
  const spotsLeft = wheel.slots.reduce((n, s) => n + Math.max(0, s.left), 0);
  const slots = wheel.slots.map((s, index) => ({
    index,
    label: s.label,
    left: s.left,
    total: s.total,
    value: s.value,
    floor: s.floor,
    chance: spotsLeft ? s.left / spotsLeft : 0,
  }));
  const live = slots.filter((s) => s.left > 0);
  const price = wheel.price !== null && wheel.price > 0 ? wheel.price : null;
  const base: WheelOdds = {
    spotsLeft,
    slots,
    expectedValue: null,
    expectedIsFloor: false,
    edge: null,
    chanceBeatPrice: null,
    topPrize: null,
    top: null,
    floor: null,
    verdict: 'empty',
    spinsUntilWorth: null,
  };
  if (!spotsLeft) return base;

  const unpriced = live.some((s) => s.value === null);
  const floored = live.some((s) => s.floor && s.value !== null);
  const expectedValue = live.reduce((sum, s) => sum + s.chance * (s.value ?? 0), 0);
  const top = live.filter((s) => s.value !== null).sort((a, b) => b.value! - a.value!)[0];
  const topValue = top?.value ?? null;
  const topChance = topValue !== null ? live.filter((s) => s.value === topValue).reduce((p, s) => p + s.chance, 0) : 0;
  const beat = price !== null ? live.filter((s) => s.value !== null && s.value > price).reduce((p, s) => p + s.chance, 0) : null;
  const edge = price !== null ? expectedValue - price : null;
  const ends = wheelEnds(live, price);

  let verdict: WheelVerdict = 'unclear';
  if (edge !== null && edge >= 0) verdict = 'worth';
  else if (edge !== null && !unpriced && !floored) verdict = 'not_worth';

  return {
    ...base,
    expectedValue,
    expectedIsFloor: unpriced || floored,
    edge,
    chanceBeatPrice: beat,
    topPrize: top && topValue !== null ? { label: top.label, value: topValue, chance: topChance } : null,
    ...ends,
    verdict,
    spinsUntilWorth: price !== null && !unpriced && !floored ? spinsUntilWorth(wheel.slots, price) : null,
  };
};
