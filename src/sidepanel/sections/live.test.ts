import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ShopFilterMode } from '../../shared/shop';

const markup = `
  <div id="live-title"></div>
  <div id="live-meta"></div>
  <div id="live-lot"></div>
  <div id="notes-card" hidden><div id="notes-coupons"></div><div id="notes-text"></div></div>
  <div id="shop-card" hidden>
    <div id="shop-summary"></div>
    <button id="shop-filter" type="button" hidden>All</button>
    <button id="shop-rescan" type="button">↻</button>
    <ul id="shop-hits"></ul>
  </div>
  <div id="estate-card" hidden><div id="estate-line"></div><div id="estate-ship"></div><div id="estate-rules"></div><div id="estate-clothing"></div><div id="estate-runs"></div></div>
  <div id="electronics-card" hidden><div id="electronics-line"></div><div id="electronics-condition"></div><div id="electronics-msrp"></div><div id="electronics-sudden"></div><div id="electronics-ship"></div><div id="electronics-rules"></div><div id="electronics-runs"></div></div>
  <div id="runner-card" hidden><div id="runner-ladder"></div><div id="runner-quote"></div><div id="runner-ship"></div></div>
  <div id="casepack-card" hidden><div id="casepack-line"></div><div id="casepack-conflict"></div><div id="casepack-sizerun"></div><div id="casepack-claims"></div><div id="casepack-breakeven"></div><div id="casepack-rules"></div><div id="casepack-currency"></div><div id="casepack-runs"></div></div>
  <button id="live-appraise" type="button"></button>
  <input id="overlay-show" type="checkbox" />
  <button id="overlay-reset" type="button"></button>
  <input id="overlay-auto" type="checkbox" />
  <div id="live-appraisal-card" hidden><div id="live-appraisal"></div></div>
  <input id="guard-lot" type="number" />
  <input id="guard-default" type="number" />
  <input id="guard-budget" type="number" />
  <input id="guard-percent" type="number" />
  <input id="guard-market" type="checkbox" />
  <input id="guard-confirm" type="checkbox" />
  <input id="guard-daily" type="number" />
  <input id="guard-weekly" type="number" />
  <input id="guard-monthly" type="number" />
  <div id="guard-left"></div>
  <button id="guard-save" type="button"></button>
  <button id="guard-clear-lot" type="button"></button>
  <div id="guard-note"></div>
  <div id="guard-status"></div>
  <div id="live-revenue"></div>
  <div id="live-orders"></div>
  <div id="live-avg"></div>
  <div id="live-today-left"></div>
  <div id="live-week-left"></div>
  <div id="live-month-left"></div>
  <div id="seller-card" hidden>
    <div id="seller-title"></div>
    <div id="seller-who"></div>
    <div id="seller-history"></div>
    <textarea id="seller-note"></textarea>
    <input id="seller-blocked" type="checkbox" />
    <button id="seller-save" type="button"></button>
    <div id="seller-saved"></div>
    <div id="seller-profile"></div>
    <div id="seller-closes"></div>
  </div>
  <div id="live-flip"></div>
  <details id="live-checks-box"><div id="live-checks"></div></details>
  <input id="monitor-input" type="text" />
  <button id="monitor-add" type="button"></button>
  <div id="monitor-list"></div>
  <div id="stat-revenue"></div>
  <div id="stat-orders"></div>
  <div id="stat-giveaways"></div>
  <div id="stat-viewers"></div>
  <div id="stat-buyers"></div>
  <div id="stat-sales"></div>
  <div id="monitor-card" hidden>
    <div id="monitor-title"></div>
    <div id="monitor-status"></div>
    <button id="monitor-unwatch" type="button"></button>
  </div>
  <div id="toast" hidden></div>
`;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('live shop rendering and filter cycling', () => {
  it('renders wishlist hit badges and cycles 3-way shop filter', async () => {
    document.body.innerHTML = markup;
    const tabId = 123;
    const sentMessages: { tabId: number; message: any }[] = [];

    const mockSession = {
      show: { liveId: 'show1', title: 'Coin Show', host: 'coin_host' },
      lot: null,
      sales: [],
      giveaways: [],
      shop: {
        status: 'ready' as const,
        binCount: 5,
        auctionCount: 2,
        filter: 'all' as ShopFilterMode,
        hits: [
          {
            id: 'h1',
            title: '1881-S Morgan Dollar',
            price: 40,
            quantity: 1,
            kind: 'deal' as const,
            reason: 'Under wishlist max $45',
            mode: 'bin' as const,
            onWishlist: true,
          },
          {
            id: 'h2',
            title: 'Generic Silver Bar',
            price: 32,
            quantity: 5,
            kind: 'deal' as const,
            reason: 'Under comps',
            mode: 'bin' as const,
            onWishlist: false,
          },
        ],
      },
    };

    const storageData: Record<string, unknown> = {
      wn2_live_123: mockSession,
      wn2_session_tab_123: 'show1',
    };

    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: async (key: string) => (key in storageData ? { [key]: storageData[key] } : {}),
          set: async (items: Record<string, unknown>) => void Object.assign(storageData, items),
        },
        session: {
          get: async (key: string) => (key in storageData ? { [key]: storageData[key] } : {}),
          set: async (items: Record<string, unknown>) => void Object.assign(storageData, items),
        },
        onChanged: { addListener() {}, removeListener() {} },
      },
      tabs: {
        query: async () => [{ id: tabId, url: 'https://www.whatnot.com/live/show1' }],
        sendMessage: vi.fn(async (targetTabId: number, msg: any) => {
          sentMessages.push({ tabId: targetTabId, message: msg });
          return { ok: true };
        }),
        onActivated: { addListener() {}, removeListener() {} },
        onUpdated: { addListener() {}, removeListener() {} },
      },
      windows: { onFocusChanged: { addListener() {}, removeListener() {} } },
    });

    const { startTabTracking } = await import('../ui');
    await startTabTracking();
    const { initLive } = await import('./live');
    await initLive();
    // Allow any pending microtasks for watchTab
    await new Promise((resolve) => setTimeout(resolve, 50));

    const shopCard = document.querySelector<HTMLElement>('#shop-card')!;
    const filterBtn = document.querySelector<HTMLButtonElement>('#shop-filter')!;
    const hitsList = document.querySelector<HTMLUListElement>('#shop-hits')!;

    expect(shopCard.hidden).toBe(false);
    expect(filterBtn.hidden).toBe(false);
    expect(filterBtn.textContent).toBe('All');

    // Wishlist hit badge
    expect(hitsList.textContent).toContain('[Wishlist]');
    expect(hitsList.textContent).toContain('1881-S Morgan Dollar');

    // Click filter button: 'all' -> 'bin'
    filterBtn.click();
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0]?.message).toEqual({
      type: 'SHOP_FILTER',
      payload: { mode: 'bin' },
    });

    // Simulate session update with filter: 'bin'
    mockSession.shop.filter = 'bin';
    filterBtn.click();
    expect(sentMessages).toHaveLength(2);
    expect(sentMessages[1]?.message).toEqual({
      type: 'SHOP_FILTER',
      payload: { mode: 'wishlist' },
    });

    // Simulate session update with filter: 'wishlist'
    mockSession.shop.filter = 'wishlist';
    filterBtn.click();
    expect(sentMessages).toHaveLength(3);
    expect(sentMessages[2]?.message).toEqual({
      type: 'SHOP_FILTER',
      payload: { mode: 'all' },
    });
  });
});
