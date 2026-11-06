import { evaluateListingSpread, type ListingAppraisal } from '../shared/shop';
import { marketOf } from '../shared/refPrice';
import type { AppraisalItem } from '../shared/appraisal';
import { getItem } from '../shared/storage';
import { askAi, realPrice } from './aiPricing';
import { quickAppraise } from './appraisal';
import { refLookup } from './refPrices';

export interface AppraiseListingInput {
  id: string;
  title: string;
  subtitle?: string | null;
  price: number;
}

export const appraiseListingText = async ({
  id,
  title,
  subtitle,
  price,
}: AppraiseListingInput): Promise<ListingAppraisal> => {
  const text = `${title} ${subtitle ?? ''}`.trim();
  const askingPrice = price;

  // 1. Quick melt from spot metal
  const quick = await quickAppraise(text).catch(() => null);
  if (quick?.melt && quick.melt.total > 0) {
    return evaluateListingSpread(id, askingPrice, Math.round(quick.melt.total * 100) / 100, 'melt');
  }

  // 2. Real price: prize melt or Whatnot sold history
  const sold = (await getItem('soldHistory')) ?? [];
  const real = await realPrice(text, sold, Date.now()).catch(() => null);
  if (real && real.low > 0) {
    const val = real.high ? Math.round(((real.low + real.high) / 2) * 100) / 100 : real.low;
    return evaluateListingSpread(id, askingPrice, val, real.source === 'melt' ? 'melt' : 'ebay');
  }

  // 3. Reference pricing (Greysheet, FMV, eBay sold comps, TCG)
  const read = quick?.read;
  const isSlabbed = Boolean(quick?.cert || read?.grade);
  const item: Partial<AppraisalItem> = {
    item_name: title,
    item_type: read?.metal ? 'coin' : 'other',
    grade: read?.grade ?? (isSlabbed ? 'MS-65' : null),
    is_slabbed: isSlabbed,
  };
  const refsResult = await refLookup(item).catch(() => null);
  if (refsResult?.refs?.length) {
    const market = marketOf(refsResult.refs, isSlabbed);
    if (market && market > 0) {
      const topRef = refsResult.refs.find((r) => r.value === market) ?? refsResult.refs[0];
      const src: ListingAppraisal['valueSource'] =
        topRef?.source === 'greysheet' ? 'greysheet' : topRef?.source === 'fmv' ? 'fmv' : 'ebay';
      return evaluateListingSpread(id, askingPrice, market, src);
    }
  }

  // 4. AI estimate fallback
  const prompt = [
    `Item title: ${title}`,
    subtitle ? `Subtitle: ${subtitle}` : '',
    `Seller asking price: $${askingPrice}`,
    'Provide estimated fair market resale value in USD.',
  ]
    .filter(Boolean)
    .join('\n');

  const answer = await askAi({
    instructions:
      'Estimate realistic fair market resale value in USD for this Buy-It-Now shop listing. Be conservative.',
    prompt,
    schema: {
      type: 'object',
      properties: {
        marketValue: { type: 'number' },
      },
      required: ['marketValue'],
      additionalProperties: false,
    },
    geminiSchema: {
      type: 'OBJECT',
      properties: {
        marketValue: { type: 'NUMBER' },
      },
      required: ['marketValue'],
    },
    usable: (t) => {
      try {
        const v = JSON.parse(t)?.marketValue;
        return typeof v === 'number' && v > 0;
      } catch {
        return false;
      }
    },
  }).catch(() => null);

  if (answer && answer.ok) {
    try {
      const parsed = JSON.parse(answer.text);
      if (typeof parsed.marketValue === 'number' && parsed.marketValue > 0) {
        return evaluateListingSpread(id, askingPrice, Math.round(parsed.marketValue * 100) / 100, 'ai');
      }
    } catch {
      // ignore parse failure
    }
  }

  return evaluateListingSpread(id, askingPrice, askingPrice, 'ai');
};
