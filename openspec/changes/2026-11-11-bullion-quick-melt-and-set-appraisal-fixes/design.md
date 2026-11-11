# Design: Bullion Quick Melt and Multi-Coin Set Appraisal Hardening

## Modules Touched

- `src/shared/appraisal.ts`: Quick read series definitions, regex matchers (`oneOz`, `QUICK_PATTERNS`, `QTY_RE`), bullion priority resolution, and Krugerrand silver support.
- `src/shared/shop.ts`: Shop listing melt calculation (`shopMelt`) and set/lot melt guards.
- `src/shared/prizeValue.ts`: Prize melt parsing guards for unweighted sets and alternative currencies.
- `src/shared/appraisal.test.ts`: Unit test suite verifying NORFED silver dollar handling, unweighted set rejection, silver Krugerrand identification, and priority resolution.
- `src/shared/shop.test.ts`: Unit test suite verifying shop melt calculations reject false steals on unweighted sets and NORFED silver listings.

## Technical Architecture & Decisions

### 1. Hardening `oneOz` and Set Detection

The `oneOz` helper in `src/shared/appraisal.ts` was designed to assume that if a bullion coin name (e.g. `krugerrand`, `gold eagle`, `silver eagle`) appears without explicit fractional or multi-ounce text, it represents a single 1 oz coin.

However, listings frequently include commemorative multi-coin sets, collector albums, and presentation boxes (e.g. `2007 Gold Krugerrand Investment Coin Set 3 Coins Limited Edition of 5000 Display Case & Booklet`). In these listings:
- The coins may be fractional (e.g., 1/10 oz, 1/4 oz, 1/2 oz), miniature gold, or proof strikes.
- Multiplying the single 1 oz bullion weight by the matched quantity (`3 Coins`) produces massive over-valuations.

**Decision**:
- Introduce `SET_OR_LOT_RE = /\b(?:sets?|coin\s*sets?|collection|lot|album|holder|display\s*case|booklet|pack|box)\b/i`.
- In `oneOz`, exclude titles matching `SET_OR_LOT_RE` unless the listing contains an explicit bullion weight expression (e.g. `3 oz silver`, `1 oz gold`).
- In `quickRead`, when a title matches `SET_OR_LOT_RE` without an explicit bullion weight specification (`BULLION_RE` / `STATED_OZ_RE`), `read` returns `null`. This prevents inventing 1 oz weights per coin across a set and allows reference lookup or AI estimation to price the set holistically.

### 2. Discrimination for `$20 Gold Double Eagle` and NORFED Liberty Dollars

In `QUICK_PATTERNS`:
```ts
// Existing:
[/\bdouble\s*eagle\b|\$20\s*(liberty|saint|gold)/i, 'us_gold_20_double_eagle', '$20 Gold Double Eagle']
```
This pattern incorrectly matched `2009 NORFED $20 Liberty Dollar – 1 oz .999 Silver` because `$20 Liberty` was present.

**Decision**:
- US $20 gold coins are double eagles, often described as "$20 Liberty Head", "$20 Saint-Gaudens", or "$20 Gold". They are never called "$20 Liberty Dollar".
- The word `dollar` following `$20 Liberty` indicates the NORFED Liberty Dollar, an alternative currency struck in silver.
- Furthermore, no gold series pattern should ever match if the listing explicitly designates `silver`, `copper`, `cobre`, `brass`, `bronze`, `clad`, `plated`, or `norfed`.
- Refactor the pattern:
```ts
[
  /^(?!.*\b(?:silver|copper|cobre|bronze|brass|clad|plated|norfed)\b)(?:.*\bdouble\s*eagle\b|.*\$20\s*(?:liberty\s*(?:head)?|saint(?:-gaudens)?|gold)\b(?!\s*dollar))/i,
  'us_gold_20_double_eagle',
  '$20 Gold Double Eagle',
]
```

### 3. Explicit Bullion Metal & Weight Precedence

In `quickRead`:
- Previously, `QUICK_PATTERNS` was checked before `BULLION_RE`.
- If an item stated `1 oz .999 Silver`, but also contained text that tripped a gold series pattern (like `$20 Liberty`), the gold series won, attributing 0.9675 oz of gold instead of 1 oz of silver.

**Decision**:
- When `BULLION_RE` matches an explicit metal and weight (e.g. `1 oz silver`), and a series pattern matches a *conflicting* metal (e.g. `gold`), the explicit bullion match MUST take precedence or disqualify the conflicting series match.
- For `2009 NORFED $20 Liberty Dollar – 1 oz .999 Silver`, the series match will reject due to the negative lookahead and dollar guard, allowing `BULLION_RE` to cleanly match `1 oz silver`.

### 4. Krugerrand Silver Recognition

In `SERIES`:
- Add `krugerrand_silver_1oz: { metal: 'silver', oz: 1 }`.
In `QUICK_PATTERNS`:
- Add Silver Krugerrand:
```ts
[oneOz(/\bsilver\b.*\bkrugerrand|\bkrugerrand\b.*\bsilver\b/), 'krugerrand_silver_1oz', '1 oz Silver Krugerrand'],
```
- Guard Gold Krugerrand:
```ts
[oneOz(/^(?!.*\b(?:silver|copper|cobre|bronze|brass|clad|plated)\b).*\bkrugerrand\b/), 'krugerrand_1oz', '1 oz Krugerrand'],
```

### 5. Shop Melt Hardening (`src/shared/shop.ts`)

In `shopMelt`:
- Add a guard against unweighted sets: if `SET_OR_LOT_RE.test(fullText)` and no explicit total bullion weight exists, `shopMelt` returns `null`.
- This guarantees that Buy-It-Now shop inventory will never flag an unweighted 3-coin presentation set as a $12,000+ "Steal".

