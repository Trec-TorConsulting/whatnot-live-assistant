// Floating control for the phone: one big Start/Stop button, the delay and share option, and a
// status line. It lives in a closed-off shadow root so Whatnot's page (and our own Share-button
// search) never sees its buttons.
import type { ShareTarget } from '../shared/types';
import { TARGET_LABEL, type LoopStatus } from './loop';
import { DELAY_CEILING_SEC, DELAY_FLOOR_SEC, type PhoneSettings } from './settings';

const HOST_ID = 'wn2-phone-share';
const DRAG_SLOP_PX = 6;

export interface PanelOptions {
  version: string;
  settings: () => PhoneSettings;
  onToggle: () => void;
  onSettings: (patch: Partial<PhoneSettings>) => void;
}

// "Request Desktop Website" lays the page out ~980px wide and shrinks it to fit the phone, which
// would shrink the panel too. Scale it back up so the buttons stay finger-sized.
export const panelScale = (layoutWidth: number, screenWidth: number) =>
  screenWidth > 0 ? Math.min(3, Math.max(1, layoutWidth / screenWidth)) : 1;

const isModal = (d: Element) => {
  try {
    return d.matches(':modal');
  } catch {
    return false;
  }
};

export const topModalDialog = (): HTMLDialogElement | null =>
  Array.from(document.querySelectorAll<HTMLDialogElement>('dialog[open]')).filter(isModal).pop() ?? null;

const STYLE = `
  :host { all: initial; }
  .wrap {
    position: fixed; z-index: 2147483647; left: 0; top: 0; transform-origin: top left;
    font: 500 14px/1.35 -apple-system, system-ui, sans-serif; color: #f9fafb;
    -webkit-user-select: none; user-select: none; touch-action: none;
  }
  .card {
    width: 240px; padding: 10px 12px 12px; border-radius: 14px;
    background: rgba(17, 24, 39, 0.94); box-shadow: 0 6px 24px rgba(0, 0, 0, 0.45);
  }
  .head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; cursor: grab; }
  .title { flex: 1; font-weight: 700; }
  .ver { color: #9ca3af; font-size: 11px; font-weight: 500; }
  .icon { border: 0; background: #374151; color: #f9fafb; border-radius: 8px; width: 32px; height: 28px; font-size: 16px; }
  button, input, select { font-family: inherit; }
  .go { width: 100%; height: 48px; border: 0; border-radius: 10px; font-size: 17px; font-weight: 700; background: #fde047; color: #111827; }
  .go.on { background: #ef4444; color: #fff; }
  .status { margin: 8px 0 10px; min-height: 2.7em; color: #d1d5db; font-size: 13px; }
  label { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 6px; }
  input[type=number], select {
    font-size: 16px; color: #111827; background: #f9fafb; border: 0; border-radius: 8px;
    padding: 6px 8px; width: 120px; box-sizing: border-box;
  }
  input[type=checkbox] { width: 22px; height: 22px; }
  .hint { color: #9ca3af; font-size: 11px; margin-top: 8px; }
  .pill {
    display: none; min-width: 56px; height: 44px; padding: 0 14px; border: 0; border-radius: 22px;
    font-size: 15px; font-weight: 700; background: #fde047; color: #111827; box-shadow: 0 6px 24px rgba(0, 0, 0, 0.45);
  }
  .pill.on { background: #ef4444; color: #fff; }
  .wrap.min .card { display: none; }
  .wrap.min .pill { display: block; }
`;

export const createPanel = (opts: PanelOptions) => {
  const host = document.createElement('div');
  host.id = HOST_ID;
  const root = host.attachShadow({ mode: 'closed' });
  const targets = (Object.keys(TARGET_LABEL) as ShareTarget[])
    .map((t) => `<option value="${t}">${TARGET_LABEL[t]}</option>`)
    .join('');
  root.innerHTML = `
    <style>${STYLE}</style>
    <div class="wrap">
      <div class="card">
        <div class="head" data-drag>
          <span class="title">Auto Share <span class="ver">v${opts.version}</span></span>
          <button class="icon" data-min aria-label="Minimize">–</button>
        </div>
        <button class="go" data-go>Start sharing</button>
        <div class="status" data-status>Ready</div>
        <label>Delay (seconds)
          <input type="number" data-delay inputmode="decimal" min="${DELAY_FLOOR_SEC}" max="${DELAY_CEILING_SEC}" step="0.5">
        </label>
        <label>Share via <select data-target>${targets}</select></label>
        <label>Keep my clipboard <input type="checkbox" data-quiet></label>
        <div class="hint">Keep Safari open on this show with the screen on. Drag the title to move.</div>
      </div>
      <button class="pill" data-pill data-drag>Share</button>
    </div>`;

  const $ = <T extends Element>(sel: string) => root.querySelector<T>(sel)!;
  const wrap = $<HTMLDivElement>('.wrap');
  const go = $<HTMLButtonElement>('[data-go]');
  const pill = $<HTMLButtonElement>('[data-pill]');
  const statusEl = $<HTMLDivElement>('[data-status]');
  const delay = $<HTMLInputElement>('[data-delay]');
  const target = $<HTMLSelectElement>('[data-target]');
  const quiet = $<HTMLInputElement>('[data-quiet]');

  const syncInputs = () => {
    const s = opts.settings();
    delay.value = String(s.delaySec);
    target.value = s.target;
    quiet.checked = s.quiet;
  };

  let scale = 1;
  const place = () => {
    scale = panelScale(window.innerWidth, window.screen?.width ?? window.innerWidth);
    wrap.style.transform = `scale(${scale})`;
    const rect = wrap.getBoundingClientRect();
    const { pos } = opts.settings();
    const left = Math.max(0, (window.innerWidth - rect.width) * pos.x);
    const top = Math.max(0, (window.innerHeight - rect.height) * pos.y);
    wrap.style.left = `${left}px`;
    wrap.style.top = `${top}px`;
  };

  // Drag by the title or the pill; a short tap on the pill still expands it.
  let drag: { id: number; dx: number; dy: number; x0: number; y0: number; moved: boolean } | null = null;
  wrap.addEventListener('pointerdown', (e) => {
    const handle = (e.target as Element).closest('[data-drag]');
    if (!handle || (e.target as Element).closest('[data-min]')) return;
    const rect = wrap.getBoundingClientRect();
    drag = { id: e.pointerId, dx: e.clientX - rect.left, dy: e.clientY - rect.top, x0: e.clientX, y0: e.clientY, moved: false };
    wrap.setPointerCapture?.(e.pointerId);
  });
  wrap.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < DRAG_SLOP_PX) return;
    drag.moved = true;
    e.preventDefault();
    const rect = wrap.getBoundingClientRect();
    const left = Math.min(Math.max(0, e.clientX - drag.dx), window.innerWidth - rect.width);
    const top = Math.min(Math.max(0, e.clientY - drag.dy), window.innerHeight - rect.height);
    wrap.style.left = `${left}px`;
    wrap.style.top = `${top}px`;
  });
  const endDrag = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const moved = drag.moved;
    drag = null;
    if (!moved) return;
    const rect = wrap.getBoundingClientRect();
    const spanX = Math.max(1, window.innerWidth - rect.width);
    const spanY = Math.max(1, window.innerHeight - rect.height);
    opts.onSettings({ pos: { x: rect.left / spanX, y: rect.top / spanY } });
    suppressClick = true;
  };
  let suppressClick = false;
  wrap.addEventListener('pointerup', endDrag);
  wrap.addEventListener('pointercancel', endDrag);

  const minimize = (min: boolean) => {
    wrap.classList.toggle('min', min);
    place();
  };
  $('[data-min]').addEventListener('click', () => minimize(true));
  pill.addEventListener('click', () => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    minimize(false);
  });
  root.querySelector('.head')!.addEventListener('click', () => {
    suppressClick = false;
  });
  go.addEventListener('click', () => opts.onToggle());
  delay.addEventListener('change', () => {
    opts.onSettings({ delaySec: Number(delay.value) });
    syncInputs();
  });
  target.addEventListener('change', () => opts.onSettings({ target: target.value as ShareTarget }));
  quiet.addEventListener('change', () => opts.onSettings({ quiet: quiet.checked }));

  window.addEventListener('resize', place);
  window.visualViewport?.addEventListener('resize', place);

  // Taps on the panel stop here, so Whatnot doesn't read them as a tap outside its share menu.
  for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'click']) {
    host.addEventListener(type, (e) => e.stopPropagation());
  }

  syncInputs();

  let wanted = false;
  // Whatnot's share menu is a modal <dialog>, which makes everything outside it untappable, so the
  // panel moves into whichever modal is on top and back out when it closes.
  const dock = () => {
    if (!wanted) return;
    const parent = topModalDialog() ?? document.documentElement;
    if (host.parentNode === parent) return;
    const fresh = !host.isConnected;
    parent.appendChild(host);
    if (fresh) place();
  };

  return {
    element: host,
    show: () => {
      wanted = true;
      dock();
    },
    hide: () => {
      wanted = false;
      host.remove();
    },
    dock,
    setStatus: (s: LoopStatus) => {
      go.textContent = s.running ? 'Stop' : 'Start sharing';
      go.classList.toggle('on', s.running);
      pill.classList.toggle('on', s.running);
      pill.textContent = s.running ? `■ ${s.sent}` : 'Share';
      statusEl.textContent = s.message;
    },
    // Exposed for tests: the panel's own controls.
    controls: { go, pill, delay, target, quiet, status: statusEl },
  };
};

export type Panel = ReturnType<typeof createPanel>;
