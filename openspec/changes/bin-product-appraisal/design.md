# Design: BIN Product Appraisal (Value vs. Asking Price)

## Context

The extension parses live show shop listings (`src/shared/shop.ts`) and flags deals using passive heuristic rules (e.g., watchlist strings, fixed key dates, or title melt calculations). However, many items in a seller's Buy-It-Now catalog do not trigger these static rules, leaving buyers without valuation insight unless an item is actively held up to the camera during an auction. See `proposal.md` for motivation.

## Goals / Non-Goals

**Goals:**
- Provide an on-demand "Appraise" button for every Buy-It-Now product displayed in the assistant's shop views.
- Extract structured attributes from listing titles and subtitles to query active pricing sources (Melt, NumisMedia FMV, Greysheet BYOK, PCGS, eBay sold comps, and AI model estimation).
- Calculate and clearly display the net dollar spread and margin percentage between appraised market value and asking price.
- Cache valuations per listing ID in session memory to prevent duplicate requests.

**Non-Goals:**
- Automated checkout or automated purchase execution.
- Concurrent bulk-appraisal of all catalog listings in the background (evaluations are user-initiated per product).
- Replacing live auction video appraisal (video appraisal remains primary for active auctions; this feature serves shop inventory).

## Decisions

1. **Text-First Appraisal Pipeline (`src/background/appraisal.ts`)**:
   - Create a specialized `appraiseListingText(listing: ShopListing)` routine that does not require canvas frame capture.
   - Run `quickRead()` on `title + ' ' + (subtitle ?? '')` to extract denomination, date/mint, metal content, and grade hints.
   - Query precious metal spot prices for melt value.
   - For numismatic coins, check NumisMedia FMV guide, PCGS (if token saved and cert/grade parsed), and Greysheet (if BYOK configured).
   - If reference pricing is unavailable (e.g., comics, cards, electronics, vintage items), dispatch a text-only prompt to Gemini Nano, Gemini API, or Ollama for market valuation.
   - *Alternative considered*: Requiring the user to open Whatnot's shop modal so a thumbnail image can be captured. *Rejected*: Slow and brittle; text metadata in listing titles and subtitles is rich enough for standard numismatic, bullion, and collectible pricing.

2. **Spread & Margin Metrics (`src/shared/shop.ts`)**:
   - Model the evaluation as `ListingAppraisal`:
     ```ts
     export interface ListingAppraisal {
       listingId: string;
       marketValue: number;
       valueSource: 'melt' | 'pcgs' | 'greysheet' | 'fmv' | 'ebay' | 'ai';
       delta: number; // marketValue - askingPrice
       marginPercent: number; // (delta / askingPrice) * 100
       isDeal: boolean; // delta > 0 && marginPercent >= 15
       isOverpriced: boolean; // delta < 0 && Math.abs(marginPercent) >= 15
     }
     ```
   - Format concisely in UI: `Val: $85 vs Ask: $50 (+70% Deal)` or `Val: $20 vs Ask: $35 (-43% Overpriced)`.

3. **Inline UI Controls (`src/sidepanel/sections/live.ts`, `src/content/overlay.ts`)**:
   - Add an `Appraise` button alongside the existing `Find` and `Dismiss (×)` buttons on each shop row.
   - When clicked, render a spinner / loading state (`Valuing…`), then replace the button or append the valuation spread pill badge.
   - Cache results in `shop.appraisals: Record<string, ListingAppraisal>` in session state.

## Modules Touched

- `src/shared/shop.ts`: `ListingAppraisal` data model, margin calculator, and formatting utilities.
- `src/background/appraisal.ts`: `appraiseListingText()` routine combining text parsing, reference pricing, and model fallback.
- `src/background/index.ts`: Register `APPRAISE_SHOP_LISTING` message handler.
- `src/content/shop.ts`: Listing appraisal invocation and session cache management.
- `src/sidepanel/sections/live.ts`: "Appraise" button, loading state, and value vs. asking UI.
- `src/content/overlay.ts`: Overlay shop hit appraisal buttons and spread display.

## Risks / Trade-offs

- **[Incomplete listing titles]** → If a seller writes vague titles (e.g. "Silver coin"), the system falls back to an AI estimate or returns a conservative range labeled as an estimate rather than inventing a grade.
- **[Rate limiting on third-party APIs]** → Per-listing session caching prevents repeat lookups for the same item during a show.

