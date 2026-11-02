// Asks Whatnot for this show's shop. Prefers a query the page already ran, then one found in its
// scripts, then two small fallbacks. The page's own request is never awaited here.
import {
  extractShopQuery,
  isShopOperation,
  readShopPage,
  shopVariablesFrom,
  SHOP_FALLBACKS,
} from '../shared/shop';
import type { HookToContent } from '../shared/hookProtocol';

interface ShopQuery {
  operation: string;
  query: string;
  variables: Record<string, unknown>;
}

let captured: ShopQuery | null = null;
let active: ShopQuery | null = null;
let discovered: ShopQuery | null | undefined;

const SHOP_TIMEOUT_MS = 8_000;
const DISCOVER_BUDGET_MS = 6_000;
const MAX_SCRIPTS = 12;

export const inspectGraphql = (
  url: string,
  base: string,
  init?: RequestInit,
): { operation: string; query: string | null; variables: Record<string, unknown> } | null => {
  if (!url.includes('/services/graphql')) return null;
  let operation = '';
  try {
    operation = new URL(url, base).searchParams.get('operationName') ?? '';
  } catch {
    operation = '';
  }
  let query: string | null = null;
  let variables: Record<string, unknown> = {};
  if (typeof init?.body === 'string') {
    try {
      const parsed = JSON.parse(init.body) as { operationName?: unknown; query?: unknown; variables?: unknown };
      if (!operation && typeof parsed.operationName === 'string') operation = parsed.operationName;
      if (typeof parsed.query === 'string') query = parsed.query;
      if (parsed.variables && typeof parsed.variables === 'object' && !Array.isArray(parsed.variables)) {
        variables = parsed.variables as Record<string, unknown>;
      }
    } catch {
      // A non-JSON body is still a page request; we just can't replay it.
    }
  }
  return operation ? { operation, query, variables } : null;
};

export const noteShopCall = (operation: string, query: string | null, variables: Record<string, unknown>) => {
  if (!isShopOperation(operation) || !query || !query.includes('query')) return;
  captured = { operation, query, variables };
  active = captured;
};

const scriptUrls = () => {
  const urls = new Set<string>();
  for (const s of document.scripts) if (s.src) urls.add(s.src);
  for (const e of performance.getEntriesByType('resource')) if (e.name.includes('.js')) urls.add(e.name);
  return [...urls]
    .filter((u) => {
      try {
        return new URL(u, location.href).hostname.endsWith('whatnot.com');
      } catch {
        return false;
      }
    })
    .sort((a, b) => Number(/shop/i.test(b)) - Number(/shop/i.test(a)) || Number(/live|commerce/i.test(b)) - Number(/live|commerce/i.test(a)));
};

const discover = async (nativeFetch: typeof fetch): Promise<ShopQuery | null> => {
  if (discovered !== undefined) return discovered;
  const deadline = Date.now() + DISCOVER_BUDGET_MS;
  for (const url of scriptUrls().slice(0, MAX_SCRIPTS)) {
    if (Date.now() > deadline) break;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2_000);
    try {
      const res = await nativeFetch(url, { credentials: 'same-origin', signal: ctrl.signal });
      if (!res.ok) continue;
      const found = extractShopQuery(await res.text());
      if (found) {
        discovered = { ...found, variables: {} };
        return discovered;
      }
    } catch {
      // The next script may be the one that contains the shop query.
    } finally {
      clearTimeout(timer);
    }
  }
  discovered = null;
  return null;
};

// A null shop field is the wrong query. An empty edges list is a shop with nothing in it.
const usable = (text: string) => {
  try {
    const read = readShopPage(JSON.parse(text));
    if (read.error) return false;
    return read.listings.length > 0 || /"edges"\s*:\s*\[/.test(text);
  } catch {
    return false;
  }
};

const runQuery = async (nativeFetch: typeof fetch, attempt: ShopQuery) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SHOP_TIMEOUT_MS);
  try {
    const res = await nativeFetch.call(window, `/services/graphql/?operationName=${encodeURIComponent(attempt.operation)}&ssr=0`, {
      method: 'POST',
      credentials: 'include',
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json', authorization: 'Cookie', 'x-whatnot-app': 'whatnot-web' },
      body: JSON.stringify({ operationName: attempt.operation, query: attempt.query, variables: attempt.variables }),
    });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

const attemptOf = (query: ShopQuery, liveId: string, after: string | null): ShopQuery | null => {
  const variables = shopVariablesFrom(query.query, query.variables, liveId, after);
  return variables ? { ...query, variables } : null;
};

export const fetchShop = async (liveId: string, after: string | null, nativeFetch: typeof fetch, post: (msg: HookToContent) => void) => {
  const attempts: ShopQuery[] = [];
  const push = (q: ShopQuery | null) => {
    if (!q || attempts.some((a) => a.operation === q.operation && a.query === q.query)) return;
    attempts.push(q);
  };
  if (after !== null && active) push(attemptOf(active, liveId, after));
  else {
    if (captured) push(attemptOf(captured, liveId, after));
    if (!captured) {
      const found = await discover(nativeFetch);
      if (found) push(attemptOf(found, liveId, after));
    }
    for (const fb of SHOP_FALLBACKS) push(attemptOf({ ...fb, variables: {} }, liveId, after));
  }

  let text: string | null = null;
  let chosen: ShopQuery | null = null;
  for (const attempt of attempts) {
    const body = await runQuery(nativeFetch, attempt);
    if (!body) continue;
    text = body;
    if (usable(body)) {
      chosen = attempt;
      break;
    }
  }
  if (chosen) active = { operation: chosen.operation, query: chosen.query, variables: chosen.variables };
  const operation = chosen?.operation ?? attempts.at(-1)?.operation ?? 'LiveShop';
  post({
    kind: 'graphql',
    operation,
    body: text ?? JSON.stringify({ errors: [{ message: 'shop unavailable' }] }),
  });
};
