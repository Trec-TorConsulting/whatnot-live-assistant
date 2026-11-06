# Proposal: Greysheet BYOK, NumisMedia FMV Guide, and Recent Auction / eBay Sold Comps

## Why

Greysheet (CDN Publishing) does not offer a free API tier and paywalls real-time pricing data. Users who have an existing Greysheet dealer subscription need a Bring-Your-Own-Key (BYOK) mechanism to connect their API credentials. In parallel, users appraising coins and collectibles without paid subscriptions need accurate, free retail and realized auction sales benchmarks, specifically NumisMedia Fair Market Value (FMV) and recent auction / completed eBay sold comps.

## What Changes

1. **Greysheet BYOK**:
   - Settings stores user-supplied Greysheet (CDN) API Key and API Token.
   - Dedicated "Test Greysheet" button verifies credentials against the CDN Public API V2 (`https://cpgpublicapiv2.greysheet.com/api`).
   - Appraisals query CDN Public API V2 for wholesale bid/ask and CPG retail guide values when credentials are provided.
2. **NumisMedia Fair Market Value (FMV) Guide**:
   - Integrated offline numismatic retail guide across standard Sheldon grades (G-4 through MS-67) for major US coin series.
   - Incorporates key date and semi-key date multipliers for numismatic accuracy.
3. **Recent Auction & eBay Completed Sold Comps**:
   - Queries realized, completed eBay sales for coins, cards, and collectibles.
   - Parses sold prices, filters out replicas/novelties, and computes count, median sold price, and price spread.
   - Displays sold statistics and provides direct links to completed auction comps.

## Capabilities

### Modified Capabilities
- `settings-and-overrides`: Saves Greysheet API credentials and provides a test button.
- `reference-prices`: Adds Greysheet BYOK, NumisMedia FMV guide, and eBay sold comps to reference price lookups.
- `appraisal`: Appraisals incorporate Greysheet, FMV, and realized sold comps into the valuation and display.

## Impact

- Touches `src/shared/storage.ts`, `src/shared/refPrice.ts`, `src/shared/fmv.ts`, `src/background/greysheet.ts`, `src/background/ebayComps.ts`, `src/background/refPrices.ts`, `src/content/appraisalView.ts`, `src/content/appraise.ts`, `src/sidepanel/index.html`, `src/sidepanel/sections/settings.ts`, and `manifest.config.ts`.
- Out of scope: Automated scraping of paywalled subscriber accounts or bypassing API auth checks.

