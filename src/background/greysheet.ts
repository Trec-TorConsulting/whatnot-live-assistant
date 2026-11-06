// Greysheet (CDN Publishing) API client for Bring-Your-Own-Key (BYOK) setups.
// Connects to CDN Public API V2 using user-supplied dealer API credentials.

import type { AppraisalItem } from '../shared/appraisal';
import type { TestResult } from '../shared/messages';
import type { RefPrice } from '../shared/refPrice';
import { getAppraisalSettings } from '../shared/storage';
import { SECOND } from '../shared/time';
import { fetchWithTimeout } from './appraisal';

export const GREYSHEET_API_BASE = 'https://cpgpublicapiv2.greysheet.com/api';
const TIMEOUT_MS = 6 * SECOND;

interface CdnPricingItem {
  id?: number | string;
  name?: string;
  series?: string;
  year?: number | string;
  mint?: string;
  grade?: string;
  cpg?: number | string | null;
  cpgValue?: number | string | null;
  cpg_price?: number | string | null;
  wholesale?: number | string | null;
  wholesale_bid?: number | string | null;
  bid?: number | string | null;
  ask?: number | string | null;
  price?: number | string | null;
  link?: string;
}

const money = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
};

export const testGreysheet = async (): Promise<TestResult> => {
  const { greysheetApiKey, greysheetToken } = await getAppraisalSettings();
  if (!greysheetApiKey || !greysheetToken) {
    return { ok: false, error: 'Enter both a Greysheet API key and API token first.' };
  }
  try {
    const res = await fetchWithTimeout(
      `${GREYSHEET_API_BASE}/GetNodeRequest?NodeId=1`,
      {
        headers: {
          'x-api-key': greysheetApiKey,
          'x-api-token': greysheetToken,
          Accept: 'application/json',
        },
      },
      TIMEOUT_MS,
    );
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: 'Greysheet rejected the credentials. Verify your key and token.' };
    }
    if (!res.ok) {
      return { ok: false, error: `Greysheet HTTP ${res.status}` };
    }
    return { ok: true, detail: 'Greysheet CDN API connected successfully.' };
  } catch (err) {
    return {
      ok: false,
      error: (err as Error).name === 'AbortError' ? 'Greysheet request timed out (>6s)' : (err as Error).message,
    };
  }
};

export const greysheetLookup = async (
  item: Partial<AppraisalItem>,
  settings: { greysheetApiKey?: string; greysheetToken?: string },
): Promise<RefPrice | null> => {
  const apiKey = settings.greysheetApiKey?.trim();
  const token = settings.greysheetToken?.trim();
  if (!apiKey || !token) return null;

  const query = [item.year, item.item_name, item.grade].filter(Boolean).join(' ').trim();
  if (!query) return null;

  try {
    // Search CDN Public API V2
    const res = await fetchWithTimeout(
      `${GREYSHEET_API_BASE}/Search?q=${encodeURIComponent(query)}&apiLevel=advanced`,
      {
        headers: {
          'x-api-key': apiKey,
          'x-api-token': token,
          Accept: 'application/json',
        },
      },
      TIMEOUT_MS,
    );

    if (res.status === 401 || res.status === 403) {
      throw new Error('Greysheet credentials rejected');
    }
    if (!res.ok) return null;

    const data = (await res.json().catch(() => null)) as
      | { items?: CdnPricingItem[]; results?: CdnPricingItem[]; data?: CdnPricingItem[] }
      | CdnPricingItem[]
      | null;

    const list: CdnPricingItem[] = Array.isArray(data)
      ? data
      : (data?.items ?? data?.results ?? data?.data ?? []);

    if (!list.length) return null;

    const hit = list[0]!;
    const cpg = money(hit.cpg ?? hit.cpgValue ?? hit.cpg_price ?? hit.price);
    const wholesale = money(hit.wholesale ?? hit.wholesale_bid ?? hit.bid);
    const val = cpg ?? wholesale;
    if (!val) return null;

    const name = hit.name || `${item.item_name} ${item.grade ?? ''}`.trim();
    const details = [
      cpg ? `CPG retail $${cpg.toLocaleString()}` : null,
      wholesale ? `wholesale $${wholesale.toLocaleString()}` : null,
    ]
      .filter(Boolean)
      .join(' · ');

    return {
      source: 'greysheet',
      kind: 'market',
      value: val,
      name,
      detail: details || 'Greysheet pricing',
      link: hit.link || 'https://www.greysheet.com',
    };
  } catch (err) {
    if ((err as Error).message === 'Greysheet credentials rejected') {
      throw err;
    }
    return null;
  }
};

