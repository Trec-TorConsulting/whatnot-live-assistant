// Recent auction and eBay completed/sold comps lookup for live appraisal.
// Pulls realized sale prices from completed eBay listings.

import type { AppraisalItem } from '../shared/appraisal';
import type { RefPrice } from '../shared/refPrice';
import { SECOND } from '../shared/time';
import { fetchWithTimeout } from './appraisal';
import { scheduleDomain } from './rateGate';

const TIMEOUT_MS = 5 * SECOND;

interface SoldComp {
  title: string;
  price: number;
}

const money = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
};

const median = (nums: number[]): number => {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round(((s[mid - 1]! + s[mid]!) / 2) * 100) / 100;
};

// Generates a clean search query for eBay sold listings
export const buildEbayQuery = (item: Partial<AppraisalItem>): string => {
  const card = item.card;
  if (card?.name) {
    return [card.name, card.set, card.number].filter(Boolean).join(' ');
  }
  const cleanName = String(item.item_name ?? '')
    .replace(/\b(lot\s*#?\d+|ltd|rare|must\s*see|look|wow)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  const yearStr = typeof item.year === 'number' && item.year > 0 ? String(item.year) : '';
  const hasYear = Boolean(yearStr && new RegExp(`\\b${yearStr}\\b`).test(cleanName));

  const mint = item.mint_mark ? String(item.mint_mark).trim() : '';
  const hasMint = Boolean(mint && new RegExp(`(?:\\b|[-_/])${mint}\\b`, 'i').test(cleanName));

  const grade = item.grade ? String(item.grade).trim() : '';
  const hasGrade = Boolean(grade && new RegExp(`\\b${grade.replace(/\s+/g, '\\s*')}\\b`, 'i').test(cleanName));

  const parts = [
    !hasYear ? yearStr : '',
    !hasMint ? mint : '',
    cleanName,
    !hasGrade ? grade : '',
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  return parts || cleanName;
};

const SKIP_WORDS = /\b(replica|reproduction|copy|tribute|counterfeit|novelty|plated\s*clad|clad\s*copy)\b/i;

// Parse items from eBay completed/sold search HTML
export const parseEbaySoldHtml = (html: string): SoldComp[] => {
  const items: SoldComp[] = [];
  // Match items in s-item or s-card listings
  const itemRegex = /<li[^>]*class="[^"]*s-item[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(html)) !== null && items.length < 15) {
    const block = match[1]!;

    // Ignore headers like "Shop on eBay"
    if (/s-item__title--tag/i.test(block) && /Shop on eBay/i.test(block)) continue;

    // Extract title (supports span, h3, or div with s-item__title, stripping child tags)
    const titleBlockMatch = block.match(/<(?:span|h3|div)[^>]*class="[^"]*s-item__title[^"]*"[^>]*>([\s\S]*?)<\/(?:span|h3|div)>/i);
    const rawTitle = titleBlockMatch ? titleBlockMatch[1]!.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
    const title = rawTitle.replace(/^(?:new listing\s*|shop on ebay\s*)/i, '').trim();
    if (!title || SKIP_WORDS.test(title)) continue;

    // Extract sold price (supports span or div with s-item__price)
    const priceMatch = block.match(/<(?:span|div)[^>]*class="[^"]*s-item__price[^"]*"[^>]*>([\s\S]*?)<\/(?:span|div)>/i);
    const rawPrice = priceMatch ? priceMatch[1]!.replace(/<[^>]+>/g, '').trim() : '';
    const cleanPrice = rawPrice.split('to')[0]!.trim(); // Handle range "$10.00 to $15.00"
    const price = money(cleanPrice);

    if (price && price > 0.5) {
      items.push({ title, price });
    }
  }

  return items;
};

export const ebaySoldLookup = async (item: Partial<AppraisalItem>): Promise<RefPrice | null> => {
  const query = buildEbayQuery(item);
  if (!query) return null;

  const url = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Sold=1&LH_Complete=1&_sop=13`;

  try {
    const res = await scheduleDomain(url, () =>
      fetchWithTimeout(
        url,
        {
          credentials: 'include',
          headers: {
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
        },
        TIMEOUT_MS,
      ),
    );

    if (!res.ok) {
      return null;
    }

    const html = await res.text();
    const comps = parseEbaySoldHtml(html);

    if (!comps.length) {
      return null;
    }

    const prices = comps.map((c) => c.price);
    const med = median(prices);
    const low = Math.min(...prices);
    const high = Math.max(...prices);

    return {
      source: 'ebay',
      kind: 'market',
      value: med,
      high: high !== low ? high : undefined,
      name: `${comps.length} eBay sold: $${low}–$${high}`,
      detail: `median $${med} · recent auction sales`,
      link: url,
    };
  } catch {
    return null;
  }
};
