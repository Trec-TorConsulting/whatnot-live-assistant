# Tasks: Bullion Quick Melt and Multi-Coin Set Appraisal Hardening

- [x] 1. Define delta specifications and requirements <!-- id: 1-specs -->
  - [x] Add modified quick melt requirements to `openspec/changes/2026-11-11-bullion-quick-melt-and-set-appraisal-fixes/specs/appraisal/spec.md`
  - [x] Add modified shop bin appraisal requirements to `openspec/changes/2026-11-11-bullion-quick-melt-and-set-appraisal-fixes/specs/bin-product-appraisal/spec.md`
  - [x] Run `openspec validate 2026-11-11-bullion-quick-melt-and-set-appraisal-fixes` to ensure specification compliance

- [x] 2. Update coin series patterns and bullion matching in `src/shared/appraisal.ts` <!-- id: 2-appraisal-patterns -->
  - [x] Add `krugerrand_silver_1oz` to `SERIES` with `{ metal: 'silver', oz: 1 }`
  - [x] Add negative lookahead guards (`silver`, `copper`, `cobre`, `brass`, `bronze`, `clad`, `plated`, `norfed`) to `us_gold_20_double_eagle` and prevent matching `$20 Liberty Dollar`
  - [x] Guard all gold patterns against conflicting `silver` mentions
  - [x] Add silver Krugerrand pattern before gold Krugerrand in `QUICK_PATTERNS`
  - [x] Update `oneOz` to exclude unweighted set and lot keywords (`set`, `collection`, `lot`, `album`, `holder`, `box`, `case`, `display case`, `booklet`)
  - [x] In `quickRead`, ensure explicit bullion weights from `BULLION_RE` take precedence over conflicting metal series matches
  - [x] In `quickRead`, reject unweighted set listings from generating single-coin multiplied melt floors

- [x] 3. Update shop melt calculation in `src/shared/shop.ts` <!-- id: 3-shop-melt -->
  - [x] In `shopMelt`, reject listings matching set or lot patterns when explicit total bullion weight is missing
  - [x] Ensure `shopMelt` calculates 1 oz silver melt (~$32) for NORFED 1 oz silver dollars rather than $20 gold melt

- [x] 4. Unit tests and verification <!-- id: 4-tests -->
  - [x] Add test cases in `src/shared/appraisal.test.ts` for:
    - `2007 Gold Krugerrand Investment Coin Set 3 Coins Limited Edition of 5000 Display Case & Booklet` (returns null read for quick melt)
    - `2009 NORFED $20 Liberty Dollar – 1 oz .999 Silver – Cali Evergreen RCO Stamp( mintage 250)` (parses as 1 oz silver, NOT gold double eagle)
    - `2021 1 oz Silver Krugerrand` (parses as silver, NOT gold)
    - `1908 $20 Saint-Gaudens Gold Double Eagle` (still parses as 0.9675 oz gold)
  - [x] Add test cases in `src/shared/shop.test.ts` for:
    - Shop listing for unweighted Krugerrand 3-coin set does not trigger `underMelt` or `steal`
    - Shop listing for NORFED 1 oz silver round at $350 does not trigger `underMelt` or `steal`
  - [x] Run `npm test` to verify all 650+ tests pass

- [x] 5. Version bump and delivery <!-- id: 5-ship -->
  - [x] Bump version in `package.json` (patch bump to 0.25.1)
  - [x] Build production assets with `npm run build`
  - [x] Verify clean git status with no tokens, .env files, or Chrome profiles
  - [x] Execute ship chain: create branch `feature/bullion-quick-melt-and-set-appraisal-fixes`, commit, push, create pull request into `main`, and merge with `gh pr merge --admin`
