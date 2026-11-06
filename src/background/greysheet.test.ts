import { afterEach, describe, expect, it, vi } from 'vitest';
import { greysheetLookup, testGreysheet } from './greysheet';

const fakeArea = (data: Record<string, unknown> = {}) => ({
  get: async (name: string) => (name in data ? { [name]: data[name] } : {}),
  set: async (items: Record<string, unknown>) => void Object.assign(data, items),
});

describe('greysheet', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('rejects testGreysheet when credentials are blank', async () => {
    vi.stubGlobal('chrome', {
      storage: {
        local: fakeArea(),
        session: fakeArea(),
      },
    });
    const res = await testGreysheet();
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).toContain('Enter both a Greysheet API key and API token');
  });

  it('calls Greysheet test endpoint with headers', async () => {
    vi.stubGlobal('chrome', {
      storage: {
        local: fakeArea({
          wn2_appraisalSettings: {
            greysheetApiKey: 'my-key',
            greysheetToken: 'my-token',
          },
        }),
        session: fakeArea(),
      },
    });

    const mockFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: 'success' }),
    }));
    vi.stubGlobal('fetch', mockFetch);

    const res = await testGreysheet();
    expect(res.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/GetNodeRequest?NodeId=1'),
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-api-key': 'my-key',
          'x-api-token': 'my-token',
        }),
      }),
    );
  });

  it('returns parsed RefPrice when Greysheet returns pricing', async () => {
    const mockFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        items: [
          {
            name: '1881-S Morgan Dollar MS65',
            cpg: 215,
            wholesale: 180,
            link: 'https://www.greysheet.com/item/1881-s-1-morgan/7130',
          },
        ],
      }),
    }));
    vi.stubGlobal('fetch', mockFetch);

    const ref = await greysheetLookup(
      { item_name: 'Morgan Dollar', year: 1881, grade: 'MS65' },
      { greysheetApiKey: 'key', greysheetToken: 'token' },
    );

    expect(ref).toMatchObject({
      source: 'greysheet',
      kind: 'market',
      value: 215,
      detail: expect.stringContaining('CPG retail $215'),
    });
  });
});
