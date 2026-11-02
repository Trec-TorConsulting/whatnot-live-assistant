export const normalize = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

export const textOf = (el: Element) => normalize((el as HTMLElement).innerText || el.textContent);

export const isVisible = (el: Element | null | undefined): el is HTMLElement => {
  if (!(el instanceof HTMLElement) || !el.isConnected) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width < 6 || rect.height < 6) return false;
  const style = getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity || '1') > 0.05;
};

export const docTop = (el: Element) => el.getBoundingClientRect().top + window.scrollY;

// MutationObserver instead of polling: background tabs clamp timers to once a second or slower.
export const waitFor = <T>(find: () => T | null | undefined | false, timeoutMs: number): Promise<T | null> =>
  new Promise((resolve) => {
    const initial = find();
    if (initial) {
      resolve(initial);
      return;
    }
    let done = false;
    let queued = false;
    const finish = (value: T | null) => {
      if (done) return;
      done = true;
      observer.disconnect();
      clearTimeout(timer);
      resolve(value);
    };
    const observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        const found = find();
        if (found) finish(found);
      });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
    const timer = setTimeout(() => finish(find() || null), timeoutMs);
  });

export const scrollIntoViewIfNeeded = (el: HTMLElement) => {
  const rect = el.getBoundingClientRect();
  if (rect.top < 60 || rect.bottom > window.innerHeight - 60) el.scrollIntoView({ block: 'center', behavior: 'instant' });
};

// React owns an input's value, so it's set through the native setter and announced with an input
// event; assigning .value alone would be undone on the next render.
export const setReactValue = (input: HTMLInputElement, text: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, text);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.focus();
  input.setSelectionRange?.(text.length, text.length);
};

// React and Radix listen on pointer/mouse down/up, so send the whole sequence before the click.
export const clickLikeUser = (el: HTMLElement) => {
  const rect = el.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const init: PointerEventInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    clientX: x,
    clientY: y,
    button: 0,
    buttons: 1,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
  };
  el.dispatchEvent(new PointerEvent('pointerdown', init));
  el.dispatchEvent(new MouseEvent('mousedown', init));
  el.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
  el.dispatchEvent(new MouseEvent('mouseup', { ...init, buttons: 0 }));
  el.click();
};
