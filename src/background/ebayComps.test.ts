import { describe, expect, it } from 'vitest';
import { buildEbayQuery, parseEbaySoldHtml } from './ebayComps';

describe('ebayComps', () => {
  it('builds clean eBay sold queries from item details', () => {
    expect(
      buildEbayQuery({
        item_name: 'Morgan Silver Dollar',
        year: 1881,
        mint_mark: 'S',
        grade: 'MS 65',
      }),
    ).toBe('1881 S Morgan Silver Dollar MS 65');

    expect(
      buildEbayQuery({
        item_name: 'Charizard Holo',
        card: { game: 'pokemon', name: 'Charizard', set: 'Base Set', number: '4/102' },
      }),
    ).toBe('Charizard Base Set 4/102');
  });

  it('parses sold items from eBay search HTML', () => {
    const sampleHtml = `
      <ul>
        <li class="s-item">
          <span class="s-item__title">1881-S Morgan Dollar NGC MS65</span>
          <span class="s-item__price"><span class="POSITIVE">$215.50</span></span>
        </li>
        <li class="s-item">
          <span class="s-item__title">1881 S Morgan Silver Dollar PCGS MS65 CAC</span>
          <span class="s-item__price">$225.00</span>
        </li>
        <li class="s-item">
          <span class="s-item__title">Copy Replica 1881-S Morgan</span>
          <span class="s-item__price">$12.00</span>
        </li>
      </ul>
    `;
    const comps = parseEbaySoldHtml(sampleHtml);
    expect(comps).toHaveLength(2);
    expect(comps[0]?.price).toBe(215.5);
    expect(comps[1]?.price).toBe(225.0);
  });
});

