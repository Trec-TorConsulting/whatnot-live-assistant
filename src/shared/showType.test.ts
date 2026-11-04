import { describe, expect, it } from 'vitest';
import { detectShowType } from './showType';

describe('detectShowType', () => {
  it('reads the show type from Whatnot tags first, then the title', () => {
    expect(detectShowType('silver,gold, copper slabs', ['us coins', 'numismatics', 'slabs'])).toBe('coins');
    expect(detectShowType('Sunday rips', ['sports_cards', 'baseball'])).toBe('cards');
    expect(detectShowType('PSA 10 Pokémon slabs', [])).toBe('cards');
    expect(detectShowType('14k scrap gold and sterling', [])).toBe('jewelry');
    expect(detectShowType('Vintage Star Wars toys and comics', [])).toBe('collectibles');
  });

  it('treats a garage sale as a garage sale even when it lists coins and cards', () => {
    expect(detectShowType('Garage sale finds: coins, cards, toys', [])).toBe('flea');
    expect(detectShowType('Storage unit treasure hunt', [])).toBe('flea');
    expect(detectShowType('Estate sale pickups', ['antiques'])).toBe('flea');
  });

  it('falls back to general when nothing matches', () => {
    expect(detectShowType('Late night show', [])).toBe('general');
    expect(detectShowType(null, [])).toBe('general');
  });

  it('reads the show type from the notes when the title and tags do not say', () => {
    expect(detectShowType('Late night show', [], 'Morgan dollars, peace dollars, and junk silver')).toBe('coins');
    expect(detectShowType('Sunday rips', ['sports_cards', 'baseball'], '298 silver dimes tonight')).toBe('cards');
  });

  it('lets flea wording in the notes outweigh a coin title', () => {
    expect(detectShowType('Morgan dollars', [], 'Garage sale estate sale storage unit')).toBe('flea');
  });

  it('treats Everyday Electronics and Laptops categories as electronics even with Pallet Pulls, while a garage sale with a laptop stays flea', () => {
    expect(detectShowType('Tech pallet pulls', ['Everyday Electronics', 'Pallet Pulls'])).toBe('electronics');
    expect(detectShowType('MacBooks and iPads', ['Laptops, Phones & Tablets'])).toBe('electronics');
    expect(detectShowType('Garage sale: old laptop and dishes', [])).toBe('flea');
  });
});
