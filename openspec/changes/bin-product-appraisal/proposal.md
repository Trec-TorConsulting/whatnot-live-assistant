# Proposal: BIN Product Appraisal (Value vs. Asking Price)

## Why

In Whatnot live streams, sellers maintain Buy-It-Now (BIN) shops with dozens or hundreds of items. Currently, the extension only scores listings that trigger passive heuristics (such as exact watchlist matches, pre-programmed key dates, or melt values extracted from titles). Buyers looking through the shop have no way to evaluate arbitrary BIN listings on demand. Adding an inline "Appraise" button to every listed BIN product allows buyers to instantly compare the appraised market value against the seller's asking price and total landed cost, identifying profitable flips and avoiding overpriced inventory before clicking buy.

## What Changes

- **Inline "Appraise" Action for BIN Listings**: Adds an "Appraise" button to every product listed in the assistant's shop card and sidepanel, and optionally injects a quick-appraise button onto Whatnot's native in-stream shop drawer cards.
- **On-Demand Single-Item Valuation**: Appraises the selected listing using its title, subtitle, condition, and price across enabled valuation providers (PCGS, Greysheet BYOK, NumisMedia FMV, eBay sold comps, precious metal melt, and Gemini/Ollama).
- **Value vs. Asking Price Comparison**: Computes and displays the exact spread between the appraised market value and the seller's asking price:
  - Seller asking price and all-in landed cost (factoring show shipping caps and taxes).
  - Appraised market value with pricing source indicator (e.g. "FMV", "Greysheet", "Melt", "eBay Comps", "AI").
  - Net spread and ROI percentage (e.g. `Value: $85 | Asking: $50 · +$35 (+70% Deal)` or `Value: $25 | Asking: $45 · -$20 (-44% Overpriced)`).
- **Session Caching**: Caches appraised values per listing ID in session memory to eliminate redundant API calls and quota consumption when revisiting shop items.

## Capabilities

### New Capabilities
- `bin-product-appraisal`: On-demand valuation of individual Buy-It-Now shop listings comparing appraised market value against seller asking price, landed cost, and margin spread.

### Modified Capabilities
- `live-show`: Expands shop listing rows in the in-stream overlay and sidepanel to include the "Appraise" button, loading state, and inline Value vs. Asking metrics.
- `reference-prices`: Supports direct reference price queries sourced from structured shop listing metadata (title, subtitle, and condition) without requiring a live auction camera frame.

## Impact

- Modifies `src/shared/shop.ts`, `src/shared/appraisal.ts`, `src/content/shop.ts`, `src/content/overlay.ts`, `src/sidepanel/sections/live.ts`, and `src/background/appraisal.ts`.
- Branch `bin-product-appraisal`, landing via pull request into `main`, merged with `gh pr merge --admin`.
- Version bump: minor version bump (0.23.0) as this introduces a significant user-facing feature.

## Out of Scope

- Automated checkout or automated clicking of Buy-It-Now buttons (the assistant never purchases items automatically).
- Mass concurrent automated appraisal of an entire store's catalog at once (lookups are on-demand per user click to respect provider rate limits).

