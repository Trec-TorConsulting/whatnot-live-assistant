import { formatMoney } from './money';

export interface ParsedAmountText {
  amount: number;
  code: string;
  usd: number | null;
  tariffs: boolean;
}

export interface CurrencyRatePair {
  amount: number;
  usd: number | null;
  code?: string | null;
}

export interface SessionCurrency {
  code: string;
  rate: number | null;
  basis?: number;
  tariffs?: boolean;
}

const PREFIX_TO_CODE: [RegExp, string][] = [
  [/^CA\$$/i, 'CAD'],
  [/^CAD$/i, 'CAD'],
  [/^(?:AU?|AUD)\$$/i, 'AUD'],
  [/^AUD$/i, 'AUD'],
  [/^NZ\$$/i, 'NZD'],
  [/^NZD$/i, 'NZD'],
  [/^MX\$$/i, 'MXN'],
  [/^MXN$/i, 'MXN'],
  [/^£$/i, 'GBP'],
  [/^GBP$/i, 'GBP'],
  [/^€$/i, 'EUR'],
  [/^EUR$/i, 'EUR'],
  [/^¥$/i, 'JPY'],
  [/^JPY$/i, 'JPY'],
  [/^(?:US)?\$$/i, 'USD'],
  [/^USD$/i, 'USD'],
];

const codeFromPrefix = (raw: string): string => {
  const clean = raw.trim();
  for (const [re, code] of PREFIX_TO_CODE) {
    if (re.test(clean)) return code;
  }
  return 'USD';
};

export const readAmountText = (text: string | null | undefined): ParsedAmountText | null => {
  if (!text) return null;
  const tariffs = /\btariffs?\b/i.test(text);
  // Strip any "(est. ...)" segment before finding the main currency amount so we don't match the est. first.
  const estMatch = text.match(/\best\.?\s*(?:US)?\$\s*([\d,]+(?:\.\d{1,2})?)/i);
  const estUsd = estMatch?.[1] ? parseFloat(estMatch[1].replace(/,/g, '')) : null;
  const withoutEst = text.replace(/\(\s*est\.?[^)]*\)/gi, ' ').replace(/\best\.?\s*(?:US)?\$\s*[\d,]+(?:\.\d{1,2})?/gi, ' ');

  const amountRe = /(CA\$|AU\$|A\$|NZ\$|MX\$|US\$|\bCAD\b|\bAUD\b|\bNZD\b|\bMXN\b|\bGBP\b|\bEUR\b|\bJPY\b|\bUSD\b|[£€¥$])\s*([\d,]+(?:\.\d{1,2})?)/i;
  const m = withoutEst.match(amountRe);
  if (!m?.[1] || !m[2]) return null;
  const amount = parseFloat(m[2].replace(/,/g, ''));
  if (!Number.isFinite(amount)) return null;
  const code = codeFromPrefix(m[1]);
  const usd = code === 'USD' ? amount : estUsd !== null && Number.isFinite(estUsd) ? estUsd : null;
  return { amount, code, usd, tariffs };
};

export const rateFrom = (pairs: readonly CurrencyRatePair[] | null | undefined): number | null => {
  if (!pairs?.length) return null;
  let best: { amount: number; usd: number } | null = null;
  for (const p of pairs) {
    if (p.code && p.code.toUpperCase() === 'USD') continue;
    if (!Number.isFinite(p.amount) || p.amount <= 0) continue;
    if (p.usd === null || p.usd === undefined || !Number.isFinite(p.usd) || p.usd <= 0) continue;
    if (!best || p.amount > best.amount) {
      best = { amount: p.amount, usd: p.usd };
    }
  }
  if (!best) return null;
  return Math.round((best.usd / best.amount) * 10000) / 10000;
};

export const toUsd = (
  amount: number | null | undefined,
  code: string | null | undefined,
  rate: number | null | undefined,
): number | null => {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return null;
  const norm = (code ?? 'USD').trim().toUpperCase() || 'USD';
  if (norm === 'USD') return Math.round(amount * 100) / 100;
  if (rate === null || rate === undefined || !Number.isFinite(rate) || rate <= 0) return null;
  return Math.round(amount * rate * 100) / 100;
};

export const formatForeignWithUsd = (
  amount: number | null | undefined,
  code: string | null | undefined,
  rateOrUsd?: number | null,
  mode: 'rate' | 'usd' = 'rate',
): string => {
  if (amount == null || !Number.isFinite(amount)) return '—';
  const norm = (code ?? 'USD').trim().toUpperCase() || 'USD';
  if (norm === 'USD') return formatMoney(amount, 'USD');
  const foreign = formatMoney(amount, norm);
  const usd =
    mode === 'usd'
      ? (rateOrUsd ?? null)
      : toUsd(amount, norm, rateOrUsd ?? null);
  return usd !== null ? `${foreign} (≈ ${formatMoney(usd, 'USD')})` : `${foreign} (not converted)`;
};
