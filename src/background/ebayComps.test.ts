import { describe, expect, it, vi } from 'vitest';
import { buildEbayQuery, ebaySoldLookup, parseEbaySoldHtml } from './ebayComps';

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

  it('avoids duplicating year, mint mark, or grade already in item_name', () => {
    expect(
      buildEbayQuery({
        item_name: '1875 Indian Head Cent',
        year: 1875,
      }),
    ).toBe('1875 Indian Head Cent');

    expect(
      buildEbayQuery({
        item_name: '1881-S Morgan Dollar MS 65',
        year: 1881,
        mint_mark: 'S',
        grade: 'MS 65',
      }),
    ).toBe('1881-S Morgan Dollar MS 65');

    expect(
      buildEbayQuery({
        item_name: '1881 S Morgan Dollar',
        year: 1881,
        mint_mark: 'S',
      }),
    ).toBe('1881 S Morgan Dollar');
  });

  it('incorporates slab service, signatures, finish, pedigree, and paper designations into queries', () => {
    expect(
      buildEbayQuery({
        item_name: '2017-W American Silver Eagle Burnished',
        grade: 'MS 70',
        is_slabbed: true,
        grading_service: 'NGC',
        signature: 'Elizabeth Jones',
        pedigree: 'First Day of Issue',
      }),
    ).toBe('2017-W American Silver Eagle Burnished NGC MS 70 Elizabeth Jones First Day of Issue');

    expect(
      buildEbayQuery({
        item_name: '1928 $1 Silver Certificate',
        grade: '64 EPQ',
        is_slabbed: true,
        grading_service: 'PMG',
        paper_quality: 'epq',
        star_note: true,
        catalog_number: 'Fr. 1606',
      }),
    ).toBe('1928 $1 Silver Certificate PMG 64 EPQ Star Fr. 1606');
  });

  it('parses sold items from eBay search HTML', () => {
    const sampleHtml = `
      <ul>
        <li class="s-item">
          <span class="s-item__title">1881-S Morgan Dollar NGC MS65</span>
          <span class="s-item__price"><span class="POSITIVE">$215.50</span></span>
        </li>
        <li class="s-item">
          <div class="s-item__title"><span role="heading">1881 S Morgan Silver Dollar PCGS MS65 CAC</span></div>
          <div class="s-item__price">$225.00</div>
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

  it('returns null when eBay lookup fails or returns no comps', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'Forbidden',
    }) as unknown as typeof fetch;

    try {
      const res = await ebaySoldLookup({ item_name: '1875 Indian Head Cent', year: 1875 });
      expect(res).toBeNull();
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('returns median and range when eBay lookup succeeds with comps', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => `
        <ul>
          <li class="s-item">
            <span class="s-item__title">1875 Indian Head Cent VF</span>
            <span class="s-item__price">$45.00</span>
          </li>
          <li class="s-item">
            <span class="s-item__title">1875 Indian Head Cent Fine</span>
            <span class="s-item__price">$35.00</span>
          </li>
        </ul>
      `,
    }) as unknown as typeof fetch;

    try {
      const res = await ebaySoldLookup({ item_name: '1875 Indian Head Cent', year: 1875 });
      expect(res).toMatchObject({
        source: 'ebay',
        kind: 'market',
        value: 40,
        high: 45,
        name: '2 eBay sold: $35–$45',
      });
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

