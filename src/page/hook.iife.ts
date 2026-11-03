// Runs in the page's MAIN world at document_start. It only observes: socket frames and selected
// GraphQL responses are mirrored to the content script, and quiet mode keeps shares from touching
// the clipboard or opening share popups.
import { BREAK_OPERATION, BREAK_QUERY } from '../shared/breaks';
import { SHOW_NOTES_OPERATION, SHOW_NOTES_QUERY } from '../shared/showNotes';
import { CONTENT_SOURCE, HOOK_SOURCE, type ContentToHook, type HookToContent } from '../shared/hookProtocol';
import { isShopOperation } from '../shared/shop';
import { logShareSucceeded } from '../userscript/logShare';
import { fetchShop, inspectGraphql, noteShopCall } from './shopFetch';
import { installQuietPatches } from './quiet';

declare global {
  interface Window {
    __wn2HookInstalled?: boolean;
  }
}

const WATCHED_OPERATIONS = new Set(['LiveStream', BREAK_OPERATION, SHOW_NOTES_OPERATION]);
const BUFFER_LIMIT = 400;
const MAX_QUIET_MS = 10_000;
const BREAK_FETCH_TIMEOUT_MS = 5_000;

const install = () => {
  if (window.__wn2HookInstalled) return;
  window.__wn2HookInstalled = true;

  // The content script loads after the page opens its sockets, so early frames wait here.
  let ready = false;
  const buffer: HookToContent[] = [];
  const post = (msg: HookToContent) => {
    if (!ready) {
      buffer.push(msg);
      if (buffer.length > BUFFER_LIMIT) buffer.shift();
      return;
    }
    window.postMessage({ source: HOOK_SOURCE, ...msg }, location.origin);
  };

  const socketKind = (url: string) =>
    /\/services\/auction\//.test(url) ? 'auction' : /\/services\/live\//.test(url) ? 'live' : null;

  const NativeWebSocket = window.WebSocket;
  class ObservedWebSocket extends NativeWebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols);
      const kind = socketKind(String(url));
      if (kind) {
        this.addEventListener('message', (e: MessageEvent) => {
          if (typeof e.data === 'string') post({ kind: 'socket', socket: kind, raw: e.data });
        });
      }
    }
  }
  window.WebSocket = ObservedWebSocket;

  const nativeFetch = window.fetch;
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await nativeFetch.call(window, input, init);
    try {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const gql = inspectGraphql(url, location.href, init);
      if (gql) {
        noteShopCall(gql.operation, gql.query, gql.variables);
        // A click only counts once this response says Whatnot recorded the share.
        if (gql.operation === 'LogShare') {
          const report = (ok: boolean) => post({ kind: 'log_share', ok });
          if (!res.ok) report(false);
          else res.clone().json().then((body) => report(logShareSucceeded(body))).catch(() => report(false));
        }
        if (WATCHED_OPERATIONS.has(gql.operation) || isShopOperation(gql.operation)) {
          res
            .clone()
            .text()
            .then((body) => {
              if (body.length <= 2_000_000) post({ kind: 'graphql', operation: gql.operation, body });
            })
            .catch(() => undefined);
        } else {
          post({ kind: 'graphql_op', operation: gql.operation });
        }
      }
    } catch {
      // Observation must never break the page's own request.
    }
    return res;
  };

  const fetchShowNotes = async (id: string) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), BREAK_FETCH_TIMEOUT_MS);
    try {
      const res = await nativeFetch.call(window, `/services/graphql/?operationName=${SHOW_NOTES_OPERATION}&ssr=0`, {
        method: 'POST',
        credentials: 'include',
        signal: ctrl.signal,
        headers: { 'content-type': 'application/json', authorization: 'Cookie', 'x-whatnot-app': 'whatnot-web' },
        body: JSON.stringify({
          operationName: SHOW_NOTES_OPERATION,
          query: SHOW_NOTES_QUERY,
          variables: { filterParams: { livestreamId: id } },
        }),
      });
      if (res.ok) post({ kind: 'graphql', operation: SHOW_NOTES_OPERATION, body: await res.text() });
    } catch {
      // The next poll tries again.
    } finally {
      clearTimeout(timer);
    }
  };

  // The wheel's prize list, read the way Whatnot's web app does; without these headers getBreak is null.
  const fetchBreak = async (id: string, soldAfter: string | null, optionsAfter: string | null) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), BREAK_FETCH_TIMEOUT_MS);
    try {
      const res = await nativeFetch.call(window, `/services/graphql/?operationName=${BREAK_OPERATION}&ssr=0`, {
        method: 'POST',
        credentials: 'include',
        signal: ctrl.signal,
        headers: { 'content-type': 'application/json', authorization: 'Cookie', 'x-whatnot-app': 'whatnot-web' },
        body: JSON.stringify({ operationName: BREAK_OPERATION, query: BREAK_QUERY, variables: { id, soldAfter, optionsAfter } }),
      });
      if (res.ok) post({ kind: 'graphql', operation: BREAK_OPERATION, body: await res.text(), optionsAfter });
    } catch {
      // A missed refresh is retried on the next spin or poll.
    } finally {
      clearTimeout(timer);
    }
  };

  let quietUntil = 0;
  const quiet = () => Date.now() < quietUntil;

  window.addEventListener('message', (e: MessageEvent) => {
    if (e.source !== window || e.data?.source !== CONTENT_SOURCE) return;
    const msg = e.data as ContentToHook & { source: string };
    if (msg.kind === 'ready') {
      ready = true;
      window.postMessage({ source: HOOK_SOURCE, kind: 'hello' } satisfies HookToContent & { source: string }, location.origin);
      buffer.splice(0).forEach(post);
    } else if (msg.kind === 'quiet') {
      quietUntil = Date.now() + Math.min(MAX_QUIET_MS, Math.max(0, msg.ms));
    } else if (msg.kind === 'fetch_break' && /^\d+$/.test(msg.id)) {
      const cursor = (v: unknown) => (typeof v === 'string' && v.length < 200 ? v : null);
      void fetchBreak(msg.id, cursor(msg.soldAfter), cursor(msg.optionsAfter));
    } else if (msg.kind === 'fetch_notes' && /^[A-Za-z0-9-]{8,80}$/.test(msg.id)) {
      void fetchShowNotes(msg.id);
    } else if (msg.kind === 'fetch_shop' && /^[A-Za-z0-9-]{8,80}$/.test(msg.id)) {
      const after = typeof msg.after === 'string' && msg.after.length < 200 ? msg.after : null;
      void fetchShop(msg.id, after, nativeFetch, post);
    }
  });

  installQuietPatches(quiet);
};

install();
