# Proposal: Multi-Metal Bullion Melt Parsing and Under-Estimation Guard

## Why

A Buy-It-Now shop listing from a live bullion show (`https://www.whatnot.com/live/cf5e54fc-7039-4682-995e-a2295786ea81`) titled:
`Steal [1 left] All Seeing Eye 2.5g Gold 3oz Silver — $777. Under melt ($11,636). All-in $780. Flip +$9,587 after fees`
was erroneously declared a massive under-melt steal with a calculated melt value of **$11,636**.

The piece is a composite collectible containing **2.5 grams of gold** (melt ~$312 at ~$3,878/oz) and **3 troy ounces of silver** (melt ~$101 at ~$33.50/oz), for a real total melt value of **~$413**. At an asking price of $777, the listing is well *above* melt (a ~$364 premium), not a steal.

In `src/shared/appraisal.ts`, `BULLION_RE` used a loose unconstrained pattern:
`\b(silver|gold|platinum|palladium)\b[^\n]*?${OZ_AMOUNT}${OZ_UNIT}`
When scanning `All Seeing Eye 2.5g Gold 3oz Silver`, it ignored `2.5g` (lacking gram parsing in `BULLION_RE`), matched the metal `Gold`, scanned forward across the space, and paired it with `3oz`, falsely treating the entire 3 oz silver piece as **3 troy ounces of solid gold** ($3,878.67 × 3 = $11,636).

The user explicitly stated: *"Can we fix the logic so it understand the diff and fully reads and understands. I rather it under est then over."* Over-estimating melt is catastrophic for buyers because it creates false "Steal" alerts on overpriced items.

## What Changes

1. **Strict Bullion Component Extraction (`parseBullionComponents`)**:
   - Extract distinct precious metal components by pairing each weight strictly with its adjacent metal (e.g. `2.5g Gold` -> 2.5g Gold, `3oz Silver` -> 3 oz Silver).
   - Guard against cross-matching: an ounce or gram amount immediately followed by a metal token belongs strictly to that subsequent metal and SHALL NOT be captured by any preceding metal token.
   - Support ounces (including fractions and words), grams, kilograms, and grains.

2. **Compound Melt Evaluation in `shopMelt` and `quickAppraise`**:
   - When multiple precious metals are present with explicit weights (e.g., `2.5g Gold 3oz Silver`), compute the exact combined melt value:
     $$\text{Total Melt} = \sum (\text{component.oz} \times \text{spot}[\text{component.metal}])$$
     For `2.5g Gold 3oz Silver`, this accurately calculates ~$413 melt, properly rejecting the $777 listing as a steal.

3. **Conservative Under-Estimation Guard**:
   - When a listing contains multiple metals where one weight is unstated or ambiguous (e.g., `3 oz Silver with Gold Inlay`), evaluate melt based only on the explicitly weighted base metal (e.g., 3 oz silver) and SHALL NOT fabricate a gold melt floor.
   - In `quickRead`, when representing an item with a single baseline metal, choose the lower-value metal floor rather than the higher-value metal, ensuring that any single-metal consumer under-estimates rather than over-estimates.
   - Reject solid bullion melt when plated, clad, gilt, or layered markers are detected.

## Capabilities

### Modified Capabilities

- `appraisal`: Strict adjacent bullion weight pairing in `quickRead`; multi-metal parsing; conservative under-estimation for compound pieces; prevention of false gold melt attribution on silver weights.
- `bin-product-appraisal`: Exact compound melt calculation in `shopMelt` across multiple precious metal components; prevention of false under-melt steal alerts on composite gold/silver items.

## Out of Scope

- Modifying PCGS cert verification or eBay sold comps lookups.
- Automated bidding or buying on Whatnot.
- Altering external spot price API endpoints.

## Impact

- `src/shared/appraisal.ts`, `src/shared/shop.ts`, `src/background/appraisal.ts`, and corresponding test suites.
- Prevents dangerous multi-thousand-dollar melt over-estimations on mixed-metal jewelry, bars, and rounds.
- Bumps package version to `0.25.3`.

## Branch & Landing

- **Branch:** `feature/multi-metal-bullion-melt-and-under-estimate-guard`
- Lands via pull request into `main`, then merges with `gh pr merge --admin`.
