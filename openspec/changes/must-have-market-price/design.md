# Design

## Context

Shop hits are built in passes (`src/content/shop.ts`):

1. `scoreShop`: synchronous. Uses melt, watched-sale comps, watchlist, key dates, and collection.
2. `priceMustHaves` → `applyShopWorth`: PCGS `GRADE_GUIDE` for key dates with a grade.
3. `priceShopRefs` → `applyShopRefs`: `REF_LOOKUP` for cards, PSA certs, and vinyl, up to 6 per scan.
4. `SHOP_AI` → `applyShopAi`: local AI range and info, up to 20 items.

Each hit has one `reason` string, made of notes joined with `. `. Before this change only steals and deals were sure to carry a price.

## Decisions

- **Market line first.** The first note on a must-have is always a market line, so the user sees the price before any other context.
- **Source order.** Pass 1 writes `Market $X (median of N sales)` when it has a median from 2+ sales, otherwise `Market: no price yet`. Later passes add outside sources in front: `Market $X (PCGS …)` / `Guide $X (PCGS …)`, `Market $X (pokemontcg|tcgplayer|…)`, `Prints $a–$b`, `Discogs listed from $X`, and `AI est. $a–$b`. A sales median, if present, stays as a second line so the user can compare.
- **Melt is not market.** Melt is the metal floor, and for a key-date silver coin it can be a small fraction of what the coin sells for. It is shown as `Melt $X` next to the market line and never satisfies `hasPriceLine`, so a must-have with only melt still keeps the placeholder and still goes to the PCGS, ref, and AI lookups.
- **Placeholder is explicit.** `Market: no price yet` uses a colon, not `Market $`, so `hasPriceLine` and the existing `^Market\s+\$` checks do not mistake it for a price.
- **`ensureMustPrice` at the end of each pass.** Any pass can change a hit's kind (a PSA mismatch demotes a steal to must; a market price promotes a must to steal). `ensureMustPrice` then adds or removes the placeholder so the rule holds whatever kind the hit ends up as.
- **No new lookups.** The lookup limits (`MAX_REF_LOOKUPS = 6`, `MAX_SHOP_AI_ITEMS = 20`) stay the same. Only the order changes: must-haves with no price go first.

## Risks / Trade-offs

- Must-hit reason strings are longer by one note. The sidepanel and overlay already wrap reason text.
- A must-have with only a sales median is no longer sent to the AI first, because it already has a market price. It can still get AI info if there is budget left.

