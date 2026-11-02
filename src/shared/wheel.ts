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
}

export type WheelVerdict = 'worth' | 'not_worth' | 'unclear' | 'empty';

// One end of the wheel: the best prizes, or the cheapest prize you can still win.
export interface WheelEnd {
  label: string;
  value: number | null;
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
    slots.push({ label, total, left: total, value });
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
  const value = ranked[0]!.value;
  const label = names.length === 1 ? names[0]! : names.length <= 3 ? names.join(', ') : `${names[0]}, ${names[1]} + ${names.length - 2} more`;
  return {
    label,
    value,
    left: group.reduce((n, s) => n + s.left, 0),
    chance: group.reduce((n, s) => n + s.chance, 0),
    loss: price !== null && value !== null ? cents(price - value) : null,
    indexes: group.map((s) => s.index),
  };
};

// The top is every prize at the highest known value. The floor is every prize at the lowest known
// value, the bottom you can still win. A big quantity is only how that cheap prize is recognized.
const wheelEnds = (live: SlotOdds[], price: number | null) => {
  const priced = live.filter((s) => s.value !== null);
  const amounts = priced.map((s) => s.value!);
  const max = amounts.length ? Math.max(...amounts) : null;
  const min = amounts.length ? Math.min(...amounts) : null;
  const topSlots = max === null ? [] : priced.filter((s) => s.value === max);
  const floorSlots = min === null || min === max ? [] : priced.filter((s) => s.value === min);
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
  const expectedValue = live.reduce((sum, s) => sum + s.chance * (s.value ?? 0), 0);
  const top = live.filter((s) => s.value !== null).sort((a, b) => b.value! - a.value!)[0];
  const topValue = top?.value ?? null;
  const topChance = topValue !== null ? live.filter((s) => s.value === topValue).reduce((p, s) => p + s.chance, 0) : 0;
  const beat = price !== null ? live.filter((s) => s.value !== null && s.value > price).reduce((p, s) => p + s.chance, 0) : null;
  const edge = price !== null ? expectedValue - price : null;
  const ends = wheelEnds(live, price);

  let verdict: WheelVerdict = 'unclear';
  if (edge !== null && edge >= 0) verdict = 'worth';
  else if (edge !== null && !unpriced) verdict = 'not_worth';

  return {
    ...base,
    expectedValue,
    expectedIsFloor: unpriced,
    edge,
    chanceBeatPrice: beat,
    topPrize: top && topValue !== null ? { label: top.label, value: topValue, chance: topChance } : null,
    ...ends,
    verdict,
    spinsUntilWorth: price !== null && !unpriced ? spinsUntilWorth(wheel.slots, price) : null,
  };
};
