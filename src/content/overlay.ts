// A small shadow-DOM panel on live pages: bid guard, wheel status or appraisal card, share status.
import type { CasePackView } from '../shared/casePack';
import type { ElectronicsView } from '../shared/electronics';
import type { EstateView } from '../shared/estate';
import type { RunnerView } from '../shared/runner';
import { DEFAULT_OVERLAY_PREFS, type OverlayPrefs } from '../shared/storage';

const HOST_ID = 'wn2-overlay';

export interface Fact {
  label: string;
  value: string;
  detail: string | null;
}
export type WheelFact = Fact;

export interface WheelView {
  title: string;
  spots: string;
  value: string;
  verdict: string;
  level: 'worth' | 'not_worth' | 'unclear';
  facts: WheelFact[];
  warnings: string[];
}

export interface GuardView {
  lotTitle: string | null;
  bid: string;
  ceiling: string | null;
  level: 'ok' | 'near' | 'over';
  reasons: string[];
  you?: 'leading' | 'outbid' | null;
  // The watchlist entry this lot matched.
  watch?: string | null;
  perOz?: string | null;
  allIn?: string | null;
  // A hedged note about the top bidder (host, moderator, or someone who keeps leading and never wins).
  pusher?: string | null;
}

export interface SellerView {
  host: string;
  note: string | null;
  blocked: boolean;
  history: string | null;
  thisShow: number;
  profile?: string | null;
  caution?: string | null;
  closes?: string | null;
}

export interface ShopHitView {
  id?: string;
  title?: string;
  quantity?: number;
  mode?: 'bin' | 'auction';
  kind: 'steal' | 'deal' | 'must';
  label: string;
  text: string;
}

export interface ShopView {
  summary: string;
  hits: ShopHitView[];
  perPieceRows?: string[];
  filter?: 'all' | 'bin';
  hasAuctions?: boolean;
  coupons?: string[];
}

export interface ToolsView {
  spot: string | null;
  templates: string[];
}

export interface QuickBidButton {
  kind: 'plus1' | 'plus5' | 'max';
  label: string;
  // Green within your ceiling, red over it or over market value; null when there's nothing to check against.
  verdict?: 'ok' | 'over' | null;
  note?: string | null;
}

// Most important first: what it is, the max bid, why it's worth bidding, the numbers behind it, and
// what to watch out for.
export interface AppraisalView {
  status: 'pending' | 'quick' | 'done' | 'error';
  title: string;
  subtitle: string | null;
  highlight: string | null;
  // Under the max bid: what the item is worth and which model answered, so a max bid well under a
  // seller's quote reads as the bid rule rather than a low value.
  valueLine?: string | null;
  reasons: string[];
  facts: Fact[];
  cautions: string[];
  footer: string | null;
  similar: string[];
  // What to check before trusting it, by kind of item.
  checks?: string[];
  // Against your collection: "Needed for your set: …" or "You own 2 like this".
  owned?: string | null;
}

// General appraises only the presented item; Scan also lists the rest of the table afterwards.
export interface ScanView {
  scan: boolean;
}

interface State {
  collapsed: boolean;
  guard: GuardView | null;
  wheel: WheelView | null;
  appraisal: AppraisalView | null;
  scan: ScanView | null;
  share: string | null;
  sharing: boolean;
  notice: string | null;
  seller: SellerView | null;
  shop: ShopView | null;
  estate: EstateView | null;
  electronics: ElectronicsView | null;
  runner: RunnerView | null;
  casePack: CasePackView | null;
  tools: ToolsView | null;
  quickBids: QuickBidButton[];
  checksOpen: boolean;
}

const state: State = {
  quickBids: [],
  checksOpen: false,
  collapsed: false,
  guard: null,
  wheel: null,
  appraisal: null,
  scan: null,
  share: null,
  sharing: false,
  notice: null,
  seller: null,
  shop: null,
  estate: null,
  electronics: null,
  runner: null,
  casePack: null,
  tools: null,
};
let host: HTMLElement | null = null;
let root: ShadowRoot | null = null;
// A newer copy of the extension took over this tab and draws its own panel under the same id.
let detached = false;
// The show-type picker has its own part: the lot redraws with every bid, which would close an open menu.
let parts: { panel: HTMLElement; head: HTMLElement; bids: HTMLElement; picker: HTMLElement; lot: HTMLElement; body: HTMLElement; tools: HTMLElement } | null = null;
let shown = { head: '', bids: '', picker: '', lot: '', body: '', tools: '' };
let flashTimer: ReturnType<typeof setTimeout> | undefined;
// The panel sits on the bottom edge, so shrinking moves everything above it. Its height holds while
// you stay in one mode (wheel, appraisal, collapsed) and resets when the mode changes.
const SHRINK_AFTER_MS = 8000;
let floor = { mode: '', px: 0, shorterSince: 0 };
let shrinkTimer: ReturnType<typeof setTimeout> | undefined;
let handlers: {
  appraise?: () => void;
  pasteToChat?: (view: AppraisalView) => void;
  chatText?: (text: string) => void;
  quickBid?: (kind: QuickBidButton['kind']) => void;
  savePrefs?: (prefs: OverlayPrefs) => void;
  pickScan?: (scan: boolean) => void;
  shopRescan?: () => void;
  shopFocus?: (title: string) => void;
  shopDismiss?: (id: string) => void;
  shopFilter?: (mode: 'all' | 'bin') => void;
} = {};
let noticeTimer: ReturnType<typeof setTimeout> | undefined;
let prefs: OverlayPrefs = DEFAULT_OVERLAY_PREFS;
let drag: { dx: number; dy: number } | null = null;
// Document Picture-in-Picture: an always-on-top window you can drag to another monitor. The panel
// itself moves into it, so it keeps updating; closing the window puts it back on the page.
let popped: Window | null = null;

interface DocumentPip {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
}
const documentPip = () => (window as unknown as { documentPictureInPicture?: DocumentPip }).documentPictureInPicture ?? null;

const HEAD_MIN_VISIBLE = 40;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const STYLE = `
  :host { all: initial; }
  .panel { position: fixed; left: 12px; bottom: 12px; z-index: 2147483646; width: 340px; max-height: 70vh; overflow: auto; box-sizing: border-box;
    font: 13px/1.45 system-ui, sans-serif; color: #e8eaef; background: rgba(15,17,21,0.94); border: 1px solid #2a2f3a;
    border-radius: 10px; box-shadow: 0 6px 24px rgba(0,0,0,0.4); scrollbar-width: thin; scrollbar-color: #3a4150 transparent; }
  :host(.popped) .panel { position: static; width: auto; max-height: none; min-height: 100vh; border: 0; border-radius: 0; box-shadow: none; }
  .head { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-bottom: 1px solid #2a2f3a; cursor: grab; user-select: none; touch-action: none; }
  :host(.popped) .head { cursor: default; }
  .head button { cursor: pointer; }
  .title { font-weight: 700; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  button.icon { padding: 3px 6px; }
  button { font: inherit; font-weight: 600; border-radius: 6px; padding: 3px 8px; border: 1px solid #2a2f3a; background: transparent; color: #e8eaef; cursor: pointer; }
  button.primary { background: #f5c518; color: #14161b; border-color: #f5c518; }
  .body { padding: 8px; display: flex; flex-direction: column; gap: 8px; }
  .row { padding: 6px 8px; border-radius: 6px; background: #181b22; border: 1px solid #2a2f3a; }
  .lot-strip { box-sizing: border-box; height: 42px; padding: 4px 8px; border-radius: 6px; background: #181b22; border: 1px solid #2a2f3a;
    display: flex; flex-direction: column; justify-content: center; overflow: hidden; }
  .lot-strip.near { border-color: #f59e0b; }
  .lot-strip.over { border-color: #ef4444; background: rgba(239,68,68,0.12); }
  .strip-bid { font-size: 13px; font-variant-numeric: tabular-nums; }
  .row.near { border-color: #f59e0b; }
  .row.over { border-color: #ef4444; background: rgba(239,68,68,0.12); }
  .row.worth { border-color: #22c55e; background: rgba(34,197,94,0.1); }
  .good { color: #22c55e; font-weight: 600; }
  .bad { color: #ef4444; font-weight: 600; }
  .muted { color: #9aa3b2; }
  .facts { display: grid; grid-template-columns: minmax(84px, max-content) 1fr; gap: 5px 10px; margin: 6px 0 0; padding-top: 6px; border-top: 1px solid #2a2f3a; align-items: baseline; }
  .facts dt { color: #9aa3b2; }
  .facts dd { margin: 0; min-width: 0; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  .facts dd .muted { font-size: 12px; overflow-wrap: anywhere; }
  .wheel-name { font-weight: 700; overflow-wrap: anywhere; }
  .wheel-spots { color: #c9cfda; font-variant-numeric: tabular-nums; }
  .wrap { overflow-wrap: anywhere; }
  .one-line { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .big { font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .notice { color: #f59e0b; font-weight: 600; }
  ul { margin: 4px 0 0; padding-left: 16px; }
  .appraisal-head, .shop-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 6px; }
  .max-bid { margin-top: 4px; font-size: 16px; font-weight: 800; color: #22c55e; font-variant-numeric: tabular-nums; }
  .value-line { font-size: 12px; font-variant-numeric: tabular-nums; }
  ul.reasons, ul.cautions { list-style: none; padding: 0; margin: 6px 0 0; display: flex; flex-direction: column; gap: 3px; }
  ul.reasons li::before { content: '★ '; color: #f5c518; }
  ul.reasons li { color: #f3e7b3; font-weight: 600; }
  ul.cautions li::before { content: '⚠ '; }
  ul.cautions li { color: #f59e0b; }
  .footer { margin-top: 6px; font-size: 11px; }
  .card-actions { display: flex; justify-content: flex-end; gap: 6px; margin-top: 6px; }
  .row.blocked { border-color: #ef4444; background: rgba(239,68,68,0.12); }
  .tools { display: flex; flex-direction: column; gap: 6px; padding: 0 8px 8px; }
  .tools:empty { display: none; }
  .tool-row, .quick { display: flex; align-items: center; gap: 6px; }
  .quick { padding: 6px 8px 0; }
  .quick:empty { display: none; }
  .quick button { flex: 1; }
  .quick button.ok { background: #22c55e; color: #0f1115; border-color: #22c55e; }
  .quick button.over { background: #ef4444; color: #fff; border-color: #ef4444; }
  ul.checks { margin: 4px 0 0; padding-left: 16px; color: #c9cfda; }
  .tools select { flex: 1; min-width: 0; font: inherit; color: #e8eaef; background: #181b22; border: 1px solid #2a2f3a; border-radius: 6px; padding: 2px 4px; }
  .tools .spot { font-size: 12px; white-space: nowrap; }
  .top-lock { position: sticky; top: 0; z-index: 2; background: rgba(15,17,21,0.98); }
  .lot-block { display: flex; flex-direction: column; gap: 8px; padding: 8px 8px 0; }
  .lot-block:empty { display: none; }
  @keyframes wn2-flash { 0%, 100% { box-shadow: 0 6px 24px rgba(0,0,0,0.4); } 50% { box-shadow: 0 0 0 3px #f5c518, 0 6px 24px rgba(0,0,0,0.4); } }
  .panel.flash { animation: wn2-flash 0.4s ease-in-out 3; }
  .picker { display: flex; align-items: center; gap: 6px; padding: 6px 8px; }
  .picker:empty { display: none; }
  .picker select { flex: 1; min-width: 0; font: inherit; color: #e8eaef; background: #181b22; border: 1px solid #2a2f3a; border-radius: 6px; padding: 2px 4px; }
  .shop-hit { cursor: pointer; }
  .shop-hit:hover { text-decoration: underline; }
  button.shop-dismiss { padding: 0 4px; font-size: 11px; line-height: 1.2; margin-left: 4px; opacity: 0.75; }
  button.shop-dismiss:hover { opacity: 1; }
`;

const ensure = () => {
  if (host?.isConnected && root && parts) return parts;
  document.getElementById(HOST_ID)?.remove();
  host = document.createElement('div');
  host.id = HOST_ID;
  root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${STYLE}</style><div class="panel"><div class="top-lock"><div class="head"></div><div class="picker"></div></div><div class="lot-block"></div><div class="quick"></div><div class="main"></div><div class="tools"></div></div>`;
  const panel = root.querySelector<HTMLElement>('.panel')!;
  const lock = panel.querySelector<HTMLElement>('.top-lock')!;
  parts = {
    panel,
    head: lock.querySelector<HTMLElement>('.head')!,
    picker: lock.querySelector<HTMLElement>('.picker')!,
    lot: panel.querySelector<HTMLElement>('.lot-block')!,
    bids: panel.querySelector<HTMLElement>('.quick')!,
    body: panel.querySelector<HTMLElement>('.main')!,
    tools: panel.querySelector<HTMLElement>('.tools')!,
  };
  shown = { head: '', bids: '', picker: '', lot: '', body: '', tools: '' };
  floor = { mode: '', px: 0, shorterSince: 0 };
  document.documentElement.appendChild(host);
  root.addEventListener('click', (e) => {
    const action = (e.target as HTMLElement).closest('[data-action]')?.getAttribute('data-action');
    if (action === 'collapse') {
      state.collapsed = !state.collapsed;
      render();
    } else if (action === 'appraise') handlers.appraise?.();
    else if (action === 'popout') void popOut();
    else if (action === 'close') {
      if (popped) popped.close();
      else savePrefs({ ...prefs, hidden: true });
    } else if (action === 'close-appraisal') {
      state.appraisal = null;
      render();
    } else if (action === 'quickbid') {
      const kind = (e.target as HTMLElement).closest<HTMLElement>('[data-kind]')?.dataset.kind as QuickBidButton['kind'] | undefined;
      if (kind) handlers.quickBid?.(kind);
    } else if (action === 'checks') {
      state.checksOpen = !state.checksOpen;
      render();
    } else if (action === 'shop-rescan') {
      handlers.shopRescan?.();
    } else if (action === 'shop-focus') {
      const title = (e.target as HTMLElement).closest<HTMLElement>('[data-title]')?.dataset.title;
      if (title) handlers.shopFocus?.(title);
    } else if (action === 'shop-dismiss') {
      const id = (e.target as HTMLElement).closest<HTMLElement>('[data-id]')?.dataset.id;
      if (id) handlers.shopDismiss?.(id);
    } else if (action === 'shop-filter') {
      const mode = (e.target as HTMLElement).closest<HTMLElement>('[data-mode]')?.dataset.mode as 'all' | 'bin' | undefined;
      if (mode) handlers.shopFilter?.(mode);
    }
  });
  root.addEventListener('change', (e) => {
    const select = (e.target as HTMLElement).closest<HTMLSelectElement>('select[data-change]');
    if (select?.dataset.change === 'scan') handlers.pickScan?.(select.value === 'scan');
    else if (select?.dataset.change === 'auto') savePrefs({ ...prefs, autoAppraise: select.value === 'auto' });
  });
  root.addEventListener('dblclick', (e) => {
    if (!popped && (e.target as HTMLElement).closest('.title')) savePrefs({ ...prefs, pos: null });
  });
  startDrag(parts.head);
  return parts;
};

window.addEventListener('resize', () => {
  if (host && !popped) render();
});

const savePrefs = (next: OverlayPrefs) => {
  prefs = next;
  handlers.savePrefs?.(next);
  if (host) render();
};

// Drag by the header; buttons in it still click normally.
const startDrag = (head: HTMLElement) => {
  head.addEventListener('pointerdown', (e) => {
    if (popped || e.button !== 0 || (e.target as HTMLElement).closest('button') || !parts) return;
    const r = parts.panel.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    head.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  });
  head.addEventListener('pointermove', (e) => {
    if (drag) place({ left: e.clientX - drag.dx, top: e.clientY - drag.dy });
  });
  const end = () => {
    if (!drag || !parts) return;
    drag = null;
    const r = parts.panel.getBoundingClientRect();
    savePrefs({ ...prefs, pos: { left: Math.round(r.left), top: Math.round(r.top) } });
  };
  head.addEventListener('pointerup', end);
  head.addEventListener('pointercancel', end);
};

// Kept on screen: a position saved on a bigger window still leaves the header reachable.
const place = (pos: OverlayPrefs['pos']) => {
  if (!parts) return;
  const s = parts.panel.style;
  if (popped || !pos) {
    s.left = s.top = s.bottom = s.maxHeight = '';
    return;
  }
  const width = parts.panel.offsetWidth || 340;
  const left = clamp(pos.left, 0, Math.max(0, window.innerWidth - width));
  const top = clamp(pos.top, 0, Math.max(0, window.innerHeight - HEAD_MIN_VISIBLE));
  s.left = `${left}px`;
  s.top = `${top}px`;
  s.bottom = 'auto';
  s.maxHeight = `${Math.max(120, window.innerHeight - top - 12)}px`;
  s.minHeight = '';
};

const popOut = async () => {
  const pip = documentPip();
  if (!pip || popped || !host) return;
  let win: Window;
  try {
    win = await pip.requestWindow({ width: 340, height: 520 });
  } catch (err) {
    overlay.notice(`Couldn't open a separate window: ${(err as Error)?.message ?? err}`);
    return;
  }
  win.document.title = 'Whatnot Assistant';
  Object.assign(win.document.body.style, { margin: '0', background: '#0f1115' });
  popped = win;
  host.classList.add('popped');
  win.document.body.append(host);
  win.addEventListener('pagehide', () => {
    popped = null;
    if (!host) return;
    host.classList.remove('popped');
    document.documentElement.appendChild(host);
    render();
  });
  render();
};

const factsHtml = (facts: Fact[]) =>
  facts.length
    ? `<dl class="facts">${facts
      .map(
        (f) =>
          `<dt>${esc(f.label)}</dt><dd><strong>${esc(f.value)}</strong>${f.detail ? `<div class="muted" title="${esc(f.detail)}">${esc(f.detail)}</div>` : ''}</dd>`,
      )
      .join('')}</dl>`
    : '';

// Always there and always two lines, so an auction starting or selling only changes its text.
// The top line is the most urgent thing: a bid-hold notice, then a guard warning, then the lot.
const lotStrip = (g: GuardView | null, notice: string | null) => {
  const top = notice
    ? { text: notice, cls: 'notice' }
    : g?.reasons[0]
      ? { text: g.reasons[0], cls: 'bad' }
      : g?.watch
        ? { text: `★ ${g.lotTitle ?? 'Current lot'}`, cls: 'notice' }
        : { text: g ? (g.lotTitle ?? 'Current lot') : 'No auction running', cls: 'muted' };
  const all = [notice, ...(g?.reasons ?? []), g?.watch ? `On your watchlist: ${g.watch}` : null].filter(Boolean).join('\n') || top.text;
  const you = g?.you === 'leading' ? ' <span class="good">· You\'re winning</span>' : g?.you === 'outbid' ? ' <span class="bad">· Outbid</span>' : '';
  const bid = g
    ? `Bid <strong>${esc(g.bid)}</strong>${g.ceiling ? ` <span class="muted">/ max ${esc(g.ceiling)}</span>` : ''}${you}`
    : '<span class="muted">Bid —</span>';
  return `<div class="lot-strip ${g?.level ?? 'idle'}" title="${esc(all)}">
      <div class="one-line ${top.cls}">${esc(top.text)}</div>
      <div class="one-line strip-bid">${bid}</div>
    </div>`;
};

// Your note, blocklist, and history with this host. Wins in this show usually ship together.
const sellerRow = (s: SellerView | null) => {
  if (!s) return '';
  const lines = [
    s.blocked ? `<div class="bad">⛔ @${esc(s.host)} is on your blocklist</div>` : '',
    s.note ? `<div class="one-line" title="${esc(s.note)}">📝 ${esc(s.note)}</div>` : '',
    s.caution ? `<div class="notice">${esc(s.caution)}</div>` : '',
    s.history ? `<div class="muted">${esc(s.history)}</div>` : '',
    s.thisShow ? `<div class="muted">${s.thisShow} won this show; shipping usually combines</div>` : '',
  ].filter(Boolean);
  return lines.length ? `<div class="row${s.blocked ? ' blocked' : ''}">${lines.join('')}</div>` : '';
};

const estateRow = (v: EstateView | null) => {
  if (!v) return '';
  const wants = v.wants.map((w) => `<div class="${w.hit ? 'good' : 'muted'}">${esc(w.text)}</div>`).join('');
  const runs = v.runs.map((r) => `<li>${esc(r)}</li>`).join('');
  return `<div class="row" data-estate>
      ${v.line ? `<div>${esc(v.line)}</div>` : ''}
      ${v.shippingNote ? `<div class="notice">${esc(v.shippingNote)}</div>` : ''}
      ${v.rules ? `<div class="notice">${esc(v.rules)}</div>` : ''}
      ${v.clothing ? `<div>${esc(v.clothing)}</div>` : ''}
      ${wants}
      ${runs ? `<ul>${runs}</ul>` : ''}
    </div>`;
};

const electronicsRow = (v: ElectronicsView | null) => {
  if (!v) return '';
  const wants = v.wants.map((w) => `<div class="${w.hit ? 'good' : 'muted'}">${esc(w.text)}</div>`).join('');
  const runs = v.runs.map((r) => `<li>${esc(r)}</li>`).join('');
  return `<div class="row" data-electronics>
      ${v.line ? `<div>${esc(v.line)}</div>` : ''}
      ${v.specLine ? `<div>${esc(v.specLine)}</div>` : ''}
      ${v.toolsLine ? `<div>${esc(v.toolsLine)}</div>` : ''}
      ${v.accessory ? `<div class="notice">${esc(v.accessory)}</div>` : ''}
      ${v.condition ? `<div>${esc(v.condition)}</div>` : ''}
      ${v.msrp ? `<div class="muted">${esc(v.msrp)}</div>` : ''}
      ${v.suddenDeath ? `<div class="notice">${esc(v.suddenDeath)}</div>` : ''}
      ${v.shippingNote ? `<div class="notice">${esc(v.shippingNote)}</div>` : ''}
      ${v.rules ? `<div class="notice">${esc(v.rules)}</div>` : ''}
      ${wants}
      ${runs ? `<ul>${runs}</ul>` : ''}
    </div>`;
};

const runnerRow = (v: RunnerView | null) => {
  if (!v) return '';
  return `<div class="row" data-runner>
      <div>${esc(v.ladder)}</div>
      ${v.quote ? `<div>${esc(v.quote)}</div>` : ''}
      ${v.shippingNote ? `<div class="notice">${esc(v.shippingNote)}</div>` : ''}
    </div>`;
};

const casePackRow = (v: CasePackView | null) => {
  if (!v) return '';
  const runs = v.runs.map((r) => `<li>${esc(r)}</li>`).join('');
  return `<div class="row" data-casepack>
      ${v.line ? `<div>${esc(v.line)}</div>` : ''}
      ${v.conflict ? `<div class="notice">${esc(v.conflict)}</div>` : ''}
      ${v.sizeRun ? `<div>${esc(v.sizeRun)}</div>` : ''}
      ${v.claims ? `<div class="muted">${esc(v.claims)}</div>` : ''}
      ${v.breakEven ? `<div>${esc(v.breakEven)}</div>` : ''}
      ${v.shippingRules ? `<div class="notice">${esc(v.shippingRules)}</div>` : ''}
      ${v.currencyNote ? `<div class="muted">${esc(v.currencyNote)}</div>` : ''}
      ${runs ? `<ul>${runs}</ul>` : ''}
    </div>`;
};

const stockBadge = (qty: number | undefined, mode: 'bin' | 'auction' | undefined) => {
  if (mode === 'auction' || !qty || qty <= 0) return '';
  if (qty === 1) return ' <span class="notice">[1 left]</span>';
  if (qty <= 99) return ` <span class="muted">[${qty} in stock]</span>`;
  return '';
};

const shopRow = (s: ShopView | null) => {
  if (!s) return '';
  const worth = s.hits.some((h) => h.kind === 'steal');
  const filterMode = s.filter ?? 'all';
  const filterBtn = s.hasAuctions
    ? `<button class="icon" data-action="shop-filter" data-mode="${filterMode === 'bin' ? 'all' : 'bin'}" title="Toggle between Buy-It-Now only and all shop items">${filterMode === 'bin' ? 'BIN only' : 'All'}</button>`
    : '';
  const rescanBtn = `<button class="icon" data-action="shop-rescan" title="Rescan the live shop">↻</button>`;
  const items = [
    ...s.hits.map((h) => {
      const cls = h.kind === 'steal' ? 'good' : h.kind === 'deal' ? 'notice' : '';
      const stock = stockBadge(h.quantity, h.mode);
      const body = h.title
        ? `<span class="shop-hit" data-action="shop-focus" data-title="${esc(h.title)}" title="Click to find in Whatnot's shop"><span class="${cls}">${esc(h.label)}</span>${stock} ${esc(h.text)}</span>`
        : `<span class="${cls}">${esc(h.label)}</span>${stock} ${esc(h.text)}`;
      const dismiss = h.id
        ? ` <button class="icon shop-dismiss" data-action="shop-dismiss" data-id="${esc(h.id)}" title="Dismiss this item">×</button>`
        : '';
      return `<li class="shop-item">${body}${dismiss}</li>`;
    }),
    ...(s.perPieceRows ?? []).map((row) => `<li class="muted">${esc(row)}</li>`),
  ].join('');
  return `<div class="row${worth ? ' worth' : ''}" data-shop><div class="shop-head"><div class="wheel-name">Shop</div><div class="tool-row">${filterBtn}${rescanBtn}</div></div><div class="muted">${esc(s.summary)}</div>${items ? `<ul>${items}</ul>` : ''}</div>`;
};

const render = () => {
  if (detached) return;
  const p = ensure();
  const g = state.guard;
  const w = state.wheel;
  const a = state.appraisal;
  const lot = state.collapsed
    ? ''
    : `${lotStrip(g, state.notice)}
        ${g?.allIn ? `<div class="muted one-line" title="The current bid plus shipping and your sales tax (Alerts tab)">${esc(g.allIn)}</div>` : ''}
        ${g?.perOz ? `<div class="muted one-line" title="Current bid per troy ounce of metal, against today's spot price">${esc(g.perOz)}</div>` : ''}
        ${g?.pusher ? `<div class="notice" title="From who led and won lots in this show; the feed shows leaders, not every bid">${esc(g.pusher)}</div>` : ''}
        ${sellerRow(state.seller)}
        ${estateRow(state.estate)}
        ${electronicsRow(state.electronics)}
        ${runnerRow(state.runner)}
        ${casePackRow(state.casePack)}`;
  const body = state.collapsed
    ? ''
    : `<div class="body">
        ${shopRow(state.shop)}
        ${w
      ? `<div class="row ${w.level === 'worth' ? 'worth' : w.level === 'not_worth' ? 'over' : ''}">
                <div class="wheel-name">${esc(w.title)}</div>
                <div class="wheel-spots">${esc(w.spots)}</div>
                <div class="big">${esc(w.value)}</div>
                <div class="wrap ${w.level === 'worth' ? 'good' : w.level === 'not_worth' ? 'bad' : 'muted'}">${esc(w.verdict)}</div>
                ${factsHtml(w.facts)}
                ${w.warnings.map((l) => `<div class="notice">${esc(l)}</div>`).join('')}
              </div>`
      : ''
    }
        ${a
      ? `<div class="row">
                <div class="appraisal-head"><span class="big">${esc(a.title)}</span><button class="icon" data-action="close-appraisal" title="Close">×</button></div>
                ${a.subtitle ? `<div class="muted">${esc(a.subtitle)}</div>` : ''}
                ${a.highlight ? `<div class="max-bid">${esc(a.highlight)}</div>` : ''}
                ${a.valueLine ? `<div class="muted value-line">${esc(a.valueLine)}</div>` : ''}
                ${a.reasons.length ? `<ul class="reasons">${a.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
                ${factsHtml(a.facts)}
                ${a.cautions.length ? `<ul class="cautions">${a.cautions.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
                ${a.owned ? `<div class="notice">${esc(a.owned)}</div>` : ''}
                ${a.similar.length ? `<div class="notice">You already bought:</div><ul>${a.similar.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
                ${a.checks?.length && state.checksOpen
        ? `<div class="muted footer">Before you trust it:</div><ul class="checks">${a.checks.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>`
        : ''
      }
                ${a.footer ? `<div class="muted footer">${esc(a.footer)}</div>` : ''}
                ${a.checks?.length
        ? `<div class="card-actions"><button data-action="checks" title="What to check before trusting this kind of item">${state.checksOpen ? 'Hide checks' : 'Checks'}</button></div>`
        : ''
      }
              </div>`
      : ''
    }
        ${state.share ? `<div class="row muted">${esc(state.share)}</div>` : ''}
      </div>`;
  const head = `<span class="title" title="${popped ? 'Whatnot Assistant' : 'Drag to move. Double-click to put it back in the corner.'}">Whatnot Assistant</span>
    ${w ? '' : '<button class="primary" data-action="appraise" title="Appraise the item on screen (Alt+Shift+V)">Appraise</button>'}
    ${!popped && documentPip() ? '<button class="icon" data-action="popout" title="Open in its own window, to move to another monitor">⧉</button>' : ''}
    <button class="icon" data-action="collapse" title="${state.collapsed ? 'Expand' : 'Collapse'}">${state.collapsed ? '▸' : '▾'}</button>
    <button class="icon" data-action="close" title="${popped ? 'Put it back on the page' : 'Hide (Alt+Shift+A or the side panel brings it back)'}">×</button>`;
  // Appraise is hidden on a wheel, so its switches are too.
  const sc = state.scan;
  const auto = prefs.autoAppraise;
  const picker =
    !w && !state.collapsed
      ? `${sc
        ? `<span class="muted">Show type</span><select data-change="scan" title="General appraises only the item being presented. Scan also lists other valuable items on the table after the answer (on by default for flea markets and yard sales).">
          <option value="general"${sc.scan ? '' : ' selected'}>General</option>
          <option value="scan"${sc.scan ? ' selected' : ''}>Scan</option>
        </select>`
        : ''
      }<span class="muted">Appraise</span><select data-change="auto" title="Auto appraises each new auction as it starts. Manual waits for you to press Appraise. Either way, a new auction clears the last answer.">
          <option value="auto"${auto ? ' selected' : ''}>Auto</option>
          <option value="manual"${auto ? '' : ' selected'}>Manual</option>
        </select>`
      : '';
  const tl = state.tools;
  const bids =
    state.quickBids.length && !w && !state.collapsed
      ? state.quickBids
        .map((b) => {
          const tip = `${b.note ? `${b.note}. ` : ''}Types the amount into Whatnot's Custom bid box. You press Set Max Bid.`;
          return `<button class="${b.verdict ?? ''}" data-action="quickbid" data-kind="${b.kind}" title="${esc(tip)}">${esc(b.label)}</button>`;
        })
        .join('')
      : '';
  const tools = tl && !state.collapsed && tl.spot ? `<div class="tool-row"><span class="muted spot" title="Spot prices, refreshed every 5 minutes">${esc(tl.spot)}</span></div>` : '';
  // Rewriting a button mid-click drops the click, so each part is only rewritten when it changes.
  if (head !== shown.head) p.head.innerHTML = shown.head = head;
  if (picker !== shown.picker) p.picker.innerHTML = shown.picker = picker;
  if (lot !== shown.lot) p.lot.innerHTML = shown.lot = lot;
  if (bids !== shown.bids) p.bids.innerHTML = shown.bids = bids;
  if (body !== shown.body) p.body.innerHTML = shown.body = body;
  if (tools !== shown.tools) p.tools.innerHTML = shown.tools = tools;

  // Hidden still shows a bid-guard notice, so a held bid click is never silent.
  host!.style.display = prefs.hidden && !popped && !state.notice ? 'none' : '';
  if (!drag) place(prefs.pos);
  fitHeight(`${state.collapsed}|${Boolean(w)}|${Boolean(a)}|${state.shop?.summary ?? ''}|${state.shop?.hits.length ?? 0}`);
};

// Grows at once, but only shrinks after the content has stayed shorter for a while, so a row that
// drops out between spins doesn't make the panel bounce.
const fitHeight = (mode: string) => {
  if (!parts) return;
  const panel = parts.panel;
  // Only the bottom-corner panel needs this: placed by its top or in its own window, growing and
  // shrinking happen below the content you're reading.
  if (popped || prefs.pos) {
    floor = { mode: '', px: 0, shorterSince: 0 };
    panel.style.minHeight = '';
    return;
  }
  // Measured without the floor; both happen before the next paint, so nothing flickers.
  panel.style.minHeight = '';
  const natural = Math.min(panel.offsetHeight, window.innerHeight * 0.7);
  const now = Date.now();
  if (mode !== floor.mode || natural >= floor.px) {
    floor = { mode, px: natural, shorterSince: 0 };
  } else if (!floor.shorterSince) {
    floor.shorterSince = now;
    clearTimeout(shrinkTimer);
    shrinkTimer = setTimeout(() => fitHeight(floor.mode), SHRINK_AFTER_MS + 50);
  } else if (now - floor.shorterSince >= SHRINK_AFTER_MS) {
    floor = { mode, px: natural, shorterSince: 0 };
  }
  panel.style.minHeight = `${floor.px}px`;
};

export const overlay = {
  mount(h: typeof handlers) {
    handlers = h;
    render();
  },
  // Stops drawing without removing the element, which may already be the newer copy's panel.
  detach() {
    detached = true;
    host = null;
    root = null;
    parts = null;
    clearTimeout(noticeTimer);
    clearTimeout(shrinkTimer);
    clearTimeout(flashTimer);
    popped?.close();
    popped = null;
  },
  unmount() {
    if (detached) return;
    document.getElementById(HOST_ID)?.remove();
    host?.remove();
    host = null;
    root = null;
    parts = null;
    popped?.close();
    popped = null;
  },
  setPrefs(next: Partial<OverlayPrefs> | undefined) {
    prefs = { ...DEFAULT_OVERLAY_PREFS, ...next };
    if (host) render();
  },
  setGuard(view: GuardView | null) {
    state.guard = view;
    if (host) render();
  },
  // A wheel takes the appraisal's place; an appraisal from before it started is about a different item.
  setWheel(view: WheelView | null) {
    if (view && !state.wheel) state.appraisal = null;
    state.wheel = view;
    if (host) render();
  },
  // You asked for an appraisal, and its quick first read only shows here, so a hidden panel comes
  // back. One started on its own (reveal false) leaves the panel as you left it.
  setAppraisal(view: AppraisalView | null, reveal = true) {
    if (!view || view.status === 'pending') state.checksOpen = false;
    state.appraisal = view;
    if (view && reveal) state.collapsed = false;
    if (view && reveal && prefs.hidden) savePrefs({ ...prefs, hidden: false });
    else if (host) render();
  },
  autoAppraise() {
    return prefs.autoAppraise;
  },
  // The answer stays on screen but is about an earlier item; the note says so.
  markAppraisalOld(note: string) {
    const a = state.appraisal;
    if (!a || a.status === 'error') return;
    state.appraisal = { ...a, footer: note };
    if (host) render();
  },
  setScan(view: ScanView | null) {
    state.scan = view;
    if (host) render();
  },
  setSeller(view: SellerView | null) {
    state.seller = view;
    if (host) render();
  },
  setShop(view: ShopView | null) {
    state.shop = view;
    if (host) render();
  },
  setEstate(view: EstateView | null) {
    state.estate = view;
    if (host) render();
  },
  setElectronics(view: ElectronicsView | null) {
    state.electronics = view;
    if (host) render();
  },
  setRunner(view: RunnerView | null) {
    state.runner = view;
    if (host) render();
  },
  setCasePack(view: CasePackView | null) {
    state.casePack = view;
    if (host) render();
  },
  setTools(view: ToolsView | null) {
    state.tools = view;
    if (host) render();
  },
  setQuickBids(list: QuickBidButton[]) {
    state.quickBids = list;
    if (host) render();
  },
  // Pulses the border so an alert catches your eye even when the notice text is small.
  flash() {
    const panel = parts?.panel;
    if (!panel) return;
    panel.classList.remove('flash');
    void panel.offsetWidth;
    panel.classList.add('flash');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => panel.classList.remove('flash'), 1300);
  },
  appraisalVisible() {
    return Boolean(host && state.appraisal && !state.collapsed && (!prefs.hidden || popped));
  },
  setShare(text: string | null, sharing: boolean) {
    state.share = text;
    state.sharing = sharing;
    if (host) render();
  },
  notice(text: string, ms = 4000) {
    state.notice = text;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => {
      state.notice = null;
      if (host) render();
    }, ms);
    if (host) render();
  },
  isOurs(el: Element) {
    return Boolean(host && (el === host || host.contains(el)));
  },
  // Keeps our panel out of screenshots taken for appraisal.
  async hiddenDuring<T>(fn: () => Promise<T>): Promise<T> {
    const prev = host?.style.visibility ?? '';
    if (host) host.style.visibility = 'hidden';
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    try {
      return await fn();
    } finally {
      if (host) host.style.visibility = prev;
    }
  },
};
