# Tasks

## 1. Branch

- [x] 1.1 Create branch `case-pack-shows` from an up-to-date main and verify that `git status` shows the branch. If `everyday-electronics-shows`, `parent-electronics`, or `electronics-and-tools-shows` merged first, rebase and keep their show-type clauses and scenarios beside this change's. Leave tokens, .env files, and Chrome profiles out of every commit.

## 2. Show type

- [x] 2.1 Add `wholesale` ("Case packs & wholesale") to `ShowType` and `SHOW_TYPES` in `src/shared/showType.ts`. A Case Packs & Bundles category returns wholesale. "case pack(s)" and "casepack" no longer feed the cards pattern. Reseller Bundles and Wholesale/Lots tags outrank flea and item words in the tags. `scansByDefault` stays flea-only. Add `wholesale` to `SPECIALTY` in `src/shared/soldHistory.ts`. Verify with vitest in `src/shared/showType.test.ts` that all 14 observed title-and-tag pairs from the review come out as wholesale. These include "12/$12 SB Casepack…" with Squishy Toys, Fashion Jewelry dozens, and "🇨🇦！Cad! Warehouse show" with Pallet Pulls. Also verify that "Pokemon packs" stays cards and that the existing show-type tests still pass.

## 3. Case-pack reading

- [x] 3.1 Add `src/shared/casePack.ts` with `packCount`, `notesRatio`, `sizeRun`, and `isGenericCaseLot`. Verify with vitest in `src/shared/casePack.test.ts` that:
  - "CASEPACK 6PCS CT-3377…" is 6, "12 pairs Christmas socks 31079 size 9-11" is 12, "Hasbro 3 per Transformers…" is 3, "Joggers Casepack size LARGE (12 pairs)" is 12, and "$24 HANES SMALL T-SHIRTS SIZE SMALL (6 pack)" is 6.
  - "4-Foot … Santa", "goldkey laundry pods 42 count", "AMA Supercross 1:10 Scale #12", and "A Grinch 40 ounce" have no count.
  - "Holiday Beauty Set" with "9 piece set" is 1.
  - "20 PIECES" in the title with "25 brand-new pieces" in the description returns both counts.
  - "Includes 2S, 2M, 2L" is a 2/2/2 run, and "3S/M and 3L/XL" is 3/3.
  - Notes with "12/$12 … UNLESS stated otherwise" give 12, "Sold by the dozen unless otherwise stated" gives 12, and the subtitle "Sold per piece" gives 1.
  - "Clothing Case Pack - Pink Tag #66", "$3.99 Shipping Cap #308", "12/$12 Dozens", "Quality Item #54", "Pallet #4", and "Rewards Bundle" are generic, while "CASEPACK 6PCS TW-2340 Mock Neck…" is not.
- [x] 3.2 Add `contentsLine`, `perPiece`, `landedPerPiece`, `breakEven`, `priceClaims`, `perPieceShopRows`, and `buildCasePackView` to the same module. Verify with vitest that:
  - "Hats- 10" gives Hats ×10, "SQUISHY CHUBBY BANANA X2" gives ×2, and "6/$12" gives 6.
  - "12/$12 SB" at $12 with $5.25 shipping is $1.00 each and $1.44 landed.
  - Hats ×10 at $21 with $7.75 is $2.10 each and $2.88 landed.
  - Break even at 10.9% + $0.30 on $2.88 is $3.57.
  - "3 lb" at $30 is $10.00 per lb.
  - "$79 msrp 10-Pack…" yields the claim $79 and no market value.
  - A flash price of $9 struck from $50 yields "seller's was-price $50".
  - The three fashionten buy-it-now rows sort to $8.00, $13.00, and $17.33 each, and none of them is a steal.
  - With no count, there is no per-piece figure.

## 4. Live session

- [x] 4.1 Add `casePins`, `caseRuns`, `currency`, and `shippingRulesKey` to `LiveSession` in `src/shared/live.ts`, and reset them in `emptySession`. On a wholesale show, pin a host or mod contents line to the current generic lot number. Never pin a viewer's line. Append paid sales of generic or counted lots to `caseRuns`, newest first, keeping 12, and leave giveaways out. Verify with vitest in `src/shared/live.test.ts` that:
  - A mod "Hats- 10" on lot 66, followed by a $21 sale, puts lot 66 · Hats · 10 · $21 · $2.10 at the top of the board.
  - A viewer line does not pin.
  - Lot 67 does not reuse lot 66's pin.
  - A giveaway between two sales is absent from the board.

## 5. Shipping rules

- [x] 5.1 Add `shippingRules` and `shippingOwed` to `src/shared/costs.ts`, and make `allInPrice` and `allInLine` take the owed result. Read the cap, combined shop shipping, tiers that do not bundle, solo-ship, the bundle weight limit, and pallet freight rows (time-zone rows, liftgate, and exempt words such as "coffin") from the notes, the titles, host or mod lines, and parsed shop rows. Verify with vitest in `src/shared/costs.test.ts` that:
  - A second win with no rules adds nothing.
  - "Max bundled shipping $9.99" plus a prior win adds nothing and names the cap.
  - A mod line "$12.99 max shipping" sets the cap.
  - "Small, medium, and large do not bundle" plus a prior win plus a Large lot adds the page shipping.
  - "bundles … up to 5 lbs" plus "Case 6-10 pounds" adds $12.99.
  - In America/New_York, "Pallet #4" at $540 with $4.47 comes to $790.47, with Eastern $246 and the $200 liftgate shown as optional.
  - A non-US zone shows $246 to $460 and adds none.
  - "Coffin" adds no freight.
  - The existing all-in tests still pass.
- [x] 5.2 Switch `src/content/bidGuard.ts` and `src/content/estate.ts` from the purchase-exists boolean to `shippingOwed`, so the guard, the estate card, and the case-pack line give one answer. Verify with vitest that the guard's all-in for a Large lot on that show matches the case-pack line's landed math.

## 6. Currency

- [x] 6.1 Add `src/shared/currency.ts` with `readAmountText`, `rateFrom`, and `toUsd`. Make `parseShipping` return the "est. $" figure and a tariffs flag. Verify with vitest that:
  - "Shipping is CA$18.50 (est. $13.26) + Taxes + Tariffs" gives $13.26 with tariffs.
  - The rate from that pair is 0.7168, and CA$40 converts to $28.67.
  - With no pair, the rate is null and `toUsd` returns null.
  - "Shipping is $5.25 + Taxes" still gives 5.25.
- [x] 6.2 Carry `currency` on `Lot`, `Sale`, and `ShopListing` from Money objects in `src/shared/live.ts` and `src/shared/shop.ts`. Store the show's rate on the session. Make `scoreShop` convert prices or skip rows with no rate. Make `soldFromSale` save the USD figure, or drop a foreign sale that has no rate. Verify with vitest that a CA$20 row with est. $14.34 is compared at $14.34, a CAD row with no rate is not scored, and a CA$35 sale with no rate is not saved as a comp.
- [x] 6.3 Add optional `currency` and `priceUsd` to `Purchase` in `src/shared/purchases.ts`, set them when a win is recorded in `src/background/alerts.ts`, and use the USD value in `summarizeSpend`, guard budgets, and the Buys panel. Count purchases left out for lack of a rate. Make the guard compare the converted bid, and show "not converted" with no over or near verdict when there is no rate. Verify with vitest that a CA$5 win at 0.7168 shows CA$5 and $3.58 and adds $3.58 to the show budget, that a CA$5 win with no rate is left out and counted, that a CA$40 bid against a $25 lot max is over, that a CA$40 bid with no rate gets no verdict, and that an old purchase with no currency still totals as US dollars.

## 7. Appraisal and comps

- [x] 7.1 Extend `appraisalContext` in `src/shared/appraisal.ts` with the case-pack input. On a wholesale show, send the case-pack hint in place of the card, jewelry, and estate hints. Replace a generic title with the lot number, the stated count and its source, and the pinned line. Do not add a model call, and keep coupons out of the request. Verify with vitest that a wholesale show tagged Fashion Jewelry omits the hallmark hint, that "Case Pack or Bundle as Seen #335" omits the estate hint, and that "Clothing Case Pack - Pink Tag #66" with the pin "Hats- 10" sends lot 66 and 10 pieces stated by a mod, and does not send the title as the item.
- [x] 7.2 Add `reconcileCount` and use it in `src/content/appraise.ts` before `computeValue` and `lotRollup`. Show the count label in `src/content/appraisalView.ts`. Verify with vitest that stated 12 with model 1 values 12 pieces labeled "12 stated", that stated 12 with model 10 values 10 and shows both counts, that no stated count with model 3 values 3, and that the suggested max follows the same count.
- [x] 7.3 In `findComps` in `src/shared/soldHistory.ts`, reject generic case-pack titles and pairs whose pack counts disagree. Verify with vitest that repeated "Clothing Case Pack - Pink Tag #N" sales do not set market value, that "12 pairs Christmas socks" does not comp a single pair, that two "Joggers Casepack size LARGE (12 pairs)" sales comp a third 12-pair pack, and that existing comp tests still pass.

## 8. Surfaces and docs

- [x] 8.1 Add `src/content/casePack.ts`, modeled on `src/content/estate.ts`, and `overlay.setCasePack`. On a wholesale show, show:
  - the case-pack line
  - any conflict note
  - the size run and price claims
  - break-even
  - the shipping-rule line, once per show
  - CA$ amounts with their US estimate
  - the run board

  Hide the estate card on a wholesale show. Mirror these fields in `src/sidepanel/sections/live.ts` and `src/sidepanel/index.html`, and add per-piece shop rows under the shop note. Verify with an overlay vitest in `src/content/overlay.test.ts` that "12/$12 SB" with a $12 start and $5.25 shipping renders 12 pieces, $1.00 each, and $1.44 landed before any appraisal, and does not show "12/$12 SB" as the item name.
- [x] 8.2 Update `README.md` under "What you can do" and "Appraisal" to cover case-pack per-piece cost, shipping rules and pallet freight, and amounts in other currencies converted from Whatnot's own estimate. Verify that the README states nothing is bought and that no new host is contacted.

## 9. Delivery

- [x] 9.1 Bump `package.json` once, by one minor version from the version on main (0.16.0 if main is still 0.15.5). Run `npm test` and `npm run build`, and verify that `dist/manifest.json` and `dist-userscript/whatnot-auto-share.user.js` show the new version.
- [x] 9.2 On a live Case Packs & Bundles show, load `dist` unpacked and verify on the page that the show type reads "Case packs & wholesale", that the case-pack line appears before the appraisal, and, on a show priced in CAD, that the shipping reads in US dollars with "tariffs not included".
- [x] 9.3 Commit on `case-pack-shows`, push with `git push -u origin HEAD`, open a detailed pull request into main with `gh pr create` (summary, test plan, and the new version), and merge with `gh pr merge --admin --merge`. Verify that the commits contain no tokens, .env files, or Chrome profiles.

## Workflow follow-up

- Archive this change only after the pull request into main is merged.
- If `estate-sale-shows` is archived later, keep its shop and template requirements. This change does not rewrite them.
