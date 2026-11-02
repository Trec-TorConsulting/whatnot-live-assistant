import { sendToTab } from '../shared/messages';
import { SECOND } from '../shared/time';

// Reloading or updating the extension cuts every open Whatnot tab off from it until the tab is
// refreshed. Re-injecting the content script reconnects them. The page hook runs in the page's own
// world and survives the reload, so only the isolated-world scripts are injected again.
const contentFiles = () =>
  ((chrome.runtime.getManifest().content_scripts ?? []) as { js?: string[]; world?: string }[])
    .filter((cs) => cs.world !== 'MAIN')
    .flatMap((cs) => cs.js ?? []);

const ping = (tabId: number) =>
  Promise.race([
    sendToTab(tabId, 'PING', {}).then(
      () => true,
      () => false,
    ),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 1500)),
  ]);

export const ensureContent = async (tabId: number): Promise<boolean> => {
  if (await ping(tabId)) return true;
  const files = contentFiles();
  if (!files.length) return false;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files });
  } catch {
    return false;
  }
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 0.3 * SECOND));
    if (await ping(tabId)) return true;
  }
  return false;
};

export const reconnectWhatnotTabs = async () => {
  const tabs = await chrome.tabs.query({ url: 'https://*.whatnot.com/*' });
  await Promise.all(tabs.map((t) => (t.id !== undefined ? ensureContent(t.id) : null)));
};
