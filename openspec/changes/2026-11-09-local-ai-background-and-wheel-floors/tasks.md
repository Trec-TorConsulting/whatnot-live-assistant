# Tasks: Local AI Routing for Background Tasks and Wheel Floor Manifests

- [x] 1. Large Wheel Scaling and Batch Precision
  - [x] 1.1 Remove the 200-item cap (`prizes.slice(0, 200)`) in `src/background/index.ts` to allow arbitrarily large wheel breaks.
  - [x] 1.2 Reduce `AI_BATCH` from 40 to 20 in `src/background/prizeValues.ts` to maintain high accuracy and prevent local context degradation.
  - [x] 1.3 Increase `options.num_predict` from 384 to 1024 in `src/background/appraisal.ts` `ollamaJson` to prevent JSON truncation on multi-item arrays.
  - [x] 1.4 Add unit tests verifying large wheel prize arrays (250+ items) process completely and write progressive updates.

- [x] 2. Background Local-First AI Routing Hardening
  - [x] 2.1 Audit and enforce that `askAi` in `src/background/aiPricing.ts` routes all non-instant background tasks (`valuePrizes`, `readEnvelopes`, `readNamedPrizes`, `scanTable`) through local Ollama first, falling back to on-device and cloud Gemini only on failure.
  - [x] 2.2 Verify `askLocalAi` in `src/background/shopAi.ts` runs strictly on local AI (Ollama or Chrome on-device) and never burns cloud quota.
  - [x] 2.3 Add unit tests verifying background AI routing waterfall and error recovery.

- [x] 3. Freeform Manifest and Floor AI Extraction
  - [x] 3.1 Define `MANIFEST_INSTRUCTIONS`, `MANIFEST_SCHEMA`, and `MANIFEST_SCHEMA_GEMINI` in `src/shared/prizeValue.ts` for structured item and floor extraction.
  - [x] 3.2 Implement `extractManifestAi` in `src/background/manifestAi.ts` utilizing `askAi`.
  - [x] 3.3 Register `EXTRACT_MANIFEST_AI` in `src/shared/messages.ts` and dispatch from `src/content/live.ts` when a wheel loads with unstructured seller notes.
  - [x] 3.4 Cache extracted manifests in session storage and integrate them into `manifestFrom` and `numberedShare`.
  - [x] 3.5 Add unit tests for diverse seller phrasing patterns (e.g. "10 slabs, 30 eagles, rest are 1oz silver floor").

- [x] 4. Mystery Envelope Floor Fallback in Wheel Odds
  - [x] 4.1 Update `wheelRows` in `src/shared/envelopes.ts` to assign the detected/extracted floor value to unassigned mystery envelope rows when `summary.average` is null but a verified floor exists.
  - [x] 4.2 Update `wheelView` in `src/content/wheel.ts` to distinguish between completely unknown spots ($0) and floor-backed mystery spots.
  - [x] 4.3 Add unit tests verifying wheels with partial board reads (e.g. 5 top chases read from video, 237 unread envelopes) report accurate floor-backed expected values.

- [x] 5. Quality Assurance and Verification
  - [x] 5.1 Run full unit test suite (`npm test`).
  - [x] 5.2 Build extension bundle (`npm run build`).
  - [x] 5.3 Verify all linting and type-checking pass without warnings.
