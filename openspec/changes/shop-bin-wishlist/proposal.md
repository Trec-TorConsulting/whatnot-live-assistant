# Proposal: Shop & BIN Wishlist

## Why

Live show sellers frequently add, restock, or discount Buy-It-Now (BIN) items in their shop during streams. While auction lots have a bid guard and outbid alerts, buyers currently lack a dedicated way to track specific wishlist items and keywords in the seller's shop. A shop wishlist lets buyers specify exact keywords, series, or items (with optional price ceilings) and immediately surfaces matching BIN listings, flash inventory drops, and restocks.

## What Changes

- **Dedicated Shop Wishlist Settings**: Users can specify wishlist entries consisting of keywords (e.g. `1881-S Morgan`, `Charizard Base`, `Milwaukee M18`) with an optional maximum buy-it-now price (e.g. `RTX 4090 $1100`).
- **Live Shop / BIN Matching & Highlights**: The live show shop scan matches all buy-it-now items against active wishlist keywords. Matching listings are flagged with a prominent "Wishlist" badge and surfaced as priority hits.
- **BIN Wishlist Filter**: Adds a "Wishlist" filter toggle in the assistant's shop view (alongside "BIN-only") to instantly view only wishlisted items currently available in the shop.
- **Restock & Flash Drop Notification**: Fires an alert when a wishlisted item is added to the shop or its available quantity increases during an active show.
- **Landed Cost & Ceiling Comparison**: If a wishlist entry includes a maximum price, the listing compares the seller's price (and landed cost) against the user's ceiling, marking items at or below the ceiling as a verified deal.

## Capabilities

### New Capabilities
- `shop-wishlist`: Manages keywords, phrases, and target price ceilings for buy-it-now shop inventory, matching shop listings and alerting on live drops.

### Modified Capabilities
- `live-show`: Shop scan recognizes wishlist keywords, tags matching buy-it-now listings with wishlist badges, and supports a wishlist-only view filter.
- `settings-and-overrides`: Persists shop wishlist items in local storage with import/export or list editing.

## Impact

- Modifies `src/shared/buyer.ts`, `src/shared/shop.ts`, `src/content/shop.ts`, `src/sidepanel/sections/live.ts`, `src/sidepanel/sections/alerts.ts`, and `src/sidepanel/index.html`.
- Branch `shop-bin-wishlist`, landing via pull request into `main`, merged with `gh pr merge --admin`.
- Version bump: minor version bump (0.21.0) as this introduces a user-facing feature.

## Out of Scope

- Automated purchasing or auto-clicking Buy-It-Now buttons (the assistant never buys or checks out automatically).
- Cross-platform web scraping of external marketplaces beyond the active and monitored Whatnot shows.

