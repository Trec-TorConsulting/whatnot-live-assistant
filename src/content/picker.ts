// Two-step picker for the share buttons: click Whatnot's Share button, then the share option.
// Clicks pass through, so the menu opens for step 2 and the step 2 click shares once.
import { send, type Result } from '../shared/messages';
import { MINUTE } from '../shared/time';
import type { ShareTarget } from '../shared/types';
import { isVisible } from './dom';
import { overlay } from './overlay';

const TARGET_LABEL: Record<ShareTarget, string> = { copy: 'Copy link', x: 'X', facebook: 'Facebook' };
const CLICKABLE = 'button, [role="button"], [role="menuitem"], a';

let step: 0 | 1 | 2 = 0;
let target: ShareTarget = 'copy';
let shareSelector: string | null = null;
let hovered: { el: HTMLElement; outline: string } | null = null;
let timeout: ReturnType<typeof setTimeout> | undefined;

const quoted = (v: string) => v.replace(/["\\]/g, '\\$&');

const unique = (sel: string, el: Element) => {
  try {
    return Array.from(document.querySelectorAll(sel)).filter(isVisible)[0] === el;
  } catch {
    return false;
  }
};

// Prefers stable hooks (id, test id, aria-label), then a short tag path, lengthened until the
// selector finds this element first.
export const buildSelector = (el: Element): string | null => {
  if (el.id && !/\d{4,}/.test(el.id) && unique(`#${CSS.escape(el.id)}`, el)) return `#${CSS.escape(el.id)}`;
  const testId = el.getAttribute('data-testid');
  if (testId && unique(`[data-testid="${quoted(testId)}"]`, el)) return `[data-testid="${quoted(testId)}"]`;
  const aria = el.getAttribute('aria-label');
  const tag = el.tagName.toLowerCase();
  if (aria && unique(`${tag}[aria-label="${quoted(aria)}"]`, el)) return `${tag}[aria-label="${quoted(aria)}"]`;

  const parts: string[] = [];
  for (let cur: Element | null = el; cur && cur !== document.body && parts.length < 10; cur = cur.parentElement) {
    let part = cur.tagName.toLowerCase();
    const parent: Element | null = cur.parentElement;
    if (parent) {
      const same = Array.from(parent.children).filter((c) => c.tagName === cur!.tagName);
      if (same.length > 1) part += `:nth-of-type(${same.indexOf(cur) + 1})`;
    }
    parts.unshift(part);
    const sel = parts.join(' > ');
    if (parts.length >= 3 && unique(sel, el)) return sel;
  }
  const sel = parts.join(' > ');
  return sel && unique(sel, el) ? sel : null;
};

const clickableFrom = (node: EventTarget | null) => {
  const el = node instanceof Element ? node.closest<HTMLElement>(CLICKABLE) : null;
  return el && !overlay.isOurs(el) ? el : null;
};

const unhover = () => {
  if (hovered) hovered.el.style.outline = hovered.outline;
  hovered = null;
};

const onOver = (e: MouseEvent) => {
  const el = clickableFrom(e.target);
  if (!el || el === hovered?.el) return;
  unhover();
  hovered = { el, outline: el.style.outline };
  el.style.outline = '3px dashed #f5c518';
};

const stop = (message: string | null) => {
  step = 0;
  clearTimeout(timeout);
  unhover();
  document.removeEventListener('mouseover', onOver, true);
  document.removeEventListener('click', onClick, true);
  document.removeEventListener('keydown', onKey, true);
  if (message) overlay.notice(message, 6000);
};

const save = async (targetSelector: string | null) => {
  const selector = shareSelector;
  stop(null);
  if (!selector) return;
  const res = await send('PICK_SAVE', { target, shareButton: selector, targetSelector }).catch((err: Error) => ({ ok: false as const, error: err.message }));
  overlay.notice(
    res.ok
      ? `Saved: Share button${targetSelector ? ` + ${TARGET_LABEL[target]}` : ' (one click)'}. Sharing will use these.`
      : res.error,
    6000,
  );
};

const onClick = (e: MouseEvent) => {
  const el = clickableFrom(e.target);
  if (!el) return;
  const selector = buildSelector(el);
  if (!selector) {
    overlay.notice("Couldn't make a stable pointer to that button. Try clicking its center.", 6000);
    return;
  }
  if (step === 1) {
    shareSelector = selector;
    step = 2;
    unhover();
    overlay.notice(`Step 2: click ${TARGET_LABEL[target]} in the menu (or press Esc if Share already did it).`, MINUTE);
  } else if (step === 2) {
    void save(selector);
  }
};

const onKey = (e: KeyboardEvent) => {
  if (e.key !== 'Escape') return;
  e.preventDefault();
  if (step === 2) void save(null);
  else stop('Picking cancelled.');
};

export const startPicker = (shareTarget: ShareTarget): Result => {
  if (step) stop(null);
  target = shareTarget;
  shareSelector = null;
  step = 1;
  document.addEventListener('mouseover', onOver, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKey, true);
  timeout = setTimeout(() => stop('Picking timed out. Click Pick again to retry.'), 2 * MINUTE);
  overlay.notice("Step 1: click Whatnot's Share button on the show. Esc cancels.", MINUTE);
  return { ok: true };
};
