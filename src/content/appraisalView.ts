// What the appraisal card shows, most important first: the max bid, why it's worth bidding, the
// numbers behind the value, and what to watch out for. Everything else stays in the side panel.
import { BASIS_LABEL, ITEM_TYPE_LABEL, MIN_COMPS, bidHeadline, isPcgsPriceable, lotLine, type AppraisalRecord } from '../shared/appraisal';
import { checksFor } from '../shared/counterfeit';
import { keyDateCallouts } from '../shared/keyDates';
import { formatMoney } from '../shared/money';
import { REF_LABEL } from '../shared/refPrice';
import { SHOW_TYPES } from '../shared/showType';
import type { TableItem } from '../shared/tableScan';
import type { AppraisalView, Fact } from './overlay';

const MAX_REASONS = 3;
const MAX_CAUTIONS = 2;
const MAX_TABLE_FACTS = 5;
const TABLE_SOURCE = { melt: 'melt', sold: 'Whatnot sold', ai: 'AI guess' } as const;

const range = (low: number, high: number) => (low === high ? formatMoney(low) : `${formatMoney(low)}–${formatMoney(high)}`);

const ozText = (oz: number) => String(Math.round(oz * 1000) / 1000);

const modelLabel = (model: string | null) => {
  if (!model) return null;
  if (model === 'on-device') return 'on-device AI';
  return model.startsWith('ollama:') ? `Ollama ${model.slice('ollama:'.length)}` : model;
};

// The max bid is a share of the value, and for an AI-only value no more than the low end of its
// range, so the value itself goes right under it. A low-confidence read has no bid number.
const valueLine = (record: AppraisalRecord) => {
  const model = modelLabel(record.model);
  if (record.confidence === 'low') return model ? `by ${model}` : null;
  const v = record.valuation;
  const qty = Math.max(1, record.quantity || 1);
  const worth =
    v.marketValue !== null && v.suggestedMax !== null && v.marketValue > v.suggestedMax
      ? v.basis === 'estimate' && record.estimate
        ? `Worth about ${formatMoney(v.marketValue)} · AI range ${range(record.estimate.low * qty, record.estimate.high * qty)}`
        : `Worth ${formatMoney(v.marketValue)}`
      : null;
  return [worth, model ? `by ${model}` : null].filter(Boolean).join(' · ') || null;
};

const calibrationText = (record: AppraisalRecord) => {
  const c = record.calibration;
  if (!c || c.factor === 1) return '';
  return `, adjusted ×${c.factor} from ${c.samples} past ${SHOW_TYPES[c.showType].label.toLowerCase()} sales`;
};

export const messageView = (status: AppraisalView['status'], title: string, cautions: string[] = [], subtitle: string | null = null): AppraisalView => ({
  status,
  title,
  subtitle,
  highlight: null,
  reasons: [],
  facts: [],
  cautions,
  footer: null,
  similar: [],
});

export const tableScanView = (items: TableItem[], onDemand = true): AppraisalView => {
  const cautions = items.filter((t): t is TableItem & { warning: string } => Boolean(t.warning)).map((t) => `${t.name}: ${t.warning}`);
  const facts: Fact[] = items.slice(0, MAX_TABLE_FACTS).map((t, i) => {
    const rest = i === MAX_TABLE_FACTS - 1 && items.length > MAX_TABLE_FACTS ? ` · +${items.length - MAX_TABLE_FACTS} more` : '';
    const loc = t.where ? `[${t.where}]` : '';
    return {
      label: i === 0 ? (onDemand ? 'Top Pick' : 'On the stall') : `#${i + 1}`,
      value: `${t.source === 'melt' ? `≥ ${formatMoney(t.low)}` : range(t.low, t.high)}${t.quantity > 1 ? ` each ×${t.quantity}` : ''}`,
      detail: [loc, t.name, TABLE_SOURCE[t.source]].filter(Boolean).join(' ') + rest,
    };
  });
  return {
    ...messageView('done', onDemand ? 'Table Top Picks' : 'On the stall', cautions),
    facts,
    footer: items.length
      ? `${items.length} item${items.length === 1 ? '' : 's'} ranked across the scene.`
      : 'Table scan found no collectible items clearly visible.',
  };
};

export const idleTableView = (items: TableItem[]): AppraisalView => tableScanView(items, false);

// Before the video is read: a key date in the lot title is a fact worth showing right away, even
// for coins with no metal value (the quick read only covers precious metal).
export const listingView = (lotTitle: string | null): AppraisalView | null => {
  const callouts = lotTitle ? keyDateCallouts({ text: lotTitle }) : [];
  if (!callouts.length) return null;
  return {
    ...messageView('pending', lotTitle!, callouts.some((c) => c.faked) ? ['Key dates are often faked or altered; raw ones are a risk.'] : []),
    reasons: callouts.map((c) => c.text).slice(0, MAX_REASONS),
    footer: 'Checking the video…',
  };
};

export const appraisalView = (record: AppraisalRecord, status: AppraisalView['status'], similar: string[]): AppraisalView => {
  const v = record.valuation;
  const coinLike = !record.itemType || isPcgsPriceable(record.itemType);
  const callouts = coinLike
    ? keyDateCallouts({
        text: [record.name, record.lotTitle, record.listing].filter(Boolean).join('\n'),
        year: record.year ?? null,
        mint: record.mintMark ?? null,
      })
    : [];
  const isKnown = callouts.some((c) => c.kind !== 'check');

  const reasons = [
    ...callouts.map((c) => c.text),
    // The table's facts beat the model's note, which would mostly restate them.
    record.special && !isKnown ? `AI note: ${record.special}` : null,
  ]
    .filter((r): r is string => Boolean(r))
    .slice(0, MAX_REASONS);

  const facts: Fact[] = [];
  const lot = record.lot;
  const top = lot && lot.pieces.length >= 2 ? lot.pieces[0] : undefined;
  if (lot && top) {
    facts.push({ label: 'By price', value: lotLine(top), detail: lot.pieces.slice(1).map(lotLine).join(' · ') || null });
    facts.push({
      label: 'Total',
      value: formatMoney(lot.total),
      detail: lot.pieces.some((p) => p.guess) ? 'Other items are AI guesses, counted at the low end.' : null,
    });
  }
  if (v.marketValue !== null) {
    const each = record.quantity > 1 ? ` (${record.quantity} × ${formatMoney(v.marketValue / record.quantity)})` : '';
    facts.push({
      label: 'Market',
      value: `${formatMoney(v.marketValue)}${each}`,
      detail:
        v.basis === 'estimate' && record.estimate
          ? `AI guess ${range(record.estimate.low, record.estimate.high)} each${calibrationText(record)}`
          : BASIS_LABEL[v.basis] || null,
    });
  }
  if (record.price?.guide && record.price.guide > 0 && v.basis !== 'guide') {
    facts.push({ label: 'PCGS guide', value: formatMoney(record.price.guide), detail: 'price guide, not a sale' });
  }
  for (const ref of record.refs ?? []) {
    if (ref.kind === 'verified') {
      facts.push({ label: REF_LABEL[ref.source], value: ref.mismatch ? 'Does not match' : (ref.detail ?? 'Verified'), detail: ref.name });
      continue;
    }
    if (ref.value === null) {
      facts.push({ label: REF_LABEL[ref.source], value: '—', detail: [ref.name, ref.detail].filter(Boolean).join(' · ') });
      continue;
    }
    const value = ref.kind === 'range' && ref.high ? range(ref.value, ref.high) : formatMoney(ref.value);
    const isGradedComp = ref.source === 'greysheet' || ref.source === 'fmv' || ref.source === 'ebay';
    const note =
      ref.kind === 'listed'
        ? (ref.detail ?? 'lowest asking')
        : ref.kind === 'market' && record.slabbed && !isGradedComp
          ? 'raw price; graded sells differently'
          : ref.detail;
    facts.push({ label: REF_LABEL[ref.source], value, detail: [ref.name, note].filter(Boolean).join(' · ') });
  }
  const auctions = record.price?.auctions;
  if (auctions?.count && auctions.low !== undefined && auctions.high !== undefined) {
    facts.push({ label: 'PCGS sales', value: `${auctions.count} sold ${range(auctions.low, auctions.high)}`, detail: null });
  }
  const comps = record.comps;
  if (comps) {
    facts.push({
      label: 'Whatnot sold',
      value: comps.count >= MIN_COMPS ? `${comps.count} sold ${range(comps.low, comps.high)}` : `1 sold ${formatMoney(comps.low)}`,
      detail: comps.count >= MIN_COMPS ? `median ${formatMoney(comps.median)}` : 'too few to set the value',
    });
  }
  if (record.melt) {
    facts.push({ label: 'Melt', value: formatMoney(record.melt.total), detail: `${ozText(record.melt.oz)} oz ${record.melt.metal} each` });
  }
  const table = record.table ?? [];
  table.slice(0, MAX_TABLE_FACTS).forEach((t, i) => {
    const rest = i === MAX_TABLE_FACTS - 1 && table.length > MAX_TABLE_FACTS ? ` · +${table.length - MAX_TABLE_FACTS} more` : '';
    facts.push({
      label: i === 0 ? 'On the table' : '',
      value: `${t.source === 'melt' ? `≥ ${formatMoney(t.low)}` : range(t.low, t.high)}${t.quantity > 1 ? ` each ×${t.quantity}` : ''}`,
      detail: [t.name, t.where, TABLE_SOURCE[t.source]].filter(Boolean).join(' · ') + rest,
    });
  });

  // A doubtful ID undercuts everything else on the card, so it comes first.
  const headline = bidHeadline(record);
  const priciest = lot?.pieces[0];
  const badCert = record.refs?.find((r) => r.kind === 'verified' && r.mismatch);
  const aboutThis = headline?.startsWith('Max bid') ? 'Max bid' : headline?.startsWith('Guess') ? 'The guess' : headline?.startsWith('Melt') ? 'The melt value' : 'This read';
  const cautions = [
    badCert ? `The ${REF_LABEL[badCert.source]} is for ${badCert.name}, not what was read. Check the slab.` : null,
    priciest && priciest.name !== record.name
      ? `Priciest in this lot is ${lotLine(priciest)}. ${aboutThis} is for this item.`
      : null,
    record.confidence === 'low' ? `Not sure what this is${record.notes ? `: ${record.notes}` : '.'}` : null,
    callouts.some((c) => c.faked) && !record.slabbed ? 'Key dates are often faked or altered; raw ones are a risk.' : null,
    v.basis === 'estimate' ? 'No real sales found: the value is an AI guess.' : null,
    v.marketValue === null && status === 'done' && !(record.price?.guide && record.price.guide > 0)
      ? 'No sales, price guide, or metal value, so no max bid.'
      : null,
  ]
    .filter((c): c is string => Boolean(c))
    .slice(0, MAX_CAUTIONS);

  const checks = checksFor({
    itemType: record.itemType,
    slabbed: Boolean(record.slabbed),
    metal: record.melt?.metal ?? null,
    keyDate: isKnown,
    showType: record.showType,
    title: [record.name, record.lotTitle].filter(Boolean).join(' '),
  });
  const kind = record.itemType && record.itemType !== 'other' ? ITEM_TYPE_LABEL[record.itemType] : null;
  const confidence = record.confidence === 'quick' ? 'from the listing' : record.confidence !== 'high' ? `${record.confidence} confidence` : null;
  const more = lot && lot.pieces.length > 1 ? `+${lot.pieces.length - 1} more` : null;

  const qtyLabel = record.countNote ?? (record.quantity > 1 ? `x${record.quantity}` : null);

  return {
    status,
    title: record.name,
    subtitle: [kind, record.grade, qtyLabel, more, confidence].filter(Boolean).join(' · ') || null,
    highlight: headline,
    valueLine: valueLine(record),
    reasons,
    facts,
    cautions,
    footer:
      status === 'quick'
        ? 'Checking the video…'
        : (record.tableNote ?? (record.table && !record.table.length ? 'Table scan found nothing else worth calling out.' : (record.refNotes?.[0] ?? null))),
    similar,
    checks,
  };
};
