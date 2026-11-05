// Every assumption about Whatnot's markup lives here. When Whatnot ships a redesign, fix this file
// (or publish selector overrides; see shared/overrides.ts).
import { docTop, isVisible, normalize, textOf } from './dom';
import type { ShareTarget } from '../shared/types';
import { overrides } from './overridesState';

const BUTTONS = 'button, [role="button"]';
const SITE_CHROME = 'nav, [role="navigation"], [role="tablist"], [role="banner"]';
// Whatnot uses native <dialog> elements (no role attribute) for its share menu and login prompt.
export const DIALOGS = 'dialog[open], [role="dialog"], [role="alertdialog"], [aria-modal="true"]';

// --- Follow ---

export type FollowState = 'following' | 'not_following';

export interface FollowControl {
  el: HTMLElement;
  state: FollowState;
}

export const classifyFollowLabel = (text: string, aria = '', pressed: string | null = null): FollowState | null => {
  const t = normalize(text).toLowerCase();
  const a = normalize(aria).toLowerCase();
  if (/followers|enter|&/.test(`${t} ${a}`)) return null;
  if (t === 'following' || /^(unfollow|following)\b/.test(a)) return 'following';
  if (/^\+?\s*follow(\s+(host|seller))?$/.test(t) || (!t && /^follow\b/.test(a))) {
    return pressed === 'true' ? 'following' : 'not_following';
  }
  return null;
};

export const classifyFollowControl = (el: Element) =>
  classifyFollowLabel(textOf(el), el.getAttribute('aria-label') ?? '', el.getAttribute('aria-pressed'));

// The profile owner's button is the topmost one; suggested sellers further down have their own.
export const findHostFollowControl = (): FollowControl | null => {
  const controls: (FollowControl & { top: number })[] = [];
  for (const el of document.querySelectorAll<HTMLElement>(overrides().followButton ?? BUTTONS)) {
    if (!isVisible(el) || el.closest(SITE_CHROME)) continue;
    const state = classifyFollowControl(el);
    if (state) controls.push({ el, state, top: docTop(el) });
  }
  controls.sort((a, b) => a.top - b.top);
  const first = controls[0];
  return first ? { el: first.el, state: first.state } : null;
};

export const findUnfollowConfirm = (): HTMLElement | null => {
  const surfaces = `${DIALOGS}, [role="menu"]`;
  for (const el of document.querySelectorAll<HTMLElement>(`${BUTTONS}, [role="menuitem"]`)) {
    if (!isVisible(el)) continue;
    const t = textOf(el).toLowerCase();
    if (/^(yes,?\s*)?unfollow$/.test(t) || (t === 'confirm' && el.closest(surfaces))) return el;
  }
  return null;
};

export const findDialogClose = (dialog: Element): HTMLElement | null =>
  Array.from(dialog.querySelectorAll<HTMLElement>(BUTTONS)).find((b) => /\bclose\b/i.test(labelOf(b))) ?? null;

// --- Bookmarks on upcoming show cards ---

export type BookmarkState = 'bookmarked' | 'not_bookmarked';

export interface ShowBookmark {
  liveId: string;
  el: HTMLElement;
  state: BookmarkState;
}

const NOT_BOOKMARK_RE = /\b(share|copy|follow|following|buy|bid|join|watch|play|mute|unmute|volume|more|menu|close|options)\b/i;
const BOOKMARK_IDENT_RE = /bookmark|remind|save|notify/i;
const BOOKMARKED_LABEL_RE =
  /\b(bookmarked|unbookmark|remove (from )?bookmarks?|saved|unsave|reminder set|reminded|remove reminder|cancel reminder)\b/i;
const UNBOOKMARKED_LABEL_RE = /\b(bookmark|save|remind me|set reminder|add reminder|notify me)\b/i;

const isTransparent = (v: string | null) => !v || ['none', 'transparent'].includes(v.toLowerCase());

// Whatnot labels icon buttons on the <svg> inside them ("Bookmark this show"), not on the button.
export const labelOf = (el: Element) =>
  normalize(
    [
      textOf(el),
      el.getAttribute('aria-label'),
      el.getAttribute('title'),
      ...Array.from(el.querySelectorAll('[aria-label]'), (n) => n.getAttribute('aria-label')),
      ...Array.from(el.querySelectorAll('svg title'), (n) => n.textContent),
    ].join(' '),
  );

type IconShape = 'outline' | 'solid' | 'unknown';

// Whatnot's outline bookmark is one evenodd path with an inner and outer contour; a solid icon has one.
export const iconShape = (btn: Element): IconShape => {
  const svg = btn.querySelector('svg');
  if (!svg) return 'unknown';
  const fill = svg.getAttribute('fill');
  const paths = Array.from(svg.querySelectorAll('path'));
  if (paths.some((p) => !isTransparent(p.getAttribute('fill')) && !isTransparent(p.getAttribute('stroke')))) return 'solid';
  if (!isTransparent(fill) && fill?.toLowerCase() !== 'currentcolor') return 'solid';
  if (paths.some((p) => !isTransparent(p.getAttribute('stroke')) && isTransparent(p.getAttribute('fill')))) return 'outline';
  if (paths.length !== 1) return 'unknown';
  const contours = (paths[0]?.getAttribute('d')?.match(/[Mm]/g) ?? []).length;
  if (contours >= 2) return 'outline';
  if (contours === 1) return 'solid';
  return 'unknown';
};

export interface BookmarkClassification {
  state: BookmarkState;
  labeled: boolean;
}

export const classifyBookmarkButton = (btn: Element): BookmarkClassification | null => {
  const text = textOf(btn);
  const human = labelOf(btn);
  const ident = normalize(`${human} ${btn.getAttribute('data-testid') ?? ''}`);
  if (NOT_BOOKMARK_RE.test(ident)) return null;

  const labeled = BOOKMARK_IDENT_RE.test(ident);
  const iconOnly = !text && Boolean(btn.querySelector('svg'));
  if (!labeled && !iconOnly) return null;

  const pressed = btn.getAttribute('aria-pressed');
  const dataState = btn.getAttribute('data-state');
  if (pressed === 'true' || dataState === 'on' || dataState === 'checked') return { state: 'bookmarked', labeled };
  if (pressed === 'false' || dataState === 'off' || dataState === 'unchecked') return { state: 'not_bookmarked', labeled };
  if (BOOKMARKED_LABEL_RE.test(human)) return { state: 'bookmarked', labeled: true };
  const shape = iconShape(btn);
  // A static "Bookmark this show" label with a solid icon means the state lives in the icon.
  if (UNBOOKMARKED_LABEL_RE.test(human)) return { state: shape === 'solid' ? 'bookmarked' : 'not_bookmarked', labeled: true };
  if (!iconOnly) return null;
  return { state: shape === 'solid' ? 'bookmarked' : 'not_bookmarked', labeled };
};

export const liveIdFromHref = (href: string | null) => href?.match(/\/live\/([^/?#]+)/)?.[1] ?? null;

const SHOW_CARD = 'section[data-testid="livestream-card"]';
const SHOW_PLACEHOLDER = '[data-type="SkeletonItem"]';

// Prefer Whatnot's own card marker; otherwise a show card is the smallest ancestor of a /live/
// link that holds a button, covers only that one show, and has no product/listing links.
export const findShowCards = (): { liveId: string; card: HTMLElement }[] => {
  const currentLive = liveIdFromHref(location.pathname);
  const cards = new Map<string, HTMLElement>();
  const cardSelector = overrides().showCard ?? SHOW_CARD;
  for (const card of document.querySelectorAll<HTMLElement>(cardSelector)) {
    if (!isVisible(card)) continue;
    const liveId = liveIdFromHref(card.querySelector('a[href*="/live/"]')?.getAttribute('href') ?? null);
    if (liveId && liveId !== currentLive && !cards.has(liveId)) cards.set(liveId, card);
  }
  if (cards.size > 0) return Array.from(cards, ([liveId, card]) => ({ liveId, card }));

  for (const link of document.querySelectorAll<HTMLAnchorElement>('a[href*="/live/"]')) {
    if (!isVisible(link)) continue;
    const liveId = liveIdFromHref(link.getAttribute('href'));
    if (!liveId || liveId === currentLive || cards.has(liveId)) continue;
    let node = link.parentElement;
    for (let depth = 0; depth < 6 && node && node !== document.body; depth++) {
      const otherShow = Array.from(node.querySelectorAll('a[href*="/live/"]')).some(
        (a) => liveIdFromHref(a.getAttribute('href')) !== liveId,
      );
      if (otherShow) break;
      if (node.querySelector('a[href*="/listing"], a[href*="/product"], a[href*="/item"]')) break;
      if (node.querySelector(BUTTONS)) {
        cards.set(liveId, node);
        break;
      }
      node = node.parentElement;
    }
  }
  return Array.from(cards, ([liveId, card]) => ({ liveId, card }));
};

// Pick the one bookmark control per card; skip cards where it's ambiguous rather than guess.
export const bookmarkForCard = (card: Element): { el: HTMLElement; state: BookmarkState } | null => {
  const override = overrides().bookmarkButton;
  if (override) {
    const el = card.querySelector<HTMLElement>(override);
    const c = el ? classifyBookmarkButton(el) : null;
    return el && c ? { el, state: c.state } : null;
  }
  const found: (BookmarkClassification & { el: HTMLElement })[] = [];
  for (const el of card.querySelectorAll<HTMLElement>(BUTTONS)) {
    const c = classifyBookmarkButton(el);
    if (c) found.push({ ...c, el });
  }
  const labeled = found.filter((f) => f.labeled);
  const pick = labeled.length === 1 ? labeled[0] : labeled.length === 0 && found.length === 1 ? found[0] : null;
  return pick ? { el: pick.el, state: pick.state } : null;
};

export const findShowBookmarks = (): ShowBookmark[] =>
  findShowCards().flatMap(({ liveId, card }) => {
    const b = bookmarkForCard(card);
    return b && isVisible(b.el) ? [{ liveId, ...b }] : [];
  });

// The shows grid ends in placeholder cards; Whatnot fetches the next batch when they scroll into view.
export const findShowPlaceholder = (): HTMLElement | null => {
  const cardSelector = overrides().showCard ?? SHOW_CARD;
  return (
    Array.from(document.querySelectorAll<HTMLElement>(SHOW_PLACEHOLDER)).find(
      (p) => isVisible(p) && p.parentElement?.querySelector(cardSelector),
    ) ?? null
  );
};

export const findExpandShowsButton = (): HTMLElement | null => {
  for (const el of document.querySelectorAll<HTMLElement>(`${BUTTONS}, a`)) {
    if (!isVisible(el) || el.closest(SITE_CHROME)) continue;
    if (!/^(see|view|show|load)\s+(all|more)(\s+shows)?$/i.test(textOf(el))) continue;
    if (el instanceof HTMLAnchorElement) {
      const href = el.getAttribute('href') ?? '';
      if (href && !href.startsWith('#') && !/show|upcoming/i.test(href)) continue;
    }
    return el;
  }
  return null;
};

export const findShowsScrollContainer = (): HTMLElement => {
  for (const dialog of document.querySelectorAll<HTMLElement>(DIALOGS)) {
    if (!isVisible(dialog)) continue;
    for (const node of [dialog, ...dialog.querySelectorAll<HTMLElement>('div, section, ul')]) {
      if (node.scrollHeight > node.clientHeight + 60 && /auto|scroll/i.test(getComputedStyle(node).overflowY)) return node;
    }
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
};

const CLOCK_RE = /\d{1,2}:\d{2}\s*(am|pm)?/i;

// Card text reads "host / Fri 6:30 AM / 20 / Show title / categories", or "host / Live · 61 / Show
// title" for a show on now. The thumbnail link carries the time or Live badge, so the title is the
// /live/ link whose text is neither.
const LIVE_BADGE_RE = /^live\b(\s*·\s*[\d.,]+k?)?$/i;
export const describeShowCard = (card: Element) => {
  const lines = (card as HTMLElement).innerText?.split('\n').map((l) => l.trim()).filter(Boolean) ?? [];
  const timeText = lines.find((l) => CLOCK_RE.test(l)) ?? null;
  const notTitle = (t: string) => CLOCK_RE.test(t) || LIVE_BADGE_RE.test(t);
  const titles = Array.from(card.querySelectorAll('a[href*="/live/"]'), (a) => textOf(a)).filter((t) => t && !notTitle(t));
  const host = card.querySelector('a[href^="/user/"]')?.getAttribute('href')?.split('/')[2] ?? null;
  return { timeText, title: titles[0] ?? lines.find((l) => !notTitle(l) && l !== host && !/^\d+$/.test(l)) ?? '', host };
};

// --- Live show page ---

const SHARE_TARGETS: Record<ShareTarget, { selectors: string[]; hrefs: string[]; labels: RegExp[] }> = {
  copy: { selectors: ['[data-testid="share-copy-link-button"]'], hrefs: [], labels: [/^copy\s*link$/i, /copy\s*(link|url)/i] },
  x: { selectors: [], hrefs: ['x.com/intent', 'twitter.com/intent'], labels: [/^(x|twitter)$/i] },
  facebook: { selectors: ['[data-testid="share-facebook-link"]'], hrefs: ['facebook.com/sharer'], labels: [/^facebook$/i] },
};

// "Continue with Facebook" and other login buttons also mention share networks.
const NOT_A_SHARE_TARGET = /continue with|log ?in|sign ?(in|up)|oauth/i;

export const findShareButton = (): HTMLElement | null => {
  const custom = overrides().shareButton;
  for (const sel of [custom, '[data-testid="show-share-button"]', 'button[aria-label="Share" i]'].filter(Boolean) as string[]) {
    const el = Array.from(document.querySelectorAll<HTMLElement>(sel)).find(isVisible);
    if (el) return el;
  }
  return Array.from(document.querySelectorAll<HTMLElement>(BUTTONS)).find((el) => isVisible(el) && /^share$/i.test(labelOf(el))) ?? null;
};

export const findShareTarget = (target: ShareTarget): HTMLElement | null => {
  const spec = SHARE_TARGETS[target];
  const custom = overrides().shareTargets?.[target];
  const ok = (el: HTMLElement | null | undefined): el is HTMLElement =>
    isVisible(el) && !NOT_A_SHARE_TARGET.test(`${labelOf(el)} ${el.getAttribute('href') ?? ''}`);
  for (const sel of [custom, ...spec.selectors].filter(Boolean) as string[]) {
    const el = Array.from(document.querySelectorAll<HTMLElement>(sel)).find(ok);
    if (el) return el;
  }
  for (const href of spec.hrefs) {
    const el = Array.from(document.querySelectorAll<HTMLElement>(`a[href*="${href}"]`)).find(ok);
    if (el) return el;
  }
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(`${BUTTONS}, a, [role="menuitem"]`)).filter(ok);
  for (const re of spec.labels) {
    const el = candidates.find((c) => {
      const label = labelOf(c);
      return label.length <= 32 && re.test(label);
    });
    if (el) return el;
  }
  return null;
};

// Phones that aren't logged in (or don't request the desktop site) get a "Continue on Whatnot"
// app screen in place of the show.
export const findAppBlock = (): boolean =>
  Array.from(document.querySelectorAll('[data-testid*="mobile-block" i]')).some(isVisible);

// Fallback when the show feed hasn't named the host: the host's profile link sits in the player
// header, above chat usernames, and the site header (your own avatar) is excluded.
export const findLiveHost = (): string | null => {
  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="/user/"]')).filter(
    (a) => isVisible(a) && !a.closest(`${SITE_CHROME}, header`),
  );
  links.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
  return links[0]?.getAttribute('href')?.split('/')[2]?.split(/[?#]/)[0] || null;
};

export const findStreamVideo = (): HTMLVideoElement | null => {
  const area = (v: HTMLVideoElement) => {
    const r = v.getBoundingClientRect();
    return r.width * r.height;
  };
  return (
    Array.from(document.querySelectorAll('video'))
      .filter((v) => v.readyState >= 2 && v.videoWidth > 0 && isVisible(v))
      .sort((a, b) => area(b) - area(a))[0] ?? null
  );
};

// Bid buttons read "Bid $25" / "$25"; a custom selector covers redesigns.
export const findBidButtons = (): HTMLElement[] => {
  const custom = overrides().bidButton;
  const nodes = document.querySelectorAll<HTMLElement>(custom ?? BUTTONS);
  return Array.from(nodes).filter((el) => {
    if (!isVisible(el) || el.closest(SITE_CHROME)) return false;
    if (custom) return true;
    const label = labelOf(el);
    return /^(place\s+)?bid\b|^\$\s?\d/i.test(label) && !/buy\s*now|save|notify/i.test(label);
  });
};

// The chat box reads "Say something..."; it's disabled when you can't chat (logged out, muted).
export const findChatInput = (): HTMLInputElement | null =>
  Array.from(
    document.querySelectorAll<HTMLInputElement>('input[data-testid="chat-input"], input[placeholder^="say something" i]'),
  ).find((el) => isVisible(el) && !el.disabled && !el.readOnly) ?? null;

// --- Live Shop drawer ---

const NAV_CHROME = 'nav, [role="navigation"], [role="banner"], header';

export const findShopTabButton = (): HTMLElement | null => {
  const byTestId = Array.from(document.querySelectorAll<HTMLElement>('[data-testid*="shop-tab" i]')).find(isVisible);
  if (byTestId) return byTestId;
  for (const el of document.querySelectorAll<HTMLElement>('[role="tab"], button, [role="button"]')) {
    if (!isVisible(el) || el.closest(NAV_CHROME)) continue;
    const text = normalize(`${textOf(el)} ${el.getAttribute('aria-label') ?? ''}`);
    if (/^shop(\s*\(\d+\)|\s+\d+|\s*·\s*\d+)?$/i.test(text)) return el;
  }
  return null;
};

export const findShopSearchInput = (): HTMLInputElement | null => {
  const explicit = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[data-testid*="shop-search" i], input[data-testid*="search-shop" i]'),
  ).find((el) => isVisible(el) && !el.disabled && !el.readOnly);
  if (explicit) return explicit;
  const chat = findChatInput();
  for (const el of document.querySelectorAll<HTMLInputElement>(
    'input[type="search"], input[placeholder*="search" i], input[aria-label*="search" i]',
  )) {
    if (el === chat || !isVisible(el) || el.disabled || el.readOnly || el.closest(NAV_CHROME)) continue;
    const hint = `${el.placeholder ?? ''} ${el.getAttribute('aria-label') ?? ''}`.toLowerCase();
    if (/say something|search whatnot/.test(hint)) continue;
    return el;
  }
  return null;
};

// --- Bidding box ---

const visibleTestId = <T extends HTMLElement = HTMLElement>(id: string) =>
  Array.from(document.querySelectorAll<T>(`[data-testid="${id}"]`)).find(isVisible) ?? null;

// "Custom" opens a dialog with preset amounts and a max-bid field; "Set Max Bid" confirms it.
export const findCustomBidButton = () => visibleTestId('show-custom-bid-button');
export const findMaxBidInput = () => visibleTestId<HTMLInputElement>('show-max-bid-input');
export const findSetMaxBidButton = () => visibleTestId('show-set-max-bid-button');

// "Shipping is $4.85 + Taxes" under the bid buttons.
export const findShippingText = () => {
  const el = document.querySelector('[data-testid="show-shipping-info"]');
  return el ? textOf(el) : null;
};

// "patriot271k is Winning!" over the bid buttons; a backup when the feed doesn't name the leader.
export const findWinningUser = (): string | null => {
  const el = document.querySelector('[data-testid="show-winning-status"]');
  return el ? (textOf(el).match(/^@?([\w.-]+)\s+is\s+winning/i)?.[1] ?? null) : null;
};

// --- Orders (Activity → Purchases) ---

export const findOrderCards = (): { id: string; lines: string[]; image: string | null }[] => {
  const byId = new Map<string, { id: string; lines: string[]; image: string | null }>();
  for (const link of document.querySelectorAll<HTMLAnchorElement>('a[href^="/order/"]')) {
    const id = link.getAttribute('href')!.split('/')[2]?.split(/[?#]/)[0];
    if (!id || byId.has(id)) continue;
    // The card is the widest ancestor whose order links all point at this one order.
    let card: HTMLElement = link;
    for (let node = link.parentElement; node && node !== document.body; node = node.parentElement) {
      const ids = new Set(Array.from(node.querySelectorAll('a[href^="/order/"]'), (a) => a.getAttribute('href')));
      if (ids.size > 1) break;
      card = node;
    }
    const lines = (card.innerText || '').split('\n');
    const image = card.querySelector('img')?.getAttribute('src') ?? null;
    byId.set(id, { id, lines, image: image?.startsWith('https://') ? image : null });
  }
  return Array.from(byId.values());
};

// A line the model can use. Chat, buttons, and viewer counts name other items and are billed on
// every appraisal. The lot title is also passed on its own; a year or a weight still counts here
// so a title that only appears on the overlay can set the melt floor.
const PROMPT_LINE =
  /\b(?:pcgs|ngc|anacs|icg|cacg|pmg|psa|bgs|sgc|cgc|cbcs)\b|\b(?:ms|pr|pf|sp|au|xf|ef|vf|vg)\s*-?\s*\d{1,2}\b|\bcert(?:ificate)?\b|(?<![\d$.,])\d{7,9}(?![\d,.])|\$\s?\d|\b(?:1[6-9]\d\d|20\d\d)\b|\b(?:oz|ozt|grams?)\b/i;
const NOT_PROMPT_LINE = /\b(?:shipping|taxes?|viewers?|watching|followers?|giveaway|joined|is winning)\b|^(?:custom|follow|share|place bid|set max bid|bid|max bid)$/i;

export const promptLine = (text: string) => {
  const line = text.trim();
  return Boolean(line) && !NOT_PROMPT_LINE.test(line) && PROMPT_LINE.test(line);
};

// Text on and just below the player. Chat sits in that box too, so only listing lines are kept.
export const collectPlayerText = (video: HTMLVideoElement | null, ignore: (el: Element) => boolean) => {
  const r = video?.getBoundingClientRect() ?? { left: 0, right: window.innerWidth, top: 0, bottom: window.innerHeight };
  const box = { left: r.left - 40, right: r.right + 40, top: r.top - 20, bottom: Math.min(window.innerHeight, r.bottom + 260) };
  const lines: string[] = [];
  const seen = new Set<string>();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  let seenNodes = 0;
  while ((node = walker.nextNode()) && lines.length < 16 && seenNodes < 400) {
    seenNodes += 1;
    const text = normalize(node.textContent);
    const el = node.parentElement;
    if (!text || seen.has(text) || !el || ignore(el) || !promptLine(text)) continue;
    const b = el.getBoundingClientRect();
    if (!b.width || b.left < box.left || b.right > box.right || b.top < box.top || b.bottom > box.bottom) continue;
    seen.add(text);
    lines.push(text.slice(0, 120));
  }
  return lines.join('\n').slice(0, 800);
};

// --- Page identity ---

export const isLivePath = (path = location.pathname) => /^\/live\/[^/]+/i.test(path);
export const liveIdFromPath = (path = location.pathname) => liveIdFromHref(path);

export const isProfilePath = (path = location.pathname) => /^\/user\/[^/]+/i.test(path);
export const isLoginPath = (path = location.pathname) => /\/(login|signin|sign-in|signup|sign-up)\b/i.test(path);

export const profileMissing = () => {
  const heading = document.querySelector('h1');
  return /page not found|user not found|doesn.t exist|couldn.t find|404/i.test(
    `${document.title} ${heading ? textOf(heading) : ''}`,
  );
};
