# Tasks

## 1. Fractional Ounce Parsing & Melt Caps

- [x] 1.1 Update `OZ_AMOUNT`, `OZ_UNIT`, `oneOz`, `TENTH_OZ`, `QUARTER_OZ`, `HALF_OZ`, `QUICK_PATTERNS`, `BULLION_RE`, `capFineOz`, and `coinWords` in `src/shared/appraisal.ts`, and apply `capFineOz` in `withMelt` (`src/background/appraisal.ts`). Verify in `src/shared/appraisal.test.ts` that `"1/10th oz gold eagle ms70 2022"` reads as `0.1 oz` gold (`$413` melt at `$4,130/oz`) and that `capFineOz` caps a 1 oz model answer to `0.1 oz`.
- [x] 1.2 Update `WEIGHT_RE` and `clarifyPrizeName` in `src/shared/prizeValue.ts`, and `titleTokens` / `matchScore` in `src/shared/purchases.ts` and `src/shared/soldHistory.ts`. Verify in `src/shared/prizeValue.test.ts` and `src/shared/soldHistory.test.ts` that ordinal fractions price at their fractional weight and never comp against 1 oz sales.

## 2. Background Local Ollama Routing & Shop AI Pass

- [x] 2.1 Export `localOllamaJson` from `src/background/appraisal.ts` and update `askAi` / `askLocalAi` in `src/background/aiPricing.ts` so configured local Ollama runs first for background tasks when `ollamaOnly` is unchecked, falling back to on-device AI and cloud AI (`skipOllama = true`). Verify in `src/background/prizeValues.test.ts`.
- [x] 2.2 Include `semi` and `variety` notes in `scoreShop` (`src/shared/shop.ts`), add background `SHOP_AI` enrichment (`src/background/shopAi.ts`, `src/content/shop.ts`, `src/shared/messages.ts`, `src/background/index.ts`), and update Settings help text in `src/sidepanel/index.html` and `README.md`. Verify in `src/shared/shop.test.ts`.

## 3. Build & Delivery

- [x] 3.1 Bump version to `0.19.2` in `package.json`, run `npm run build` and `npm test`, and validate OpenSpec specs with `openspec validate --all`.
- [x] 3.2 When deploying/pushing, create branch `ollama-background-and-fractional-oz`, commit, push, open a detailed PR into `main`, and merge with `gh pr merge --admin`.

