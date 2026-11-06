# Proposal: Production Readiness Hardening

## Why

While the assistant has comprehensive unit test coverage (586 tests), strict TypeScript compilation, and robust appraisal engines, five operational vulnerabilities prevent it from achieving 100% production readiness:

1. **Manifest Host Permissions & Store Review Risk (`manifest.config.ts`)**: `optional_host_permissions` currently requests catch-all wildcards (`http://*:*/*`, `https://*:*/*`). This violates the principle of least privilege, contradicts `openspec/specs/extension-shell/spec.md`, and triggers immediate rejection or lengthy manual review queues in the Chrome Web Store.
2. **Missing Live Canary & Selector Regression Detection (`scripts/`, `.github/workflows/`)**: Unit tests execute exclusively against static Happy-DOM HTML mock trees. When Whatnot updates their live frontend layout or renames class names, unit tests pass while live users experience silent button and auction scraping failures.
3. **Unbounded Background Fetches & API Rate Limiting (`src/background/appraisal.ts`, `src/background/refPrices.ts`)**: Floating promises like `void warmSpots()` make unhandled live network requests on every appraisal, throwing DNS resolution errors (`ENOTFOUND api.gold-api.com`) when offline or behind firewalls. External providers (eBay, Scryfall, Discogs, Greysheet) lack a centralized rate limiter, risking rate-limit bans during automated shop or table scans.
4. **Service Worker State Volatility Under MV3 Wakeups (`src/background/index.ts`, `src/background/jobRunner.ts`)**: Under Chrome Manifest V3, background service workers terminate after 30 seconds of inactivity. In-memory locks, volatile timers, and cache maps that do not hydrate from `chrome.storage.session` risk state de-synchronization across worker wakeup cycles during long-running shows.
5. **Lack of Automated Tagged Release Packaging (`.github/workflows/`, `scripts/`)**: Production distributions currently depend on manual local builds. There is no automated workflow that validates, bundles, zips, and attaches release packages (`whatnot-assistant-vX.Y.Z.zip`) to GitHub Releases when version tags are pushed.

## What Changes

- **1. Manifest Permissions Hardening (`manifest.config.ts`, `src/sidepanel/sections/settings.ts`)**:
  - Replace wildcard `optional_host_permissions` with explicit, enumerated provider host patterns (`https://api.openai.com/*`, `https://api.anthropic.com/*`, `https://openrouter.ai/*`).
  - Support custom remote Ollama origins by prompting for targeted host permissions dynamically at runtime via `chrome.permissions.request({ origins: [customOrigin] })` rather than broad wildcards.
- **2. Automated Canary Smoke Test Suite (`scripts/canary-check.ts`, `.github/workflows/canary.yml`)**:
  - Add a scheduled GitHub Action running headless Chromium against public Whatnot show URLs.
  - Assert that `src/content/selectors.ts` successfully locates primary live stream elements (stream title, lot drawer, chat feed, shop button).
  - Automatically report selector breakages before users experience failures.
- **3. Centralized Domain Rate-Limiting & Safe Network Boundaries (`src/background/rateGate.ts`, `src/background/appraisal.ts`)**:
  - Implement a centralized token-bucket / leaky-bucket rate limiter per origin (e.g. Scryfall: max 10 req/sec; eBay: max 5 req/sec; PCGS: max 4 req/sec).
  - Wrap background spot warming (`warmSpots`) in a safe, non-throwing boundary that suppresses unhandled offline DNS errors and respects warm-up debouncing.
- **4. Service Worker Session State Persistence (`src/background/index.ts`, `src/background/jobRunner.ts`, `src/shared/storage.ts`)**:
  - Move transient worker states, active locks, and alarm tracking into `chrome.storage.session` so that background worker sleep/wake cycles retain full state integrity without disk I/O penalties.
- **5. Automated Release Packaging & Tag Workflow (`.github/workflows/release.yml`, `scripts/package-extension.ts`)**:
  - Add a release script and GitHub Action that triggers on tag push (`v*`).
  - Verifies clean test and typecheck runs, compiles production bundles for both Chrome Extension and iOS userscript, creates a distributable zip archive (`whatnot-assistant-vX.Y.Z.zip`), and publishes a draft GitHub Release.

## Capabilities

### Modified Capabilities

- `extension-shell`: `manifest.config.ts` declares only required host origins and explicit optional provider patterns, removing broad wildcards; runtime permission prompts request specific origins.
- `build-and-delivery`: Adds automated release packaging, release zip generation, and automated live canary smoke checks in CI.
- `reference-prices`: Enforces domain-specific query rates and wraps background spot price warming in safe error boundaries.
- `diagnostics`: Extends selector diagnostic checks for automated canary verification against production DOM layouts.

## Out of Scope

- Bidding, buying, or automatic giveaway entry (strictly prohibited by core project invariants).
- Cloud-hosted user accounts, remote databases, or multi-tenant backend servers (local browser-only architecture is preserved).
- Chrome Web Store automated upload API tokens (publishing remains a deliberate manual or review-gated step).

## Branch & Landing

- **Branch:** `feature/production-readiness-hardening`
- **Landing:** Work lands through a pull request into `main` and merges via `gh pr merge --admin`.

