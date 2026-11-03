import { afterEach, describe, expect, it, vi } from 'vitest';
import { isLogShareUrl, logShareSucceeded, watchLogShare } from './logShare';

const realFetch = window.fetch;
afterEach(() => {
  window.fetch = realFetch;
});

describe('LogShare detection', () => {
  it('matches only the LogShare GraphQL operation', () => {
    const base = 'https://www.whatnot.com/live/abc';
    expect(isLogShareUrl('/services/graphql/?operationName=LogShare&ssr=0', base)).toBe(true);
    expect(isLogShareUrl('/services/graphql/?operationName=LiveStream', base)).toBe(false);
    expect(isLogShareUrl('/services/events/v1/t?operationName=LogShare', base)).toBe(false);
    expect(isLogShareUrl('/services/graphql/?ssr=0', base, { body: JSON.stringify({ operationName: 'LogShare' }) })).toBe(true);
    expect(isLogShareUrl('/services/graphql/?ssr=0', base, { body: JSON.stringify({ operationName: 'LiveStream' }) })).toBe(false);
  });

  it('treats GraphQL errors as not recorded', () => {
    expect(logShareSucceeded({ data: { logShare: { ok: true } } })).toBe(true);
    expect(logShareSucceeded({ errors: [{ message: 'rate limited' }] })).toBe(false);
    expect(logShareSucceeded(null)).toBe(false);
  });

  it('reports successful LogShare responses and passes every response through', async () => {
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    window.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('fail')) return json({ errors: [{ message: 'no' }] });
      if (url.includes('500')) return json({}, 500);
      return json({ data: {} });
    }) as typeof fetch;
    const onShare = vi.fn();
    watchLogShare(onShare);

    const ok = await window.fetch('/services/graphql/?operationName=LogShare');
    await window.fetch('/services/graphql/?ssr=0', { body: JSON.stringify({ operationName: 'LogShare' }) });
    await window.fetch('/services/graphql/?operationName=LogShare&fail=1');
    await window.fetch('/services/graphql/?operationName=LogShare&500=1');
    await window.fetch('/services/graphql/?operationName=LiveStream');
    await new Promise((r) => setTimeout(r, 0));

    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ data: {} });
    expect(onShare).toHaveBeenCalledTimes(2);
  });
});
