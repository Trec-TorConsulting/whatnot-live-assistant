import { afterEach, describe, expect, it, vi } from 'vitest';
import { messageView } from './appraisalView';
import { overlay, type WheelView } from './overlay';

const view = (bid: string): WheelView => ({
  title: 'Gold Rush · 4 of 10 spots left',
  value: 'Worth $32.50 a spin',
  verdict: 'Worth it: $2.50 over the bid',
  level: 'worth',
  facts: [{ label: 'Bid', value: bid, detail: null }],
  warnings: [],
});

const shadow = () => document.getElementById('wn2-overlay')!.shadowRoot!;

const hostEl = () => document.getElementById('wn2-overlay')!;
const click = (action: string) => shadow().querySelector<HTMLElement>(`[data-action="${action}"]`)!.click();

describe('overlay', () => {
  afterEach(() => {
    overlay.unmount();
    overlay.setPrefs(undefined);
  });

  it('hides on close, saves that, and still shows a bid-guard notice while hidden', () => {
    vi.useFakeTimers();
    try {
      const saved: unknown[] = [];
      overlay.mount({ savePrefs: (p) => saved.push(p) });
      click('close');
      expect(saved).toEqual([{ hidden: true, pos: null, autoAppraise: false }]);
      expect(hostEl().style.display).toBe('none');
      overlay.notice('Over your max. Click again to bid anyway.', 4000);
      expect(hostEl().style.display).toBe('');
      vi.advanceTimersByTime(4100);
      expect(hostEl().style.display).toBe('none');
      overlay.setPrefs({ hidden: false, pos: null });
      expect(hostEl().style.display).toBe('');
    } finally {
      vi.useRealTimers();
    }
  });

  it('comes back when you ask for an appraisal', () => {
    const saved: unknown[] = [];
    overlay.mount({ savePrefs: (p) => saved.push(p) });
    overlay.setPrefs({ hidden: true, pos: null });
    overlay.setAppraisal(messageView('pending', 'Appraising…'));
    expect(saved).toEqual([{ hidden: false, pos: null, autoAppraise: false }]);
    expect(hostEl().style.display).toBe('');
  });

  it("stays hidden for an appraisal it started on its own, and clears when a new lot starts", () => {
    const saved: unknown[] = [];
    overlay.mount({ savePrefs: (p) => saved.push(p) });
    overlay.setWheel(null);
    overlay.setPrefs({ hidden: true, pos: null });
    overlay.setAppraisal(messageView('pending', 'Appraising…'), false);
    expect(saved).toEqual([]);
    expect(hostEl().style.display).toBe('none');
    overlay.setPrefs({ hidden: false, pos: null });
    expect(shadow().textContent).toContain('Appraising…');
    overlay.setAppraisal(null);
    expect(shadow().textContent).not.toContain('Appraising…');
  });

  it('keeps an answer from an earlier auction on screen, marked as such', () => {
    overlay.mount({});
    overlay.setWheel(null);
    overlay.setAppraisal({ ...messageView('done', '1921 Morgan Dollar'), footer: 'From PCGS' });
    overlay.markAppraisalOld('From an earlier auction. Press Appraise for this one.');
    expect(shadow().textContent).toContain('1921 Morgan Dollar');
    expect(shadow().textContent).toContain('From an earlier auction');
    expect(shadow().textContent).not.toContain('From PCGS');
    overlay.setAppraisal(null);
  });

  it('switches between auto and manual appraising and saves it', () => {
    const saved: { autoAppraise: boolean }[] = [];
    overlay.mount({ savePrefs: (p) => saved.push(p) });
    overlay.setWheel(null);
    expect(overlay.autoAppraise()).toBe(false);
    const select = shadow().querySelector<HTMLSelectElement>('select[data-change="auto"]')!;
    expect(select.value).toBe('manual');
    select.value = 'auto';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(saved.at(-1)?.autoAppraise).toBe(true);
    expect(overlay.autoAppraise()).toBe(true);
  });

  it('goes where you put it, kept on screen, and double-clicking the title puts it back', () => {
    const saved: unknown[] = [];
    overlay.mount({ savePrefs: (p) => saved.push(p) });
    overlay.setPrefs({ hidden: false, pos: { left: 99_999, top: -50 } });
    const panel = shadow().querySelector<HTMLElement>('.panel')!;
    expect(panel.style.top).toBe('0px');
    expect(parseFloat(panel.style.left)).toBeLessThanOrEqual(window.innerWidth);
    expect(panel.style.bottom).toBe('auto');
    shadow().querySelector('.title')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true }));
    expect(saved).toEqual([{ hidden: false, pos: null, autoAppraise: false }]);
    expect(panel.style.top).toBe('');
  });

  it('keeps the header buttons when only the wheel changes, so a click mid-update still lands', () => {
    overlay.mount({});
    overlay.setWheel(view('$30'));
    const share = shadow().querySelector('[data-action="share"]');
    overlay.setWheel(view('$31'));
    expect(shadow().querySelector('[data-action="share"]')).toBe(share);
    expect(shadow().textContent).toContain('$31');
  });

  it('holds its height through a brief dip, never creeps, and shrinks once content stays shorter', () => {
    vi.useFakeTimers();
    let natural = 200;
    const spy = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('panel') ? natural : 0;
    });
    try {
      overlay.mount({});
      const panel = () => shadow().querySelector<HTMLElement>('.panel')!;
      for (const bid of ['$30', '$31', '$32', '$33']) overlay.setWheel(view(bid));
      expect(panel().style.minHeight).toBe('200px');
      natural = 120;
      overlay.setWheel(view('$34'));
      expect(panel().style.minHeight).toBe('200px');
      vi.advanceTimersByTime(9000);
      expect(panel().style.minHeight).toBe('120px');
    } finally {
      spy.mockRestore();
      vi.useRealTimers();
    }
  });

  it('keeps the auction strip in place with the same two lines whether or not an auction is running', () => {
    overlay.mount({});
    const strip = () => shadow().querySelector<HTMLElement>('.lot-strip')!;
    const shape = () => [...strip().children].map((c) => c.className.replace(/\b(muted|bad|notice)\b/g, '').trim());
    expect(strip().textContent).toContain('No auction running');
    const idle = shape();
    overlay.setGuard({ lotTitle: '1921 Morgan', bid: '$40', ceiling: '$60', level: 'ok', reasons: [] });
    expect(strip().textContent).toContain('1921 Morgan');
    expect(strip().textContent).toContain('$40');
    expect(shape()).toEqual(idle);
    overlay.setGuard({ lotTitle: '1921 Morgan', bid: '$70', ceiling: '$60', level: 'over', reasons: ['Bid is over your $60 max'] });
    expect(strip().className).toContain('over');
    expect(strip().children[0]!.textContent).toBe('Bid is over your $60 max');
    expect(shape()).toEqual(idle);
    overlay.notice('Click again to bid anyway.');
    expect(strip().children[0]!.textContent).toBe('Click again to bid anyway.');
    overlay.setGuard(null);
    expect(shape()).toEqual(idle);
  });

  it('shows whether you are winning, a watchlist star, and your seller note', () => {
    overlay.mount({});
    const strip = () => shadow().querySelector<HTMLElement>('.lot-strip')!;
    overlay.setGuard({ lotTitle: '1921 Morgan', bid: '$40', ceiling: '$45', level: 'ok', reasons: [], you: 'leading', watch: '1921 morgan $45' });
    // An earlier test's notice may still hold the top line, so the star is checked in the tooltip too.
    expect(strip().title).toContain('On your watchlist: 1921 morgan $45');
    expect(strip().children[1]!.textContent).toContain("You're winning");
    overlay.setGuard({ lotTitle: '1921 Morgan', bid: '$50', ceiling: '$45', level: 'over', reasons: ['Over'], you: 'outbid' });
    expect(strip().children[1]!.textContent).toContain('Outbid');
    overlay.setSeller({ host: 'bob', note: 'Slow shipper', blocked: true, history: null, thisShow: 2 });
    expect(shadow().textContent).toContain('@bob is on your blocklist');
    expect(shadow().textContent).toContain('Slow shipper');
    expect(shadow().textContent).toContain('2 won this show');
    overlay.setSeller(null);
    overlay.setGuard(null);
  });

  it('puts a quick chat line in chat and resets the menu', () => {
    const sent: string[] = [];
    overlay.mount({ chatText: (t) => sent.push(t) });
    overlay.setTools({ spot: 'Gold $2,400.00', templates: ['What year is it?', 'Can you show the back?'] });
    const select = shadow().querySelector<HTMLSelectElement>('select[data-change="template"]')!;
    select.value = '1';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(sent).toEqual(['Can you show the back?']);
    expect(select.value).toBe('');
    expect(shadow().textContent).toContain('Gold $2,400');
    overlay.setTools(null);
  });

  it('puts the bid buttons right under the header, green when ok and red when over', () => {
    const kinds: string[] = [];
    overlay.mount({ quickBid: (k) => kinds.push(k) });
    overlay.setWheel(null);
    overlay.setQuickBids([
      { kind: 'plus1', label: '+$1', verdict: 'ok', note: '$41 is within your max of $60' },
      { kind: 'plus5', label: '+$5', verdict: 'over', note: '$65 is over your max bid ($60)' },
      { kind: 'max', label: 'Max $60', verdict: null, note: null },
    ]);
    const row = shadow().querySelector<HTMLElement>('.quick')!;
    expect(row.previousElementSibling!.className).toBe('head');
    const buttons = [...row.querySelectorAll<HTMLButtonElement>('button')];
    expect(buttons.map((b) => b.className)).toEqual(['ok', 'over', '']);
    expect(buttons[1]!.title).toContain('$65 is over your max bid ($60)');
    buttons[1]!.click();
    expect(kinds).toEqual(['plus5']);
    overlay.setQuickBids([]);
    expect(row.children).toHaveLength(0);
  });

  it('hides Appraise while a wheel is running', () => {
    overlay.mount({});
    overlay.setWheel(null);
    expect(shadow().querySelector('[data-action="appraise"]')).not.toBeNull();
    overlay.setWheel(view('$30'));
    expect(shadow().querySelector('[data-action="appraise"]')).toBeNull();
  });
});
