import { send } from '../../shared/messages';
import { emptyRateState, rateUsage, type RateState } from '../../shared/rateLimit';
import { DEFAULT_SHARE_SETTINGS, SHARE_GUARDRAILS, sanitizeShareSettings, type ShareSettings } from '../../shared/shareSettings';
import {
  getItem,
  getRateState,
  getSession,
  getShareSettings,
  onItemChanged,
  onSessionKeyChanged,
  setItem,
  type ShareSession,
} from '../../shared/storage';
import { SECOND, formatClock } from '../../shared/time';
import type { ShareTarget } from '../../shared/types';
import { $, li, liveIdOfTab, onActiveTab, runCommand, toast } from '../ui';

const el = {
  status: $('#share-status'),
  target: $<HTMLSelectElement>('#share-target'),
  count: $<HTMLInputElement>('#share-count'),
  quiet: $<HTMLInputElement>('#share-quiet'),
  once: $<HTMLButtonElement>('#share-once'),
  n: $<HTMLButtonElement>('#share-n'),
  auto: $<HTMLButtonElement>('#share-auto'),
  stop: $<HTMLButtonElement>('#share-stop'),
  useHour: $('#share-use-hour'),
  useDay: $('#share-use-day'),
  form: $<HTMLFormElement>('#share-settings'),
  note: $('#share-settings-note'),
  stats: $('#share-stats'),
  statsReset: $<HTMLButtonElement>('#share-stats-reset'),
  pick: $<HTMLButtonElement>('#pick-share'),
  pickClear: $<HTMLButtonElement>('#pick-clear'),
  pickStatus: $('#pick-status'),
};

const TARGET_LABEL: Record<ShareTarget, string> = { copy: 'Copy link', x: 'X', facebook: 'Facebook' };

let tabId: number | null = null;
let settings: ShareSettings = DEFAULT_SHARE_SETTINGS;
let rate: RateState = emptyRateState();
let sessions: Record<string, ShareSession> = {};

const current = () => (tabId !== null ? sessions[tabId] : undefined);

export const renderShare = () => {
  const s = current();
  const active = Boolean(s && s.status !== 'stopped');
  if (tabId === null) el.status.textContent = 'Open a Whatnot live show in the active tab.';
  else if (!s) el.status.textContent = 'Ready to share this show.';
  else if (s.status === 'waiting') el.status.textContent = `${s.message ?? 'Waiting'}. Next share at ${formatClock(s.waitUntil ?? Date.now())}. ${s.done} confirmed.`;
  else if (s.status === 'running') el.status.textContent = `Sharing: ${s.done} confirmed${s.remaining !== null ? `, ${s.remaining} left` : ''}.`;
  else el.status.textContent = `${s.message ?? 'Stopped'} · ${s.done} confirmed.`;
  for (const b of [el.once, el.n, el.auto]) b.disabled = tabId === null || active;
  el.stop.disabled = !active;

  const u = rateUsage(rate, Date.now());
  el.useHour.textContent = String(u.sharesHour);
  el.useDay.textContent = String(u.sharesDay);
  el.pick.disabled = tabId === null;
};

const renderPicked = async () => {
  const o = (await getItem('overrides'))?.value ?? {};
  const target = o.shareTargets?.[settings.target];
  el.pickStatus.textContent = o.shareButton
    ? `Using picked Share button${target ? ` and ${TARGET_LABEL[settings.target]} option` : ''}.`
    : 'Using built-in detection.';
};

const renderStats = async () => {
  const stats = await getItem('shareStats');
  const rows = Object.entries(stats?.shows ?? {}).sort((a, b) => b[1].lastAt - a[1].lastAt);
  el.stats.replaceChildren(...rows.slice(0, 30).map(([, s]) => li(`${s.title}${s.host ? ` (@${s.host})` : ''}: ${s.shares}`)));
  if (!rows.length) el.stats.replaceChildren(li('No shares yet.', 'muted'));
};

const fillForm = () => {
  el.target.value = settings.target;
  el.quiet.checked = settings.quiet;
  const f = el.form.elements as unknown as Record<string, HTMLInputElement>;
  f.min!.value = String(settings.delayMs.min / SECOND);
  f.max!.value = String(settings.delayMs.max / SECOND);
};

const saveSettings = async (patch: Partial<ShareSettings>) => {
  const input = { ...settings, ...patch };
  const clean = sanitizeShareSettings(input);
  await setItem('shareSettings', clean);
  settings = clean;
  fillForm();
  return JSON.stringify(clean) === JSON.stringify(input);
};

const start = async (count: number | null) => {
  if (tabId === null) return toast('Open a Whatnot live show first.');
  await saveSettings({ target: el.target.value as ShareTarget, quiet: el.quiet.checked });
  await runCommand(send('SHARE_START', { tabId, count }));
};

export const initShare = async () => {
  [settings, rate, sessions] = await Promise.all([getShareSettings(), getRateState(), getSession('shareSessions').then((s) => s ?? {})]);
  fillForm();
  await renderStats();

  onActiveTab((tab) => {
    tabId = liveIdOfTab(tab) && tab?.id !== undefined ? tab.id : null;
    renderShare();
  });
  onSessionKeyChanged('shareSessions', (v) => {
    sessions = (v as Record<string, ShareSession> | undefined) ?? {};
    renderShare();
  });
  onItemChanged('rate', (v) => {
    rate = v ?? emptyRateState();
    renderShare();
  });
  onItemChanged('shareSettings', (v) => {
    settings = sanitizeShareSettings(v);
    renderShare();
  });
  onItemChanged('shareStats', () => void renderStats());

  el.once.addEventListener('click', () => void start(1));
  el.n.addEventListener('click', () => {
    const n = Math.round(Number(el.count.value));
    if (!Number.isFinite(n) || n < 1) return toast('Enter how many shares.');
    void start(n);
  });
  el.auto.addEventListener('click', () => void start(null));
  el.stop.addEventListener('click', () => {
    if (tabId !== null) void runCommand(send('SHARE_STOP', { tabId }));
  });
  el.target.addEventListener('change', () => void saveSettings({ target: el.target.value as ShareTarget }));
  el.quiet.addEventListener('change', () => void saveSettings({ quiet: el.quiet.checked }));
  el.form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = el.form.elements as unknown as Record<string, HTMLInputElement>;
    void saveSettings({
      delayMs: { min: Number(f.min!.value) * SECOND, max: Number(f.max!.value) * SECOND },
    }).then(
      (exact) =>
        (el.note.textContent = exact
          ? 'Saved.'
          : `Saved. The delay was kept between ${SHARE_GUARDRAILS.delayMs.floor / SECOND} and ${SHARE_GUARDRAILS.delayMs.ceiling / SECOND} seconds.`),
    );
  });
  el.pick.addEventListener('click', () => {
    if (tabId === null) return toast('Open a Whatnot live show first.');
    void runCommand(send('PICK_START', { tabId, target: settings.target }), 'Now click the Share button on the show.');
  });
  el.pickClear.addEventListener('click', () => void runCommand(send('PICK_CLEAR', {}), 'Back to built-in detection.'));
  onItemChanged('overrides', () => void renderPicked());
  await renderPicked();
  el.statsReset.addEventListener('click', () => {
    if (!confirm('Reset share counts per show?')) return;
    void setItem('shareStats', { since: Date.now(), shows: {} });
  });
  renderShare();
};
