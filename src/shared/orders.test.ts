import { describe, expect, it } from 'vitest';
import { isLate, isOpen, mergeOrders, orderLine, parseOrderLines } from './orders';

// innerText of real order cards from Activity → Purchases (Oct 2026).
const IN_TRANSIT = ['In Transit', 'Q1-AI 360 Degree Phone Tripod #7', 'Seller:', 'socalsteals', 'Purchased:', '$27.56', 'Date:', '9/11/2026', 'Delivery expected:', '10/30/2026'];
const DONE = ['Completed', 'Anime marvel tees skull #18', 'Seller:', 'abizzyblu', 'Purchased:', '$3.00', 'Date:', '7/19/2026', 'Delivery date:', '7/23/2026'];

describe('orders', () => {
  it('reads an order card', () => {
    const o = parseOrderLines('hDSP', IN_TRANSIT, 'https://images.whatnot.com/x', 5)!;
    expect(o).toMatchObject({
      id: 'hDSP',
      status: 'In Transit',
      title: 'Q1-AI 360 Degree Phone Tripod #7',
      seller: 'socalsteals',
      price: 27.56,
      delivery: 'expected',
      image: 'https://images.whatnot.com/x',
    });
    expect(new Date(o.orderedAt!).getMonth()).toBe(8);
    expect(new Date(o.deliveryAt!).getDate()).toBe(30);
    expect(parseOrderLines('x', ['Completed'], null, 0)).toBeNull();
  });

  it('is late only past its expected day and not yet delivered', () => {
    const open = parseOrderLines('a', IN_TRANSIT, null, 0)!;
    const done = parseOrderLines('b', DONE, null, 0)!;
    expect(isLate(open, new Date(2026, 9, 30, 20).getTime())).toBe(false);
    expect(isLate(open, new Date(2026, 9, 31, 8).getTime())).toBe(true);
    expect(isOpen(done)).toBe(false);
    expect(isLate(done, new Date(2027, 0, 1).getTime())).toBe(false);
    expect(orderLine(open, new Date(2026, 9, 31).getTime())).toMatch(/^LATE \(expected/);
  });

  it('keeps the newest copy of each order', () => {
    const a = parseOrderLines('a', IN_TRANSIT, null, 0)!;
    const merged = mergeOrders({ a }, [{ ...a, status: 'Delivered' }, parseOrderLines('b', DONE, null, 0)!]);
    expect(Object.keys(merged)).toEqual(['a', 'b']);
    expect(merged.a!.status).toBe('Delivered');
  });
});
