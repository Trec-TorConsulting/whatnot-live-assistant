import { describe, expect, it } from 'vitest';
import { DEFAULT_PHONE_SETTINGS, loadPhoneSettings, sanitizePhoneSettings, savePhoneSettings } from './settings';

describe('sanitizePhoneSettings', () => {
  it('falls back to defaults for junk', () => {
    expect(sanitizePhoneSettings(null)).toEqual(DEFAULT_PHONE_SETTINGS);
    expect(sanitizePhoneSettings({ target: 'myspace', delaySec: 'fast', quiet: 1, pos: 'left' })).toEqual(DEFAULT_PHONE_SETTINGS);
  });

  it('keeps the delay between 0.5s and 120s, to a tenth of a second', () => {
    expect(sanitizePhoneSettings({ delaySec: 0.1 }).delaySec).toBe(0.5);
    expect(sanitizePhoneSettings({ delaySec: 0.5 }).delaySec).toBe(0.5);
    expect(sanitizePhoneSettings({ delaySec: 2.25 }).delaySec).toBe(2.3);
    expect(sanitizePhoneSettings({ delaySec: 999 }).delaySec).toBe(120);
    expect(sanitizePhoneSettings({ delaySec: Number.NaN }).delaySec).toBe(DEFAULT_PHONE_SETTINGS.delaySec);
  });

  it('keeps the panel position on screen', () => {
    expect(sanitizePhoneSettings({ pos: { x: -1, y: 2 } }).pos).toEqual({ x: 0, y: 1 });
  });
});

describe('load/save', () => {
  it('round-trips through storage and survives bad JSON', () => {
    localStorage.clear();
    expect(loadPhoneSettings()).toEqual(DEFAULT_PHONE_SETTINGS);
    savePhoneSettings({ ...DEFAULT_PHONE_SETTINGS, target: 'facebook', delaySec: 0.5, quiet: false });
    expect(loadPhoneSettings()).toMatchObject({ target: 'facebook', delaySec: 0.5, quiet: false });
    localStorage.setItem('wn2-phone-share', '{not json');
    expect(loadPhoneSettings()).toEqual(DEFAULT_PHONE_SETTINGS);
  });
});
