import { SECOND } from '../shared/time';
import { initAlerts } from './sections/alerts';
import { initBulk, renderBulk } from './sections/bulk';
import { initBuys } from './sections/buys';
import { initDiagnose } from './sections/diagnose';
import { initLive, renderLive } from './sections/live';
import { initSettings } from './sections/settings';
import { initShare, renderShare } from './sections/share';
import { initWheel, renderWheel } from './sections/wheel';
import { $, startTabTracking } from './ui';

const TAB_KEY = 'wn2_sidepanel_tab';

const showTab = (name: string) => {
  for (const b of document.querySelectorAll<HTMLButtonElement>('#tabs button')) b.classList.toggle('active', b.dataset.tab === name);
  for (const p of document.querySelectorAll<HTMLElement>('main[data-panel]')) p.hidden = p.dataset.panel !== name;
  localStorage.setItem(TAB_KEY, name);
};

const init = async () => {
  $('#tabs').addEventListener('click', (e) => {
    const tab = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-tab]')?.dataset.tab;
    if (tab) showTab(tab);
  });
  showTab(localStorage.getItem(TAB_KEY) ?? 'live');

  await startTabTracking();
  await Promise.all([initLive(), initShare(), initBulk(), initBuys(), initAlerts(), initSettings(), initWheel()]);
  initDiagnose();

  // Countdowns (lot timers, job waits, share waits, wheel freshness) tick once a second.
  setInterval(() => {
    renderBulk();
    renderLive();
    renderShare();
    renderWheel();
  }, SECOND);
};

void init();
