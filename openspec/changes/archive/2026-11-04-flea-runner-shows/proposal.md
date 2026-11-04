# Proposal

## Why

Some flea shows are a person walking a market with a camera. The buyer calls out an item, the host reads the vendor's price, and chat answers R to run it or P to pass. The auction that follows often closes on one bid at a start price taken from a ladder in the show notes, and shipping can cost as much as the item. Watched on 4 Nov 2026, dammit_terry's Deal Hunting show at Leesport worked this way, and another live Deal Hunting show was a runner at a different market. The assistant already stores the notes and scans a flea table after an appraisal, but the decision is the vendor price, which arrives before any listing exists.

## What Changes

- Recognize a runner show from the published notes: an R-for-run / P-for-pass instruction together with a vendor-price ladder. Keep the show type. Do not key this off one seller.
- Show that ladder once, as a short card, on the Live panel and the on-page assistant.
- When the host or a mod states a vendor price, show the run start from the ladder, bubble wrap only when that same line calls for it, shipping, and the all-in. Do not type R or P, and do not send chat.
- On a runner show, call out when unpaid shipping is at least half the run start or the current bid. A paid win in the show clears it. A giveaway the user wins, whose description says the seller pays shipping, clears it too. Do not enter the giveaway.
- While the show is waiting for the next item, run one table scan of the camera so the stall can be called out before a listing exists. A new auction's appraisal does not wait on that scan.
- On a runner show, keep the ladder and the buying-rules lines in the appraisal and table-scan prompts when they sit past the ordinary note cap. A coupon code still stays out of the prompt.
- A runner lot whose title is a specific item plus a trailing "as seen" or "as shown" keeps that item name. The estate template pass stays off for that title. The same wording on a show that is not a runner is unchanged.

## Capabilities

### New Capabilities

- `runner-shows`: Runner detection, the price ladder, the host run quote, the shipping callout, the idle stall scan, and the named "as seen" lot on a runner show.

### Modified Capabilities

- `appraisal`: On a runner show, the notes included with an appraisal or a table scan keep the price ladder and the buying rules when those lines fall past the ordinary note cap. A coupon code stays omitted.

## Impact

- New `src/shared/runner.ts` for detection, the ladder, the run quote, and the shipping callout. The live session, the Live panel, the on-page assistant, and the note prompt call it.
- `src/shared/showNotes.ts` and `src/shared/appraisal.ts` keep the ladder and rules in the runner prompt. `src/shared/live.ts` records a host or mod vendor price. `src/content/appraise.ts` starts one idle table scan in the gap between lots. `src/shared/estate.ts` is consulted so a named runner title is not treated as a template.
- The run quote is local and does not add a model call. The idle scan is one extra table-scan call during the gap, with the same timeout as the scan that already follows an appraisal. It does not delay the next lot's appraisal, and a late result does not replace that appraisal. Accuracy of the run start comes from the parsed ladder, not from a model.
- Version becomes 0.16.0 in `package.json` (a requested feature, so a minor bump from 0.15.5). The manifest and userscript pick that up from the build.
- Branch `flea-runner-shows`, opened as a pull request into `main`, then merged with `gh pr merge --admin`.

## Out of scope

- A new show type, or a separate calibration bucket. These shows stay whatever `detectShowType` already returns.
- Typing R or P, sending chat, bidding, entering a giveaway, or claiming a coupon.
- Reading a vendor price off a tag in the image, or off a viewer's chat line.
- Loyalty-coupon advice.
- The $999,999 bookmark listing in the shop.
- Changing template detection on a show that is not a runner. "Sewing Patterns Vintage As Shown" stays a template.
- Wheel odds, the iPhone userscript, and a repeating scan while the host is still walking.
