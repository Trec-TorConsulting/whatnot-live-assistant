# Design

## Context

See proposal.md for why. Today `isHiddenPrize` in `src/shared/breaks.ts` tests only the title, and the pattern is anchored, so "Family Pack #7" with detail "Envelope" is priced as a named product. `wheelRows` in `src/shared/envelopes.ts` then sorts the camera board and keeps the cheapest rows until the remaining envelopes are filled, which drops the top item. `wheelOdds` in `src/shared/wheel.ts` averages whatever rows it is given. The camera read in `src/content/envelopes.ts` and `src/background/prizeValues.ts` already runs on a timer, off the bid click.

## Goals / Non-Goals

**Goals:**

- One envelope value for every sealed envelope, from the camera pool after instant hits are matched off.
- A jackpot share that uses the starting envelope count, and switches to the sealed count only after the board actually shrinks.
- A next-spin value that moves when cheap instant hits sell.
- No extra model call on the bid path.

**Non-Goals:**

- Assigning envelope #7 to the shelf label 7.
- Parsing chat. Odds already ignore chat; a test locks that in.
- A new network source for envelope prices. Pool items keep today's melt, then watched sales, then a labeled model estimate.

## Decisions

1. **Hidden means title or detail.** `isHiddenPrize` stays the name test. A prize is hidden when the title or the detail matches it. "Envelope" in the description catches Family Pack spots. Sold hits often have a title and no detail, so a sold hit also counts when its title stem matches a hidden prize on this break (the shared "Family Pack #" part, ignoring emoji and the number). If sold history is still paging, the jackpot share stays incomplete. Alternative considered: treat every "pack" title as an envelope. Rejected, because pack is already excluded from melt and is not always an envelope.

2. **The pool is what the camera could not match to a named spot.** Named instant hits keep the existing seen-item path. Anything left is the pool. Shelf numbers are ignored for assignment, even when they equal an envelope number. `parseEnvelopeAnswer` may still return a `prize` string; the wheel drops that link instead of trusting it.

3. **Do not slice the board down to the cheapest rows.** If the unmatched count is within the original envelope count, each sealed envelope is worth that average, and gaps count as zero so the number is a floor. If the shelf is still larger, show the top item and mark the average incomplete. Alternative considered: keep averaging every extra item. Rejected, because those extras may be instant hits the match missed or prizes already won and still on display.

4. **Sealed is the default. A shrinking board is the reveal switch.** Store the pool item names on the break's envelope board. After an envelope hit, a later read that is a strict subset of those names drops the missing items and divides the top item by envelopes still sealed. An empty read keeps the last board, as it does now. Alternative considered: always divide by envelopes left. Rejected, because a sold envelope can already hold the top item and the seller has not opened it.

5. **The spin uses the mix.** Remaining hidden spots are valued at the envelope average (or left unpriced when that average is incomplete). Named spots keep their own prices. `wheelOdds` is unchanged: it averages the rows it is given. The card adds the top item, its share, and the envelope average. This is local arithmetic on the prize list and the last board.

Time-to-answer stays the same, because the frame read is the one that already retries before the bid. Accuracy moves the other way: a Family Pack joins the pool, a late sealed envelope does not inherit the whole top item, and a crowded shelf does not throw that top item away.

## Risks / Trade-offs

- [A seller leaves won instant hits on the shelf and the label is too small to match] → the unmatched count exceeds the envelope count, the average stays incomplete, and the top item is still shown. That is a floor on confidence, not a guessed assignment.
- [Sold "Family Pack" titles vary by emoji or wording, so the stem misses] → the share stays incomplete instead of using envelopes left.
- [A camera read drops an item because it was out of frame, and the subset test treats that as a reveal] → require the shrink to happen after an envelope hit, and ignore a read that loses most of the board at once. An empty read never clears the pool.
- [The model still prices a Family Pack by name before this lands] → values keyed only by that name are not used for a hidden prize, which is the rule already used for "ENVELOPE #3".

## Migration Plan

Ship on branch `envelope-wheel-odds` as a pull request into `main`. The wheel card copy changes; saved manual wheel values stay. Rollback is reverting the pull request. No stored board needs a migration: an old board is re-read on the next frame.

## Open Questions

None. Seller differences are covered by the sealed default and the shrinking-board switch.
