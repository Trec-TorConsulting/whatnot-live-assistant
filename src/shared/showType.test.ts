import { describe, expect, it } from 'vitest';
import { detectShowType, scansByDefault } from './showType';

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

  it('treats Tools and tool-brand tags as tools even with Pallet Pulls, while a garage sale mentioning a drill stays flea', () => {
    expect(detectShowType('Tool pallets', ['Tools', 'Pallet Pulls', 'Ryobi Tools'])).toBe('tools');
    expect(detectShowType('Milwaukee blowout', ['Tools', 'DIY', 'Milwaukee Tools'])).toBe('tools');
    expect(detectShowType('Everyday Electronics', ['Everyday Electronics', 'Pallet Pulls'])).toBe('electronics');
    expect(detectShowType('Garage sale: old drill and boxes', [])).toBe('flea');
  });

  it('classifies all 14 observed Case Packs & Bundles shows as wholesale while keeping Pokemon packs as cards and scansByDefault flea-only', () => {
    const observed: [string, string[]][] = [
      ['12/$12 SB Casepack:Novelties,Keychains,Jewelry,Accessories', ['Case Packs & Bundles', 'Reseller Bundles', 'Wholesale/Lots', 'Squishy Toys']],
      ['12/$12 Earrings, Necklaces & More! Casepacks!', ['Case Packs & Bundles', 'Reseller Bundles', 'Wholesale/Lots', 'Fashion Jewelry']],
      ['🇨🇦！Cad! Warehouse show', ['Case Packs & Bundles', 'Reseller Bundles', 'Wholesale/Lots', 'Pallet Pulls']],
      ['Boutique Apparel Casepacks & Bundles', ['Case Packs & Bundles', 'Reseller Bundles', 'Women\'s Contemporary']],
      ['Wholesale Reseller Bundles $1 Starts', ['Case Packs & Bundles', 'Reseller Bundles', 'Wholesale/Lots']],
      ['Children\'s Clothing Case Packs', ['Case Packs & Bundles', 'Reseller Bundles', 'Baby & Kids']],
      ['12/$12 Dozens Wholesale Blowout', ['Case Packs & Bundles', 'Wholesale/Lots']],
      ['Closeout Casepack Liquidation', ['Case Packs & Bundles', 'Reseller Bundles']],
      ['Sneaker & Streetwear Case Packs', ['Case Packs & Bundles', 'Sneakers & Streetwear']],
      ['Beauty & Cosmetics Casepacks', ['Case Packs & Bundles', 'Beauty']],
      ['Toys & Collectibles Reseller Casepacks', ['Case Packs & Bundles', 'Toys']],
      ['Home & Kitchen Case Packs', ['Case Packs & Bundles', 'Home & Garden']],
      ['Reseller Bundles & Closeouts', ['Reseller Bundles', 'Wholesale/Lots', 'Pallet Pulls']],
      ['Casepack Madness 12/$12', ['Wholesale/Lots', 'Fashion Jewelry']],
    ];
    for (const [title, tags] of observed) {
      expect(detectShowType(title, tags)).toBe('wholesale');
    }
    expect(detectShowType('Pokemon packs', [])).toBe('cards');
    expect(scansByDefault('wholesale')).toBe(false);
    expect(scansByDefault('flea')).toBe(true);
  });
});
