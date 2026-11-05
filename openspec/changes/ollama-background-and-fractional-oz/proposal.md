# Proposal

## Why

Two issues surfaced during live show usage:

1. **Fractional ounce bullion written with ordinal suffixes or decimals was valued as a full 1 oz coin.** On show `47b277e9-9614-4fd0-98eb-85afe0a5f7ee`, the shop listed `"1/10th oz gold eagle ms70 2022"` at `$525`. Because the fraction regex in `src/shared/appraisal.ts` and `src/shared/prizeValue.ts` did not allow ordinal suffixes (`st`, `nd`, `rd`, `th`) between the fraction and `oz`, the `1/10th oz` pattern missed and the generic `gold eagle` 1 oz pattern matched instead, reporting `Under melt ($4,130)` instead of `0.1 oz` (`$413` melt). In addition, `capFineOz` only capped `fine_weight_oz` by stated gram weight, not by a stated fractional ounce weight, and `matchScore` in `src/shared/soldHistory.ts` did not reject comps with conflicting ounce weights.
2. **A configured local Ollama server sat idle unless "Use Ollama only" was checked or cloud providers failed.** When a user has both a fast cloud provider (like Gemini) and a local Ollama server configured with `ollamaOnly` unchecked, live auction appraisals need Gemini's speed, while background tasks (shop enrichment for key dates/item info, wheel prize valuation, envelope board reads, named-prize camera reads, and table/shelf scans) can run on the local Ollama server first without spending cloud quota.

## What Changes

- Support ordinal suffixes (`1/10th oz`, `1/4th oz`, `1/2nd oz`), decimal fractions (`.10 oz`, `0.25 oz`), and word fractions (`tenth oz`, `quarter oz`, `half oz`) across `src/shared/appraisal.ts`, `src/shared/prizeValue.ts`, `src/shared/purchases.ts`, and `src/shared/soldHistory.ts`.
- Guard all 1 oz bullion series patterns (`Gold Eagle`, `Gold Buffalo`, `Gold Maple`, `Gold Krugerrand`, `Silver Eagle`, `Silver Maple`, `Silver Libertad`) with `oneOz(...)` so fractional prefixes/suffixes cannot match the 1 oz pattern.
- Cap `fine_weight_oz` in `capFineOz` and `withMelt` when the title/name states a fractional ounce weight below `fine_weight_oz`.
- Reject Whatnot sold comps in `matchScore` when both titles have a parsed precious-metal ounce weight and the two weights differ by more than 5%.
- Route background AI tasks (`askAi` in `src/background/aiPricing.ts`, used by wheel `valuePrizes`, `readEnvelopes`, `readNamedPrizes`, and `scanTable`) to a configured local Ollama server first even when `ollamaOnly` is unchecked, falling back to on-device AI and then saved cloud providers (`skipOllama = true` so Ollama is not called twice). Keep foreground live appraisals (`APPRAISE`) on on-device + preferred cloud provider first with Ollama as the 5-second hedge backup.
- Include `semi` and `variety` callouts from `keyDateNote` in `scoreShop`, and add a background `SHOP_AI` pass (`src/background/shopAi.ts`) that uses local AI (`askLocalAi`: local Ollama first, then on-device AI, never cloud quota) to enrich unpriced `must` shop hits and specific shop candidates with an `AI est.` range and collector/key-date `info` note, promoting items priced at or below 60% of the local AI low estimate to `deal` hits.

## Capabilities

### Modified Capabilities

- `appraisal`: Fractional and ordinal ounce parsing and `capFineOz` in quick melt and model post-processing; background AI tasks try configured local Ollama first when `ollamaOnly` is unchecked while foreground live appraisals keep cloud-first speed.
- `live-show`: Shop scan handles ordinal/decimal fractional bullion weights accurately, includes semi-key and variety notes, and runs an asynchronous local-AI (`SHOP_AI`) pass for item info and deal discovery.
- `reference-prices`: Whatnot sold comps reject matches whose parsed precious-metal ounce weights conflict.
- `wheel-and-prizes`: Prize melt and prize title normalization recognize ordinal fractional ounce weights (`1/10th oz`, `1/4th oz`, `1/2nd oz`).

## Impact

- `src/shared/appraisal.ts`, `src/background/appraisal.ts`, `src/shared/prizeValue.ts`, `src/shared/purchases.ts`, `src/shared/soldHistory.ts`, `src/background/aiPricing.ts`, `src/shared/shop.ts`, `src/background/shopAi.ts`, `src/content/shop.ts`, `src/shared/messages.ts`, `src/background/index.ts`, `src/sidepanel/index.html`, and `README.md`.
- Time-to-answer for foreground live appraisals and the initial shop scan is unchanged (instant local regex/melt/key-date pass first, cloud AI for live frames). Background tasks shift to local Ollama when configured, saving cloud API calls and enriching shop items asynchronously. Accuracy improves by eliminating false 1 oz melt callouts on fractional gold/silver listings.
- Version bumped to `0.19.2` in `package.json`.
- Branch `ollama-background-and-fractional-oz`, opened as a pull request into `main`, then merged with `gh pr merge --admin`.

## Out of scope

- Bidding, buying from the shop, entering giveaways, or sending chat.
- Calling paid cloud providers for the background `SHOP_AI` shop scan pass.
- Changing foreground live appraisal order when `ollamaOnly` is checked.

