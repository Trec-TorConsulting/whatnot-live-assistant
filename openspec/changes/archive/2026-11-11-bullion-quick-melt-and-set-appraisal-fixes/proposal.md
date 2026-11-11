# Proposal: Bullion Quick Melt and Multi-Coin Set Appraisal Hardening

## Why

Two shop items from a live bullion show were falsely flagged as massive "Steals" under melt value due to flawed coin classification and melt arithmetic in `quickRead`:

1. **`Steal [1 left] 2007 Gold Krugerrand Investment Coin Set 3 Coins Limited Edition of 5000 Display Case & Booklet — $325. Under melt ($12,158). Flip +$10,503`**:
   - `src/shared/appraisal.ts` matched `oneOz(/\bkrugerrand/)`, assuming any unweighted Krugerrand listing is a full 1 oz Gold Krugerrand (`krugerrand_1oz` = 1.0 oz fine gold).
   - `QTY_RE` matched `3 Coins` as `quantity = 3`.
   - The system multiplied 3 × 1.0 oz × live gold spot ($4,052.67/oz) = **$12,158** melt value.
   - In reality, an unweighted multi-coin "Investment Coin Set 3 Coins" is a commemorative/fractional or tribute presentation set, NOT 3 full 1-ounce gold bullion coins (which would be 3 oz of pure gold). Multiplying an assumed 1 oz weight across an unweighted set's coin count creates catastrophic false valuations.

2. **`Steal [1 left] 2009 NORFED $20 Liberty Dollar – 1 oz .999 Silver – Cali Evergreen RCO Stamp( mintage 250) — $350. Under melt ($3,921). Flip +$3,139`**:
   - `QUICK_PATTERNS` in `src/shared/appraisal.ts` matched `[/\bdouble\s*eagle\b|\$20\s*(liberty|saint|gold)/i, 'us_gold_20_double_eagle', '$20 Gold Double Eagle']` because `$20 Liberty` appeared in the title `$20 Liberty Dollar`.
   - This classified the item as `us_gold_20_double_eagle` (`metal: 'gold'`, `oz: 0.9675`), ignoring the explicit `1 oz .999 Silver` text and the `NORFED` issuer.
   - In `quickRead`, `QUICK_PATTERNS` ran before `BULLION_RE`, allowing an erroneous gold series match to completely override explicit silver bullion specifications.
   - At gold spot ($4,052.67), 0.9675 oz was priced at **$3,921** melt value instead of 1 oz silver melt (~$32). Against a $350 asking price, it was erroneously declared a "Steal" with a +$3,139 flip profit.

Additionally, South African Krugerrands have been minted in official 1 oz Silver since 2017, but `QUICK_PATTERNS` only possesses a gold Krugerrand entry and lacks silver discrimination, causing silver Krugerrands to misclassify as gold.

## What Changes

- **1. Disqualify Unweighted Sets & Lots from Single-Coin Bullion Melt (`src/shared/appraisal.ts`, `src/shared/shop.ts`)**:
  - Update `oneOz` and `quickRead` to reject titles containing multi-item indicators (`set`, `sets`, `collection`, `lot`, `album`, `holder`, `case`, `display case`, `booklet`, `pack`) unless an explicit total bullion weight or explicit per-piece bullion weight is specified (e.g. `3 oz silver`, `1/10 oz gold`).
  - Update `shopMelt` to ensure listings identified as multi-coin sets or unweighted lots do not fabricate multi-ounce melt values by multiplying coin count against single-coin series weights.
- **2. Metal Conflict Protection & NORFED Dollar Discrimination (`src/shared/appraisal.ts`)**:
  - Guard the `$20 Gold Double Eagle` pattern so it requires authentic gold denominations (e.g. Double Eagle, $20 Liberty Head, $20 Saint-Gaudens, $20 Gold) and explicitly rejects `dollar` (e.g. `$20 Liberty Dollar`), `norfed`, and base/conflicting metals (`silver`, `copper`, `cobre`, `brass`, `bronze`, `clad`, `plated`).
  - Ensure all gold coin series patterns (`krugerrand_1oz`, `american_gold_eagle`, `gold_buffalo`, `gold_maple`, `britannia_gold`, `us_gold_*`) contain negative lookahead guards preventing matches when the listing text explicitly denotes `silver`, `copper`, `platinum`, or `palladium`.
- **3. Explicit Bullion Priority Over Series Guessing (`src/shared/appraisal.ts`)**:
  - In `quickRead`, when explicit bullion weight and metal are parsed from text (e.g. `1 oz .999 Silver`), ensure the explicit metal takes precedence over any conflicting series match.
- **4. Add Silver Krugerrand Recognition (`src/shared/appraisal.ts`)**:
  - Add `krugerrand_silver_1oz` (`metal: 'silver'`, `oz: 1`) to `SERIES`.
  - Add explicit silver Krugerrand pattern matching in `QUICK_PATTERNS` before the gold Krugerrand fallback, and guard the gold Krugerrand pattern against matching silver titles.

## Capabilities

### Modified Capabilities

- `appraisal`: Hardens quick melt extraction against unweighted multi-coin sets, prevents gold series misclassification on silver and NORFED listings, prioritizes explicit bullion statements over conflicting series rules, and supports Silver Krugerrands.
- `bin-product-appraisal`: Prevents shop melt and Buy-It-Now appraisal from flagging unweighted sets as steals under fake melt calculations.

## Out of Scope

- Modifying video frame appraisal or PCGS cert verification logic.
- Automated bidding or purchasing on Whatnot.
- External spot price provider changes (continues using `gold-api.com`).

## Branch & Landing

- **Branch:** `feature/bullion-quick-melt-and-set-appraisal-fixes`
- **Landing:** Work lands through a pull request into `main` and merges via `gh pr merge --admin`.

