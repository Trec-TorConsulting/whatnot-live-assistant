# Tasks

## 1. Schema, Prompt & Types

- [x] 1.1 Define `TableScanResult`, `TableScanPick`, and `TableScanTrapWarning` interfaces in `src/shared/appraisal.ts`, verified by unit tests in `src/shared/appraisal.test.ts`.
- [x] 1.2 Implement `TABLE_SCAN_INSTRUCTIONS` with full-scene guidance, top-item ranking rules, spatial quadrant descriptors, and replica/souvenir trap detection directives in `src/shared/appraisal.ts`, verified by prompt structure tests in `src/shared/appraisal.test.ts`.
- [x] 1.3 Add parsing and validation logic for table scan model responses in `src/shared/appraisal.ts`, verified by fixture tests covering multi-item tables, empty tables, and souvenir traps in `src/shared/appraisal.test.ts`.

## 2. Background Model Routing & Handlers

- [x] 2.1 Implement `tableScanAppraise()` in `src/background/appraisal.ts` routing image frames to Gemini (and Ollama when configured) with table scan schema constraints, verified by mock model response tests in `src/background/appraisal.test.ts`.
- [x] 2.2 Register `TABLE_SCAN` message handler in `src/background/index.ts`, verified by background messaging unit tests in `src/background/index.test.ts`.

## 3. In-Stream Overlay & Frame Capture

- [x] 3.1 Implement video frame capture specifically for table scan mode in `src/content/appraise.ts`, verified by canvas capture unit tests in `src/content/appraise.test.ts`.
- [x] 3.2 Add "Scan Table" button and keyboard shortcut handler (`Alt+Shift+T`) to in-stream overlay in `src/content/overlay.ts`, verified by DOM event tests in `src/content/overlay.test.ts`.
- [x] 3.3 Implement `TableScanCard` UI component in `src/content/overlay.ts` displaying ranked picks, spatial position badges, estimated value ranges, and replica warning alerts, verified by component rendering tests in `src/content/overlay.test.ts`.

## 4. Sidepanel Integration & Quick Actions

- [x] 4.1 Add "Scan Table" button and table scan results section to the Live tab in `src/sidepanel/sections/live.ts` and `src/sidepanel/index.html`, verified by sidepanel DOM tests in `src/sidepanel/sections/live.test.ts`.
- [x] 4.2 Add "Copy request to chat" quick action helper on table picks in `src/content/overlay.ts` and `src/sidepanel/sections/live.ts`, verified by clipboard/chat interaction tests in `src/sidepanel/sections/live.test.ts`.

## 5. Verification & Ship Chain

- [x] 5.1 Run full test suite (`npm test`) and production build (`npm run build`) to ensure type check and zero regressions across all modules.
- [x] 5.2 Validate OpenSpec specification completeness with `openspec validate table-scan-and-pick-appraisal`.
- [x] 5.3 Execute ship chain: create feature branch `table-scan-and-pick-appraisal`, commit changes without tokens or secrets, push with authorized credentials, open pull request into `main`, merge with `gh pr merge --admin`, and bump version to `0.23.0`.

## Workflow follow-up

- Archive `table-scan-and-pick-appraisal` with `openspec archive table-scan-and-pick-appraisal` once all implementation tasks are merged to main.
- Verify canonical specifications reflect the new `table-scan` capability and updated `appraisal` and `live-show` specs.

