import type { ShareTarget } from '../shared/types';

export interface PhoneSettings {
  target: ShareTarget;
  delaySec: number;
  quiet: boolean;
  // Panel position as a fraction of the viewport, so it survives rotation.
  pos: { x: number; y: number };
}

export const DELAY_FLOOR_SEC = 0.5;
export const DELAY_CEILING_SEC = 120;

export const DEFAULT_PHONE_SETTINGS: PhoneSettings = {
  target: 'copy',
  delaySec: 3,
  quiet: true,
  pos: { x: 0.96, y: 0.7 },
};

const KEY = 'wn2-phone-share';
const TARGETS: ShareTarget[] = ['copy', 'x', 'facebook'];

const fraction = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;

export const sanitizePhoneSettings = (input: unknown): PhoneSettings => {
  const s = (input && typeof input === 'object' ? input : {}) as Partial<PhoneSettings>;
  const d = DEFAULT_PHONE_SETTINGS;
  const delay = typeof s.delaySec === 'number' && Number.isFinite(s.delaySec) ? s.delaySec : d.delaySec;
  return {
    target: TARGETS.includes(s.target as ShareTarget) ? (s.target as ShareTarget) : d.target,
    delaySec: Math.round(Math.min(DELAY_CEILING_SEC, Math.max(DELAY_FLOOR_SEC, delay)) * 10) / 10,
    quiet: typeof s.quiet === 'boolean' ? s.quiet : d.quiet,
    pos: { x: fraction(s.pos?.x, d.pos.x), y: fraction(s.pos?.y, d.pos.y) },
  };
};

export const loadPhoneSettings = (storage: Storage = localStorage): PhoneSettings => {
  try {
    return sanitizePhoneSettings(JSON.parse(storage.getItem(KEY) ?? 'null'));
  } catch {
    return sanitizePhoneSettings(null);
  }
};

export const savePhoneSettings = (settings: PhoneSettings, storage: Storage = localStorage) => {
  const clean = sanitizePhoneSettings(settings);
  try {
    storage.setItem(KEY, JSON.stringify(clean));
  } catch {
    // Private browsing can refuse storage; the settings still apply for this page.
  }
  return clean;
};
