// Wheel games where each hit removes that prize: the odds shift after every spin, so a spin is
// worth buying once its expected value beats the spin price. Sampling without replacement keeps the
// expected value of the next spin unchanged on average, so waiting never helps by itself; the edge
// only appears after cheap prizes happen to come off.
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

export interface WheelOdds {
  spotsLeft: number;
  slots: SlotOdds[];
  // With unpriced prizes left, this counts them as $0, so it's a floor rather than the real value.
  expectedValue: number | null;
  expectedIsFloor: boolean;
  edge: number | null;
  chanceBeatPrice: number | null;
  topPrize: { label: string; value: number; chance: number } | null;
  verdict: WheelVerdict;
  // The fewest further spins before a spin could be worth its price (cheapest prizes hit first).
  // 0 means worth it now; null means it never can be, or it can't be known.
  spinsUntilWorth: number | null;
}

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
    verdict,
    spinsUntilWorth: price !== null && !unpriced ? spinsUntilWorth(wheel.slots, price) : null,
  };
};
