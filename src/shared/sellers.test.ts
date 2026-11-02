import { describe, expect, it } from 'vitest';
import { parseSellerList, sellerUrl } from './sellers';

describe('parseSellerList', () => {
  it('accepts usernames, @handles, and profile URLs', () => {
    const { sellers, invalid } = parseSellerList(
      ['dammit_terry', '@coin.queen', 'https://www.whatnot.com/user/silver-stacker?ref=x', 'whatnot.com/user/Bob'].join('\n'),
    );
    expect(sellers).toEqual(['dammit_terry', 'coin.queen', 'silver-stacker', 'Bob']);
    expect(invalid).toEqual([]);
  });

  it('dedupes case-insensitively, keeping the first spelling', () => {
    expect(parseSellerList('Bob, bob @BOB https://whatnot.com/user/bob').sellers).toEqual(['Bob']);
  });

  it('reports entries it cannot use', () => {
    const { sellers, invalid } = parseSellerList('good_one\nhttps://www.whatnot.com/live/abc\nbad$name');
    expect(sellers).toEqual(['good_one']);
    expect(invalid).toEqual(['https://www.whatnot.com/live/abc', 'bad$name']);
  });
});

describe('sellerUrl', () => {
  it('builds the profile URL', () => {
    expect(sellerUrl('coin.queen')).toBe('https://www.whatnot.com/user/coin.queen');
  });
});
