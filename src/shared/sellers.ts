const USERNAME_RE = /^[A-Za-z0-9_.-]{1,50}$/;

export interface ParsedSellers {
  sellers: string[];
  invalid: string[];
}

const toUsername = (raw: string): string | null => {
  const entry = raw.trim();
  if (!entry) return null;
  if (/^(https?:\/\/)?([a-z0-9-]+\.)*whatnot\.com\//i.test(entry)) {
    const match = entry.match(/\/user\/([^/?#\s]+)/i);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  }
  const name = entry.replace(/^@/, '');
  return USERNAME_RE.test(name) ? name : null;
};

// Accepts one seller per line (or comma/space separated): `name`, `@name`, or a whatnot.com/user/ URL.
export const parseSellerList = (text: string): ParsedSellers => {
  const seen = new Set<string>();
  const sellers: string[] = [];
  const invalid: string[] = [];
  for (const token of text.split(/[\s,]+/)) {
    if (!token.trim()) continue;
    const name = toUsername(token);
    if (!name || !USERNAME_RE.test(name)) {
      invalid.push(token.trim());
      continue;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    sellers.push(name);
  }
  return { sellers, invalid };
};

export const sellerUrl = (name: string) => `https://www.whatnot.com/user/${encodeURIComponent(name)}`;
