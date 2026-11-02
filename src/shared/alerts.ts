import { DAY, MINUTE } from './time';

export interface AlertSettings {
  giveaways: boolean;
  chatKeywords: string[];
  showStarting: boolean;
  leadMinutes: number;
  myWins: boolean;
}

export const DEFAULT_ALERT_SETTINGS: AlertSettings = {
  giveaways: true,
  chatKeywords: [],
  showStarting: true,
  leadMinutes: 10,
  myWins: true,
};

export const sanitizeAlertSettings = (input: unknown): AlertSettings => {
  const s = (input ?? {}) as Partial<AlertSettings>;
  const d = DEFAULT_ALERT_SETTINGS;
  const keywords = Array.isArray(s.chatKeywords) ? s.chatKeywords : [];
  const lead = typeof s.leadMinutes === 'number' && Number.isFinite(s.leadMinutes) ? Math.round(s.leadMinutes) : d.leadMinutes;
  return {
    giveaways: typeof s.giveaways === 'boolean' ? s.giveaways : d.giveaways,
    chatKeywords: [...new Set(keywords.map((k) => String(k).trim().toLowerCase()).filter((k) => k.length >= 2 && k.length <= 40))].slice(0, 30),
    showStarting: typeof s.showStarting === 'boolean' ? s.showStarting : d.showStarting,
    leadMinutes: Math.min(120, Math.max(1, lead)),
    myWins: typeof s.myWins === 'boolean' ? s.myWins : d.myWins,
  };
};

export const parseKeywords = (text: string) => text.split(/[,\n]/).map((k) => k.trim()).filter(Boolean);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const matchKeywords = (text: string, keywords: string[]): string[] =>
  keywords.filter((k) => new RegExp(`(^|[^\\w])${escapeRe(k)}($|[^\\w])`, 'i').test(text));

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const setClock = (base: Date, hour: number, minute: number, ampm: string | undefined) => {
  let h = hour % 12;
  if (ampm?.toLowerCase() === 'pm') h += 12;
  if (!ampm) h = hour;
  const d = new Date(base);
  d.setHours(h, minute, 0, 0);
  return d;
};

// Calendar days, not 24h blocks, so daylight-saving changes don't shift the clock time.
const addDays = (base: Date, days: number) => {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
};

// Show cards say "Fri 6:30 AM", "Today 3:00 PM", "Tomorrow 1:00 PM", or "Oct 28 6:30 PM".
export const parseShowTime = (text: string, now: number): number | null => {
  const t = text.replace(/\s+/g, ' ').trim();
  const clock = t.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
  if (!clock) return null;
  const hour = parseInt(clock[1]!, 10);
  const minute = parseInt(clock[2]!, 10);
  const ampm = clock[3];
  const today = new Date(now);
  const lower = t.toLowerCase();

  if (/\btoday\b/.test(lower)) return setClock(today, hour, minute, ampm).getTime();
  if (/\btomorrow\b/.test(lower)) return setClock(addDays(today, 1), hour, minute, ampm).getTime();

  const month = MONTHS.findIndex((m) => new RegExp(`\\b${m}[a-z]*\\.?\\s+(\\d{1,2})\\b`).test(lower));
  if (month >= 0) {
    const day = parseInt(lower.match(new RegExp(`\\b${MONTHS[month]}[a-z]*\\.?\\s+(\\d{1,2})\\b`))![1]!, 10);
    const d = setClock(new Date(today.getFullYear(), month, day), hour, minute, ampm);
    if (d.getTime() < now - 180 * DAY) d.setFullYear(d.getFullYear() + 1);
    return d.getTime();
  }

  const dow = DAYS.findIndex((d) => new RegExp(`\\b${d}[a-z]*\\b`).test(lower));
  if (dow >= 0) {
    const ahead = (dow - today.getDay() + 7) % 7;
    let d = setClock(addDays(today, ahead), hour, minute, ampm);
    if (d.getTime() < now - 6 * 60 * MINUTE) d = setClock(addDays(today, ahead + 7), hour, minute, ampm);
    return d.getTime();
  }
  return setClock(today, hour, minute, ampm).getTime();
};

export interface WatchedShow {
  liveId: string;
  title: string;
  host: string | null;
  startsAt: number;
  notifiedAt: number | null;
  seenAt: number;
}

export const MAX_WATCHED = 500;

export const mergeWatched = (current: WatchedShow[], incoming: Omit<WatchedShow, 'notifiedAt'>[], now: number): WatchedShow[] => {
  const byId = new Map(current.map((s) => [s.liveId, s]));
  for (const s of incoming) {
    const prev = byId.get(s.liveId);
    byId.set(s.liveId, {
      ...s,
      notifiedAt: prev && Math.abs(prev.startsAt - s.startsAt) < 5 * MINUTE ? prev.notifiedAt : null,
    });
  }
  return Array.from(byId.values())
    .filter((s) => s.startsAt > now - 6 * 60 * MINUTE)
    .sort((a, b) => a.startsAt - b.startsAt)
    .slice(0, MAX_WATCHED);
};

export const dueShows = (shows: WatchedShow[], now: number, leadMinutes: number) =>
  shows.filter((s) => !s.notifiedAt && s.startsAt - now <= leadMinutes * MINUTE && s.startsAt - now > -15 * MINUTE);
