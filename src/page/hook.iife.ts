// Runs in the page's MAIN world at document_start. It only observes: socket frames and selected
// GraphQL responses are mirrored to the content script, and quiet mode keeps shares from touching
// the clipboard or opening share popups.
import { BREAK_OPERATION, BREAK_QUERY } from '../shared/breaks';
import { CONTENT_SOURCE, HOOK_SOURCE, type ContentToHook, type HookToContent } from '../shared/hookProtocol';
import { installQuietPatches } from './quiet';

declare global {
  interface Window {
    __wn2HookInstalled?: boolean;
  }
}

const WATCHED_OPERATIONS = new Set(['LiveStream', BREAK_OPERATION]);
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
      if (url.includes('/services/graphql')) {
        const operation = new URL(url, location.href).searchParams.get('operationName');
        if (operation && WATCHED_OPERATIONS.has(operation)) {
          res
            .clone()
            .text()
            .then((body) => post({ kind: 'graphql', operation, body }))
            .catch(() => undefined);
        } else if (operation) {
          post({ kind: 'graphql_op', operation });
        }
      }
    } catch {
      // Observation must never break the page's own request.
    }
    return res;
  };

  // The wheel's prize list, read the way Whatnot's web app does; without these headers getBreak is null.
  const fetchBreak = async (id: string, soldAfter: string | null) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), BREAK_FETCH_TIMEOUT_MS);
    try {
      const res = await nativeFetch.call(window, `/services/graphql/?operationName=${BREAK_OPERATION}&ssr=0`, {
        method: 'POST',
        credentials: 'include',
        signal: ctrl.signal,
        headers: { 'content-type': 'application/json', authorization: 'Cookie', 'x-whatnot-app': 'whatnot-web' },
        body: JSON.stringify({ operationName: BREAK_OPERATION, query: BREAK_QUERY, variables: { id, soldAfter } }),
      });
      if (res.ok) post({ kind: 'graphql', operation: BREAK_OPERATION, body: await res.text() });
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
      void fetchBreak(msg.id, typeof msg.soldAfter === 'string' && msg.soldAfter.length < 200 ? msg.soldAfter : null);
    }
  });

  installQuietPatches(quiet);
};

install();
