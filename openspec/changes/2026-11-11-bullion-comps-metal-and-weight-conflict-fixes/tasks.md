# Tasks: Bullion Sold Comps Precious Metal and Weight Conflict Guard

## 1. Precious Metal & Bullion Weight Conflict Logic

- [x] 1.1 Implement `extractMetal` and `metalsConflict` in `src/shared/soldHistory.ts` to detect precious and base metal mismatches between want and comp titles
- [x] 1.2 Implement `extractBullionWeight` in `src/shared/soldHistory.ts` to extract weights across ounces, grams, kilograms, and grains normalized to troy ounces
- [x] 1.3 Update `matchScore` in `src/shared/soldHistory.ts` to reject metal mismatches, > 5% weight divergences, and non-1-oz bullion against unweighted titles

## 2. Unit Tests & Verification

- [x] 2.1 Add unit tests in `src/shared/soldHistory.test.ts` covering Coca-Cola polar bear silver vs gold, Valcambi 1g vs 1 oz, and unweighted bar guards
- [x] 2.2 Add unit test in `src/shared/shop.test.ts` verifying `scoreShop` does not flag `1 oz silver 2026 Coca Cola polar bear` or `Valcambi 1g Silver` as steals against mismatched comps
- [x] 2.3 Run full test suite (`npm test`) and verify all tests pass

## 3. Build & Ship Chain

- [x] 3.1 Bump patch version to `0.25.2` in `package.json` and build distribution bundles with `npm run build`
- [x] 3.2 Verify clean git status leaving tokens, .env files, and Chrome profiles out of commit
- [x] 3.3 Execute ship chain: create branch `feature/bullion-comps-metal-and-weight-conflict-fixes`, commit, push, open pull request into `main`, and merge with `gh pr merge --admin`
