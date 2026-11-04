# Tasks

## 1. Branch

- [x] 1.1 Create branch `everyday-electronics-shows` from main and verify `git status` shows that branch. Leave tokens, .env files, and Chrome profiles out of every commit.

## 2. Show type

- [x] 2.1 Add `electronics` to `ShowType` in `src/shared/showType.ts`. An Everyday Electronics or Laptops, Phones & Tablets category outranks a Pallet Pulls tag. A garage-sale title that only mentions a laptop, with no electronics category, stays flea. `scansByDefault` stays flea-only. Verify a vitest that Everyday Electronics plus Pallet Pulls is electronics, Laptops, Phones & Tablets is electronics, and a garage sale titled with a laptop is flea.

## 3. Electronics module

- [x] 3.1 Add `src/shared/electronics.ts` with the pass, pull bucket, lot number, and tier. Verify a vitest that "1. XS-XSMALL PULL", "Large", "Medium Pallet Pull (1-2LB)" (tier 1-2 lb), "No Risk Pallet Pulls (ABC LARGE)", "ELECTRONIC AS SHOWN", "SMALL Random Item #202" (lot 202), "APPLE IPAD", and "Android Smartphone (not a Samsung)" are pull buckets, and "2020 Apple MacBook Air Laptop Apple M1 Chip (USED)" and "XGIMI MoGo Pro+" are not. A coin show whose title mentions a phone leaves the pass off. Everyday Electronics turns the pass on.
- [x] 3.2 Add condition, stated MSRP, buying rules, sudden death, the shipping callout, pins, and wants in the same module. Verify a vitest that subtitle "For parts, not fully functioning, or untested" wins over a Certified Refurbished tag, "Open-box" is open-box, "($200 Retail) Viaim…" yields MSRP $200 and a name without the retail clause, "$349 • ECOVACS…" does the same, notes that bar Canada and chargers for phones show no-Canada and no charger on a phone lot and a charger on a laptop lot, "bundle up to 6" is a cap of 6, a Sudden Death tag is a label and does not bid, $11.05 shipping on a $1 "Large #4" calls out and a paid win clears it, "any optiplex?" and "GoPro" are wants, a line asking for a cellphone number is not, and a mod line "Apple AirPods Pro 1" pins while an emoji-only line does not.

## 4. Live session

- [x] 4.1 Keep electronics pins, wants, runs, and the rules key on the live session, and clear them when the live path changes. Pin a host or mod line onto the current pull lot. Replace the pin when the appraisal names that same lot. On a pull sale, copy the pin onto a run entry and keep the newest twelve. Leave giveaways and non-positive prices off the board. Hide the estate card while the electronics pass is on. Verify a vitest in `src/shared/live.test.ts` that pull lot 46 at $24 keeps its recognized name, a later lot does not rewrite it, and a giveaway between two pull sales is absent.

## 5. Appraisal and comps

- [x] 5.1 When the electronics pass is on, `appraisalContext` sends the electronics hint and does not send the estate hint. A pull or generic title is lot number and tier, not the item name. A stated MSRP is labeled as a claim. Do not add a model call, and do not put a coupon in the request. Verify a vitest that "ELECTRONIC AS SHOWN #150" includes the electronics hint, omits the estate hint, and does not call the item "ELECTRONIC AS SHOWN", and that "SMALL Random Item #202" may include lot 202 and the small tier.
- [x] 5.2 `findComps` rejects a pull bucket title and a generic device-class title, and strips a stated MSRP before matching. A specific model still matches. Keep the sale. Verify a vitest that several "SMALL Random Item" hammers and several "APPLE IPAD" hammers do not set market value, two "2020 Apple MacBook Air M1" sales can, and "($200 Retail)" does not set value by itself.

## 6. Shop

- [x] 6.1 Keep the listing subtitle on parsed shop rows. `scoreShop` still drops templates, $1 pre-bids, and giveaways. It also drops pull buckets, generic device classes, a giveaway-titled buy-it-now, and a row priced at $10,000 or more with quantity of 20 or more. A specific title with quantity of 20 or more can still score. A parts or untested subtitle is not a steal or a deal against working sales. Verify a vitest that "XGIMI MoGo Pro+" quantity 26 under its comps is listed, "APPLE IPAD" quantity in the hundreds is not, the $999,999 giveaway buy-it-now is not, a for-parts row is not a steal, and the 1/1000 oz gold case is still not under melt.

## 7. Surfaces

- [x] 7.1 Show the pull line, condition, shipping callout, rules, sudden death, stated MSRP, highlighted want, and run board on the Live panel and the on-page assistant. The pull line uses the listing, start, and shipping already on the page and does not wait on a model. Verify an overlay vitest that lot 202, the small tier, the $3 start, and $6.75 shipping render before an appraisal, and that the title is not shown as the item name "Random Item".

## 8. Delivery

- [x] 8.1 Bump `package.json` from 0.15.5 to 0.16.0 once, run `npm test` and `npm run build`, and verify `dist/manifest.json` and `dist-userscript/whatnot-auto-share.user.js` show 0.16.0.
- [x] 8.2 Commit, push, and open a detailed pull request from `everyday-electronics-shows` into main, then merge it with `gh pr merge --admin`. The commits contain no tokens, .env files, or Chrome profiles.

## Workflow follow-up

- Archive this change only after the pull request into main is merged.
- If `estate-sale-shows` is archived later, keep the named-auction and template shop scenarios from this change's live-show delta.
