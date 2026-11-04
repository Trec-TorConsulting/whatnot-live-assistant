import { describe, expect, it, vi } from 'vitest';
import {
  bookmarkForCard,
  classifyBookmarkButton,
  classifyFollowLabel,
  describeShowCard,
  findAppBlock,
  findShowPlaceholder,
  iconShape,
  promptLine,
} from './selectors';

const html = (markup: string) => {
  const wrap = document.createElement('div');
  wrap.innerHTML = markup.trim();
  return wrap.firstElementChild as HTMLElement;
};

describe('promptLine', () => {
  it.each(['1921 Morgan Dollar', 'Bid $25', '$40', 'PCGS MS 65', 'Cert 40123456', '1 oz silver', '14 grams'])('keeps %j', (line) => {
    expect(promptLine(line)).toBe(true);
  });

  it.each(['nice coin', 'Follow', 'Set Max Bid', 'Shipping is $4.85', 'patriot271k is Winning', '61 watching'])('drops %j', (line) => {
    expect(promptLine(line)).toBe(false);
  });
});

describe('classifyFollowLabel', () => {
  it.each([
    ['Follow', '', null, 'not_following'],
    ['+ Follow', '', null, 'not_following'],
    ['Follow Host', '', null, 'not_following'],
    ['Following', '', null, 'following'],
    ['', 'Follow coin_queen', null, 'not_following'],
    ['', 'Unfollow coin_queen', null, 'following'],
    ['Follow', '', 'true', 'following'],
  ] as const)('%j / aria %j / pressed %j → %s', (text, aria, pressed, expected) => {
    expect(classifyFollowLabel(text, aria, pressed)).toBe(expected);
  });

  it.each(['12.4K Followers', 'Follow & Enter', 'Unfollow', 'Followed by 3 friends', 'Share'])('ignores %j', (text) => {
    expect(classifyFollowLabel(text)).toBeNull();
  });
});

describe('classifyBookmarkButton', () => {
  it('reads explicit pressed state first', () => {
    expect(classifyBookmarkButton(html('<button aria-pressed="true" aria-label="Bookmark"><svg></svg></button>'))).toEqual({
      state: 'bookmarked',
      labeled: true,
    });
    expect(classifyBookmarkButton(html('<button aria-pressed="false" aria-label="Bookmarked"><svg></svg></button>'))).toEqual({
      state: 'not_bookmarked',
      labeled: true,
    });
  });

  it('reads labels', () => {
    expect(classifyBookmarkButton(html('<button>Remind me</button>'))?.state).toBe('not_bookmarked');
    expect(classifyBookmarkButton(html('<button>Reminder set</button>'))?.state).toBe('bookmarked');
    expect(classifyBookmarkButton(html('<button aria-label="Remove bookmark"><svg></svg></button>'))?.state).toBe('bookmarked');
    expect(classifyBookmarkButton(html('<button aria-label="Save show"><svg></svg></button>'))?.state).toBe('not_bookmarked');
  });

  it('does not let a test id decide the state', () => {
    const filled = html('<button data-testid="bookmark-button"><svg fill="#fff"><path d="M0"/></svg></button>');
    expect(classifyBookmarkButton(filled)).toEqual({ state: 'bookmarked', labeled: true });
  });

  it('falls back to icon fill for unlabeled icon buttons', () => {
    expect(classifyBookmarkButton(html('<button><svg fill="none"><path stroke="#fff" d="M0"/></svg></button>'))).toEqual({
      state: 'not_bookmarked',
      labeled: false,
    });
    expect(classifyBookmarkButton(html('<button><svg fill="#fff"><path d="M0"/></svg></button>'))).toEqual({
      state: 'bookmarked',
      labeled: false,
    });
  });

  it('ignores other controls', () => {
    expect(classifyBookmarkButton(html('<button aria-label="Share"><svg></svg></button>'))).toBeNull();
    expect(classifyBookmarkButton(html('<button>Follow</button>'))).toBeNull();
    expect(classifyBookmarkButton(html('<button>Buy now</button>'))).toBeNull();
  });
});

// Markup captured from a real whatnot.com profile page (classes trimmed).
const OUTLINE_D =
  'M10.586 16.116a2 2 0 0 1 2.828 0l4.733 4.732a.5.5 0 0 0 .853-.354V6a3 3 0 0 0-3-3H8a3 3 0 0 0-3 3v14.494a.5.5 0 0 0 .854.354zm6.146 6.146c1.575 1.575 4.268.46 4.268-1.768V6a5 5 0 0 0-5-5H8a5 5 0 0 0-5 5v14.494c0 2.228 2.693 3.343 4.268 1.768L12 17.53z';
const SOLID_D = 'M5 3a2 2 0 0 0-2 2v16.5l9-5 9 5V5a2 2 0 0 0-2-2z';
const whatnotBookmark = (label: string, d: string) =>
  `<button type="button"><span><div><svg width="16" height="16" fill="none" viewBox="0 0 24 24" aria-label="${label}" class="fill-neutral-900"><path fill-rule="evenodd" d="${d}" clip-rule="evenodd"></path></svg></div></span></button>`;

describe('real Whatnot markup', () => {
  it('reads the label from the svg inside the button', () => {
    expect(classifyBookmarkButton(html(whatnotBookmark('Bookmark this show', OUTLINE_D)))).toEqual({ state: 'not_bookmarked', labeled: true });
  });

  it('treats a solid icon under the same label as bookmarked', () => {
    expect(classifyBookmarkButton(html(whatnotBookmark('Bookmark this show', SOLID_D)))?.state).toBe('bookmarked');
  });

  it('reads an explicit bookmarked label', () => {
    expect(classifyBookmarkButton(html(whatnotBookmark('Remove bookmark', SOLID_D)))?.state).toBe('bookmarked');
  });

  it('ignores the profile menu button labeled on its svg', () => {
    expect(
      classifyBookmarkButton(html('<button><svg fill="none" aria-label="Show menu for additional user actions"><path d="M4 14a2 2 0 1 0 0-4"/></svg></button>')),
    ).toBeNull();
  });

  it('ignores follower count buttons', () => {
    expect(classifyFollowLabel('8.8K Following')).toBeNull();
    expect(classifyFollowLabel('7.8K Followers')).toBeNull();
  });

  it('picks the bookmark control on a livestream card', () => {
    const card = html(`<section data-testid="livestream-card">
      <a href="/user/dammit_terry">dammit_terry</a>
      <div><a href="/live/4b9a01d6?referringSource=profile"><img alt="Thumbnail for live show"></a>${whatnotBookmark('Bookmark this show', OUTLINE_D)}</div>
      <a href="/live/4b9a01d6?referringSource=profile">Ohio Meet Up &amp; Flea Market</a>
    </section>`);
    expect(bookmarkForCard(card)?.state).toBe('not_bookmarked');
    expect(iconShape(card.querySelector('button')!)).toBe('outline');
  });

  it('takes the card title from the title link, not the time overlay', () => {
    const card = html(`<section data-testid="livestream-card">
      <a href="/user/dammit_terry">dammit_terry</a>
      <a href="/live/4b9a01d6">Fri 6:30 AM 20</a>
      <a href="/live/4b9a01d6">Ohio Meet Up &amp; Flea Market</a>
    </section>`);
    expect(describeShowCard(card)).toMatchObject({ title: 'Ohio Meet Up & Flea Market', host: 'dammit_terry' });
  });

  it('skips the "Live · 61" badge on a show that is on now', () => {
    // Link texts from a live card on whatnot.com/tag/coins_and_money (Oct 2026).
    const card = html(`<section data-testid="livestream-card">
      <a href="/user/bidkdc">bidkdc</a>
      <a href="/live/bf7c0c37">Live · 61</a>
      <a href="/live/bf7c0c37">Nick's $1 Start Coin Auctions</a>
    </section>`);
    expect(describeShowCard(card)).toMatchObject({ title: "Nick's $1 Start Coin Auctions", host: 'bidkdc', timeText: null });
  });
});

describe('bookmarkForCard', () => {
  it('prefers the labeled bookmark control', () => {
    const card = html(`<div>
      <button aria-label="More options"><svg></svg></button>
      <button><svg fill="none"></svg></button>
      <button aria-label="Bookmark"><svg fill="none"></svg></button>
    </div>`);
    expect(bookmarkForCard(card)?.el.getAttribute('aria-label')).toBe('Bookmark');
  });

  it('skips cards with several unlabeled icon buttons rather than guessing', () => {
    const card = html('<div><button><svg></svg></button><button><svg></svg></button></div>');
    expect(bookmarkForCard(card)).toBeNull();
  });

  it('uses a lone icon button', () => {
    const card = html('<div><a href="/live/abc">Show</a><button><svg fill="none"></svg></button></div>');
    expect(bookmarkForCard(card)?.state).toBe('not_bookmarked');
  });
});

describe('findAppBlock', () => {
  it("spots Whatnot's mobile app screen", () => {
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 390, height: 800 } as DOMRect);
    document.body.innerHTML = '<div data-testid="show-share-button">Share</div>';
    expect(findAppBlock()).toBe(false);
    document.body.innerHTML =
      '<div data-testid="component-unauthed-mobile-block"><button data-testid="unauthed-mobile-block-screen-continue-button">Continue on Whatnot</button></div>';
    expect(findAppBlock()).toBe(true);
    rect.mockRestore();
    document.body.innerHTML = '';
  });
});

describe('findShowPlaceholder', () => {
  it('finds the placeholder cards at the end of the shows grid only', () => {
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 200, height: 300 } as DOMRect);
    document.body.innerHTML = `
      <div id="reviews"><div data-type="SkeletonItem"></div></div>
      <div id="shows">
        <div><section data-testid="livestream-card"><a href="/live/abc">Show</a></section></div>
        <div data-type="SkeletonItem" id="pending"></div>
      </div>`;
    expect(findShowPlaceholder()?.id).toBe('pending');
    document.getElementById('pending')!.remove();
    expect(findShowPlaceholder()).toBeNull();
    rect.mockRestore();
    document.body.innerHTML = '';
  });
});
