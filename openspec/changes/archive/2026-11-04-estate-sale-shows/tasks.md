# Tasks

## 1. Branch

- [x] 1.1 Create branch `estate-sale-shows` from main and verify `git status` shows that branch. Leave tokens, .env files, and Chrome profiles out of every commit.

## 2. Estate module

- [x] 2.1 Add `src/shared/estate.ts` with the estate pass, `isTemplate`, lot number, and weight tier. Verify a vitest that "*c - 2 oz Item on screen #57" is lot 57 and tier 2 oz, "Junk bag #70" and "E Random 1-2lb #10" and "Cool Vintage Small 8-11 oz" and "*z - Category - Coins" and "Sewing Patterns Vintage As Shown" are templates, and "Chico's Blue Textured Fringe Trim Sweater Jacket Size 1 Medium" and "Better Homes & Gardens Cookbook 1953" are not, with 1953 not read as a lot number. A coin lot titled "1921 Morgan dollar" on a coin show leaves the pass off. "Estate Sales" as a category turns the pass on without changing show type.
- [x] 2.2 Add the shipping callout, the four buying rules, buyer wants, want matching, and the clothing line in the same module. Verify a vitest that $4.47 shipping against a $5 bid calls out and against $36 does not, a paid win in the show clears it, a $3 start with no bid calls out, notes with "/coupon SAVE10" and "not washed" yield the clean-before-wear rule and no coupon, "no refund" and "as seen" yield no-returns and as-is, the same rule set does not count as a new chip, "Can you run the duck with the heart dress?" and "Sterling?" are wants, "No sound?" and "How do the bulk ship?" are not, "lion" highlights on "Chalkware lion bookend", "pixies" matches "pixie", and a Chico's size 1 listing shows the brand and size while an unstated measurement stays empty.

## 3. Live session

- [x] 3.1 Keep pins, wants, runs, and the rules key on the live session, and clear them when the live path changes. Pin a host or mod item line onto the current template lot number as the line arrives. Do not pin "Ty!", a join, or an emoji-only line. Replace the pin when the appraisal names that same lot. On a template sale, copy the pin onto a run entry and keep the newest twelve. Leave giveaways and non-positive prices off the board. Verify a vitest in `src/shared/live.test.ts` that #40 at $36 and #42 at $1 both stay, a host name for #10 is on that hammer, a later lot does not rewrite it, and a giveaway between them is absent.

## 4. Appraisal and comps

- [x] 4.1 When the pass is on, `appraisalContext` sends the estate hint and, for a template lot, the lot number and tier instead of the template title as the item name. Do not add a model call, and do not put a coupon in the request. The flea table scan's "being sold now" line uses the appraisal name, or "the piece closest to the camera" before that, and still does not change the max bid. Verify a vitest that "E Random 1-2lb #10" includes the hint and does not call the item "Random", and that "*c - 2 oz Item on screen #57" does not call the item "Item on screen".
- [x] 4.2 `findComps` rejects a saved sale whose title is a template and still keeps the sale. Verify a vitest that several "Junk bag" hammers do not set or move market value for a junk-bag lot, and that one real matching sale still does not set market value on its own.

## 5. Shop

- [x] 5.1 Keep named auctions in `parseShopListings` with `mode: 'auction'`. Drop giveaways. Do not drop a named auction only because `isPreBid` is set. `scoreShop` drops templates and quantity of 20 or more, and scores the rest with the existing melt, comps, watchlist, and key-date rules. Label an auction hit Auction, and say "shop" in the summary once an auction is included. Verify a vitest that a named auction under its comps is listed next to a buy-it-now coin under melt, "*z - Category - Coins" at $1 with a quantity in the hundreds is not, a giveaway is not, and the 1/1000 oz gold case is still not under melt.

## 6. Surfaces

- [x] 6.1 Show the template line, the shipping callout, the rules chip, the highlighted want, the clothing line, and the run board on the Live panel and the on-page assistant. The template line uses the listing, the start, and the shipping quote already on the page and does not wait on a model. Verify an overlay vitest that lot 57, the 2 oz tier, the $4 start, and $4.47 shipping render before an appraisal, and that the title is not shown as the item name "Item on screen".

## 7. Delivery

- [x] 7.1 Bump `package.json` from 0.14.0 to 0.15.0 once, run `npm test` and `npm run build`, and verify `dist/manifest.json` and `dist-userscript/whatnot-auto-share.user.js` show 0.15.0.
- [x] 7.2 Commit, push, and open a detailed pull request from `estate-sale-shows` into main, then merge it with `gh pr merge --admin`. The commits contain no tokens, .env files, or Chrome profiles.

## Workflow follow-up

- Archive this change only after the pull request into main is merged.
