# Proposal

## Why

The shop check lists three kinds of hit: **Steal**, **Deal**, and **Must-have**. Steals and deals always say what they are priced against (melt, the median of watched sales, your max, or a PCGS/TCG/AI market). Must-haves usually do not. A must-have is listed because it is on the watchlist, is a key, semi-key, or variety date, or fills a set gap, and `scoreShop` in `src/shared/shop.ts` never writes a price on it, even when it already knows the median of watched sales. A price shows up only when a later pass finds one:

- `applyShopWorth`: only for coin key dates with a PCGS number and grade in the title.
- `applyShopRefs`: only for listings that read as a card, a stated PSA cert, or vinyl.
- `applyShopAi`: only when local AI is available and finishes.

So most must-haves show no market price, and the user cannot tell whether the price is unknown or was just left off. Must-haves SHALL always show the current market price.

## What Changes

- `scoreShop` leads every `must` hit's reason with its market price: `Market $X (median of N sales)` when two or more watched sales exist. Otherwise it leads with the placeholder `Market: no price yet` (`NO_MARKET_LINE`).
- Melt is a floor, not a market price. When it is known, a must-have shows `Melt $X` after the market line and never in place of it.
- Add `hasPriceLine`, `withPriceLine`, `stripNoMarket`, and `ensureMustPrice` helpers in `src/shared/shop.ts`. A price line is `Market $`, `Guide $`, `AI est. $`, `Under AI est. $`, `Prints $`, or `Discogs listed from $`.
- `applyShopWorth` (PCGS market or guide), `applyShopRefs` (TCG market, print range, Discogs listing), and `applyShopAi` (AI estimate) replace the placeholder with the price they find. When a later pass finds no price, the placeholder stays. A PSA cert mismatch that adds a new must-have also starts with the placeholder.
- `applyShopAi` still adds `Under AI est. …` when it promotes a must-have to a deal, even if a sales median is already shown.
- `selectShopAiItems` and `priceShopRefs` (`src/content/shop.ts`) send must-haves with no price line first, so the limited lookup budget goes to filling the gap.
- Bump the version to `0.20.2` and update the README feature line.

## Capabilities

### Modified Capabilities

- `live-show`: Every must-have in the shop check shows a current market price, or says plainly that none is known yet.

## Impact

- `src/shared/shop.ts`, `src/content/shop.ts`, `src/shared/shop.test.ts`, `README.md`, `package.json`.
- No new network calls. Pass 1 stays synchronous and the same lookups run, only in a different order.

