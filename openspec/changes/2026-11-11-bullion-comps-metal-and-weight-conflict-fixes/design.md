# Design: Bullion Sold Comps Precious Metal and Weight Conflict Guard

## Context

`matchScore` in `src/shared/soldHistory.ts` determines whether a completed sale is an acceptable comp for a listing or auction. While it guards against conflicting years, pack counts, and device specifications, its bullion safeguards were insufficient:
1. It lacked precious metal conflict detection, allowing silver coins to pair with gold bullion sales if other keywords matched.
2. It relied exclusively on `quickRead(text).read?.oz` for weight comparison. `quickRead` only parses explicit ounce formats (`oz`) or known coin series, returning `null` for gram, kilogram, and grain weights. When either title returned `null`, weight divergence was completely unmonitored.

## Goals / Non-Goals

**Goals:**
- Detect and prevent metal mismatches (`silver` vs `gold`, `platinum`, `palladium`, `copper`, or `clad`/`plated`/`gilt`) in `soldHistory.ts`.
- Extract bullion weights across ounces, grams, kilograms, and grains, converting them to troy ounces for accurate percentage comparison.
- Rule out comps when bullion weights diverge by more than 5%.
- Rule out comps when an item specifies an explicit non-1-oz bullion weight (e.g. fractional < 0.8 oz or heavy > 1.2 oz) and the comparison title lacks a matching weight.

**Non-Goals:**
- Altering PCGS auction or price guide valuation pipelines.
- Modifying electronics device spec parsing.
- Introducing external network or API lookups.

## Decisions

### 1. Dedicated Precious Metal Extraction and Conflict Resolution (`extractMetal` and `metalsConflict`)
- **Extraction logic**: Checks both `quickRead(text).read?.metal` (which identifies coin series like Morgan Dollars as silver and Double Eagles as gold) and explicit keyword matching (`gold`, `silver`, `platinum`, `palladium`, `copper`, `cobre`, `brass`, `bronze`, `clad`, `plated`, `gilt`).
- **Conflict rule**:
  - `silver` conflicts with `gold`, `platinum`, `palladium`, `copper`, `cobre`, `brass`, `bronze`, and `clad`/`plated`/`gilt`.
  - `gold` conflicts with `silver`, `platinum`, `palladium`, `copper`, `cobre`, `brass`, `bronze`, and `clad`/`plated`/`gilt`.
  - Solid precious metals conflict with base metals or novelty plated items.
- **Alternatives considered**: Relying solely on token overlap with metal words in `NOISE`/`STOP`. Rejected because when listings have 5+ tokens (e.g., `2026`, `Coca`, `Cola`, `polar`, `bear`), the 60% overlap threshold is easily exceeded even when `silver` is replaced by `gold`.

### 2. Multi-Unit Bullion Weight Parser (`extractBullionWeight`)
- Extracts bullion weights into normalized troy ounces:
  - **Ounces (`oz`, `ozt`, `ounce`, `ounces`)**: Direct ounce value, including fractions (`1/10th`, `1/4`, `1/2`, `1/1000`) and word fractions (`tenth`, `quarter`, `half`).
  - **Grams (`g`, `gram`, `grams`)**: `grams / 31.1035`.
  - **Kilograms (`kg`, `kilo`, `kilos`)**: `(kg * 1000) / 31.1035`.
  - **Grains (`grain`, `grains`, `gr`)**: `grains / 480`.
- Falls back to `quickRead(text).read?.oz` when explicit regex does not match but a known coin series is present.
- **Alternatives considered**: Only checking gram weights. Rejected because bullion is frequently traded in kilos (bars) and grains (art bars/scrap), which would leave identical vulnerabilities.

### 3. Asymmetric Weight Protection for Non-1-oz Bullion
- If both items have an extracted bullion weight: reject if `|a - b| / max(a, b) > 0.05` (more than 5% difference).
- If one item has an explicit fractional weight (< 0.8 oz, such as `1g`, `5g`, `1/10 oz`) or heavy weight (> 1.2 oz, such as `10 oz`, `1 kilo`), and the comparison item does not have a matching weight: reject the match (`return 0`). This ensures `Valcambi 1g Silver` will not comp against an unweighted `Valcambi Silver Bar` that realized 1 oz prices.

## Modules Touched

- `src/shared/soldHistory.ts`
- `src/shared/soldHistory.test.ts`
- `src/shared/shop.test.ts`
- `package.json`

## Risks / Trade-offs

- **[Risk]**: Wireless generation `5G` in electronics titles matching as 5 grams.
  - **Mitigation**: Confine `g` matching with negative lookaheads (`(?!\\s*(?:cellular|lte|uwb|network|wifi|phone))`) and rely on existing `SPECIALTY` show-type isolation which keeps `coins` and `electronics` shows strictly separated.
- **[Risk]**: A 1 oz coin with no explicit weight stated in one title fails to match another 1 oz coin with explicit weight.
  - **Mitigation**: The unweighted guard applies only to non-1-oz bullion (< 0.8 oz or > 1.2 oz). Standard 1 oz items (e.g., `1 oz Silver Eagle` vs `Silver Eagle`) continue to match freely.

