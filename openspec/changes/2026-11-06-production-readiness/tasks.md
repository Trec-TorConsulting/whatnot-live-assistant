# Tasks: Production Readiness Hardening

## 1. Manifest Permissions Hardening
- [x] In `manifest.config.ts`, replace wildcard `optional_host_permissions` with explicit provider origins (`https://api.openai.com/*`, `https://api.anthropic.com/*`, `https://openrouter.ai/*`).
- [x] In `src/sidepanel/sections/settings.ts`, implement dynamic origin permission requests when the user configures a custom non-loopback Ollama host.
- [x] Update `src/sidepanel/sections/settings.test.ts` to test granular permission grants and denials.

## 2. API Rate Limiting & Network Error Boundary
- [x] Enhance `src/background/rateGate.ts` with domain-specific rate limits (Scryfall, eBay, PCGS, Greysheet).
- [x] Route reference pricing calls in `src/background/refPrices.ts`, `src/background/ebayComps.ts`, and `src/background/greysheet.ts` through `rateGate`.
- [x] In `src/background/appraisal.ts`, wrap `warmSpots` and `getSpot` in a catch-boundary to eliminate unhandled `ENOTFOUND` errors during offline/firewall conditions.
- [x] Add tests in `src/background/appraisal.test.ts` and `src/background/rateGate.test.ts` verifying silent degradation and domain spacing.

## 3. Service Worker Session State Persistence
- [x] Update `src/shared/storage.ts` to expose typed helpers for `chrome.storage.session` with fallback support.
- [x] Back transient background job runner locks, wakeup alarms, and task continuation in `chrome.storage.session`.
- [x] Verify background service worker resume and recovery behavior in `src/background/jobRunner.ts`.

## 4. Canary Smoke Tests & Release Packaging
- [ ] Create `scripts/canary-check.ts` to validate selector queries against live/canary Whatnot DOM fixtures.
- [ ] Add `.github/workflows/canary.yml` for scheduled daily selector health monitoring.
- [ ] Create `scripts/package-release.ts` to produce `dist/whatnot-assistant-v{version}.zip` with SHA-256 checksums.
- [ ] Add `.github/workflows/release.yml` triggering on tag push (`v*`) to build and attach artifacts to GitHub Releases.

## 5. Verification & Ship Chain
- [x] Bump package version in `package.json` to 0.23.1.
- [x] Run `npm run build` to verify typecheck and clean rebuild of `dist/` and `dist-userscript/`.
- [x] Run `npm test` to verify all test suites pass with zero unhandled errors.
- [ ] **Ship Chain:**
  - Create branch `production-readiness-hardening`.
  - Commit changes (verifying no tokens, .env files, or Chrome profiles are included).
  - Push branch to remote.
  - Open a detailed pull request into `main`.
  - Merge pull request using `gh pr merge --admin`.

