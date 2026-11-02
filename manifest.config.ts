import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json' with { type: 'json' };

export default defineManifest({
  manifest_version: 3,
  name: 'Whatnot Assistant',
  version: pkg.version,
  description:
    'Follow and bookmark the current show, auto sharing, collectible appraisal, live show stats, a max-bid guard, purchase tracking, and alerts for Whatnot.',
  icons: { 16: 'icons/icon-16.png', 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' },
  permissions: ['storage', 'alarms', 'sidePanel', 'notifications', 'activeTab', 'scripting'],
  host_permissions: [
    'https://*.whatnot.com/*',
    'https://generativelanguage.googleapis.com/*',
    'https://api.gold-api.com/*',
    'https://api.pcgs.com/*',
    // Card, record, and cert prices, asked after the model names the item.
    'https://api.scryfall.com/*',
    'https://api.pokemontcg.io/*',
    'https://db.ygoprodeck.com/*',
    'https://api.psacard.com/*',
    'https://api.discogs.com/*',
    // Default Ollama port on this machine. A server on another host is granted from Settings.
    'http://127.0.0.1:*/*',
    'http://localhost:*/*',
  ],
  optional_host_permissions: ['http://*:*/*', 'https://*:*/*'],
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  action: {
    default_title: 'Open Whatnot Assistant',
    default_icon: { 16: 'icons/icon-16.png', 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' },
  },
  side_panel: {
    default_path: 'src/sidepanel/index.html',
  },
  commands: {
    'toggle-share': {
      suggested_key: { default: 'Alt+Shift+S' },
      description: 'Start or stop Auto Share on this show',
    },
    appraise: {
      suggested_key: { default: 'Alt+Shift+V' },
      description: 'Appraise the item on screen',
    },
    'toggle-assistant': {
      suggested_key: { default: 'Alt+Shift+A' },
      description: 'Show or hide the assistant panel on the page',
    },  },
  content_scripts: [
    {
      matches: ['https://*.whatnot.com/*'],
      js: ['src/page/hook.iife.ts'],
      run_at: 'document_start',
      world: 'MAIN',
    },
    {
      matches: ['https://*.whatnot.com/*'],
      js: ['src/content/index.ts'],
      run_at: 'document_idle',
    },
  ],
});
