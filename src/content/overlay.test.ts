import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildCasePackView } from '../shared/casePack';
import { buildElectronicsView } from '../shared/electronics';
import { buildEstateView } from '../shared/estate';
import { buildRunnerView } from '../shared/runner';
import { messageView } from './appraisalView';
import { overlay, type WheelView } from './overlay';

const view = (bid: string): WheelView => ({
  title: 'Gold Rush',
  spots: '4 of 10 spots left',
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
    const close = shadow().querySelector('[data-action="close"]');
    overlay.setWheel(view('$31'));
    expect(shadow().querySelector('[data-action="close"]')).toBe(close);
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
    overlay.setSeller({
      host: 'bob',
      note: 'Slow shipper',
      blocked: true,
      history: null,
      thisShow: 2,
      profile: '★4.9 (1.2K reviews) · on Whatnot 5 months',
      closes: 'Their lots close at ~98% of market (6 compared): about market',
    });
    expect(shadow().textContent).toContain('@bob is on your blocklist');
    expect(shadow().textContent).toContain('Slow shipper');
    expect(shadow().textContent).toContain('2 won this show');
    expect(shadow().textContent).not.toContain('★4.9');
    expect(shadow().textContent).not.toContain('about market');
    overlay.setSeller(null);
    overlay.setGuard(null);
  });

  it('shows the spot price and leaves quick chat out', () => {
    overlay.mount({});
    overlay.setTools({ spot: 'Gold $2,400.00 · Silver $32.00', templates: ['What year is it?'] });
    expect(shadow().querySelector('select[data-change="template"]')).toBeNull();
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
    expect(row.previousElementSibling!.className).toBe('lot-block');
    const order = [...shadow().querySelector('.panel')!.children].map((el) => el.className);
    expect(order).toEqual(['top-lock', 'lot-block', 'quick', 'main', 'tools']);
    const buttons = [...row.querySelectorAll<HTMLButtonElement>('button')];
    expect(buttons.map((b) => b.className)).toEqual(['ok', 'over', '']);
    expect(buttons[1]!.title).toContain('$65 is over your max bid ($60)');
    buttons[1]!.click();
    expect(kinds).toEqual(['plus5']);
    overlay.setQuickBids([]);
    expect(row.children).toHaveLength(0);
  });

  it('shows the full break name, how many spots are left, and the floor', () => {
    overlay.mount({});
    overlay.setWheel({
      ...view('$30'),
      title: 'Marks 12 instant reveal surprise set',
      spots: '93 of 120 spots left',
      facts: [{ label: 'Floor', value: '$1 · 75% chance', detail: 'Random wheat · 70 left · lose $14' }],
    });
    const name = shadow().querySelector('.wheel-name')!;
    expect(name.textContent).toBe('Marks 12 instant reveal surprise set');
    expect(name.className).not.toContain('one-line');
    expect(shadow().textContent).toContain('93 of 120 spots left');
    expect(shadow().textContent).toContain('Random wheat · 70 left · lose $14');
  });

  it('keeps show type and appraise mode above the lot, bids, shop, and appraisal', () => {
    overlay.mount({});
    overlay.setWheel(null);
    overlay.setPrefs({ autoAppraise: true, hidden: false, pos: null });
    overlay.setScan({ scan: false });
    overlay.setGuard({ lotTitle: 'Morgan dollar', bid: '$1', ceiling: null, level: 'ok', reasons: [] });
    overlay.setQuickBids([{ kind: 'plus1', label: '+$1' }]);
    overlay.setShop({ summary: 'Checked 1 buy-it-now item.', hits: [] });
    overlay.setAppraisal(messageView('done', 'Silver eagle'), false);
    overlay.setTools({ spot: 'Gold $2,400', templates: [] });
    const follows = (earlier: Element, later: Element) => Boolean(earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING);
    const picker = shadow().querySelector('.picker')!;
    const strip = shadow().querySelector('.lot-strip')!;
    const quick = shadow().querySelector('.quick')!;
    const shop = [...shadow().querySelectorAll('.wheel-name')].find((el) => el.textContent === 'Shop')!;
    const appraisal = shadow().querySelector('.appraisal-head')!;
    const spot = shadow().querySelector('.spot')!;
    expect(picker.textContent).toContain('Show type');
    expect(strip.textContent).toContain('$1');
    expect(follows(picker, strip)).toBe(true);
    expect(follows(strip, quick)).toBe(true);
    expect(follows(quick, shop)).toBe(true);
    expect(follows(shop, appraisal)).toBe(true);
    expect(follows(appraisal, spot)).toBe(true);
    expect(shadow().querySelector('[data-action="chat"]')).toBeNull();
    expect(shadow().querySelector('[data-action="ask"]')).toBeNull();
  });

  it('lists buy-it-now shop hits', () => {
    overlay.mount({});
    overlay.setShop({
      summary: 'Checked 4 buy-it-now items.',
      hits: [{ kind: 'steal', label: 'Steal', text: '1 oz silver round — $20. Under melt ($30)' }],
    });
    expect(shadow().textContent).toContain('Checked 4 buy-it-now items.');
    expect(shadow().textContent).toContain('Steal');
    expect(shadow().textContent).toContain('1 oz silver round');
    overlay.setShop(null);
    expect(shadow().textContent).not.toContain('1 oz silver round');
  });

  it('renders shop stock badges and wires click-to-focus, dismiss, filter, and rescan controls', () => {
    const focused: string[] = [];
    const dismissed: string[] = [];
    const appraised: string[] = [];
    const filters: string[] = [];
    let rescanned = 0;
    let tableScans = 0;
    overlay.mount({
      shopFocus: (title) => focused.push(title),
      shopDismiss: (id) => dismissed.push(id),
      shopAppraise: (id) => appraised.push(id),
      tableScan: () => {
        tableScans += 1;
      },
      shopFilter: (mode) => filters.push(mode),
      shopRescan: () => {
        rescanned += 1;
      },
    });
    overlay.setShop({
      summary: 'Checked 6 shop items.',
      hasAuctions: true,
      filter: 'all',
      hits: [
        {
          id: 'r1',
          title: '1 oz silver round',
          quantity: 1,
          mode: 'bin',
          kind: 'steal',
          label: 'Steal',
          text: '1 oz silver round — $20. Under melt ($30)',
        },
        {
          id: 'r2',
          title: '1921 Morgan Dollar',
          quantity: 4,
          mode: 'bin',
          kind: 'deal',
          label: 'Deal',
          text: '1921 Morgan Dollar — $25. Watchlist',
          onWishlist: true,
        },
      ],
    });
    const text = shadow().textContent ?? '';
    expect(text).toContain('[1 left]');
    expect(text).toContain('[4 in stock]');
    expect(text).toContain('[Wishlist]');
    shadow().querySelector<HTMLElement>('[data-action="shop-focus"]')!.click();
    expect(focused).toEqual(['1 oz silver round']);
    shadow().querySelector<HTMLElement>('[data-action="shop-dismiss"]')!.click();
    expect(dismissed).toEqual(['r1']);
    const filterBtn = shadow().querySelector<HTMLElement>('[data-action="shop-filter"]')!;
    filterBtn.click();
    expect(filters).toEqual(['bin']);
    overlay.setShop({
      summary: 'Checked 6 shop items.',
      hasAuctions: true,
      filter: 'bin',
      hits: [],
    });
    shadow().querySelector<HTMLElement>('[data-action="shop-filter"]')!.click();
    expect(filters).toEqual(['bin', 'wishlist']);
    overlay.setShop({
      summary: 'Checked 6 shop items.',
      hasAuctions: true,
      filter: 'wishlist',
      hits: [],
    });
    shadow().querySelector<HTMLElement>('[data-action="shop-filter"]')!.click();
    expect(filters).toEqual(['bin', 'wishlist', 'all']);
    shadow().querySelector<HTMLElement>('[data-action="shop-rescan"]')!.click();
    expect(rescanned).toBe(1);
    shadow().querySelector<HTMLElement>('[data-action="table-scan"]')!.click();
    expect(tableScans).toBe(1);
    overlay.setShop(null);
  });

  it('shows the template lot before an appraisal', () => {
    overlay.mount({});
    overlay.setEstate(
      buildEstateView({
        lotTitle: '*c - 2 oz Item on screen #57',
        start: 4,
        shipping: 4.47,
        categories: ['Estate Sales'],
      }),
    );
    const text = shadow().textContent ?? '';
    expect(text).toContain('Lot 57');
    expect(text).toContain('2 oz');
    expect(text).toContain('$4');
    expect(text).toContain('$4.47');
    expect(text).not.toContain('Item on screen');
    expect(text).not.toContain('Appraising');
    overlay.setEstate(null);
  });

  it('shows the electronics pull lot before an appraisal without calling the item Random Item', () => {
    overlay.mount({});
    overlay.setElectronics(
      buildElectronicsView({
        lotTitle: 'SMALL Random Item #202',
        start: 3,
        shipping: 6.75,
        categories: ['Everyday Electronics', 'Pallet Pulls'],
      }),
    );
    const text = shadow().textContent ?? '';
    expect(text).toContain('Lot 202');
    expect(text).toContain('small');
    expect(text).toContain('$3');
    expect(text).toContain('$6.75');
    expect(text).not.toContain('Random Item');
    expect(text).not.toContain('Appraising');
    overlay.setElectronics(null);
  });

  it('renders the tools quick read and the device spec line before an appraisal', () => {
    overlay.mount({});
    overlay.setElectronics(
      buildElectronicsView({
        lotTitle: '$329 M18 FUEL 5 in. Flathead Braking Grinder 2886-20',
        categories: ['Tools', 'Milwaukee Tools'],
      }),
    );
    const toolsText = shadow().textContent ?? '';
    expect(toolsText).toContain('M18 FUEL');
    expect(toolsText).toContain('tool-only');
    expect(toolsText).toContain('2886-20');
    expect(toolsText).not.toContain('Appraising');

    overlay.setElectronics(
      buildElectronicsView({
        lotTitle: '2015 Apple Macbook Air 8GB RAM 250GB SSD i5 13"',
        categories: ['Everyday Electronics'],
      }),
    );
    const specText = shadow().textContent ?? '';
    expect(specText).toContain('2015');
    expect(specText).toContain('i5');
    expect(specText).toContain('8GB RAM');
    expect(specText).toContain('250GB');
    expect(specText).toContain('13 inch');
    overlay.setElectronics(null);
  });

  it('renders the runner ladder, vendor quote, and sum without sending chat or showing R/P actions', () => {
    const sent: string[] = [];
    overlay.mount({ chatText: (t) => sent.push(t) });
    overlay.setRunner(
      buildRunnerView({
        notes: [
          'Put in the chat R for Run and P for Pass.',
          'Vendor price $1 will run for $6, $2 will run for $7, $3 will run for $8, $4 will run for $9, and anything $5 and up is doubled.',
          'Large glass items or multiple items add $5 for bubble wrap.',
        ].join('\n'),
        quote: { vendor: 8, text: 'vendor wants $8' },
        shipping: 7.75,
        hasActiveLot: false,
      }),
    );
    const runnerEl = shadow().querySelector('[data-runner]')!;
    const text = runnerEl.textContent ?? '';
    expect(text).toContain('$1 → $6');
    expect(text).toContain('$2 → $7');
    expect(text).toContain('$3 → $8');
    expect(text).toContain('$4 → $9');
    expect(text).toContain('$5+ doubled');
    expect(text).toContain('+$5');
    expect(text).toContain('Vendor $8');
    expect(text).toContain('start $16');
    expect(text).toContain('$7.75');
    expect(text).toContain('$23.75');
    expect(sent).toEqual([]);
    expect(runnerEl.querySelectorAll('button')).toHaveLength(0);
    expect(shadow().querySelector('[data-action="chat"]')).toBeNull();
    expect(text).not.toMatch(/\bR\s*\/\s*P\b/);
    overlay.setRunner(null);
  });

  it('shows the case-pack per-piece and landed per-piece cost before an appraisal without calling the item 12/$12 SB', () => {
    overlay.mount({});
    overlay.setCasePack(
      buildCasePackView({
        showType: 'wholesale',
        lotTitle: '12/$12 SB, 11/4 am',
        bid: 12,
        shipping: 5.25,
      }),
    );
    const casePackEl = shadow().querySelector('[data-casepack]')!;
    const text = casePackEl.textContent ?? '';
    expect(text).toContain('12 pieces');
    expect(text).toContain('$1.00 each');
    expect(text).toContain('$1.44 each landed');
    expect(text).not.toContain('12/$12 SB');
    expect(text).not.toContain('Appraising');
    overlay.setCasePack(null);
  });

  it('renders estate runs as a compact last-sold line and omits viewer chat wants', () => {
    overlay.mount({});
    overlay.setEstate(
      buildEstateView({
        lotTitle: 'Template lot #2',
        categories: ['Estate Sales'],
        runs: [
          { number: 2, name: null, price: 3 },
          { number: 1, name: 'Silver bowl', price: 25 },
        ],
        wants: ['Any 1/4 oz silver rounds', 'can u do $110?'],
      }),
    );
    const estateEl = shadow().querySelector('[data-estate]')!;
    const text = estateEl.textContent ?? '';
    expect(text).toContain('Last sold: Lot 2 · $3');
    expect(text).not.toContain('Lot 1 · Silver bowl · $25');
    expect(text).not.toContain('Any 1/4 oz silver rounds');
    expect(text).not.toContain('can u do $110?');
    overlay.setEstate(null);
  });

  it('renders fact links as clickable anchors opening in new tab', () => {
    overlay.mount({});
    overlay.setAppraisal({
      status: 'done',
      title: '1881-S Morgan Dollar',
      subtitle: null,
      highlight: null,
      reasons: [],
      facts: [
        {
          label: 'NGC cert',
          value: 'Verified',
          detail: 'NGC MS 65',
          link: 'https://www.ngccoin.com/certlookup/6066357-002/65/',
        },
      ],
      cautions: [],
      footer: null,
      similar: [],
    });
    const link = shadow().querySelector<HTMLAnchorElement>('.fact-link');
    expect(link).not.toBeNull();
    expect(link?.href).toBe('https://www.ngccoin.com/certlookup/6066357-002/65/');
    expect(link?.target).toBe('_blank');
    expect(link?.rel).toBe('noopener noreferrer');
    expect(link?.textContent).toContain('Verified ↗');
  });

  it('hides Appraise while a wheel is running', () => {
    overlay.mount({});
    overlay.setWheel(null);
    expect(shadow().querySelector('[data-action="appraise"]')).not.toBeNull();
    overlay.setWheel(view('$30'));
    expect(shadow().querySelector('[data-action="appraise"]')).toBeNull();
  });
});
