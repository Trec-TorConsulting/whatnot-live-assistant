import { afterEach, describe, expect, it, vi } from 'vitest';
import { fillMaxBid, quickBidAmount } from './quickBid';
import { findOrderCards, findShippingText, findWinningUser } from './selectors';

const visible = () => vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 120, height: 40 } as DOMRect);

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('quick bids', () => {
  it('adds to the current bid, or uses your max', () => {
    expect(quickBidAmount('plus1', 6, null)).toBe(7);
    expect(quickBidAmount('plus5', 6, null)).toBe(11);
    expect(quickBidAmount('max', 6, 45)).toBe(45);
    expect(quickBidAmount('max', 6, null)).toBeNull();
    expect(quickBidAmount('plus1', null, 45)).toBeNull();
  });

  it("opens Whatnot's Custom box and types the amount, without pressing Set Max Bid", async () => {
    visible();
    const setMax = vi.fn();
    document.body.innerHTML = '<button data-testid="show-custom-bid-button">Custom</button>';
    document.querySelector('button')!.addEventListener('click', () => {
      document.body.insertAdjacentHTML(
        'beforeend',
        '<dialog open><input data-testid="show-max-bid-input" type="text" inputmode="decimal"><button data-testid="show-set-max-bid-button">Set Max Bid</button></dialog>',
      );
      document.querySelector('[data-testid="show-set-max-bid-button"]')!.addEventListener('click', setMax);
    });
    const typed: string[] = [];
    document.addEventListener('input', (e) => typed.push((e.target as HTMLInputElement).value), true);
    expect(await fillMaxBid(12.5)).toBe('filled');
    expect(typed).toEqual(['12.50']);
    expect(setMax).not.toHaveBeenCalled();
  });

  it('says so when no auction is open', async () => {
    expect(await fillMaxBid(10)).toBe('no-auction');
  });
});

describe('live page reads', () => {
  it('reads the winning bidder and shipping line', () => {
    document.body.innerHTML =
      '<strong data-testid="show-winning-status">patriot271k is <strong>Winning!</strong></strong><button data-testid="show-shipping-info">Shipping is $4.85 + Taxes</button>';
    expect(findWinningUser()).toBe('patriot271k');
    expect(findShippingText()).toBe('Shipping is $4.85 + Taxes');
  });

  it('reads order cards from the Purchases list', () => {
    // Trimmed from the real Activity → Purchases markup (Oct 2026).
    const card = (id: string, status: string, title: string) =>
      `<div><a href="/order/${id}"><div><img src="https://images.whatnot.com/${id}"></div></a><div><a href="/order/${id}"><div><div><section><span>${status}</span></section></div><strong>${title}</strong></div></a><div><strong>Seller:</strong><a href="/user/socalsteals"><strong>socalsteals</strong></a></div><a href="/order/${id}"><div><div><strong>Purchased:</strong><strong>$27.56</strong></div></div></a></div></div>`;
    document.body.innerHTML = `<div>${card('A1', 'In Transit', 'Tripod #7')}${card('B2', 'Completed', 'Tee #18')}</div>`;
    const cards = findOrderCards();
    expect(cards.map((c) => [c.id, c.image])).toEqual([
      ['A1', 'https://images.whatnot.com/A1'],
      ['B2', 'https://images.whatnot.com/B2'],
    ]);
    expect(cards[0]!.lines.join('|')).toContain('Tripod #7');
    expect(cards[0]!.lines.join('|')).not.toContain('Tee #18');
  });
});
