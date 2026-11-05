# Tasks

## 1. Live Shop Sync, Upsert & Real-Time Sale Pruning

- [x] 1.1 Update `readListing` and `readShopPage` in `src/shared/shop.ts` so explicit `quantity <= 0` returns `null`, and export `readRemovedShopIds`, `mergeShopListings`, and `applySaleToShopListings`. Verify in `src/shared/shop.test.ts` that zero-quantity nodes are skipped, re-read listings update changed prices and quantities, sold/zero-qty IDs are pruned, and live paid sales decrement or remove matching BIN and auction listings while ignoring giveaways.
- [x] 1.2 Update `src/content/shop.ts`, `src/shared/messages.ts`, and `src/content/index.ts` to use `mergeShopListings`, listen to live `sale` signals via `onLive`, re-score when `purchases` change, and support `rescanShop` (`SHOP_RESCAN`).

## 2. Subtitle Parsing, Device/Tool Context & PCGS Re-Scoring

- [x] 2.1 Update `shopMelt` and `scoreShop` in `src/shared/shop.ts` to inspect `item.subtitle` alongside `item.title` for melt weight/purity, watchlist matches, sold comps, and key-date callouts, and append device/tool context (`specLine`, `toolsLine`, `missingAccessory`, and `Matches chat want` from `electronicsWantMatches`). Verify in `src/shared/shop.test.ts`.
- [x] 2.2 Upgrade `applyShopWorth` in `src/shared/shop.ts` and `priceMustHaves` in `src/content/shop.ts` so PCGS auction medians (`Market $X`) promote qualifying `must` hits to `steal` (`<= 60%`) or `deal` (`<= maxBidPercent%`) and drop non-watchlist `must` hits above `125%` of market (or `150%` of guide), while `Guide $X` alone never promotes a `must` hit to `steal` or `deal`. Verify in `src/shared/shop.test.ts`.

## 3. All-In Landed Cost, Flip Profit & Show Coupons

- [x] 3.1 Extend `ShopScoreInput` and `scoreShop` in `src/shared/shop.ts` with optional `shipping`, `shippingRules`, `hasWinThisShow`, `taxPercent`, `feePercent`, and `coupons`. Evaluate steals and deals against landed cost (`allInPrice` + `shippingOwed`), append net resale profit (`flipProfit`) and landed/combined-shipping notes on steals and deals, and surface active show coupon codes. Wire session shipping, rules, purchases, buyer settings, and coupons in `src/content/shop.ts`. Verify in `src/shared/shop.test.ts`.

## 4. Collection & Set-Builder Matching

- [x] 4.1 Extend `ShopScoreInput` and `scoreShop` in `src/shared/shop.ts` with optional `collection` and `ownedTitles` using `compareToCollection` (`src/shared/collection.ts`). Surface non-overpriced listings that fill a missing date/mint in an active set (`Needed for your set: …`) as at least a `must` hit, and tag hits that match already-owned items (`Already in your set: …` or `You own N like this`). Wire `getCollection()` and `purchases` in `src/content/shop.ts`. Verify in `src/shared/shop.test.ts`.

## 5. TCG Card, Vinyl & Stated PSA Cert Reference Lookups (`REF_LOOKUP`)

- [x] 5.1 Add `extractShopRefQuery` and `applyShopRefs` in `src/shared/shop.ts` and `priceShopRefs` in `src/content/shop.ts` to query `REF_LOOKUP` for up to 6 shop candidates with stated card numbers/set codes, stated 7–9 digit PSA cert numbers, or vinyl record keywords. Promote raw cards with single-print market prices (`kind: 'market'`) when under threshold, and attach range, Discogs listed, or PSA cert verification/mismatch notes without inventing cert numbers or setting market value from ranges/listings. Verify in `src/shared/shop.test.ts`.

## 6. Interactive Shop UI: Click-to-Find, Scarcity Badges, Dismiss, Filter & Monitor Badges

- [x] 6.1 Add `findShopTabButton` and `findShopSearchInput` in `src/content/selectors.ts` (and test in `src/content/selectors.test.ts`), and implement `focusShopHit`, `dismissShopHit`, and `setShopFilter` in `src/content/shop.ts` wired to `SHOP_FOCUS`, `SHOP_DISMISS`, and `SHOP_FILTER` in `src/shared/messages.ts` and `src/content/index.ts`.
- [x] 6.2 Update `src/content/overlay.ts`, `src/sidepanel/sections/live.ts`, and `src/sidepanel/index.html` to render clickable shop hits, stock scarcity badges (`1 left`, `N in stock`), per-hit dismiss buttons (`×`), `BIN only` / `All` filter and `Rescan` controls, and background monitor shop deal badges (`monitorShopBadge` in `src/shared/shop.ts`). Verify in `src/content/overlay.test.ts` and `src/shared/shop.test.ts`.

## 7. Build, Validate & Delivery

- [x] 7.1 Update `README.md` to document the new shop check capabilities, bump `package.json` version to `0.20.0`, run `npm test`, `npm run build`, and `openspec validate --all`, and verify that `dist/manifest.json` and `dist-userscript/whatnot-auto-share.user.js` reflect `0.20.0`.
