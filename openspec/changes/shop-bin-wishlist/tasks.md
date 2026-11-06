# Tasks

## 1. Wishlist Data Model & Storage

- [x] 1.1 Define `WishlistItem` interface (`keywords: string[]`, `max: number | null`, `text: string`) and parsing/normalization functions in `src/shared/buyer.ts`, verified by unit tests in `src/shared/buyer.test.ts`.
- [x] 1.2 Add `wishlist` array property to `BuyerSettings` and schema defaults in `src/shared/storage.ts`, verified by unit tests in `src/shared/storage.test.ts`.
- [x] 1.3 Add wishlist multiline textarea and save handler in `src/sidepanel/sections/alerts.ts` and `src/sidepanel/index.html`, verified by settings persistence tests in `src/sidepanel/sections/alerts.test.ts`.

## 2. Shop Scoring & Wishlist Matching

- [x] 2.1 Implement multi-word token matching and longest-match selection between shop listings and active wishlist entries in `src/shared/shop.ts`, verified by unit tests in `src/shared/shop.test.ts`.
- [x] 2.2 Add price ceiling evaluation to mark under-ceiling items as deals and badge matching items as wishlist hits in `src/shared/shop.ts`, verified by ceiling scenarios in `src/shared/shop.test.ts`.
- [x] 2.3 Extend `ShopHit` interface with `onWishlist: boolean` and `wishlistCeiling: number | null` fields across scoring and content scripts, verified by type check in `npm run build`.

## 3. Shop Filter Controls & Badging UI

- [x] 3.1 Add `Wishlist` badge and 3-way filter toggle (`All` | `BIN only` | `Wishlist`) to the in-stream shop overlay card in `src/content/overlay.ts`, verified by overlay DOM tests in `src/content/overlay.test.ts`.
- [x] 3.2 Add `Wishlist` filter button and visual hit badges in sidepanel live show shop section in `src/sidepanel/sections/live.ts`, verified by sidepanel live tests in `src/sidepanel/sections/live.test.ts`.

## 4. Live Drop & Restock Detection

- [x] 4.1 Track seen listing IDs and stock quantities across live show shop poll cycles in `src/content/shop.ts` to detect new listings and 0-to-positive restocks, verified by session tracking tests in `src/content/shop.test.ts`.
- [x] 4.2 Dispatch instant notifications on newly dropped or restocked wishlist items during live streams in `src/content/shop.ts`, verified by alert dispatch tests in `src/content/shop.test.ts`.

## 5. Verification & Ship Chain

- [x] 5.1 Run full project test suite (`npm test`) and production build (`npm run build`) to ensure zero regressions across all modules.
- [x] 5.2 Validate OpenSpec specification completeness with `openspec validate shop-bin-wishlist`.
- [x] 5.3 Execute ship chain: create feature branch, commit changes without tokens or secrets, push with authorized credentials, open pull request into `main`, merge with `gh pr merge --admin`, and bump version to `0.21.0`.

## Workflow follow-up

- Archive `shop-bin-wishlist` with `openspec archive shop-bin-wishlist` once all implementation tasks are merged to main.
- Verify canonical specifications reflect the new `shop-wishlist` capability and updated `live-show` and `settings-and-overrides` specs.

