# Tasks: Multi-Metal Bullion Melt Parsing and Under-Estimation Guard

## 1. Multi-Metal Parser & Appraisal Hardening

- [x] 1.1 Implement `parseBullionPieces` with strict adjacent weight-to-metal binding in `src/shared/appraisal.ts`
- [x] 1.2 Update `quickRead` in `src/shared/appraisal.ts` to attach `pieces` on `QuickRead` and use conservative lower-value metal for legacy fields
- [x] 1.3 Update `quickAppraise` in `src/background/appraisal.ts` to sum melt across all parsed pieces

## 2. Shop Melt Calculation & Compound Support

- [x] 2.1 Update `shopMelt` in `src/shared/shop.ts` to calculate combined melt across all parsed bullion pieces
- [x] 2.2 Verify unweighted mixed items fall back to conservative under-estimates

## 3. Unit Tests & Verification

- [x] 3.1 Add unit tests in `src/shared/appraisal.test.ts` for `All Seeing Eye 2.5g Gold 3oz Silver` and multi-metal parsing
- [x] 3.2 Add unit tests in `src/shared/shop.test.ts` verifying `All Seeing Eye 2.5g Gold 3oz Silver` ($777) evaluates to ~$413 melt and is not badged as a steal
- [x] 3.3 Run full test suite (`npm test`) and verify all tests pass

## 4. Build & Ship Chain

- [x] 4.1 Bump patch version to `0.25.3` in `package.json` and build with `npm run build`
- [x] 4.2 Verify clean git status leaving tokens, .env files, and Chrome profiles out of commit
- [x] 4.3 Execute ship chain: branch `feature/multi-metal-bullion-melt-and-under-estimate-guard`, commit, push, create PR into `main`, and merge with `gh pr merge --admin`
