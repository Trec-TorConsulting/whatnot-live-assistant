// What the spin history can and can't tell you. On a fair wheel every remaining spot is equally
// likely, so past hits never make a prize "due"; they matter only because hit prizes come off.
// That leaves three honest questions: what spins sell for, how likely the wheel is to turn worth it
// soon, and whether the big prizes have been hitting as often as a fair wheel would allow.
import { prizeKey } from './breaks';

export interface StatPrize {
  title: string;
  left: number;
  // Floor value: unpriced prizes count as 0.
  value: number;
}

export interface StatHit {
  title: string;
  price: number | null;
}

const totals = (prizes: StatPrize[]) =>
  prizes.reduce((t, p) => ({ spots: t.spots + Math.max(0, p.left), sum: t.sum + Math.max(0, p.left) * p.value }), { spots: 0, sum: 0 });

// Exact chance that the very next spin leaves the wheel worth `price` a spin.
export const nextSpinTurnsWorth = (prizes: StatPrize[], price: number): number => {
  const { spots, sum } = totals(prizes);
  if (spots < 2) return 0;
  return prizes.reduce((p, s) => (s.left > 0 && (sum - s.value) / (spots - 1) >= price ? p + s.left / spots : p), 0);
};

// Simulated chance the wheel is worth `price` a spin at some point within the next `spins` spins.
export const chanceWorthWithin = (prizes: StatPrize[], price: number, spins: number, sims = 2000, rng: () => number = Math.random): number => {
  const start = totals(prizes);
  if (start.spots < 2) return 0;
  const lefts = prizes.map((p) => Math.max(0, p.left));
  let hits = 0;
  for (let sim = 0; sim < sims; sim++) {
    const left = [...lefts];
    let { spots, sum } = start;
    for (let k = 0; k < spins && spots > 1; k++) {
      let r = rng() * spots;
      let i = 0;
      while (r >= left[i]! && i < left.length - 1) r -= left[i++]!;
      left[i]! -= 1;
      sum -= prizes[i]!.value;
      spots -= 1;
      if (sum / spots >= price) {
        hits += 1;
        break;
      }
    }
  }
  return hits / sims;
};

export interface SpinPrices {
  count: number;
  median: number;
  low: number;
  high: number;
  last: number;
}

export const spinPrices = (hits: StatHit[]): SpinPrices | null => {
  const prices = hits.map((h) => h.price).filter((p): p is number => p !== null && p > 0);
  if (!prices.length) return null;
  const sorted = [...prices].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return {
    count: prices.length,
    median: sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2,
    low: sorted[0]!,
    high: sorted[sorted.length - 1]!,
    last: prices[prices.length - 1]!,
  };
};

export interface BigHitCheck {
  spins: number;
  observed: number;
  expected: number;
  // Chance a fair wheel gives this few (or this many) big hits.
  lowTail: number;
  highTail: number;
}

// Walks back from today's counts, putting each hit back, to get the wheel as it stood before every
// tracked spin. Needs the most recent spins without gaps.
export const bigHitCheck = (prizes: StatPrize[], hits: StatHit[], isBig: (title: string) => boolean): BigHitCheck | null => {
  if (!hits.length) return null;
  const counts = new Map<string, { left: number; big: boolean }>();
  for (const p of prizes) {
    const key = prizeKey(p.title);
    const c = counts.get(key);
    counts.set(key, { left: (c?.left ?? 0) + Math.max(0, p.left), big: isBig(p.title) });
  }
  const probs: number[] = [];
  let observed = 0;
  for (let i = hits.length - 1; i >= 0; i--) {
    const title = hits[i]!.title;
    const key = prizeKey(title);
    const c = counts.get(key) ?? { left: 0, big: isBig(title) };
    counts.set(key, { ...c, left: c.left + 1 });
    let spots = 0;
    let big = 0;
    for (const v of counts.values()) {
      spots += v.left;
      if (v.big) big += v.left;
    }
    probs.push(spots ? big / spots : 0);
    if (c.big) observed += 1;
  }
  // Poisson-binomial distribution of big hits across those spins.
  let dist = [1];
  for (const p of probs) {
    const next = Array<number>(dist.length + 1).fill(0);
    dist.forEach((q, k) => {
      next[k]! += q * (1 - p);
      next[k + 1]! += q * p;
    });
    dist = next;
  }
  const sum = (from: number, to: number) => dist.slice(from, to + 1).reduce((a, b) => a + b, 0);
  return {
    spins: hits.length,
    observed,
    expected: probs.reduce((a, b) => a + b, 0),
    lowTail: Math.min(1, sum(0, observed)),
    highTail: Math.min(1, sum(observed, dist.length - 1)),
  };
};

// Below this, a result is unlikely enough to be worth pointing out.
export const UNUSUAL = 0.05;
