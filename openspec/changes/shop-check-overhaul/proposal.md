# Proposal

## Why

The buy-it-now and one-off auction shop check (`src/shared/shop.ts`, `src/content/shop.ts`, `src/content/overlay.ts`, and `src/sidepanel/sections/live.ts`) currently has seven gaps that limit its accuracy and usefulness during a live show:

1. **Stale, one-shot shop state and zero-quantity bug.** `readListing` clamps `0` inventory up to `1` (`Math.max(1, ...)`), so sold-out rows without a `"SOLD"` status string can still be scored as deals. `ingest` in `src/content/shop.ts` is append-only (`if (seen.has(item.id)) continue`), ignoring mid-show price drops, stock changes, and newly sold-out items, and live `sale` events on the show socket never decrement or prune shop listings. There is also no manual rescan control.
2. **Incomplete valuation across PCGS key dates, subtitles, and device/tool specs.** `applyShopWorth` prepends a PCGS Market or Guide string to `must` hits without promoting under-market PCGS auction medians (`Market $X`) to `steal` or `deal` (or alerting via `announce`), and without dropping heavily overpriced key dates. `shopMelt`, `matchWatch`, `findComps`, and `keyDateCallouts` inspect only `item.title` and miss weights, purities (`"1 oz .999 silver"`, `"14k 5.2g"`), grades, and part numbers placed in `item.subtitle`. Electronics and tool shop hits also omit device spec lines, tool platform/kit/part callouts, missing-charger warnings, and buyer chat-want matches.
3. **No all-in landed cost, flip profit, or show-coupon awareness.** A low-dollar buy-it-now row slightly below melt or comps is scored as a steal even when unpaid shipping and sales tax push its landed cost above melt or market. Conversely, when shipping is already paid/combined in the show, the landed cost is lower and the net resale flip profit (`flipProfit` after seller fees) is not shown. Published show-note coupons are also not surfaced on shop hits.
4. **Non-interactive shop rows.** Shop hits in the overlay and sidepanel are static text. Clicking a hit does not open Whatnot's Shop tab or filter the shop search input, there are no stock scarcity badges (`1 left`, `N in stock`), hits cannot be dismissed (`×`) to reveal the next ranked hit beyond the top 8, and there is no `BIN only` / `All` mode filter.
5. **No collection or set-builder integration.** Unlike live auction appraisals, `scoreShop` does not check `compareToCollection` (`src/shared/collection.ts`). Buy-it-now items that fill a missing date/mint hole in a user's active set (`Needed for your set: …`) are missed, and hits that duplicate already-owned items (`You own N like this` / `Already in your set`) are not tagged.
6. **No card, vinyl, or PSA cert reference lookup (`REF_LOOKUP`).** Pass 2 of the shop scan only queries PCGS (`GRADE_GUIDE`) for coins. Trading cards with printed numbers or set codes (Scryfall for Magic, Pokémon TCG, YGOPRODeck for Yu-Gi-Oh!), PSA slabs with stated cert numbers in the listing text, and vinyl records (Discogs) in the shop never run through `refLookup` (`src/background/refPrices.ts`).
7. **No shop deal badges on background monitored shows.** The sidepanel's "Watch other shows" monitor list (`renderMonitors` in `src/sidepanel/sections/live.ts`) shows only the active auction lot for each background tab, giving no visual badge when a monitored show has buy-it-now steals or deals sitting in its shop.

## What Changes

- **1. Live Shop Sync (`src/shared/shop.ts`, `src/content/shop.ts`, `src/shared/messages.ts`, `src/content/index.ts`, `src/content/overlay.ts`, `src/sidepanel/sections/live.ts`)**:
  - Reject shop listings whose explicit `quantity`, `inventory`, or `inventoryLevel.quantity` is `0` or negative in `readListing`, and collect sold/zero-quantity IDs (`readRemovedShopIds`) when reading a shop page.
  - Replace append-only listing ingestion with `mergeShopListings(current, incoming, removedIds)` so re-fetched shop pages update changed prices and quantities and remove sold-out rows.
  - Subscribe to live `sale` signals in `src/content/shop.ts` via `applySaleToShopListings(listings, sale)` to decrement stock or remove sold BIN and one-off auction listings in real time.
  - Add a manual `Rescan` action in both the on-page overlay (`data-action="shop-rescan"`) and the sidepanel Live tab (`#shop-rescan` via `SHOP_RESCAN`).
- **2. Smarter Valuation: PCGS Re-Scoring, Subtitle Parsing & Device/Tool Context (`src/shared/shop.ts`, `src/content/shop.ts`)**:
  - Update `applyShopWorth` to re-score `must` hits when PCGS returns an auction median (`Market $X` from 2+ sales): promote `price <= 0.6 * market` to `steal` and `price <= (maxBidPercent / 100) * market` to `deal`, drop non-watchlist `must` hits priced above `1.25 * market` (or above `1.5 * guide` when only PCGS guide is available), re-sort hits, and call `announce` when PCGS promotion produces a new top steal or deal.
  - Make `shopMelt`, `matchWatch`, `findComps`, and `keyDateCallouts` read `item.subtitle` alongside `item.title` so weights (`14k 5.2g`, `1 oz .999 silver`), grades, and model/part numbers in subtitles are scored.
  - Append concise device/tool context (`specLine`, `toolsLine`, `missingAccessory`, and `Matches chat want` from `electronicsWantMatches`) to shop hit reasons when present.
- **3. All-In Landed Cost, Flip Profit & Show Coupon Context (`src/shared/shop.ts`, `src/content/shop.ts`)**:
  - Pass optional `shipping`, `shippingRules`, `hasWinThisShow`, `taxPercent`, `feePercent`, and `coupons` into `scoreShop`.
  - When shipping/tax context is provided, evaluate `underMelt`, `stealComps`, `dealComps`, and `watchDeal` against the landed all-in price (`allInPrice` + `shippingOwed`) so unpaid shipping and tax cannot turn an unprofitable low-dollar item into a false steal or deal, while combined/paid shipping in the current show is credited automatically.
  - Append net resale profit (`Flip +$X after fees` via `flipProfit`) and landed shipping context (`all-in $X` or `combined ship`) on steals and deals when positive, and note published show-note coupons (`Coupon CODE`) when present.
- **4. Click-to-Find in Whatnot Shop, Scarcity Badges, Dismiss & Mode Filter (`src/content/selectors.ts`, `src/content/shop.ts`, `src/content/overlay.ts`, `src/sidepanel/sections/live.ts`, `src/shared/messages.ts`)**:
  - Add `findShopTabButton` and `findShopSearchInput` in `src/content/selectors.ts`, and `focusShopHit(title)` in `src/content/shop.ts` (also reachable from the sidepanel via `SHOP_FOCUS`). Clicking a shop hit opens Whatnot's shop drawer if needed, fills the shop search box with the item's title using `setReactValue`, and copies the title to the clipboard without clicking Buy Now or placing a bid.
  - Show stock scarcity badges (`1 left` or `N in stock`) on BIN hits, add a per-hit dismiss button (`×` via `data-action="shop-dismiss"` and `SHOP_DISMISS`) that hides the hit for the current show and reveals the next ranked hit from the scored pool, and add a `BIN only` / `All` filter toggle when the shop includes one-off auctions.
- **5. Collection & Set-Builder Matching (`src/shared/shop.ts`, `src/content/shop.ts`)**:
  - Pass the user's saved `CollectionSettings` (`owned` plus recorded `purchases` titles, and `sets`) into `scoreShop`.
  - Surface non-overpriced listings that fill a missing date/mint in an active set (`Needed for your set: …`) as at least a `must` hit, and tag hits that match already-owned items (`Already in your set: …` or `You own N like this`).
- **6. TCG Card, Vinyl & Stated PSA Cert Reference Lookup (`src/shared/shop.ts`, `src/content/shop.ts`)**:
  - Add `extractShopRefQuery` and `applyShopRefs` in `src/shared/shop.ts` and `priceShopRefs` in `src/content/shop.ts` to query `REF_LOOKUP` (`src/background/refPrices.ts`) for up to 6 shop candidates that state a Pokemon/Magic/Yu-Gi-Oh card number or set code, a PSA slab cert number (7–9 digits explicitly in the listing text), or a vinyl record release.
  - Raw cards with a single exact-print market price (`kind: 'market'`) can promote hits to `steal` (`<= 60%`) or `deal` (`<= maxBidPercent%`); multi-print ranges (`kind: 'range'`), Discogs lowest listed prices (`kind: 'listed'`), and PSA cert verifications (`kind: 'verified'` or mismatch warnings) attach context notes without setting market value or inventing certification numbers.
- **7. Background Monitor Shop Badges (`src/shared/shop.ts`, `src/sidepanel/sections/live.ts`)**:
  - Add `monitorShopBadge(shop)` in `src/shared/shop.ts` and render a live shop deal badge (e.g. `Shop steal: 1 oz Silver Round $20` or `2 shop steals (from $18)`) on each row in the sidepanel's "Watch other shows" monitor list (`renderMonitors`), highlighting rows with steals so the user can click `Open` to jump to that show.

## Capabilities

### Modified Capabilities

- `live-show`: Shop scan upserts and prunes listings on re-read and live sales, skips zero-quantity rows, parses subtitles and device/tool specs, re-scores PCGS auction medians, checks collection/sets, supports rescan/dismiss/BIN-filter controls, and enriches card/cert/vinyl candidates via `REF_LOOKUP`.
- `reference-prices`: Shop scan uses PCGS auction medians (`GRADE_GUIDE`) and card/PSA-cert/Discogs lookups (`REF_LOOKUP`) according to reference-price rules without letting price guides, multi-print spreads, or Discogs asking prices set market value.
- `shipping-costs`: Shop scan evaluates steals and deals against landed all-in cost (`allInPrice` with `shippingOwed`) and shows net flip profit (`flipProfit`) and combined-shipping status when shipping context is known.
- `purchases`: Saved collection items, active sets (`compareToCollection`), and recorded purchase titles feed the shop scan to flag missing set dates and already-owned duplicates.
- `quick-actions`: Clicking a shop hit in the overlay or sidepanel opens Whatnot's shop tab if needed, types the listing title into the shop search input, and copies it to the clipboard without buying or bidding.
- `show-monitors`: Background monitored show rows in the sidepanel display a shop steal/deal badge from each monitored tab's `LiveSession.shop`.

## Impact

- Touches `src/shared/shop.ts`, `src/shared/shop.test.ts`, `src/content/shop.ts`, `src/content/selectors.ts`, `src/content/selectors.test.ts`, `src/content/overlay.ts`, `src/content/overlay.test.ts`, `src/content/index.ts`, `src/sidepanel/sections/live.ts`, `src/sidepanel/index.html`, `src/shared/messages.ts`, and `README.md`.
- **Time-to-answer and accuracy**: Pass 1 (local melt, comps, watchlist, key dates, subtitles, device/tool specs, collection/sets, and all-in/flip math) remains synchronous and instant (`0 ms` network wait) as soon as the shop GraphQL response arrives. Pass 2 (`GRADE_GUIDE` and `REF_LOOKUP`, bounded by the existing 4s lookup timeout and 24h/30d `refCache`) and Pass 3 (`SHOP_AI` on local AI) run asynchronously and update the shop card in place. Accuracy improves by eliminating zero-stock ghost listings, false low-dollar steals eaten by shipping, missed subtitle weights/purities, and un-promoted PCGS/TCG steals.
- **Version**: Bumps `package.json` to `0.20.0` (minor bump for the new shop capabilities). `manifest.config.ts` and the userscript build pick up `0.20.0` automatically.
- **Delivery**: Branch `shop-check-overhaul`, opened as a pull request into `main`, then merged with `gh pr merge --admin`.

## Out of scope

- Clicking Buy Now, Pre-bid, Place Bid, or Set Max Bid, entering giveaways, claiming coupons, or sending chat messages.
- Inventing certification numbers, mintages, population figures, or exchange rates.
- Calling paid cloud AI providers for the background shop scan (`SHOP_AI` remains strictly local Ollama / on-device AI).
- Modifying the iPhone auto-share userscript (`src/userscript/`).

