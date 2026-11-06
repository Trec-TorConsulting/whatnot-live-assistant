# Tasks

## 1. Data Model & Spread Calculation

- [x] 1.1 Define `ListingAppraisal` interface (`listingId`, `marketValue`, `valueSource`, `delta`, `marginPercent`, `isDeal`, `isOverpriced`) and spread calculation functions in `src/shared/shop.ts`, verified by unit tests in `src/shared/shop.test.ts`.
- [x] 1.2 Implement formatting helpers for Value vs. Asking price and margin display (e.g. `Val: $65 vs Ask: $40 (+62% Deal)`) in `src/shared/shop.ts`, verified by unit tests in `src/shared/shop.test.ts`.

## 2. Text-First Listing Appraisal Engine

- [x] 2.1 Implement `appraiseListingText()` in `src/background/appraisal.ts` combining `quickRead()`, spot melt, NumisMedia FMV, Greysheet BYOK, PCGS, and text-only AI model fallback, verified by unit tests in `src/background/appraisal.test.ts`.
- [x] 2.2 Register `APPRAISE_SHOP_LISTING` message handler in `src/background/index.ts`, verified by message routing tests in `src/background/index.test.ts`.

## 3. Sidepanel Shop UI & Session Caching

- [x] 3.1 Implement session-level caching of listing appraisals in `src/content/shop.ts` and dispatch `APPRAISE_SHOP_LISTING` requests on demand, verified by cache and dispatch tests in `src/content/shop.test.ts`.
- [x] 3.2 Add "Appraise" button to each shop listing row in `src/sidepanel/sections/live.ts`, displaying loading state and rendering the value vs. asking spread badge upon completion, verified by DOM rendering tests in `src/sidepanel/sections/live.test.ts`.

## 4. In-Stream Overlay Integration

- [x] 4.1 Add inline appraisal trigger and value spread display to shop hit rows in the in-stream overlay in `src/content/overlay.ts`, verified by overlay DOM tests in `src/content/overlay.test.ts`.

## 5. Verification & Ship Chain

- [x] 5.1 Run full project test suite (`npm test`) and production build (`npm run build`) to ensure zero regressions across all modules.
- [x] 5.2 Validate OpenSpec specification completeness with `openspec validate bin-product-appraisal`.
- [x] 5.3 Execute ship chain: create feature branch `bin-product-appraisal`, commit changes without tokens or secrets, push with authorized credentials, open pull request into `main`, merge with `gh pr merge --admin`, and bump version to `0.23.0`.

## Workflow follow-up

- Archive `bin-product-appraisal` with `openspec archive bin-product-appraisal` once all implementation tasks are merged to main.
- Verify canonical specifications reflect the new `bin-product-appraisal` capability and updated `live-show` and `reference-prices` specs.

