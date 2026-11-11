# Proposal: Bullion Sold Comps Precious Metal and Weight Conflict Guard

## Why

In live coin and bullion shows (such as `https://www.whatnot.com/live/e9086f65-0d9e-4d87-b0ae-672a94f5cc35`), the shop check produced two severe false "Steal" alerts due to defective comp matching in `src/shared/soldHistory.ts`:

1. **`Steal [17 in stock] 1 oz silver 2026 Coca Cola polar bear — $135. Under $760 median of 7 sales. Flip +$542 after fees`**:
   - The shop item is a 1 oz silver round ($135 asking price).
   - Whatnot sold comps matched it against 7 sales of the 2026 PAMP Coca-Cola Polar Bear 5 Gram Gold Bar (which realize ~$760).
   - `matchScore` in `src/shared/soldHistory.ts` had **zero metal conflict checking**: it never checked whether one title was silver and the other gold. Furthermore, `quickRead` only extracted weights explicitly formatted with ounce units (`oz`), returning `null` for gram weights like `5 Gram`, which bypassed the weight conflict guard entirely.

2. **`Steal Valcambi 1g Silver — $8. Under $30.50 median of 8 sales. Flip +$18.88 after fees`**:
   - The shop item is a 1 gram silver bar ($8 asking price, melt value ~$1.03).
   - Whatnot sold comps matched it against 8 sales of 1 oz Valcambi silver bars/rounds (median $30.50).
   - `quickRead` failed to extract `1g` because it lacked gram parsing. In `titleTokens`, `1` is filtered out by length and `oz` is a stop token, giving `Valcambi 1g Silver` and `Valcambi 1 oz Silver` a 67% token overlap (`valcambi`, `silver`). Without a weight conflict triggered, the 1g bar was comped directly against 1 oz bar sales, showing an erroneous +$18.88 flip profit.

## What Changes

- **Precious Metal Conflict Detection (`metalsConflict`)**:
  - Extract metal types from explicit text and series identification (`silver`, `gold`, `platinum`, `palladium`, `copper`/`cobre`, `brass`, `bronze`, and `clad`/`plated`/`gilt`).
  - Reject Whatnot comps (`return 0`) when the wanted item and comparison title have conflicting metals (e.g., silver matching gold, or solid precious metal matching copper or clad/plated novelty).
- **Comprehensive Bullion Weight Extraction (`extractBullionWeight`)**:
  - Extract bullion weights across units: troy ounces (`oz`, `ozt`, `ounce`, `ounces`, word/decimal/ordinal fractions), grams (`1g`, `2.5g`, `5g`, `100g`, `grams`), kilograms (`1kg`, `kilo`), and grains (`100 grain`, `gr`). Normalize all extracted weights to troy ounces.
  - Reject Whatnot comps when both items specify bullion weights and their normalized weights differ by more than 5%.
  - Reject Whatnot comps when an item states an explicit non-1-oz weight (such as fractional weights < 0.8 oz like `1g`, `5g`, `1/10 oz`, or heavy weights > 1.2 oz like `10 oz`, `1 kilo`) and the comparison title lacks a matching weight.

## Capabilities

### Modified Capabilities

- `reference-prices`: Whatnot sold comps rule out matches with conflicting precious metal types (silver, gold, platinum, palladium, copper, clad/plated) or conflicting bullion weights across ounces, grams, kilograms, and grains.

## Out of Scope

- Modifying PCGS or eBay sold comps pipelines.
- Changing live video frame identification or cert verification.
- Automated bidding or buying on Whatnot.

## Impact

- `src/shared/soldHistory.ts`, `src/shared/soldHistory.test.ts`, and `src/shared/shop.test.ts`.
- Eliminates erroneous "Steal" badges on shop items caused by mismatched metal types or mismatched bullion weights.
- Patch version bump to `0.25.2` in `package.json`.

## Branch & Landing

- **Branch:** `feature/bullion-comps-metal-and-weight-conflict-fixes`
- Lands through a pull request into `main`, then merges with `gh pr merge --admin`.

