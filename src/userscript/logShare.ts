// Copy link (and the other share options) send a LogShare GraphQL request. A response without
// GraphQL errors means Whatnot recorded the share.
export const isLogShareUrl = (url: string, base = location.href) => {
  if (!url.includes('/services/graphql')) return false;
  try {
    return new URL(url, base).searchParams.get('operationName') === 'LogShare';
  } catch {
    return false;
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
      if (res.ok && isLogShareUrl(url)) {
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
