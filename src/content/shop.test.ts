import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseWishlist } from '../shared/buyer';
import type { ShopListing } from '../shared/shop';
import { alertWishlistHit, detectWishlistDrops } from './shop';
import { overlay } from './overlay';

vi.mock('./overlay', () => ({
  overlay: {
    notice: vi.fn(),
    flash: vi.fn(),
    setShop: vi.fn(),
  },
}));

vi.mock('../shared/messages', () => ({
  send: vi.fn(async () => ({ ok: true })),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('live shop drop and restock detection', () => {
  const wishlist = parseWishlist([
    'charizard base',
    '1881-s morgan $45',
    'milwaukee m18 fuel $120',
  ].join('\n'));

  it('ignores listings during initial scan before initialDone is true', () => {
    const incoming: ShopListing[] = [
      { id: 'item1', title: '1999 Pokémon Charizard Base Set Holo', price: 150, quantity: 1, mode: 'bin' },
    ];
    const inventory = new Map<string, number>();
    const drops = detectWishlistDrops(incoming, inventory, wishlist, false);
    expect(drops).toEqual([]);
  });

  it('detects a newly dropped buy-it-now item matching the wishlist after initial scan', () => {
    const inventory = new Map<string, number>([
      ['old-item', 2],
    ]);
    const incoming: ShopListing[] = [
      { id: 'item1', title: '1999 Pokémon Charizard Base Set Holo', price: 150, quantity: 1, mode: 'bin' },
      { id: 'unrelated', title: 'Random Coin', price: 10, quantity: 5, mode: 'bin' },
    ];
    const drops = detectWishlistDrops(incoming, inventory, wishlist, true);
    expect(drops).toHaveLength(1);
    expect(drops[0]).toEqual({
      kind: 'drop',
      item: incoming[0],
    });
  });

  it('detects a quantity restock on a wishlisted item that previously had 0 inventory', () => {
    const inventory = new Map<string, number>([
      ['item1', 0],
      ['item2', 3],
    ]);
    const incoming: ShopListing[] = [
      { id: 'item1', title: '1881-S Morgan Dollar BU', price: 40, quantity: 2, mode: 'bin' },
    ];
    const drops = detectWishlistDrops(incoming, inventory, wishlist, true);
    expect(drops).toHaveLength(1);
    expect(drops[0]).toEqual({
      kind: 'restock',
      item: incoming[0],
    });
  });

  it('detects a quantity increase on an active wishlisted item', () => {
    const inventory = new Map<string, number>([
      ['tool1', 1],
    ]);
    const incoming: ShopListing[] = [
      { id: 'tool1', title: 'Milwaukee M18 FUEL Impact Driver', price: 99, quantity: 5, mode: 'bin' },
    ];
    const drops = detectWishlistDrops(incoming, inventory, wishlist, true);
    expect(drops).toHaveLength(1);
    expect(drops[0]).toEqual({
      kind: 'restock',
      item: incoming[0],
    });
  });

  it('ignores auction items and zero-quantity items', () => {
    const inventory = new Map<string, number>();
    const incoming: ShopListing[] = [
      { id: 'a1', title: '1881-S Morgan Dollar BU', price: 1, quantity: 1, mode: 'auction' },
      { id: 'sold-out', title: '1999 Pokémon Charizard Base Set Holo', price: 100, quantity: 0, mode: 'bin' },
    ];
    const drops = detectWishlistDrops(incoming, inventory, wishlist, true);
    expect(drops).toEqual([]);
  });

  it('emits visual overlay cues and background buyer alert on wishlist drops', async () => {
    const { send } = await import('../shared/messages');
    const item: ShopListing = {
      id: 'drop-1',
      title: '1999 Pokémon Charizard Base Set Holo',
      price: 150,
      quantity: 1,
      mode: 'bin',
    };

    alertWishlistHit(item, 'drop', false);

    expect(overlay.notice).toHaveBeenCalledWith('Wishlist drop: 1999 Pokémon Charizard Base Set Holo at $150', 8000);
    expect(overlay.flash).toHaveBeenCalled();

    // Verify background alert dispatch when document is hidden
    vi.stubGlobal('document', { hidden: true });
    alertWishlistHit(item, 'restock', false);

    expect(overlay.notice).toHaveBeenCalledWith('Wishlist restock: 1999 Pokémon Charizard Base Set Holo (1 in stock)', 8000);
    expect(send).toHaveBeenCalledWith('BUYER_ALERT', expect.objectContaining({
      title: 'Wishlist restock: 1999 Pokémon Charizard Base Set Holo (1 in stock)',
      message: 'Restocked in shop at $150',
    }));
  });
});
