# Proposal: Local AI Routing for Background Tasks and Wheel Floor Manifests

## Why

Live show auctions—especially mystery envelope wheels, box breaks, and large catalog shows—frequently present large sets of items (often 200 to 300 spots) where only a handful of chase prizes are visible on camera. In a recent live show (`a5892022-efa0-4223-b7fa-ccd6afaace28`), 237 prizes remained unvalued ($0) despite video AI successfully reading top prizes from the host's board.

This breakdown stems from four key architectural bottlenecks:

1. **Unstructured Manifest & Floor Guarantees Collapsing to $0**: Sellers on large envelope wheels rarely display all 250 items legibly on camera; instead, they state the floor or prize distribution in stream notes, pinned messages, or break descriptions (e.g., *"10 chase slabs, 40 Silver Eagles, remaining spots are 1 oz silver rounds or 90% halves (floor is $15)"*). Because current manifest parsing (`manifestFrom`) and floor extraction (`extractFloorsFromNotes`) rely exclusively on rigid regular expressions, slight phrasing variations fail to match. When no structured manifest matches, unassigned mystery envelopes evaluate to `value: null` ($0), completely breaking expected value and wheel odds calculations.
2. **Arbitrary 200-Prize Hard Cap**: In `src/background/index.ts:107`, the `WHEEL_VALUE` message handler truncates the prize array using `prizes.slice(0, 200)`. Any wheel with more than 200 spots permanently ignores prizes beyond index 200, guaranteeing that the tail remains unpriced.
3. **Local Ollama JSON Truncation**: In `src/background/appraisal.ts`, `ollamaJson` sets `options.num_predict = 384`. When returning JSON arrays for batches of 40 prizes, the response is cut off mid-flight, causing JSON parse errors and forcing fallbacks.
4. **Cloud Token Burn on Non-Instant Background Tasks**: Valuing hundreds of prizes, re-scanning shop inventories, and parsing verbose break notes can consume hundreds of thousands of cloud API tokens. Local AI (Ollama or Chrome on-device) should be the primary engine for all background, non-instant tasks, reserving cloud AI (e.g. Gemini) for immediate, sub-second live auction camera appraisals.

## What Changes

- **1. Prioritize Local AI for All Background / Non-Instant Tasks (`src/background/aiPricing.ts`, `src/background/appraisal.ts`)**:
  - Guarantee that all background tasks—wheel prize valuation (`valuePrizes`), envelope board reads (`readEnvelopes`), named prize reads (`readNamedPrizes`), shop item enrichment (`askLocalAi`), and table scans (`scanTable`)—prioritize the configured local Ollama instance first.
  - Maintain instant foreground camera appraisals (`APPRAISE`) on the cloud-first / on-device racing path for sub-second latency.
  - If local Ollama fails or is not configured, fall back gracefully to on-device models and saved cloud providers so valuation never stalls.
- **2. Local AI Manifest & Floor Extractor (`src/background/manifestAi.ts`, `src/shared/prizeValue.ts`, `src/shared/wheel.ts`)**:
  - Introduce an asynchronous background task (`EXTRACT_MANIFEST_AI`) that invokes local AI to parse unstructured show notes and break descriptions into structured manifests (items and quantities) and explicit floor rules.
  - When regex parsing fails, populate `manifestFrom` and `extractFloorsFromNotes` with the AI-extracted manifest.
- **3. Mystery Envelope Floor Distribution (`src/shared/envelopes.ts`)**:
  - Update `wheelRows` and `envelopeSummary`: when individual mystery envelopes cannot be matched to specific board items, assign the parsed manifest floor or pool average across all unassigned envelope rows.
  - Prevent mystery spots from evaluating to $0 when a legitimate floor guarantee is present.
- **4. Large Wheel Scaling and Batch Precision (`src/background/index.ts`, `src/background/prizeValues.ts`, `src/background/appraisal.ts`)**:
  - Remove the `prizes.slice(0, 200)` truncation in `src/background/index.ts` so entire prize lists are evaluated.
  - Deduplicate identical prize titles prior to AI valuation, mapping the evaluated price back across all copies.
  - Reduce the AI valuation chunk size from 40 to 15–20 items per request to fit comfortably within local model attention limits, and increase `ollamaJson`'s `num_predict` to 1024 to avoid truncated JSON responses.

## Capabilities

### Modified Capabilities

- `wheel-and-prizes`: Parses complex unstructured break descriptions and show notes using background local AI; distributes floor guarantees across unassigned mystery spots so large wheels do not report hundreds of $0 prizes; eliminates the 200-prize valuation ceiling.
- `appraisal`: Enforces local-first AI execution for all background tasks (wheel prizes, envelope reading, shop scanning, table scanning) with cloud fallback, while preserving cloud-first speed for instant live camera appraisals; increases Ollama background generation tokens to prevent JSON truncation.
- `live-show`: Expands session notes analysis to extract game rules and prize distributions via background local AI.

## Out of Scope

- Automated bidding, sniping, or giveaway participation (strictly prohibited by system safety invariants).
- Altering precious metal melt calculations (melt values remain arithmetic spot calculations).
- Bypassing external anti-bot challenges or web gates.

## Branch & Landing

- **Branch:** `feature/local-ai-background-and-wheel-floors`
- **Landing:** Work lands through a pull request into `main` and merges via `gh pr merge --admin`.

