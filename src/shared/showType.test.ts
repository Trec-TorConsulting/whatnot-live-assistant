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
});
