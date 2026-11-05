# Design

## Context

- **Current shop ingestion (`src/shared/shop.ts`, `src/content/shop.ts`).** `readListing` in `src/shared/shop.ts` reads `rawQty = num(o.quantity ?? o.inventory ?? obj(o.inventoryLevel)?.quantity) ?? 1` and clamps `Math.max(1, Math.min(999, Math.round(rawQty)))`, turning `0` into `1`. In `src/content/shop.ts`, `ingest` skips any listing whose `id` is already in `listings`, so price cuts, quantity changes, and newly sold items on later shop reads are ignored. Live `sale` events in `src/content/live.ts` are never reflected in `listings`.
- **Current scoring (`src/shared/shop.ts`).** `scoreShop` checks `shopMelt(item, spot)` (which only calls `quickRead(listing.title)`), `findComps([item.title], ...)`, `matchWatch(item.title, watchlist)`, and `keyDateCallouts({ text: item.title })`. It does not read `item.subtitle` for those checks, does not append device/tool spec lines (`specLine`, `toolsLine`, `missingAccessory`, `electronicsWantMatches`), does not check `compareToCollection` (`src/shared/collection.ts`), and does not factor in `allInPrice` / `shippingOwed` / `flipProfit` (`src/shared/costs.ts`) or show-note coupons.
- **Current enrichment passes (`src/content/shop.ts`, `src/shared/shop.ts`, `src/background/refPrices.ts`).** Pass 2 (`priceMustHaves`) calls `GRADE_GUIDE` for graded coin `must` hits, and `applyShopWorth` prepends `Market $X` or `Guide $X` to `reason` without changing `kind` or re-sorting. Cards, PSA certs, and vinyl records in the shop never call `REF_LOOKUP` (`refLookup` in `src/background/refPrices.ts`).
- **Current UI surfaces (`src/content/overlay.ts`, `src/sidepanel/sections/live.ts`, `src/sidepanel/index.html`, `src/content/selectors.ts`).** `ShopHitView` and `#shop-hits` render static text with no click handler to search Whatnot's shop drawer, no stock scarcity label, no per-hit dismiss control, no `BIN only` / `All` mode filter, no manual `Rescan` button, and no shop deal badge on background monitored show rows (`renderMonitors`).

## Goals / Non-Goals

**Goals:**

- Keep the initial Pass 1 shop scan instant and purely local while making it accurate for stock state, subtitles, device/tool specs, collection/sets, and all-in landed cost / flip profit.
- Keep the shop list live as items sell on the show socket or as shop pages are re-read or manually rescanned.
- Promote or filter key-date coins from PCGS auction medians (`GRADE_GUIDE`) and enrich raw cards, stated PSA certs, and vinyl records from `REF_LOOKUP` (`src/background/refPrices.ts`).
- Make shop hits actionable in both the overlay and sidepanel (click to search in Whatnot's shop drawer + copy title, stock badges, dismiss hit to reveal the next hit from the scored pool, `BIN only` / `All` filter, and background monitor badges).

**Non-Goals:**

- Clicking Buy Now, Pre-bid, Place Bid, or Set Max Bid, entering giveaways, claiming coupons, or sending chat.
- Inventing certification numbers, exchange rates, or retail prices.
- Calling paid cloud AI providers during the background shop scan.

## Decisions

### 1. Live Shop Sync (`src/shared/shop.ts`, `src/content/shop.ts`, `src/shared/messages.ts`, `src/content/index.ts`)

- **Zero-quantity rejection and removed IDs**:
  - In `readListing`, check explicit quantity fields (`o.quantity`, `o.inventory`, `obj(o.inventoryLevel)?.quantity`). When any explicit field is a finite number `<= 0`, return `null`. Default to `1` only when no quantity field is present.
  - Add `readRemovedShopIds(body: unknown): Set<string>` in `src/shared/shop.ts` (and include `removedIds: string[]` on `readShopPage(body)`), collecting IDs of nodes in the payload whose status matches `SOLD_STATUS` or whose explicit quantity is `<= 0`.
- **Upsert & prune (`mergeShopListings`)**:
  - Add `mergeShopListings(current: ShopListing[], incoming: ShopListing[], removedIds?: Iterable<string>): ShopListing[]` in `src/shared/shop.ts`. It drops any listing in `removedIds`, updates existing listings in place when `id` matches (updating `price`, `quantity`, `title`, `subtitle`, `currency`, `usdPrice`, `mode`), and appends new listings up to `MAX_LISTINGS`.
- **Live socket sale sync (`applySaleToShopListings`)**:
  - Add `applySaleToShopListings(listings: ShopListing[], sale: { id?: string | null; productId?: string | null; title?: string | null; kind?: string | null }): ShopListing[]` in `src/shared/shop.ts`. Giveaways (`kind === 'giveaway'`) are ignored. Match by `sale.productId` or `sale.id` against `listing.id` first; if neither matches, match the first `bin` listing whose normalized title equals the normalized `sale.title`. Decrement `quantity` by `1`, or remove the listing when `quantity <= 1` or `mode === 'auction'`.
  - In `src/content/shop.ts`, register an `onLive` listener inside `ensureShopListener()` so any `sale` signal that modifies `listings` triggers `arm(QUICK_MS)`.
- **Manual Rescan (`rescanShop` & `SHOP_RESCAN`)**:
  - Export `rescanShop()` in `src/content/shop.ts`: clears `seenCursor`, resets `pages = 0`, posts `{ kind: 'fetch_shop', id: liveId, after: null }`, and arms the quiet timer.
  - Add `SHOP_RESCAN` to `MessageMap` in `src/shared/messages.ts`, wired in `src/content/index.ts`, with a `Rescan` button in `src/sidepanel/index.html` (`#shop-rescan`) and `src/content/overlay.ts` (`data-action="shop-rescan"`).

### 2. Subtitle Parsing, Device/Tool Context & PCGS Re-Scoring (`src/shared/shop.ts`, `src/content/shop.ts`)

- **Subtitle-aware `shopMelt` and `scoreShop`**:
  - In `shopMelt(listing, spot)`, try `quickRead(listing.title).read` first; if null and `listing.subtitle` is present, fall back to `quickRead(`${listing.title} ${listing.subtitle}`).read`.
  - In `scoreShop`, pass `item.subtitle ? [`${item.title} ${item.subtitle}`, item.title] : [item.title]` to `findComps`, check `matchWatch(item.title, watchlist) ?? (item.subtitle ? matchWatch(`${item.title} ${item.subtitle}`, watchlist) : null)`, and pass `item.subtitle ? `${item.title} ${item.subtitle}` : item.title` to `keyDateCallouts`.
- **Device/tool context & chat wants**:
  - Add optional `chatWants?: string[]` to `ShopScoreInput`.
  - When a listing produces a hit (or matches a buyer chat want on an electronics/tools show), enrich its notes with concise device specs (`specLine(item.title, item.subtitle)`), tool quick read (`toolsLine(item.title, item.subtitle)` without repeating start/shipping), missing charger/adapter (`missingAccessory(item.title, item.subtitle)`), and `Matches chat want` when `chatWants?.some(w => electronicsWantMatches(w, item.title, item.subtitle))` is true.
- **PCGS re-scoring (`applyShopWorth`)**:
  - Extend `applyShopWorth(hits, lines, options?: { maxBidPercent?: number; watchlist?: WatchItem[] })`:
    - Parse `Market $X` (auction median from 2+ PCGS sales) or `Guide $X` (PCGS price guide) from the worth line.
    - When `Market $X` is present:
      - If `hit.price <= market * STEAL_RATIO (0.6)`, promote `kind` from `'must'` to `'steal'`.
      - Else if `hit.price <= market * ((options?.maxBidPercent ?? 80) / 100)`, promote `kind` from `'must'` to `'deal'`.
      - Else if `hit.price > market * 1.25` and the item does not match `options?.watchlist`, drop the overpriced `must` hit.
    - When `Guide $X` is present (and no auction median):
      - Keep `kind: 'must'` (price guides never set bid/steal value), except drop non-watchlist `must` hits priced above `guide * 1.5`.
    - Re-sort by `KIND_RANK` then edge then price. In `src/content/shop.ts`, call `announce(id, visibleHits)` after `priceMustHaves` when promotions occur.

### 3. All-In Landed Cost, Flip Profit & Coupons (`src/shared/shop.ts`, `src/content/shop.ts`)

- Add optional `shipping?: number | null`, `shippingRules?: ShippingRules | null`, `hasWinThisShow?: boolean`, `taxPercent?: number`, `feePercent?: number`, and `coupons?: string[]` to `ShopScoreInput`.
- When shipping/tax context is provided (`shipping != null || hasWinThisShow || (taxPercent ?? 0) > 0 || shippingRules != null`):
  - Compute `owed = shippingOwed({ rules: shippingRules, lotTitle: item.title, pageShipping: shipping ?? null, hasWinThisShow: Boolean(hasWinThisShow) })` and `allIn = allInPrice(effectivePrice, owed, taxPercent ?? 0)`.
  - Use `landedPrice = allIn.total` when checking `underMelt` (`landedPrice < melt`), `stealComps` (`landedPrice <= median * STEAL_RATIO`), `dealComps` (`landedPrice <= max`), and `watchDeal` (`landedPrice <= watch.max`).
  - On `steal` and `deal` hits where `reference = Math.max(melt ?? 0, median ?? 0) > 0`:
    - Append `combined ship` when `allIn.shippingPaid` is true, or `all-in ${formatMoney(landedPrice)}` when `landedPrice > effectivePrice`.
    - Compute `flip = flipProfit(reference, landedPrice, feePercent ?? DEFAULT_FEE_PERCENT)`; when `flip.profit >= 1`, append `Flip +${formatMoney(flip.profit)} after fees`.
- When `coupons?.length` is non-empty, append `Coupon ${coupons[0]}` to the shop summary or hit notes so the buyer knows a show coupon is active without deducting an unknown discount.

### 4. Click-to-Find in Whatnot Shop, Scarcity Badges, Dismiss & Mode Filter (`src/content/selectors.ts`, `src/content/shop.ts`, `src/content/overlay.ts`, `src/sidepanel/sections/live.ts`, `src/shared/messages.ts`)

- **Selectors (`src/content/selectors.ts`)**:
  - `findShopTabButton(): HTMLElement | null` finds a visible button or `[role="tab"]` outside `SITE_CHROME` and our overlay whose label matches `/^shop(?:\s*\(\d+\)|\s+\d+)?$|^buy\s*it\s*now\b/i` or `[data-testid*="shop-tab" i]`.
  - `findShopSearchInput(): HTMLInputElement | null` finds a visible, enabled search input outside `SITE_CHROME` and `header` matching `input[data-testid*="shop" i], input[placeholder*="search shop" i], input[placeholder*="search" i], input[type="search"]` (excluding `findChatInput()`).
- **Focus action (`focusShopHit` in `src/content/shop.ts`)**:
  - Copies `title` to the clipboard via `navigator.clipboard?.writeText(title)`.
  - Checks `findShopSearchInput()`; if not visible, clicks `findShopTabButton()` with `clickLikeUser` and awaits `waitFor(findShopSearchInput, 1500)`.
  - When found, sets the input value with `setReactValue(input, title)` and shows an overlay notice (`Filtered shop for "…".` or `Copied "…" — paste into Shop search.`). Never clicks any Buy Now or Pre-bid button.
- **Scarcity badges, Dismiss (`×`), and `BIN only` / `All` filter**:
  - `scoreShop` and `applyShopAi` accept an optional `limit` (default `MAX_SHOP_HITS = 8`). `src/content/shop.ts` requests up to `24` scored hits in `pool`, filters out `dismissedIds` (per show) and applies the active mode filter (`'all' | 'bin'`), and slices to `MAX_SHOP_HITS = 8` for display.
  - `ShopHitView` in `src/content/overlay.ts` and `ShopScan` in `src/shared/shop.ts` carry `id`, `title`, `quantity`, `mode`, `filter`, and `hasAuctions`.
  - Add `SHOP_FOCUS: { req: { title: string }; res: Result }`, `SHOP_DISMISS: { req: { id: string }; res: Result }`, and `SHOP_FILTER: { req: { filter: 'all' | 'bin' }; res: Result }` to `MessageMap` in `src/shared/messages.ts` so both the overlay and sidepanel share the exact same actions.

### 5. Collection & Set-Builder Matching (`src/shared/shop.ts`, `src/content/shop.ts`)

- Add optional `collection?: CollectionSettings | null` and `ownedTitles?: string[]` to `ShopScoreInput`.
- In `scoreShop`:
  - Build `ownedList = [...(collection?.owned ?? []), ...(ownedTitles ?? [])]`.
  - When `ownedList.length > 0 || (collection?.sets.length ?? 0) > 0`, call `compareToCollection({ name: fullTitle }, ownedList, collection?.sets ?? [])`.
  - If `coll.set && !coll.set.have && !parts && !pricedFair`: qualify the listing as at least `kind = 'must'` and include `Needed for your set: ${coll.set.text} (you have ${coll.set.dates} dates)` in `notes`.
  - If `kind !== null` and `coll.set?.have`: include `Already in your set: ${coll.set.text}`.
  - Else if `kind !== null` and `coll.similar > 0`: include `You own ${coll.similar} like this`.

### 6. TCG Card, Vinyl & Stated PSA Cert Reference Lookup (`src/shared/shop.ts`, `src/content/shop.ts`)

- Add `extractShopRefQuery(listing: ShopListing, showType?: ShowType): Partial<AppraisalItem> | null` in `src/shared/shop.ts`:
  - **Stated PSA cert**: When `title` or `subtitle` contains `\bpsa\b/i` and an explicit 7-to-9-digit cert number (`/(?:\bcert(?:\s*#|\s+no\.?)?\s*|^#?)(\d{7,9})\b/i`), return `{ item_name: listing.title, is_slabbed: true, grading_service: 'PSA', cert_number, year }`.
  - **Trading cards**: When `title` or `subtitle` states a collector number `(\d{1,3}\/\d{1,3})` or Yu-Gi-Oh set code `\b([A-Z]{2,4}-(?:EN)?\d{3})\b` and either `showType === 'cards'` or card game keywords (`pokemon|pikachu|charizard|tcg|holo|vmax|vstar|mtg|magic|yugioh|yu-gi-oh`) appear, return `{ item_name, item_type: 'trading_card', is_slabbed, card: { game, name, set, number } }`.
  - **Vinyl records**: When `\b(?:vinyl|lp|12"\s*record|33\s*rpm|45\s*rpm)\b/i` appears in `title` or `subtitle`, return `{ item_name: listing.title, item_type: 'vinyl_media' }`.
- Add `applyShopRefs(listings, hits, refById, options)` in `src/shared/shop.ts` and `priceShopRefs` in `src/content/shop.ts` (capped at 6 lookups per scan, using `send('REF_LOOKUP', { item })` which shares `refCache` in `src/background/refPrices.ts`).

### 7. Background Monitor Shop Badges (`src/shared/shop.ts`, `src/sidepanel/sections/live.ts`)

- Add `monitorShopBadge(shop: ShopScan | null | undefined): { text: string; kind: 'steal' | 'deal' } | null` in `src/shared/shop.ts`.
- In `renderMonitors` (`src/sidepanel/sections/live.ts`), call `monitorShopBadge(s?.shop)`, append `badge.text` to the monitor row description, and add the `'good'` highlight class when `badge?.kind === 'steal'`.

## Risks / Trade-offs

- **[Unpaid shipping filters out a cheap BIN item the user might bundle later]** → Once the user wins any lot in the show, `purchases` updates `hasWinThisShow = true` and `src/content/shop.ts` re-evaluates `listings` immediately, surfacing combined-shipping steals automatically.
- **[Card titles without card numbers could trigger noisy `REF_LOOKUP` calls]** → `extractShopRefQuery` requires an explicit card number (`N/M`) or set code (`ABC-123`), an explicit 7–9 digit PSA cert number, or explicit vinyl keywords, and caps lookups at 6 per shop scan.
- **[Whatnot changes its Shop tab or search input markup]** → `focusShopHit` always copies the title to the clipboard first and falls back cleanly with a notice telling the user to paste into Shop search.

## Migration Plan

- No storage schema breaking changes. Optional fields on `ShopScan`, `ShopHit`, and `ShopHitView` degrade gracefully if absent.
- Rollback: revert the pull request.

