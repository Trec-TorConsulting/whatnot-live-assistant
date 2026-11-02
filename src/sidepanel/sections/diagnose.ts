import { send, sendToTab, type DiagnosticsReport } from '../../shared/messages';
import { summarizeReport } from '../format';
import { $, activeTab, toast } from '../ui';

const el = {
  highlight: $<HTMLInputElement>('#diag-highlight'),
  run: $<HTMLButtonElement>('#diag-run'),
  copy: $<HTMLButtonElement>('#diag-copy'),
  summary: $('#diag-summary'),
  raw: $('#diag-raw'),
};

let lastReport: DiagnosticsReport | null = null;

const line = (label: string, value: string, ok: boolean | null = null) => {
  const dt = document.createElement('dt');
  dt.textContent = label;
  const dd = document.createElement('dd');
  dd.textContent = value;
  if (ok !== null) dd.className = ok ? 'ok-text' : 'bad-text';
  return [dt, dd];
};

const render = (r: DiagnosticsReport) => {
  const dl = document.createElement('dl');
  dl.className = 'kv';
  for (const [k, v, ok] of summarizeReport(r)) dl.append(...line(k, v, ok));
  el.summary.replaceChildren(dl);
  el.raw.textContent = JSON.stringify(r, null, 2);
};

const showError = (message: string) => {
  const p = document.createElement('p');
  p.className = 'bad-text';
  p.textContent = message;
  el.summary.replaceChildren(p);
  el.raw.textContent = '';
};

const isReport = (r: unknown): r is DiagnosticsReport => Boolean(r && typeof r === 'object' && 'url' in r && 'showCards' in r);

export const initDiagnose = () => {
  el.run.addEventListener('click', async () => {
    const tab = activeTab();
    if (!tab?.id || !/whatnot\.com/.test(tab.url ?? '')) return showError('Open a Whatnot page in the active tab first.');
    el.run.disabled = true;
    el.summary.textContent = 'Checking the page…';
    try {
      const connected = await send('ENSURE_CONTENT', { tabId: tab.id });
      if (!connected.ok) return showError(connected.error);
      const res: unknown = await sendToTab(tab.id, 'DIAGNOSE', { highlight: el.highlight.checked });
      if (!isReport(res)) {
        return showError(`Diagnosis failed on the page: ${(res as { error?: string } | null)?.error ?? 'no report came back'}`);
      }
      lastReport = res;
      render(res);
    } catch (err) {
      showError(`Diagnosis failed: ${String((err as Error)?.message ?? err)}`);
    } finally {
      el.run.disabled = false;
    }
  });
  el.copy.addEventListener('click', async () => {
    if (!lastReport) return toast('Run a diagnosis first.');
    await navigator.clipboard.writeText(JSON.stringify(lastReport, null, 2));
    toast('Report copied.');
  });
};
