# Design

## Context

- **Fractional ounce parsing (`src/shared/appraisal.ts`, `src/shared/prizeValue.ts`).** `OZ_AMOUNT` matched `(\d+\/\d+|\d+(?:\.\d+)?)` followed immediately by `troy oz|oz t|ozt|oz|ounce`. Listings written `"1/10th oz gold eagle"` or `".10 oz gold"` failed `TENTH_OZ` and fell through to the unguarded `gold (?:american )?eagle` 1 oz entry in `QUICK_PATTERNS`. In addition, `withMelt` in `src/background/appraisal.ts` only called `capFineOz` when `known` was null, so if an AI model returned `series_key: "us_gold_eagle_1oz"` with `fine_weight_oz: 1` for a `"1/10th oz Gold Eagle"`, `withMelt` used `1.0 oz`.
- **Sold comp weight collisions (`src/shared/soldHistory.ts`, `src/shared/purchases.ts`).** `titleTokens` stripped `/` into spaces and kept `10th`, while `matchScore` did not compare parsed ounce weights from `quickRead`, allowing a 1 oz coin sale and a fractional coin sale of the same series and year to share tokens.
- **Local Ollama routing (`src/background/appraisal.ts`, `src/background/aiPricing.ts`).** Previously, `askAi` called on-device `LanguageModel` and then `geminiJson` (which only ran Ollama if no cloud keys existed or after a 5-second cloud hedge). Background callers (`valuePrizes`, `readEnvelopes`, `readNamedPrizes`, `scanTable`) all go through `askAi`.
- **Shop scan (`src/shared/shop.ts`, `src/content/shop.ts`, `src/background/shopAi.ts`).** `scoreShop` ran synchronously in the content script using melt, watched sales, watchlist, and `keyDateNote` (`tier === 'key'` only). Unpriced key/semi-key items or collectible shop rows had no background local AI valuation or collector blurb.

## Goals / Non-Goals

**Goals:**

- Parse ordinal fractions (`1/10th`, `1/4th`, `1/2nd`), decimal fractions (`.10`, `0.25`), and word fractions (`tenth`, `quarter`, `half`) consistently across quick melt, `capFineOz`, `withMelt`, prize valuation, and sold-comp matching.
- Use a configured local Ollama server first for background AI tasks even when `ollamaOnly` is unchecked, while keeping Gemini/cloud first for foreground live auction appraisals.
- Enrich shop scan results asynchronously via local AI (`SHOP_AI`) with collector notes and conservative value ranges without delaying the initial shop scan or using cloud API quota.

**Non-Goals:**

- Calling cloud AI providers during the background shop scan.
- Modifying bid placement or giveaway behavior.

## Decisions

### Fractional and ordinal ounce protection in `src/shared/appraisal.ts` and `src/background/appraisal.ts`

1. Extend `OZ_AMOUNT` to `(\d+\/\d+(?:st|nd|rd|th)?|\d*\.\d+|\d+)` and `OZ_UNIT` to `(?:(?:troy\s*)?oz\.?\s*t?\.?|ounces?)`, and allow `.` or digits before `oz` in the `quickRead` pre-filter (`(?:\b|\d)ozt?\b`).
2. Wrap every 1 oz bullion entry in `QUICK_PATTERNS` (`us_gold_eagle_1oz`, `us_gold_buffalo`, `canada_gold_maple_1oz`, `sa_krugerrand_1oz`, `us_ase`, `canada_maple`, `mexico_libertad`) with `oneOz(...)`, which rejects fractional prefixes (`1/10th`, `0.1`, `tenth`, `quarter`, `half`) and fractional/gram suffixes.
3. Extend `capFineOz` with `statedFractOz` so any stated fractional weight (`< 1 oz`) caps `fine_weight_oz`, and apply `capFineOz` inside `withMelt` even when `known` is matched.

### Comp weight guard in `src/shared/soldHistory.ts` and `src/shared/purchases.ts`

- Normalize ordinal fractions (`1/10th` → `1/10`) in `titleTokens`.
- In `matchScore`, compute `quickRead([a]).read?.oz` and `quickRead([b]).read?.oz`; when both are positive and differ by more than 5%, return `0`.

### Background-first local Ollama in `src/background/aiPricing.ts`

- Export `localOllamaJson` from `src/background/appraisal.ts` and add `skipOllama` to `geminiJson`.
- In `askAi(prompt, schema, image)`:
  1. If `ollamaReady(settings)` is true (regardless of `ollamaOnly`), call `localOllamaJson` first.
  2. If `ollamaOnly` is true, stop there and return the result or `null`.
  3. Otherwise try `localJson` (Chrome on-device `LanguageModel`), then `geminiJson(prompt, schema, image, true)` (`skipOllama = true`).
- Export `askLocalAi(prompt, schema, image)` which tries `localOllamaJson` when configured and then `localJson` (when `ollamaOnly` is false), never calling cloud providers.

### Shop semi-key callouts and background `SHOP_AI` enrichment (`src/shared/shop.ts`, `src/background/shopAi.ts`, `src/content/shop.ts`)

- In `scoreShop`, accept `keyDateNote` matches for `key`, `semi`, and `variety` tiers.
- Add `selectShopAiItems`, `shopAiPrompt`, `parseShopAiAnswer`, and `applyShopAi` in `src/shared/shop.ts`, and `evaluateShopItems` in `src/background/shopAi.ts` wired to `SHOP_AI` in `src/background/index.ts`.
- After `checkShop` in `src/content/shop.ts` renders the immediate local scan, if candidate items exist, send `SHOP_AI` in the background and re-render the shop summary if still on the same live show.

