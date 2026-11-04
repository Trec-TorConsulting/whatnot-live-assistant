export const formatMoney = (n: number | null | undefined, currency = 'USD') => {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: n >= 100 || Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: n >= 100 ? 0 : 2,
  });
};

export const parseMoneyText = (s: string | null | undefined): number | null => {
  const m = String(s ?? '').replace(/,/g, '').match(/\$\s*(\d+(?:\.\d{1,2})?)/);
  return m?.[1] ? parseFloat(m[1]) : null;
};

const toNumber = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim()) {
    const n = parseFloat(v.replace(/[$,\s]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

// Whatnot's GraphQL Money objects are in minor units: { amount: 11900, currency: 'USD' } is $119.
export const moneyValue = (v: unknown, keyHint = ''): number | null => {
  if (v == null) return null;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const minor = toNumber(o.amount ?? o.amountSafe ?? o.amountCents ?? o.cents);
    if (minor !== null) return minor / 100;
    const major = toNumber(o.value ?? o.dollars);
    return major;
  }
  const n = toNumber(v);
  if (n === null) return null;
  return /cents/i.test(keyHint) ? n / 100 : n;
};

export const moneyCurrency = (v: unknown): string | null => {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const raw = o.currency ?? o.currencyCode ?? o.code;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  return raw.trim().toUpperCase();
};
