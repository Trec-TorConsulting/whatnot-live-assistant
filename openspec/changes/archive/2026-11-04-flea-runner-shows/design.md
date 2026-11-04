# Design

## Context

See proposal.md for why. A runner show is already flea when the title, tags, or notes say flea, so the table scan defaults on and `noteForPrompt` already feeds the first 700 characters of the published note into `appraisalContext` and `tablePrompt`. Chat on the live session already carries `isHost` and `isModerator`. Shipping text is already parsed by `parseShipping`, and a paid win is already a purchase on that live id. `isTemplate` treats a title ending in "as seen" or "as shown", with no brand and no four-digit year, as an estate template. The product title on the watched show was the item ("Cannons") and the description was "As seen"; the card joins those into "Cannons As seen".

`scanTable` already prices a frame through `askAi` with the existing deadline. It runs only after an appraisal, from `addTableScan` in `src/content/appraise.ts`.

## Goals / Non-Goals

**Goals:**

- One pure module owns detection, the ladder, the quote, the shipping callout, and the named "as seen" title.
- The quote renders from the notes and the chat line. No model call on that path.
- The idle scan reuses `scanTable` and cannot hold up or replace the next lot's appraisal.

**Non-Goals:**

- A new `ShowType` or a change to `detectShowType`.
- Changing `isTemplate` for a show whose runner pass is off.
- Reading a price out of the camera frame.

## Decisions

### Runner pass from the notes, not the seller

`src/shared/runner.ts` exports the pass, the ladder, the quote, and the callout. The pass is on only when the published note text has both an R-for-run / P-for-pass instruction and at least one parsed rung. `readShowNote` already drops unpublished notes, so an unpublished ladder never reaches the pass. The seller username is not an input.

Alternative: a seller allow-list. Rejected because the same notes showed up as a pattern, and a second runner was live at a different market.

### Ladder and quote are pure

A rung line pairs a vendor dollar amount with a run dollar amount ("vendor price $1 will run for $6"). A double line sets the threshold at which the start is twice the vendor price ("anything $5 and up will be doubled"). One flat add is kept when a line names glass, multiple items, or bubble wrap and states an extra dollar amount. Amounts are a `$` figure or a number plus "dollars". Spelled-out numbers are ignored.

The quote stores the vendor amount and the chat line, not the computed start. The view multiplies through the current ladder, so a note edit updates the start without a second chat line. Wrap is added only when that stored line matches glass, multiple, bundle, or bubble wrap. The shown sum is start + wrap + shipping when shipping is known. Tax stays on the bid guard.

A host or mod line sets the vendor amount when it contains exactly one such amount and that amount is not the known shipping quote, and the line is not about shipping, a tip, or a coupon. Two amounts leave the quote unchanged. Viewer lines are ignored because `noteChat` already knows `isHost` and `isModerator`.

The quote is cleared when `isNewLot` says the auction changed. Nothing writes R or P into the chat box. `pasteToChat` is not called.

Alternative: ask the model to read the vendor price. Rejected because the ladder is arithmetic and the auction can open within seconds of the host's line.

### Shipping paid is narrower than the estate check

The estate card treats any purchase on this live id as shipping paid, and a giveaway win is recorded as a purchase. The runner callout does not. It clears when this live id has a purchase whose kind is not a giveaway and whose price is greater than zero, or when the user wins a giveaway whose listing description says the seller pays shipping.

`src/content/shop.ts` already receives the shop body. A pure walker in `runner.ts` collects title stems of giveaway listings whose description matches that wording, without scoring them and without changing `parseShopListings`. A later giveaway sale whose buyer is the profile username and whose title stem matches is remembered on the session. The extension does not enter the giveaway.

The half-price comparison uses the run start while no lot is active, and the current bid once a lot is active. The threshold is the same one `shippingCallout` already uses: shipping at least half the price.

### Named "as seen" does not edit `isTemplate`

`runnerItemName` returns the words before a trailing "as seen" or "as shown" when the runner pass is on and those words are not themselves a template. Estate rendering and appraisal use that name, and the estate pass stays off for that lot. `isTemplate("Sewing Patterns Vintage As Shown")` stays true when the pass is off, so the estate tests stay as they are.

The lot title stored from the socket stays the product title. Description text is not concatenated onto it. The joined card string is handled only when that string is what the session stored.

### Notes past the cap

`noteForPrompt` stays capped at 700 characters for every show. On a runner show, `appraisalContext` and `tablePrompt` append a short supplement: the parsed ladder lines and the buying-rules lines (no cancellation, no refund, no return, as-is, untested, not cleaned). Lines already inside the cap are not repeated. Coupon codes stay stripped. The pet-hair paragraph is not appended. This adds no model round-trip. The request that was already going to run is the one that gets the extra lines, so time-to-answer is unchanged and the model stops losing the double-from-$5 rule and the no-return lines.

### One idle scan per gap

When the runner pass is on, scan is on, the document is visible, the tab is not the share worker, and the session has no active auction, `src/content/appraise.ts` captures one frame with the existing `captureFrame` and sends the existing `TABLE_SCAN`. The main item is the piece closest to the camera, which `tableSubject` already says when the name is empty. The result renders on the overlay as the stall, the same list a post-appraisal scan uses.

A gap id increments when an auction becomes active. The idle request carries the gap id it started in. A result from an older gap is dropped, which is what keeps a late scan from replacing the new lot's appraisal. The next lot still goes through `appraiseAndGuard` immediately. A second idle request is not sent until the gap id changes and the show is waiting again. The scan uses `askAi`'s existing deadline. It does not move the max bid.

Alternative: scan on a timer while the host walks. Rejected because each pass is a full model call and the spec allows one scan per gap.

### Where it shows

`src/content/overlay.ts` gains a runner view beside the estate view. `src/sidepanel/sections/live.ts` renders the same ladder, quote, and shipping line. `src/content/live.ts` applies the chat line and the giveaway-win flag on the session. Refresh follows `onLive`, the same way `src/content/estate.ts` does.

## Risks / Trade-offs

- [A host line about a tip or a coupon contains a dollar amount] → Lines about shipping, tips, or coupons are ignored, and a line with two amounts does not set the quote. A bare amount that is not the shipping quote can still be wrong. The next host price replaces it, and a new auction clears it.
- [The giveaway description is only on the shop listing, not the sale event] → Stems are taken from the shop body. A win that arrives before the shop body was read does not clear the callout until that body is seen and the title matches. The callout stays up rather than clearing on the wrong giveaway.
- [The idle scan spends a model call during a long wait] → One call per gap, skipped when the document is hidden, scan is off, or the tab is the share worker. A failed scan does not retry until the next gap.
- ["Cannons As seen" on a non-runner show stays an estate template] → That is the existing rule. Only the runner pass renames it.

## Migration Plan

No stored data moves. The quote and the giveaway flag live on the in-memory session and clear when the live path changes. Rollback is reverting the pull request. Version becomes 0.16.0 once, in `package.json`, and the build writes the manifest and the userscript.

## Modules

- `src/shared/runner.ts` — pass, ladder, quote, shipping callout, named title, giveaway stems, prompt supplement. New, with `src/shared/runner.test.ts`.
- `src/shared/live.ts` — store the vendor line, clear it on a new lot, remember a matching giveaway win.
- `src/shared/showNotes.ts` — the 700-character cap stays. The runner supplement is applied by the callers, not by raising the cap.
- `src/shared/appraisal.ts` and `src/shared/tableScan.ts` — append the supplement when the pass is on.
- `src/shared/estate.ts` — unchanged predicate. Callers skip the estate pass when `runnerItemName` returns a name.
- `src/content/appraise.ts` — one idle `TABLE_SCAN` per gap. Drop a stale result.
- `src/content/shop.ts` — pass the shop body to the giveaway-stem walker.
- `src/content/live.ts`, `src/content/overlay.ts`, `src/sidepanel/sections/live.ts` — session updates and the two surfaces.
