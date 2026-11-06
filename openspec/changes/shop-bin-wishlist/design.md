# Design: Shop & BIN Wishlist

## Context

Currently, the extension maintains a general `watchlist` array primarily designed for auction lot bid guard ceilings and closing alerts in `src/shared/buyer.ts`. In the shop scan (`src/shared/shop.ts`), watchlist hits are partially integrated into deal scoring, but users cannot easily view wishlist-only shop inventory, receive alerts on live BIN drops, or manage wishlist entries separately with specific keywords tailored for shop inventory. See `proposal.md` for motivation.

## Goals / Non-Goals

**Goals:**
- Provide a clean data model and parser for shop wishlist items (keywords + optional price ceiling).
- Score and badge Buy-It-Now shop inventory matching wishlist entries on active and monitored shows.
- Enable instant filtering (`Wishlist` / `BIN only` / `All`) in the assistant shop card and sidepanel.
- Trigger real-time notifications when a seller drops or restocks a wishlisted BIN item during a stream.

**Non-Goals:**
- Automated checkout or automated clicking of Whatnot Buy-It-Now buttons.
- Overriding user bid limits for live auctions with shop wishlist rules.

## Decisions

1. **Wishlist Structure & Parser (`src/shared/buyer.ts`)**:
   - Reuse the battle-tested whitespace-separated keyword format with an optional trailing dollar amount (e.g. `1881-s morgan $45`, `charizard base holo`).
   - Store entries in `BuyerSettings.wishlist` (or extend `watchlist` with explicit `mode: 'bin' | 'all'`).
   - *Alternative considered*: Separate comma-separated tags. *Rejected*: The space-separated tokens with trailing `$max` is already familiar to users and proven in the codebase.

2. **Shop Matching & Deal Promotion (`src/shared/shop.ts`, `src/content/shop.ts`)**:
   - Match item title and subtitle against wishlist tokens.
   - If a matching listing has a price $\le$ ceiling, promote it to a `deal` or `steal` with the reason `"Under wishlist max $X"`.
   - If no ceiling or price $>$ ceiling, tag it as a `must` or `wishlist` hit with `"On your wishlist"`.

3. **Shop Filter Controls (`src/sidepanel/sections/live.ts`, `src/content/overlay.ts`)**:
   - Add a 3-way segmented control / filter: `All` | `BIN only` | `Wishlist`.
   - When `Wishlist` is selected, only items with `onWishlist: true` are rendered.

4. **Live Drop & Restock Detection (`src/content/shop.ts`, `src/content/buyer.ts`)**:
   - Track seen listing IDs and quantities in session memory.
   - If a new listing matches the wishlist or an existing listing transitions from 0 to $>0$ inventory, dispatch a notification alert.

## Modules Touched

- `src/shared/buyer.ts`: Wishlist parsing, normalization, and types.
- `src/shared/shop.ts`: Shop scoring, wishlist matching, and deal promotion.
- `src/content/shop.ts`: Live show shop scanning, drop tracking, and restock alerts.
- `src/content/overlay.ts`: Assistant overlay shop card display, wishlist badges, and filter toggle.
- `src/sidepanel/sections/live.ts`: Live tab shop list display, badges, and wishlist filter buttons.
- `src/sidepanel/sections/alerts.ts`: Wishlist textarea input, validation, and persistence.
- `src/sidepanel/index.html`: UI elements for wishlist management and shop filter controls.

## Risks / Trade-offs

- **[Risk]** Overly broad keywords (e.g. `coin` or `pack`) matching too many items.
  → **Mitigation**: Require token-based matching and clamp maximum scored wishlist hits; prioritize longer word matches.
- **[Risk]** False alerts on repeated shop polling.
  → **Mitigation**: Track seen listing IDs and stock counts in session cache; only alert on genuine additions and quantity increases.

