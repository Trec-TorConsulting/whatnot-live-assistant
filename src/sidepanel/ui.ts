import type { Result } from '../shared/messages';

export const $ = <T extends HTMLElement = HTMLElement>(selector: string) => {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Missing ${selector}`);
  return el;
};

export const li = (text: string, className = '') => {
  const item = document.createElement('li');
  item.textContent = text;
  if (className) item.className = className;
  return item;
};

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export const toast = (message: string) => {
  const el = $('#toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 4000);
};

export const runCommand = async (command: Promise<Result>, success?: string) => {
  try {
    const res = await command;
    if (!res.ok) toast(res.error);
    else if (success) toast(success);
    return res.ok;
  } catch (err) {
    toast(String((err as Error)?.message ?? err));
    return false;
  }
};

export const numberOf = (input: HTMLInputElement): number | null => {
  const n = parseFloat(input.value);
  return Number.isFinite(n) ? n : null;
};

export const setNumber = (input: HTMLInputElement, value: number | null | undefined) => {
  input.value = value === null || value === undefined || value === 0 ? '' : String(Math.round(value * 100) / 100);
};

// The side panel follows whichever tab is active in its window.
type TabListener = (tab: chrome.tabs.Tab | null) => void;
const tabListeners = new Set<TabListener>();
let currentTab: chrome.tabs.Tab | null = null;

export const activeTab = () => currentTab;
export const liveIdOfTab = (tab: chrome.tabs.Tab | null) => tab?.url?.match(/whatnot\.com\/live\/([^/?#]+)/)?.[1] ?? null;
export const profileUserOfTab = (tab: chrome.tabs.Tab | null) => {
  const raw = tab?.url?.match(/whatnot\.com\/user\/([^/?#]+)/)?.[1];
  return raw ? decodeURIComponent(raw) : null;
};

const refreshTab = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const changed = tab?.id !== currentTab?.id || tab?.url !== currentTab?.url;
  currentTab = tab ?? null;
  if (changed) tabListeners.forEach((fn) => fn(currentTab));
};

export const onActiveTab = (fn: TabListener) => {
  tabListeners.add(fn);
  fn(currentTab);
};

export const startTabTracking = async () => {
  chrome.tabs.onActivated.addListener(() => void refreshTab());
  chrome.tabs.onUpdated.addListener((_id, info) => {
    if (info.url || info.status === 'complete') void refreshTab();
  });
  chrome.windows.onFocusChanged.addListener(() => void refreshTab());
  await refreshTab();
};
