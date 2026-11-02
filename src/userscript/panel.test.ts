import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPanel, panelScale, topModalDialog } from './panel';
import { DEFAULT_PHONE_SETTINGS, type PhoneSettings } from './settings';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  document.getElementById('wn2-phone-share')?.remove();
});

const make = () => {
  let settings: PhoneSettings = { ...DEFAULT_PHONE_SETTINGS };
  const onToggle = vi.fn();
  const panel = createPanel({
    version: '9.9.9',
    settings: () => settings,
    onToggle,
    onSettings: (patch) => {
      settings = { ...settings, ...patch };
    },
  });
  return { panel, onToggle, settings: () => settings };
};

describe('panelScale', () => {
  it('scales up for Request Desktop Website and never shrinks', () => {
    expect(panelScale(980, 390)).toBeCloseTo(2.51, 2);
    expect(panelScale(390, 390)).toBe(1);
    expect(panelScale(1280, 1728)).toBe(1);
    expect(panelScale(5000, 390)).toBe(3);
    expect(panelScale(980, 0)).toBe(1);
  });
});

describe('topModalDialog', () => {
  it('picks the last open modal dialog and ignores non-modal ones', () => {
    document.body.innerHTML = '<dialog open id="a"></dialog><dialog open id="b"></dialog><dialog id="c"></dialog>';
    const modal = new Set(['a', 'b']);
    vi.spyOn(Element.prototype, 'matches').mockImplementation(function (this: Element, sel: string) {
      return sel === ':modal' ? modal.has(this.id) : false;
    });
    expect(topModalDialog()?.id).toBe('b');
    modal.delete('b');
    expect(topModalDialog()?.id).toBe('a');
    modal.clear();
    expect(topModalDialog()).toBeNull();
  });
});

describe('createPanel', () => {
  it('mounts only when shown and docks into an open modal so it stays tappable', () => {
    const { panel } = make();
    expect(panel.element.isConnected).toBe(false);
    panel.dock();
    expect(panel.element.isConnected).toBe(false);

    panel.show();
    expect(panel.element.parentNode).toBe(document.documentElement);

    document.body.innerHTML = '<dialog open id="menu"></dialog>';
    const menu = document.getElementById('menu')!;
    vi.spyOn(Element.prototype, 'matches').mockImplementation(function (this: Element, sel: string) {
      return sel === ':modal' && this === menu;
    });
    panel.dock();
    expect(panel.element.parentNode).toBe(menu);

    // Whatnot unmounts the menu with the panel inside; the next dock brings it back.
    menu.remove();
    expect(panel.element.isConnected).toBe(false);
    panel.dock();
    expect(panel.element.parentNode).toBe(document.documentElement);

    panel.hide();
    expect(panel.element.isConnected).toBe(false);
    panel.dock();
    expect(panel.element.isConnected).toBe(false);
  });

  it('keeps its taps away from the page', () => {
    const { panel, onToggle } = make();
    panel.show();
    const pageClick = vi.fn();
    document.addEventListener('click', pageClick);
    panel.controls.go.click();
    document.removeEventListener('click', pageClick);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(pageClick).not.toHaveBeenCalled();
  });

  it('shows running state and saves setting changes', () => {
    const { panel, settings } = make();
    panel.setStatus({ running: true, sent: 7, confirmed: 6, message: 'Sharing via Copy link: 7 sent, 6 confirmed by Whatnot' });
    expect(panel.controls.go.textContent).toBe('Stop');
    expect(panel.controls.pill.textContent).toBe('■ 7');
    expect(panel.controls.status.textContent).toContain('6 confirmed');

    panel.controls.delay.value = '0.5';
    panel.controls.delay.dispatchEvent(new Event('change'));
    panel.controls.target.value = 'facebook';
    panel.controls.target.dispatchEvent(new Event('change'));
    panel.controls.quiet.checked = false;
    panel.controls.quiet.dispatchEvent(new Event('change'));
    expect(settings()).toMatchObject({ delaySec: 0.5, target: 'facebook', quiet: false });

    panel.setStatus({ running: false, sent: 7, confirmed: 6, message: 'Stopped. 7 sent, 6 confirmed.' });
    expect(panel.controls.go.textContent).toBe('Start sharing');
    expect(panel.controls.pill.textContent).toBe('Share');
  });
});
