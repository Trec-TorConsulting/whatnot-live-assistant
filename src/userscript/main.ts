// Userscript entry for iPhone Safari (the Userscripts app). Runs in the page at document-start so
// the clipboard/popup patches and the LogShare watcher are in place before Whatnot's code loads.
import { clickLikeUser, waitFor } from '../content/dom';
import { findAppBlock, findShareButton, findShareTarget, isLivePath, liveIdFromPath } from '../content/selectors';
import { findLoginPrompt, findWarning } from '../content/warnings';
import { installQuietPatches } from '../page/quiet';
import { SECOND } from '../shared/time';
import { watchLogShare } from './logShare';
import { APP_BLOCK_MESSAGE, createShareLoop } from './loop';
import { createPanel } from './panel';
import { loadPhoneSettings, savePhoneSettings, type PhoneSettings } from './settings';

declare const __WN2_VERSION__: string;

declare global {
  interface Window {
    __wn2PhoneShare?: boolean;
  }
}

const install = () => {
  if (window.__wn2PhoneShare || window.top !== window) return;
  window.__wn2PhoneShare = true;

  let settings: PhoneSettings = loadPhoneSettings();
  let quietUntil = 0;
  let liveAtStart: string | null = null;
  installQuietPatches(() => Date.now() < quietUntil);

  // The phone sleeps after Auto-Lock and Safari pauses the page, so hold the screen on while sharing.
  let wakeLock: WakeLockSentinel | null = null;
  const keepAwake = async (on: boolean) => {
    if (!on) {
      await wakeLock?.release().catch(() => undefined);
      wakeLock = null;
      return;
    }
    if (wakeLock && !wakeLock.released) return;
    wakeLock = (await navigator.wakeLock?.request('screen').catch(() => null)) ?? null;
  };

  const panel = createPanel({
    version: __WN2_VERSION__,
    settings: () => settings,
    onToggle: () => toggle(),
    onSettings: (patch) => {
      settings = savePhoneSettings({ ...settings, ...patch });
    },
  });

  const loop = createShareLoop(
    {
      findShareButton,
      findShareTarget,
      findWarning,
      findLoginPrompt,
      findAppBlock,
      onLivePage: () => isLivePath() && liveIdFromPath() === liveAtStart,
      click: clickLikeUser,
      waitFor,
      setQuiet: (ms) => {
        quietUntil = Date.now() + ms;
      },
      settings: () => settings,
    },
    (status) => {
      panel.setStatus(status);
      if (!status.running) void keepAwake(false);
    },
  );
  watchLogShare(() => loop.confirm());

  const toggle = () => {
    if (loop.status().running) {
      loop.stop();
      return;
    }
    liveAtStart = liveIdFromPath();
    void keepAwake(true);
    void loop.start();
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && loop.status().running) void keepAwake(true);
  });

  // Whatnot navigates client-side, so follow the URL instead of waiting for a page load.
  const syncRoute = () => {
    if (!document.body) return;
    if (isLivePath()) {
      panel.show();
      if (!loop.status().running && findAppBlock()) panel.setStatus({ ...loop.status(), message: APP_BLOCK_MESSAGE });
    } else {
      loop.stop('Stopped: you left the show');
      panel.hide();
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', syncRoute, { once: true });
  else syncRoute();
  setInterval(syncRoute, SECOND);

  let dockQueued = false;
  new MutationObserver(() => {
    if (dockQueued) return;
    dockQueued = true;
    setTimeout(() => {
      dockQueued = false;
      panel.dock();
    }, 50);
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
};

install();
