// Copy link (and the other share options) send a LogShare GraphQL request. A response without
// GraphQL errors means Whatnot recorded the share.
const operationFromBody = (init?: RequestInit) => {
  if (typeof init?.body !== 'string') return null;
  try {
    const name = (JSON.parse(init.body) as { operationName?: unknown }).operationName;
    return typeof name === 'string' ? name : null;
  } catch {
    return null;
  }
};

// Whatnot puts operationName on the query string, or only in the POST body.
export const isLogShareUrl = (url: string, base = location.href, init?: RequestInit) => {
  if (!url.includes('/services/graphql')) return false;
  try {
    return (new URL(url, base).searchParams.get('operationName') || operationFromBody(init)) === 'LogShare';
  } catch {
    return operationFromBody(init) === 'LogShare';
  }
};

export const logShareSucceeded = (body: unknown) => {
  const b = body as { errors?: unknown[]; data?: unknown } | null;
  return Boolean(b && typeof b === 'object' && !(Array.isArray(b.errors) && b.errors.length > 0));
};

export const watchLogShare = (onShare: () => void) => {
  const nativeFetch = window.fetch;
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await nativeFetch.call(window, input, init);
    try {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (res.ok && isLogShareUrl(url, location.href, init)) {
        res
          .clone()
          .json()
          .then((body) => logShareSucceeded(body) && onShare())
          .catch(() => undefined);
      }
    } catch {
      // Observation must never break the page's own request.
    }
    return res;
  };
};
