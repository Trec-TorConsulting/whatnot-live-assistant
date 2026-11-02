// Builds the iPhone Safari userscript: `npm run userscript`, then copy
// dist-userscript/whatnot-auto-share.user.js into the Userscripts app's folder on the phone.
import { defineConfig, type Plugin } from 'vite';
import pkg from '../package.json' with { type: 'json' };

const FILE = 'whatnot-auto-share.user.js';

export const userscriptHeader = (version: string) => `// ==UserScript==
// @name         Whatnot Auto Share (iPhone)
// @namespace    whatnot-assistant
// @version      ${version}
// @description  Keeps Whatnot's Share menu open on a live show and taps Copy link on your delay.
// @match        https://www.whatnot.com/*
// @match        https://whatnot.com/*
// @run-at       document-start
// @inject-into  page
// @noframes
// @grant        none
// ==/UserScript==
//
// iPhone setup (once):
//   1. Install "Userscripts" from the App Store, open it, and pick a folder for scripts.
//   2. Put this file in that folder (AirDrop it to the phone and save to Files, or use iCloud Drive).
//   3. Settings > Apps > Safari > Extensions > Userscripts: turn it on and allow whatnot.com.
// Each show:
//   4. Open whatnot.com in Safari and tap aA > Request Desktop Website (otherwise Whatnot shows phones
//      a "Continue on Whatnot" app screen instead of the show). Log in, then open the show.
//   5. Tap "Start sharing" on the Auto Share panel. Keep Safari open on the show; switching apps or
//      locking the phone pauses it. "Confirmed" counts the shares Whatnot recorded.
`;

const header = (version: string): Plugin => ({
  name: 'userscript-header',
  generateBundle(_, bundle) {
    for (const chunk of Object.values(bundle)) {
      if (chunk.type === 'chunk') chunk.code = `${userscriptHeader(version)}\n${chunk.code}`;
    }
  },
});

export default defineConfig({
  define: { __WN2_VERSION__: JSON.stringify(pkg.version) },
  plugins: [header(pkg.version)],
  publicDir: false,
  build: {
    outDir: 'dist-userscript',
    emptyOutDir: true,
    target: 'es2020',
    minify: false,
    lib: { entry: 'src/userscript/main.ts', formats: ['iife'], name: 'wn2PhoneShare', fileName: () => FILE },
  },
});
