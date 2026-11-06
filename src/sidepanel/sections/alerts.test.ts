import { afterEach, describe, expect, it, vi } from 'vitest';

const markup = `
  <input id="alert-giveaways" type="checkbox" />
  <input id="alert-wins" type="checkbox" />
  <input id="alert-starting" type="checkbox" />
  <input id="alert-lead" type="number" />
  <textarea id="alert-keywords"></textarea>
  <button id="alert-save" type="button"></button>
  <div id="alert-note"></div>
  <ul id="alert-watched"></ul>
  <input id="buyer-outbid" type="checkbox" />
  <input id="buyer-mentions" type="checkbox" />
  <input id="buyer-sound" type="checkbox" />
  <input id="buyer-seconds" type="number" />
  <input id="buyer-tilt" type="number" />
  <textarea id="buyer-watch"></textarea>
  <textarea id="buyer-wishlist"></textarea>
  <textarea id="buyer-templates"></textarea>
  <button id="buyer-save" type="button"></button>
  <div id="buyer-note"></div>
  <input id="buyer-tax" type="number" />
  <input id="buyer-fee" type="number" />
  <textarea id="buyer-shows"></textarea>
  <ul id="show-matches"></ul>
`;

const boot = async (stored: Record<string, unknown> = {}) => {
  document.body.innerHTML = markup;
  const data: Record<string, unknown> = { ...stored };
  const set = vi.fn(async (items: Record<string, unknown>) => void Object.assign(data, items));
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: async (name: string) => (name in data ? { [name]: data[name] } : {}),
        set,
      },
      onChanged: { addListener() {}, removeListener() {} },
    },
    tabs: { create: vi.fn() },
  });
  const { initAlerts } = await import('./alerts');
  await initAlerts();
  return { data, set };
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('initAlerts and wishlist persistence', () => {
  it('populates wishlist textarea from storage and saves new wishlist items on submit', async () => {
    const { data, set } = await boot({
      wn2_buyerSettings: {
        wishlist: [
          { keywords: ['charizard', 'base'], max: 120, text: 'charizard base $120' },
          { keywords: ['1881', 's', 'morgan'], max: 45, text: '1881-s morgan $45' },
        ],
      },
    });

    const wishlistArea = document.querySelector<HTMLTextAreaElement>('#buyer-wishlist')!;
    const watchArea = document.querySelector<HTMLTextAreaElement>('#buyer-watch')!;
    const note = document.querySelector<HTMLElement>('#buyer-note')!;
    const saveBtn = document.querySelector<HTMLButtonElement>('#buyer-save')!;

    expect(wishlistArea.value).toBe('charizard base $120\n1881-s morgan $45');

    // Enter a new wishlist line and save
    wishlistArea.value = 'charizard base $120\nmilwaukee m18 fuel\n$invalid\n';
    watchArea.value = '1921 morgan $40';

    saveBtn.click();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(set).toHaveBeenCalled();
    const saved = data.wn2_buyerSettings as any;
    expect(saved.wishlist).toHaveLength(2);
    expect(saved.wishlist[0].text).toBe('charizard base $120');
    expect(saved.wishlist[0].max).toBe(120);
    expect(saved.wishlist[1].text).toBe('milwaukee m18 fuel');
    expect(saved.wishlist[1].max).toBeNull();
    expect(saved.watchlist).toHaveLength(1);
    expect(note.textContent).toContain('1 on watchlist, 2 on wishlist');
    expect(note.textContent).toContain('1 line skipped');
  });
});
