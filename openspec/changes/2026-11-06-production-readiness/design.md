# Design: Production Readiness Hardening

## Overview

This change shores up the five operational gaps identified for production readiness:
1. Manifest permission hardening for Chrome Web Store compliance.
2. Scheduled headless canary testing for Whatnot UI selector regression defense.
3. Centralized per-domain rate limiting and resilient error boundary wrapping for external APIs.
4. Manifest V3 Service Worker session storage backing across worker terminations.
5. Automated release build and zip artifact distribution.

---

## Modules Touched

- `manifest.config.ts`: Remove wildcards from `optional_host_permissions`, enumerate explicit AI provider URLs.
- `src/sidepanel/sections/settings.ts`: Request granular host permissions when saving custom Ollama or cloud provider hosts.
- `src/background/rateGate.ts`: Implement token-bucket / sliding window rate gates per domain.
- `src/background/appraisal.ts`: Wrap `warmSpots()` and spot price fetches in safe boundaries; apply rate gate to external price guides.
- `src/background/refPrices.ts`: Route Scryfall, Pokémon TCG, Discogs, and PSA queries through rate-limiting gates.
- `src/background/index.ts` & `src/shared/storage.ts`: Back active job runner states and volatile locks in `chrome.storage.session`.
- `scripts/canary-check.ts` & `src/content/diagnostics.ts`: Expose an automated selector verification suite runnable via headless Playwright / Puppeteer.
- `.github/workflows/canary.yml`: Daily cron to detect Whatnot UI drift.
- `.github/workflows/release.yml` & `scripts/package-release.ts`: Script to package `dist/` into a distributable zip archive and attach to tagged releases.

---

## Detailed Component Design

### 1. Manifest Permissions Hardening
* **Current:** `optional_host_permissions: ['http://*:*/*', 'https://*:*/*']`
* **Target:**
  ```ts
  optional_host_permissions: [
    'https://api.openai.com/*',
    'https://api.anthropic.com/*',
    'https://openrouter.ai/*',
  ]
  ```
* When a user enters a custom Ollama host in Settings (e.g. `http://192.168.1.50:11434`), Settings invokes:
  ```ts
  const origin = new URL(customOllamaUrl).origin + '/*';
  const granted = await chrome.permissions.request({ origins: [origin] });
  ```
  This adheres strictly to Chrome Web Store security guidelines and avoids store review blocks.

### 2. Centralized Per-Domain Rate Limiter (`src/background/rateGate.ts`)
* A token-bucket gate manages dispatch rates to prevent HTTP 429 errors:
  - Scryfall: Max 10 requests / second.
  - eBay: Max 5 requests / second.
  - PCGS: Max 4 requests / second.
  - Greysheet: Max 3 requests / second.
* If a scan attempts 50 concurrent lookups, `rateGate.schedule(domain, fn)` queues promises and drains them smoothly without dropping calls or overloading third-party hosts.

### 3. Non-Throwing Offline Resilience in `appraisal.ts`
* In `refreshSpot()` and `warmSpots()`:
  - If network resolution fails (`ENOTFOUND`, `AbortError`, or HTTP >= 500), the call catches the rejection silently, logs to debug if in development, and returns `null` without throwing to module scope or Node/Chrome error listeners.
  - `warmSpots()` adds a 15-minute debounce so multiple rapid appraisal clicks do not trigger redundant network requests.

### 4. Service Worker Session State Persistence
* `chrome.storage.session` is memory-backed and survives service worker restarts within the browser session.
* Lock states (`soldLock`) and alarm tracking markers are initialized from `chrome.storage.session`.
* When Chrome suspends the service worker after 30s of inactivity and a new WebSocket frame wakes it up, the worker restores state seamlessly.

### 5. Release Packaging Pipeline
* A Node script `scripts/package-release.ts`:
  1. Runs `npm run build`.
  2. Reads version from `package.json`.
  3. Archives `dist/` into `dist/whatnot-assistant-v{version}.zip`.
  4. Generates SHA-256 checksums.
* A GitHub Actions workflow `.github/workflows/release.yml` triggers on `git push --tags` (`v*`) and uploads the release zip and checksum as release assets.

