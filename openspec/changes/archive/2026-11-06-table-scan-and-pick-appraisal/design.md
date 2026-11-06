# Design: Table Scan & Pick-of-Show Appraisal

## Context

The extension currently optimizes appraisal for single-item auction lots via `FOCUS_INSTRUCTION` in `src/shared/appraisal.ts`, which explicitly ignores background displays, shelves, and trays. While this prevents false bids during single-lot auctions, it blocks buyers from evaluating "Buyer's Choice" tray auctions, identifying table grails, or spotting deceptive replica ceilings (see `proposal.md` - Why).

## Goals / Non-Goals

**Goals:**
- Provide a dedicated table scan workflow that evaluates the entire visible camera frame for multi-item inventory.
- Rank the top 1–3 most valuable items with estimated market values and spatial location cues.
- Actively detect and flag high-profile traps (e.g., BEP souvenir cards, fantasy tokens, plated novelty bars).
- Provide an overlay card and sidepanel view with quick action helpers (e.g. copy request to chat).

**Non-Goals:**
- Automated continuous video stream processing or real-time object tracking (scans are strictly on-demand per click or keyboard shortcut).
- Pixel-coordinate bounding box canvas overlays (spatial descriptions use normalized region tags like `bottom_right` and `middle_shelf`).
- Automatically choosing or bidding on lots in Whatnot's UI.

## Decisions

1. **Structured Schema for Table Scans (`src/shared/appraisal.ts`)**:
   - Define a dedicated `TableScanResult` schema containing `picks` (ranked array with `rank`, `name`, `estimated_value`, `location`, `reason`) and `traps` (array with `target_item`, `trap_type`, `explanation`, `collector_value`).
   - Use Gemini JSON schema enforcement (and structured prompts for Ollama) to guarantee parseable, consistent output.
   - *Alternative considered*: Reusing the existing `AppraisalResult` with the `others` array. *Rejected*: `AppraisalResult` is coupled to lot titles, single-item cert checks, and single max-bid ceilings, making it ill-suited for multi-item rankings and trap warnings.

2. **Spatial Location Representation (`src/shared/appraisal.ts`)**:
   - Instruct the vision model to return standard spatial locations: `top_left`, `top_center`, `top_right`, `middle_left`, `center`, `middle_right`, `bottom_left`, `bottom_center`, `bottom_right`, or descriptive descriptors (`bottom tray`, `middle shelf`).
   - Render these as clear human-readable pill badges in the UI.
   - *Alternative considered*: Exact normalized bounding box coordinates `[ymin, xmin, ymax, xmax]`. *Rejected*: Whatnot camera feeds frequently shift, pan, and zoom; exact bounding boxes often misalign on responsive video containers, whereas regional descriptions provide immediate clarity for users during fast-paced pick auctions.

3. **Replica & Trap Detection Rules (`src/shared/appraisal.ts`)**:
   - Add explicit system rules for common collectibles traps:
     - Bureau of Engraving and Printing (BEP) souvenir cards depicting classic currency designs (e.g. 1896 $5 Educational, 1899 $1 Black Eagle).
     - Gold/silver clad or layered bars ("100 Mills", "clad", "tribute").
     - Fantasy and gaming pieces (e.g. Zombucks, crypto novelty rounds).
     - Colorized or sticker-enhanced standard circulation coins marketed as rare bullion.

4. **Overlay UI & Shortcut (`src/content/overlay.ts`, `src/content/appraise.ts`)**:
   - Add a "Scan Table" button adjacent to "Appraise" in the overlay header and sidepanel.
   - Register keyboard shortcut `Alt+Shift+T` for rapid triggering.
   - Render results in a compact "Table Picks" card that collapses smoothly or can be dismissed with a single click.

## Modules Touched

- `src/shared/appraisal.ts`: Define `TABLE_SCAN_INSTRUCTIONS`, `TableScanResult`, and response validation.
- `src/background/appraisal.ts`: Implement `tableScanAppraise()` handling vision model requests with table scan schema.
- `src/background/index.ts`: Register `TABLE_SCAN` background message router.
- `src/content/appraise.ts`: Add frame capture and message dispatch for table scan mode.
- `src/content/overlay.ts`: Add "Scan Table" button, shortcut `Alt+Shift+T`, and table scan results card.
- `src/sidepanel/sections/live.ts`: Add table scan button and results list in the Live panel.
- `src/sidepanel/index.html`: Add table scan UI elements.

## Risks / Trade-offs

- **[Model Latency during fast pick auctions]** → Maintain prompt compactness and request only the top 3 items to keep latency within 2–3 seconds.
- **[Over-identifying background clutter as grails]** → Instruct model to only rank items clearly identifiable and ignore generic background household objects unless they are clear collectibles.
- **[Camera blur on handheld streams]** → When an image is too blurry to resolve grades or dates, return conservative value ranges labeled as estimates.

