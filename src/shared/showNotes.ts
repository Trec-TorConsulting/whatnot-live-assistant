// The seller's show-notes sticky. Whatnot loads it with GetShowNotes and writes a coupon as
// "/coupon CODE". The note is rules, the mix, and the kind of show. It is not claimed from here.
export const SHOW_NOTES_OPERATION = 'GetShowNotes';

export const SHOW_NOTES_QUERY = `query GetShowNotes($filterParams: ShowNoteFilterParams) {
  showNotes(filterParams: $filterParams) {
    id
    content { text }
    isPublished
    liveUuid
    updatedAt
  }
}`;

export interface ShowNote {
  text: string;
  coupons: string[];
  updatedAt: number | null;
}

const NOTE_CAP = 4000;
export const NOTE_PROMPT_CAP = 700;

// Whatnot's own "/coupon CODE", plus a code written out as "coupon code" or "use code".
const couponPattern = () =>
  /\/coupon\s+([A-Za-z0-9]{4,15})|\b(?:coupon|promo)\s*code\s*[:\-]?\s*([A-Za-z0-9]{4,15})\b|\buse\s+code\s+([A-Za-z0-9]{4,15})\b/gi;

export const couponsIn = (text: string): string[] => {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(couponPattern())) {
    const code = (match[1] || match[2] || match[3] || '').toUpperCase();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out;
};

const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);

// undefined: this response is not a show-notes payload, so the note already stored stays.
// null: the show has no published note.
export const readShowNote = (body: unknown, liveId: string): ShowNote | null | undefined => {
  const data = obj(obj(body)?.data);
  if (!data || !('showNotes' in data)) return undefined;
  const list = Array.isArray(data.showNotes) ? data.showNotes : [];
  const texts: string[] = [];
  let updatedAt: number | null = null;
  for (const raw of list) {
    const note = obj(raw);
    if (!note || note.isPublished === false) continue;
    const live = str(note.liveUuid);
    if (live && live !== liveId) continue;
    const text = str(obj(note.content)?.text ?? note.text);
    if (!text) continue;
    texts.push(text);
    const at = Date.parse(typeof note.updatedAt === 'string' ? note.updatedAt : '');
    if (Number.isFinite(at)) updatedAt = Math.max(updatedAt ?? 0, at);
  }
  if (!texts.length) return null;
  const full = texts.join('\n\n');
  return { text: full.slice(0, NOTE_CAP), coupons: couponsIn(full), updatedAt };
};

// Coupon codes are not part of the game. The image and the prize list still win over this text.
export const noteForPrompt = (text: string | null | undefined) =>
  (text ?? '')
    .replace(couponPattern(), ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, NOTE_PROMPT_CAP);
