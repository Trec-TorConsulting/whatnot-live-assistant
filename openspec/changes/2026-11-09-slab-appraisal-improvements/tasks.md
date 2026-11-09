# Tasks: Slab Appraisal and Certification Precision Hardening

- [x] 1. **Schema & Instruction Expansion for Slabs (`src/shared/appraisal.ts`)**
  - [x] 1.1 Add structured slab fields to `AppraisalItem` (`finish`, `designation`, `pedigree`, `signature`, `cac`, `paper_quality`, `star_note`, `catalog_number`).
  - [x] 1.2 Update `APPRAISAL_SCHEMA` with the new nullable fields.
  - [x] 1.3 Update `APPRAISAL_INSTRUCTIONS` to direct models to extract coin/currency slab headers, signatures, pedigrees, CAC stickers, and EPQ/PPQ banners.
  - [x] 1.4 Add helper `hasPremiumSlabAttributes(item)` to detect when an item has signatures, special finishes, pedigrees, CAC stickers, or EPQ.

- [x] 2. **Valuation Priority & UI Basis Label Fix (`src/shared/appraisal.ts`, `src/content/appraisalView.ts`)**
  - [x] 2.1 Update `computeValue` so that when `hasPremiumSlabAttributes` is true, generic common-date base FMV does not override a higher AI estimate or slab-specific comps.
  - [x] 2.2 Fix the hardcoded `'TCGplayer market price'` label in `BASIS_LABEL` to dynamically render the actual source name (`NumisMedia FMV`, `Greysheet CPG`, `eBay sold comps`, `TCGplayer market price`).
  - [x] 2.3 Add unit tests verifying that premium slab coins and notes do not get downgraded by common-date bullion FMV.

- [x] 3. **Slab-Aware eBay Sold Comps (`src/background/ebayComps.ts`, `src/shared/refPrice.ts`)**
  - [x] 3.1 Update `buildEbayQuery` to include slab grading service, certified grade, signature, finish, pedigree, and paper designations (`EPQ`, `Star`).
  - [x] 3.2 Add query cleanup and anti-reprint filtering (`-copy -reprint -tribute`).
  - [x] 3.3 Update `marketOf` to prefer realized graded eBay comps over common-date static guide prices for slabs with premium attributes.
  - [x] 3.4 Add unit tests verifying queries generated for signature slabs and paper currency slabs.

- [x] 4. **Paper Currency Slab Valuation (`src/shared/fmv.ts`, `src/background/refPrices.ts`)**
  - [x] 4.1 Add retail baseline and EPQ multiplier logic for common US paper currency series (Silver Certificates, Red Seals, Federal Reserve Notes).
  - [x] 4.2 Support Friedberg (Fr.) number extraction and matching.
  - [x] 4.3 Add unit tests verifying paper currency slab pricing and EPQ/Star handling.

- [x] 5. **UI Slab Badge Rendering (`src/content/appraisalView.ts`, `src/sidepanel/format.ts`)**
  - [x] 5.1 Render signature badges, CAC stickers, and EPQ/PPQ indicators on the appraisal overlay.
  - [x] 5.2 Verify layout and visual formatting on both desktop extension overlay and side panel.

- [x] 6. **Testing & Quality Assurance**
  - [x] 6.1 Run full unit test suite (`npm test`).
  - [x] 6.2 Run typecheck (`npm run build`).
  - [x] 6.3 Verify the 2017-W Burnished MS 70 Elizabeth Jones scenario in test cases.

- [ ] 7. **Ship Chain**
  - [x] 7.1 Bump version in `package.json`.
  - [x] 7.2 Create feature branch `feature/slab-appraisal-improvements`.
  - [ ] 7.3 Commit changes excluding any tokens, `.env` files, or Chrome profiles.
  - [ ] 7.4 Push branch to remote.
  - [ ] 7.5 Open detailed pull request into `main`.
  - [ ] 7.6 Merge pull request with `gh pr merge --admin`.

