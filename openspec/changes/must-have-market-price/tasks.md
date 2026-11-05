# Tasks

## 1. Market Line on Must-Haves

- [x] 1.1 Add `NO_MARKET_LINE`, `hasPriceLine`, `stripNoMarket`, `withPriceLine`, and `ensureMustPrice` to `src/shared/shop.ts`. Melt is not a price line.
- [x] 1.2 In `scoreShop`, start every `must` hit with `Market $X (median of N sales)` or `Market: no price yet`, then `Melt $X` when known.
- [x] 1.3 Make `applyShopWorth`, `applyShopRefs`, and `applyShopAi` replace the placeholder when they find a price and keep it when they do not. Start PSA-mismatch must-haves with the placeholder, and keep `Under AI est.` when AI promotes a must-have to a deal.

## 2. Lookup Priority

- [x] 2.1 In `selectShopAiItems` (`src/shared/shop.ts`) and `priceShopRefs` (`src/content/shop.ts`), send must-haves with no price line first.

## 3. Remove Viewer Chat Wants & Compact Sales History

- [x] 3.1 Stop ingesting viewer chat messages into `estateWants` and `electronicsWants` in `src/shared/live.ts`, keeping host/mod lot pins intact.
- [x] 3.2 Remove `wants` display from `estateRow` and `electronicsRow` in `src/content/overlay.ts`, and remove `estateWants`/`electronicsWants` from `src/sidepanel/sections/live.ts` and `src/sidepanel/index.html`.
- [x] 3.3 Replace the vertical runs list in `overlay.ts` and `sidepanel` with a compact 1-line `Last sold: Lot X · $Y` summary while continuing to track all sales in session and history.

## 4. Verify, Build & Delivery

- [x] 4.1 Add `always leads a must-have with a market price, or says none is known yet` to `src/shared/shop.test.ts` and overlay last-sold compact test to `src/content/overlay.test.ts`.
- [x] 4.2 Bump the version to `0.20.2` in `package.json` and `README.md`, and update the README Live feature line.
- [x] 4.3 Run `npm run build` and `npm test`, and validate with `openspec validate must-have-market-price`.
- [ ] 4.4 After local testing, commit on branch `must-have-market-price`, push, open a PR into `main`, and merge with `gh pr merge --admin`.

