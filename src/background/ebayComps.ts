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

  // Slab attributes
  const slabService = item.is_slabbed && item.grading_service ? item.grading_service.trim() : '';
  const hasSlabService = Boolean(slabService && new RegExp(`\\b${slabService}\\b`, 'i').test(cleanName));

  // Signature
  let sig = item.signature ? item.signature.trim() : '';
  if (!sig && item.special) {
    const sigMatch = item.special.match(/\b(elizabeth\s*jones|john\s*mercanti|mercanti|ed\s*moy|david\s*ryder|thomas\s*cleveland|michael\s*gaudioso|emily\s*damstra|anna\s*cabral)\b/i);
    if (sigMatch) sig = sigMatch[1]!;
  }
  const hasSig = Boolean(sig && new RegExp(`\\b${sig.replace(/\s+/g, '\\s*')}\\b`, 'i').test(cleanName));

  // Finish (burnished, reverse proof)
  let finish = item.finish ? item.finish.trim() : '';
  if (!finish && item.special) {
    const finishMatch = item.special.match(/\b(burnished|reverse\s*proof|enhanced\s*rev\w*|matte\s*proof)\b/i);
    if (finishMatch) finish = finishMatch[1]!;
  }
  const hasFinish = Boolean(finish && new RegExp(`\\b${finish.replace(/\s+/g, '\\s*')}\\b`, 'i').test(cleanName));

  // Pedigree (First Day of Issue / FDI)
  let pedigree = item.pedigree ? item.pedigree.trim() : '';
  if (!pedigree && item.special) {
    const pedMatch = item.special.match(/\b(first\s*day\s*of\s*issue|fdi|early\s*releases|first\s*strike)\b/i);
    if (pedMatch) pedigree = pedMatch[1]!;
  }
  const hasPedigree = Boolean(pedigree && new RegExp(`\\b${pedigree.replace(/\s+/g, '\\s*')}\\b`, 'i').test(cleanName));

  // Paper currency designations (EPQ, Star note, Fr. #)
  let epq = item.paper_quality && item.paper_quality !== 'none' ? item.paper_quality.toUpperCase() : '';
  if (!epq) {
    const epqMatch = [item.grade, item.special].filter(Boolean).join(' ').match(/\b(epq|ppq)\b/i);
    if (epqMatch) epq = epqMatch[1]!.toUpperCase();
  }
  const hasEpq = Boolean(epq && new RegExp(`\\b${epq}\\b`, 'i').test(cleanName + ' ' + grade));

  let star = item.star_note ? 'Star' : '';
  if (!star && /\b(star\s*note|★|\*)\b/i.test([item.special, item.grade].filter(Boolean).join(' '))) {
    star = 'Star';
  }
  const hasStar = Boolean(star && new RegExp(`\\b${star}\\b`, 'i').test(cleanName + ' ' + grade));

  let catalog = item.catalog_number ? item.catalog_number.trim() : '';
  if (!catalog && item.special) {
    const frMatch = item.special.match(/\bFr\.?\s*\d+[a-z]?\b/i);
    if (frMatch) catalog = frMatch[0];
  }
  const hasCatalog = Boolean(catalog && new RegExp(`\\b${catalog.replace(/\./g, '\\.')}\\b`, 'i').test(cleanName));

  let cac = item.cac && item.cac !== 'none' ? 'CAC' : '';
  if (!cac && /\b(green\s*cac|gold\s*cac|cac\s*sticker)\b/i.test([item.special, item.grade].filter(Boolean).join(' '))) {
    cac = 'CAC';
  }
  const hasCac = Boolean(cac && new RegExp(`\\b${cac}\\b`, 'i').test(cleanName));

  const parts = [
    !hasYear ? yearStr : '',
    !hasMint ? mint : '',
    cleanName,
    !hasFinish && finish && finish.toLowerCase() !== 'regular' ? finish : '',
    !hasSlabService ? slabService : '',
    !hasGrade ? grade : '',
    !hasSig ? sig : '',
    !hasPedigree ? pedigree : '',
    !hasEpq ? epq : '',
    !hasStar ? star : '',
    !hasCatalog ? catalog : '',
    !hasCac ? cac : '',
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
