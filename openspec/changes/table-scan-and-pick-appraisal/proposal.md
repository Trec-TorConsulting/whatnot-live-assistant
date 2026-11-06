# Proposal: Table Scan & Pick-of-Show Appraisal

## Why

In many Whatnot collectible streams (coins, bullion, sports cards, estate sales), sellers run "Buyer's Choice" auctions where the winner has seconds to pick any item from a tray, table, or shelf. Streamers also display high-end items in the background to hype mystery games, sometimes featuring deceptive replicas or souvenir cards (such as BEP souvenir cards mistaken for multi-thousand-dollar banknotes). Currently, the assistant only appraises the single active lot held close to the camera (`FOCUS_INSTRUCTION`), ignoring the rest of the display. A dedicated "Table Scan" mode lets buyers instantly spot the most valuable items on the table, detect replica traps, and know exactly what to pick or request before the timer runs out.

## What Changes

- **Table Scan Trigger & Action**: Adds a "Scan Table" action (and shortcut `Alt+Shift+T`) in the in-stream overlay and sidepanel to analyze the full visible camera frame rather than focusing exclusively on the active lot in hand.
- **Top Items Ranking & Spatial Identification**: Prompts the vision model (Gemini / Ollama) to identify and rank the top 1–3 most valuable items visible in the scene, returning item descriptions, estimated values, and approximate spatial locations (e.g. "Bottom right", "Middle shelf", "Left tray").
- **Trap & Replica Warning Detection**: Specifically checks high-profile displayed items for official replicas, souvenir cards (e.g. BEP souvenir cards), fantasy issues (e.g. Zombucks), clad commemoratives, and plated novelty bars, labeling them with a clear warning so buyers do not mistake them for genuine high-value pieces.
- **Overlay & Sidepanel Presentation**: Displays a compact "Table Top Picks" card showing the ranked items, estimated values, location indicators, and any replica warnings without obstructing the live stream.
- **Quick Request / Pick Helper**: Allows copying the recommended pick or item description to the clipboard or quick chat box (e.g. "Can you run the poured silver skull on the bottom right?").

## Capabilities

### New Capabilities
- `table-scan`: Full-frame multi-item appraisal for livestream video frames, identifying and ranking top valuable items with spatial location cues and replica/trap warnings.

### Modified Capabilities
- `appraisal`: Distinguishes between single-item lot focus mode and full-frame table scan mode, preserving the primary focus instruction for standard lot auctions while enabling wide-angle multi-item valuation on demand.
- `live-show`: Adds table scan action controls, keyboard shortcut support (`Alt+Shift+T`), and visual overlay rendering for table scan results alongside the existing auction card.

## Impact

- Modifies `src/shared/appraisal.ts`, `src/background/appraisal.ts`, `src/content/appraise.ts`, `src/content/overlay.ts`, `src/sidepanel/sections/live.ts`, and `src/sidepanel/index.html`.
- Branch `table-scan-and-pick-appraisal`, landing via pull request into `main`, merged with `gh pr merge --admin`.
- Version bump: minor version bump (0.22.0) as this introduces a major user-facing feature.

## Out of Scope

- Automated video frame tracking or continuous bounding-box video motion tracking (scans are on-demand single-frame snapshots to preserve rate limits and performance).
- Automated bidding or auto-selection of Whatnot choice lots (the assistant never bids or chooses items automatically).
- Precise millimeter pixel coordinate overlays on dynamically panned cameras (spatial locations use relative region descriptors like "Bottom right" or "Middle rack").

