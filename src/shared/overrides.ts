import type { ShareTarget } from './types';

// Optional replacements for built-in selectors, so a Whatnot markup change can be patched by
// editing JSON (pasted or hosted) instead of shipping a new build.
export interface SelectorOverrides {
  followButton?: string;
  showCard?: string;
  bookmarkButton?: string;
  shareButton?: string;
  shareTargets?: Partial<Record<ShareTarget, string>>;
  bidButton?: string;
  warningPattern?: string;
}

export interface OverridesState {
  value: SelectorOverrides;
  source: 'none' | 'inline' | 'url';
  fetchedAt: number | null;
  errors: string[];
}

export interface OverridesConfig {
  url: string;
  inline: string;
}

const SELECTOR_KEYS = ['followButton', 'showCard', 'bookmarkButton', 'shareButton', 'bidButton'] as const;
const TARGETS: ShareTarget[] = ['copy', 'x', 'facebook'];
const MAX_LEN = 400;

const isSelectorString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= MAX_LEN;

export const parseOverrides = (
  raw: unknown,
  isValidSelector: (selector: string) => boolean = () => true,
): { value: SelectorOverrides; errors: string[] } => {
  const errors: string[] = [];
  let data = raw;
  if (typeof raw === 'string') {
    if (!raw.trim()) return { value: {}, errors };
    try {
      data = JSON.parse(raw);
    } catch (err) {
      return { value: {}, errors: [`Not valid JSON: ${(err as Error).message}`] };
    }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { value: {}, errors: ['Overrides must be a JSON object'] };
  const input = data as Record<string, unknown>;
  const value: SelectorOverrides = {};

  for (const key of SELECTOR_KEYS) {
    const v = input[key];
    if (v === undefined) continue;
    if (isSelectorString(v) && isValidSelector(v)) value[key] = v.trim();
    else errors.push(`${key}: not a valid CSS selector`);
  }

  if (input.shareTargets !== undefined) {
    const targets = input.shareTargets as Record<string, unknown>;
    if (!targets || typeof targets !== 'object') errors.push('shareTargets: must be an object');
    else {
      const out: Partial<Record<ShareTarget, string>> = {};
      for (const t of TARGETS) {
        const v = targets[t];
        if (v === undefined) continue;
        if (isSelectorString(v) && isValidSelector(v)) out[t] = v.trim();
        else errors.push(`shareTargets.${t}: not a valid CSS selector`);
      }
      if (Object.keys(out).length) value.shareTargets = out;
    }
  }

  if (input.warningPattern !== undefined) {
    const v = input.warningPattern;
    try {
      if (typeof v !== 'string' || !v.trim() || v.length > MAX_LEN) throw new Error('empty');
      new RegExp(v, 'i');
      value.warningPattern = v;
    } catch {
      errors.push('warningPattern: not a valid regular expression');
    }
  }

  const known = new Set<string>([...SELECTOR_KEYS, 'shareTargets', 'warningPattern']);
  for (const key of Object.keys(input)) if (!known.has(key)) errors.push(`${key}: unknown key (ignored)`);
  return { value, errors };
};

// URL overrides win over pasted ones key by key, since hosted JSON is the shared fix.
export const mergeOverrides = (inline: SelectorOverrides, remote: SelectorOverrides): SelectorOverrides => ({
  ...inline,
  ...remote,
  ...(inline.shareTargets || remote.shareTargets ? { shareTargets: { ...inline.shareTargets, ...remote.shareTargets } } : {}),
});

export const EMPTY_OVERRIDES: OverridesState = { value: {}, source: 'none', fetchedAt: null, errors: [] };
