import type { LiveSession } from '../../shared/live';
import { send } from '../../shared/messages';
import { emptyRateState, rateUsage, type RateState } from '../../shared/rateLimit';
import { DEFAULT_SETTINGS, sanitizeSettings, type Settings } from '../../shared/settings';
import { getItem, getRateState, getSettings, getTabLive, liveKey, onItemChanged, onSessionKeyChanged, setItem } from '../../shared/storage';
import { MINUTE, SECOND, formatClock } from '../../shared/time';
import { isActiveJob, type Job } from '../../shared/types';
import { describeResult, describeStatus, summarize } from '../format';
import { $, liveIdOfTab, onActiveTab, profileUserOfTab, runCommand, toast } from '../ui';

const el = {
  pill: $('#status-pill'),
  job: $('#job'),
  jobTitle: $('#job-title'),
  jobDetail: $('#job-detail'),
  jobPause: $<HTMLButtonElement>('#job-pause'),
  jobResume: $<HTMLButtonElement>('#job-resume'),
  jobStop: $<HTMLButtonElement>('#job-stop'),
  jobClear: $<HTMLButtonElement>('#job-clear'),
  jobProgress: $<HTMLProgressElement>('#job-progress'),
  jobSummary: $('#job-summary'),
  jobResults: $('#job-results'),
  followDry: $<HTMLInputElement>('#follow-dry'),
  followStart: $<HTMLButtonElement>('#follow-start'),
  undoUnfollow: $<HTMLInputElement>('#undo-unfollow'),
  undoUnbookmark: $<HTMLInputElement>('#undo-unbookmark'),
  undoDry: $<HTMLInputElement>('#undo-dry'),
  undoStart: $<HTMLButtonElement>('#undo-start'),
  useHour: $('#use-hour'),
  useDay: $('#use-day'),
  useFollowHour: $('#use-follow-hour'),
  useFollowDay: $('#use-follow-day'),
  useCooldown: $('#use-cooldown'),
  settings: $<HTMLFormElement>('#settings'),
  settingsReset: $<HTMLButtonElement>('#settings-reset'),
  settingsNote: $('#settings-note'),
};

let job: Job | null = null;
let rate: RateState = emptyRateState();
let settings: Settings = DEFAULT_SETTINGS;
let renderedResults = -1;
let renderedJobId: string | null = null;
let show: LiveSession['show'] | null = null;
let unwatchShow: (() => void) | null = null;
let profileUser: string | null = null;

const host = () => profileUser ?? (show?.host?.replace(/^@/, '') || null);

const renderHost = () => {
  const h = host();
  const active = isActiveJob(job);
  el.followStart.disabled = active || !h;
  el.undoStart.disabled = active || !h;
  el.followStart.textContent = h ? `Follow + Bookmark @${h}` : 'Follow + Bookmark host';
  el.undoStart.textContent = h ? `Unfollow / Unbookmark @${h}` : 'Unfollow / Unbookmark host';
};

const watchShow = async (tabId: number | null) => {
  unwatchShow?.();
  unwatchShow = null;
  show = null;
  if (tabId !== null) {
    show = (await getTabLive(tabId))?.show ?? null;
    unwatchShow = onSessionKeyChanged(liveKey(tabId), (v) => {
      show = (v as LiveSession | undefined)?.show ?? null;
      renderHost();
    });
  }
  renderHost();
};

const renderJob = (now: number) => {
  const status = describeStatus(job, now);
  el.pill.textContent = status.label;
  el.pill.className = `pill ${status.tone}`;

  const active = isActiveJob(job);
  renderHost();

  if (!job) {
    el.job.hidden = true;
    return;
  }
  const current = job;
  el.job.hidden = false;
  const action = current.kind === 'follow_bookmark' ? 'Follow + Bookmark' : 'Unfollow / Unbookmark';
  el.jobTitle.textContent = `${current.dryRun ? 'Preview: ' : ''}${action}`;
  el.jobDetail.textContent = status.detail;
  el.jobPause.hidden = !(current.status === 'running' || current.status === 'waiting');
  el.jobResume.hidden = current.status !== 'paused';
  el.jobStop.hidden = !active;
  el.jobClear.hidden = active;
  el.jobProgress.max = Math.max(1, current.sellers.length);
  el.jobProgress.value = current.results.length;
  el.jobSummary.textContent = summarize(current);

  if (renderedJobId !== current.id || renderedResults !== current.results.length) {
    renderedJobId = current.id;
    renderedResults = current.results.length;
    el.jobResults.replaceChildren(
      ...current.results
        .slice()
        .reverse()
        .map((r) => {
          const item = document.createElement('li');
          item.textContent = `@${r.seller}: ${describeResult(r, current)}`;
          if (r.error || r.follow === 'failed' || r.bookmarksFailed) item.className = 'bad';
          return item;
        }),
    );
  }
};

const renderRate = (now: number) => {
  const u = rateUsage(rate, now);
  el.useHour.textContent = `${u.hour} / ${settings.maxActionsPerHour}`;
  el.useDay.textContent = `${u.day} / ${settings.maxActionsPerDay}`;
  el.useFollowHour.textContent = `${u.followsHour} / ${settings.maxFollowsPerHour}`;
  el.useFollowDay.textContent = `${u.followsDay} / ${settings.maxFollowsPerDay}`;
  el.useCooldown.textContent =
    u.notBefore - now > 30 * SECOND ? `Cooling down: no actions until ${formatClock(u.notBefore)}` : '';
};

export const renderBulk = () => {
  const now = Date.now();
  renderJob(now);
  renderRate(now);
};

const fields = () => el.settings.elements as unknown as Record<string, HTMLInputElement>;

const fillSettingsForm = (s: Settings) => {
  const f = fields();
  const set = (name: string, value: number) => {
    const input = f[name];
    if (input) input.value = String(Math.round(value * 10) / 10);
  };
  set('actionMin', s.actionDelayMs.min / SECOND);
  set('actionMax', s.actionDelayMs.max / SECOND);
  set('sellerMin', s.sellerDelayMs.min / SECOND);
  set('sellerMax', s.sellerDelayMs.max / SECOND);
  set('breakEvery', s.breakEverySellers);
  set('breakMin', s.breakMs.min / MINUTE);
  set('breakMax', s.breakMs.max / MINUTE);
  set('perHour', s.maxActionsPerHour);
  set('perDay', s.maxActionsPerDay);
  set('followsHour', s.maxFollowsPerHour);
  set('followsDay', s.maxFollowsPerDay);
  set('perSeller', s.maxBookmarksPerSeller);
  set('cooldown', s.warningCooldownMs / MINUTE);
};

const readSettingsForm = (): Settings => {
  const f = fields();
  const num = (name: string) => Number(f[name]?.value);
  return {
    actionDelayMs: { min: num('actionMin') * SECOND, max: num('actionMax') * SECOND },
    sellerDelayMs: { min: num('sellerMin') * SECOND, max: num('sellerMax') * SECOND },
    breakEverySellers: num('breakEvery'),
    breakMs: { min: num('breakMin') * MINUTE, max: num('breakMax') * MINUTE },
    maxActionsPerHour: num('perHour'),
    maxActionsPerDay: num('perDay'),
    maxFollowsPerHour: num('followsHour'),
    maxFollowsPerDay: num('followsDay'),
    maxBookmarksPerSeller: num('perSeller'),
    warningCooldownMs: num('cooldown') * MINUTE,
  };
};

const saveSettings = async (input: Settings) => {
  const clean = sanitizeSettings(input);
  await setItem('settings', clean);
  settings = clean;
  fillSettingsForm(clean);
  el.settingsNote.textContent =
    JSON.stringify(clean) === JSON.stringify(input) ? 'Saved.' : 'Saved. Some values were adjusted to stay within the safe limits.';
  renderBulk();
};

const bind = () => {
  el.followStart.addEventListener('click', () => {
    const h = host();
    if (!h) return toast('Open a live show or seller profile first.');
    void runCommand(send('JOB_START', { kind: 'follow_bookmark', sellers: [h], dryRun: el.followDry.checked }));
  });

  el.undoStart.addEventListener('click', () => {
    const h = host();
    const undo = { unfollow: el.undoUnfollow.checked, unbookmark: el.undoUnbookmark.checked };
    if (!h) return toast('Open a live show or seller profile first.');
    if (!undo.unfollow && !undo.unbookmark) return toast('Pick unfollow, remove bookmarks, or both.');
    const dryRun = el.undoDry.checked;
    const what = [undo.unfollow && 'unfollow', undo.unbookmark && 'remove show bookmarks for'].filter(Boolean).join(' and ');
    if (!dryRun && !confirm(`This will ${what} @${h}. Continue?`)) return;
    void runCommand(send('JOB_START', { kind: 'unfollow_unbookmark', sellers: [h], undo, dryRun }));
  });

  el.jobPause.addEventListener('click', () => void runCommand(send('JOB_PAUSE', {})));
  el.jobResume.addEventListener('click', () => void runCommand(send('JOB_RESUME', {})));
  el.jobStop.addEventListener('click', () => void runCommand(send('JOB_STOP', {})));
  el.jobClear.addEventListener('click', () => void runCommand(send('JOB_CLEAR', {})));

  el.settings.addEventListener('submit', (e) => {
    e.preventDefault();
    void saveSettings(readSettingsForm());
  });
  el.settingsReset.addEventListener('click', () => void saveSettings(DEFAULT_SETTINGS));

  onItemChanged('job', (value) => {
    job = value ?? null;
    renderBulk();
  });
  onItemChanged('rate', (value) => {
    rate = value ?? emptyRateState();
    renderBulk();
  });
  onItemChanged('settings', (value) => {
    settings = sanitizeSettings(value);
    renderBulk();
  });
};

export const initBulk = async () => {
  const [savedJob, savedRate, savedSettings] = await Promise.all([getItem('job'), getRateState(), getSettings()]);
  job = savedJob ?? null;
  rate = savedRate;
  settings = savedSettings;
  fillSettingsForm(settings);
  bind();
  onActiveTab((tab) => {
    profileUser = profileUserOfTab(tab);
    void watchShow(liveIdOfTab(tab) && tab?.id !== undefined ? tab.id : null);
  });
  renderBulk();
};
