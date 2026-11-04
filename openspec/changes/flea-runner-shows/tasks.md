# Tasks

## 1. Branch

- [x] 1.1 Create branch `flea-runner-shows` from main and verify `git status` shows that branch. Leave tokens, .env files, and Chrome profiles out of every commit.

## 2. Runner module

- [x] 2.1 Add `src/shared/runner.ts` with the runner pass and the price ladder. The pass requires a published-note instruction to answer R for run and P for pass plus at least one vendor-price rung, and it does not take a seller name or change show type. The ladder reads explicit rungs, a doubled-above threshold, and one flat add for glass, multiple items, or bubble wrap. Verify a vitest that the Leesport wording (R for Run, P for Pass, $1→$6, $2→$7, $3→$8, $4→$9, $5 and up doubled, +$5 for large glass or multiple items) turns the pass on and returns that ladder, flea notes with no rung leave the pass off and invent no rung, and reading the same notes twice does not duplicate the ladder.

- [x] 2.2 Add the run quote in the same module. A host or mod line with exactly one dollar amount sets the vendor price, unless that amount is the known shipping quote or the line is about shipping, a tip, or a coupon. Two amounts do not set it. A viewer line does not set it. Wrap is added only when that same line mentions glass, multiple items, a bundle, or bubble wrap. The shown sum is start + wrap + shipping when shipping is known, with no tax. A newer vendor price replaces the quote. Verify a vitest that "vendor wants $8" with a double-from-$5 ladder and $7.75 shipping shows start $16 and sum $23.75 with no wrap, "vendor price is $2" shows start $7, "large glass at $3" shows start $8 plus $5 wrap, a viewer "$50" leaves the quote unchanged, "shipping is $7.75" leaves it unchanged, and "$8 or $10" leaves it unchanged.

- [x] 2.3 Add the shipping callout, the giveaway-stem walker, and the named "as seen" title in the same module. The callout uses the run start while no lot is active and the current bid once a lot is active, and it fires when known unpaid shipping is at least half that price. A non-giveaway purchase with a positive price on this live id clears it. A giveaway win clears it only when the shop listing description says the seller pays shipping and the sale title stem matches. `isTemplate` is not changed. Verify a vitest that $7.75 against a $7 start calls out and against a $40 bid does not, a positive non-giveaway purchase clears it, a giveaway purchase alone does not, a "Follower Giveaway" listing whose description says the seller pays shipping matches a "Follower Giveaway #4" win, a giveaway description that does not mention shipping does not match, "Cannons As seen" on a runner show names Cannons and is not an estate template, "Junk bag #3" on a runner show stays a template, and "Sewing Patterns Vintage As Shown" with the pass off stays a template.

- [x] 2.4 Add the prompt supplement in the same module. It returns the ladder lines and the buying-rules lines (no cancellation, no refund, no return, as-is, untested, not cleaned) when they sit past the 700-character cap, without repeating lines already inside the cap and without a coupon code. Verify a vitest that a note longer than 700 characters whose ladder and no-return lines start after the cap includes those lines and omits `/coupon SAVE10`, and that the supplement is empty when the runner pass is off.

## 3. Live session

- [x] 3.1 Store the vendor line on the live session, clear it when the lot changes, and set the giveaway-shipping flag when the buyer is the signed-in user and the sale matches a stem from the shop body. Clear the quote, the flag, and the stems when the live path changes. Verify a vitest in `src/shared/live.test.ts` that a host "$8" is stored, a later host "$2" replaces it, a viewer "$50" does not, a new auction clears it, and a matching giveaway win sets the flag while an unmatched giveaway win does not.

## 4. Appraisal context

- [x] 4.1 When the runner pass is on, `appraisalContext` and `tablePrompt` append the supplement from 2.4 and still omit coupon codes. `noteForPrompt` stays capped at 700 for a show that is not a runner. Do not add a model call. When `runnerItemName` returns a name, the estate pass stays off for that lot and the item name sent to the model is that name. Verify a vitest that a runner note past the cap includes the double-from-$5 line and the no-return line in both prompts, a non-runner note does not add the later lines, and "Cannons As seen" is sent as Cannons rather than as a template title.

## 5. Idle stall scan

- [x] 5.1 Add a pure gate for one idle scan per gap: runner pass on, table scan on, no active auction, document visible, and not the share worker. A new active auction advances the gap. A result is current only when its gap id matches. Verify a vitest that a waiting runner show requests one scan, a second check in the same gap does not, scan off does not, a hidden document does not, the share worker does not, and a result from the previous gap is dropped.

- [x] 5.2 From `src/content/appraise.ts`, when that gate says scan, capture one frame with the existing `captureFrame` and send the existing `TABLE_SCAN`. Appraise a new auction without waiting on that scan. Render a current result as the stall list and do not apply a stale one onto the new lot's appraisal. The scan does not change the max bid. `src/content/shop.ts` feeds the shop body to the giveaway-stem walker without scoring those giveaways. Verify the gate vitest from 5.1 still passes and a shop-body vitest shows a shipping giveaway stem is recorded while `parseShopListings` still drops giveaways.

## 6. Surfaces

- [x] 6.1 Show the ladder once, the run quote, and the shipping callout on the Live panel and the on-page assistant. The quote uses the notes and the chat line and does not wait on a model. Do not put R or P in the chat box. Verify an overlay vitest that the four rungs, the double from $5, the $5 glass add, a vendor price of $8, a start of $16, shipping of $7.75, and the sum $23.75 render, and that the rendered runner view contains neither a sent chat line nor the letters R and P as an action.

## 7. Delivery

- [x] 7.1 Bump `package.json` from 0.15.5 to 0.16.0 once, run `npm test` and `npm run build`, and verify `dist/manifest.json` and `dist-userscript/whatnot-auto-share.user.js` show 0.16.0.

- [x] 7.2 Commit, push, and open a detailed pull request from `flea-runner-shows` into main, then merge it with `gh pr merge --admin`. The commits contain no tokens, .env files, or Chrome profiles.

## Workflow follow-up

- Archive this change only after the pull request into main is merged.
