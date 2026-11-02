// Your Whatnot orders, read from the Purchases list (Activity → Purchases) whenever it's open, so
// shipping can be tracked and late packages flagged.
export interface Order {
  id: string;
  title: string;
  status: string;
  seller: string | null;
  price: number | null;
  orderedAt: number | null;
  deliveryAt: number | null;
  // "expected" until it arrives, then the delivery date.
  delivery: 'expected' | 'delivered' | null;
  image: string | null;
  seenAt: number;
}

export const MAX_ORDERS = 300;

// "9/11/2026" in your locale's US-style order, as Whatnot shows it.
const parseDate = (s: string | undefined): number | null => {
  const m = s?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2])).getTime();
};

const after = (lines: string[], label: RegExp) => {
  const i = lines.findIndex((l) => label.test(l));
  return i >= 0 ? lines[i + 1] : undefined;
};

// A card reads: status, title, "Seller:", name, "Purchased:", "$27.56", "Date:", "9/11/2026",
// "Delivery expected:" or "Delivery date:", "10/30/2026".
export const parseOrderLines = (id: string, raw: string[], image: string | null, now: number): Order | null => {
  const lines = raw.map((l) => l.trim()).filter(Boolean);
  const sellerAt = lines.findIndex((l) => /^seller:?$/i.test(l));
  const head = lines.slice(0, sellerAt >= 0 ? sellerAt : 2);
  if (head.length < 2) return null;
  const [status, ...titleParts] = head;
  const expected = after(lines, /^delivery expected:?$/i);
  const delivered = after(lines, /^delivery date:?$/i);
  const price = after(lines, /^purchased:?$/i)?.match(/\$\s?([\d,]+(?:\.\d{1,2})?)/);
  return {
    id,
    title: titleParts.join(' ').slice(0, 200),
    status: status!.slice(0, 40),
    seller: sellerAt >= 0 ? (lines[sellerAt + 1] ?? null) : null,
    price: price ? parseFloat(price[1]!.replace(/,/g, '')) : null,
    orderedAt: parseDate(after(lines, /^date:?$/i)),
    deliveryAt: parseDate(expected ?? delivered),
    delivery: expected ? 'expected' : delivered ? 'delivered' : null,
    image,
    seenAt: now,
  };
};

export const mergeOrders = (current: Record<string, Order>, incoming: Order[]): Record<string, Order> => {
  const next = { ...current };
  for (const o of incoming) next[o.id] = o;
  const list = Object.values(next).sort((a, b) => (b.orderedAt ?? b.seenAt) - (a.orderedAt ?? a.seenAt));
  return Object.fromEntries(list.slice(0, MAX_ORDERS).map((o) => [o.id, o]));
};

const DONE = /complete|deliver|cancel|refund/i;

const startOfDay = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export const isOpen = (o: Order) => !DONE.test(o.status) && o.delivery !== 'delivered';

// Past its expected delivery day and still not marked complete or delivered.
export const isLate = (o: Order, now: number) => isOpen(o) && o.delivery === 'expected' && o.deliveryAt !== null && o.deliveryAt < startOfDay(now);

export const orderLine = (o: Order, now: number) =>
  [
    isLate(o, now) ? `LATE (expected ${new Date(o.deliveryAt!).toLocaleDateString()})` : o.status,
    o.title,
    o.seller ? `@${o.seller}` : null,
    !isLate(o, now) && o.deliveryAt ? `${o.delivery === 'delivered' ? 'delivered' : 'expected'} ${new Date(o.deliveryAt).toLocaleDateString()}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
