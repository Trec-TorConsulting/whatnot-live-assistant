# Whatnot Live Assistant

Whatnot Live Assistant is a live-show assistant for [Whatnot](https://www.whatnot.com/). This repository is the Chrome extension and the iPhone auto-share userscript, at version 0.12.1. In Chrome the extension is named **Whatnot Assistant**.

It runs on a show you already have open. API keys stay in the browser. Nothing in this repository is a key, a login, or a bid.

## Install the Chrome extension

`dist/` is the built extension. Node.js is not required to install it.

1. Clone this repository, or download it and unzip it.
2. Open `chrome://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and choose the `dist` folder.

Pin **Whatnot Assistant**, then open a Whatnot show. The toolbar icon opens the side panel. **Alt+Shift+A** shows or hides the panel on the page.

Chrome will say the extension is unpacked. That is expected: it is installed from this repository, not the Chrome Web Store.

## Install the iPhone userscript

`dist-userscript/whatnot-auto-share.user.js` repeats **Copy link** on one live show. It does not include appraisal, alerts, or the bid guard. Those are in the Chrome extension.

1. Install **Userscripts** from the App Store, open it, and choose a folder for scripts.
2. Put `whatnot-auto-share.user.js` in that folder (AirDrop it to Files, or save it in iCloud Drive).
3. On the iPhone, go to **Settings > Apps > Safari > Extensions > Userscripts**. Turn it on and allow `whatnot.com`.
4. Open the show in Safari and choose **aA > Request Desktop Website**. Whatnot otherwise shows a "Continue on Whatnot" screen instead of the show. Log in, then open the show.
5. Tap **Start sharing** on the Auto Share panel. Keep Safari open on that show. Switching apps or locking the phone pauses it. **Confirmed** counts the shares Whatnot recorded.

## What you can do

Open the side panel on a live show.

| Area | What it does |
| --- | --- |
| Live | Show title, lot, viewers, revenue, orders, giveaways, and top buyers from the show feed. On entry, check the shop for buy-it-now steals, deals, and must-haves. Appraise the item on screen. Track wheel odds. Watch up to four other shows in muted tabs. |
| Share | Copy link, X, or Facebook on a delay, once, for a count, or until you stop. Sharing runs in a muted background tab, so the tab you are watching is left alone. |
| Bulk | Follow the host and bookmark upcoming shows that are not bookmarked yet. Unfollow or remove those bookmarks. Preview mode clicks nothing. |
| Buys | Record purchases, cost, and what an appraisal said the item was worth. |
| Alerts | Notify on giveaways, wins, bookmarked shows that are about to start, chat keywords, outbids, @mentions, and lots near close. A watchlist can set the bid ceiling for a matching lot. |
| Settings | Your Whatnot username, appraisal providers, and selector overrides if a Whatnot redesign breaks a button. |
| Diagnose | Show what the extension can see on the current page, and outline those elements. |

### Appraisal

Press **Appraise**, or turn on automatic appraisal for each new auction. **Alt+Shift+V** appraises the active show.

The extension reads the listing first, then fills in prices it can actually look up:

- Chrome's on-device model runs first when Chrome says it is available.
- Gemini runs when the on-device model is missing or fails. An optional Ollama server can stand in when Gemini is slow, or handle every appraisal if you turn that on.
- Coin prices come from PCGS when you add a token. Graded-card certs can use a PSA token. Record prices can use a Discogs token. Card prices also use Scryfall, Pokémon TCG, and YGOPRODeck after the item is identified.

A figure with no sale behind it is labeled as an estimate. The extension does not invent certification numbers.

### Max-bid guard

Set a ceiling for the current lot, a default, and show, day, week, and month budgets. The guard warns when a bid would pass a ceiling or the appraised market value. It can hold that click until you click again. It never places a bid.

### Shortcuts

| Shortcut | Action |
| --- | --- |
| Alt+Shift+A | Show or hide the on-page assistant |
| Alt+Shift+S | Start or stop Auto Share on this show |
| Alt+Shift+V | Appraise the item on screen |

## What it will not do

- It does not bid, and it does not enter giveaways.
- Quick bid types an amount into Whatnot's custom bid box. You press Set Max Bid.
- Quick chat puts a line in the chat box. You press Enter.
- Sharing pauses when Whatnot shows a warning.
- Bulk follow and bookmark skip actions that are already done.

## Keys and privacy

Save keys in **Settings**. They stay in Chrome's local extension storage on that profile.

| Setting | Used for |
| --- | --- |
| Gemini API key | Appraisals when on-device AI is unavailable |
| PCGS token | Coin sale prices |
| PSA token | Graded-card cert checks |
| Discogs token | Record prices |
| Ollama URL | A model you run yourself |

The extension talks only to Whatnot, the price and model hosts named above, and an Ollama server if you set one. Optional host permission is requested when that server is not on this machine. Spot metal prices come from gold-api.com.

Do not commit tokens, `.env` files, or a Chrome profile. None of those belong in this repository.

If Whatnot changes its page, **Diagnose** shows what still matches. **Settings > Selector overrides** can point a button at a new selector without a new build. A hosted overrides file has to allow CORS. A GitHub raw URL works.

## Develop

Node.js 22 or newer.

```bash
npm ci
npm test
npm run typecheck
npm run build
```

`npm run build` typechecks, then rewrites `dist/` and `dist-userscript/`. Those two folders are committed so the extension and userscript can be installed without a build. After a source change, run the build and commit the new output with the source.

`npm run dev` starts the extension build in watch mode. Load the `dist` folder in Chrome once; later rebuilds reload it.

## Layout

| Path | Contents |
| --- | --- |
| `src/` | Extension, side panel, background worker, and userscript source |
| `dist/` | Chrome extension to load unpacked |
| `dist-userscript/` | iPhone userscript |
| `public/icons/` | Extension icons |
| `manifest.config.ts` | Manifest. The version comes from `package.json` |
| `.github/workflows/ci.yml` | Typecheck and tests |

## License

All rights reserved. This repository is public so the extension and userscript can be installed. It does not grant a license to copy, modify, or redistribute the code.
