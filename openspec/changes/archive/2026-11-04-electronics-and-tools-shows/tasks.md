# Tasks

## 1. Branch

- [x] 1.1 Confirm `everyday-electronics-shows` is merged into main, then create branch `electronics-and-tools-shows` from main and verify `git status` shows that branch. Leave tokens, .env files, and Chrome profiles out of every commit.

## 2. Show type

- [x] 2.1 Add `tools` to `ShowType` in `src/shared/showType.ts`. A Tools category or a tool-brand tag outranks Pallet Pulls. `scansByDefault` stays flea-only. Verify a vitest that Tools + Pallet Pulls + Ryobi Tools is tools, Tools + DIY + Milwaukee Tools is tools, Everyday Electronics + Pallet Pulls is still electronics, and a garage sale mentioning a drill is still flea.

## 3. Device specs

- [x] 3.1 Add `src/shared/deviceSpecs.ts` that returns year, chip, RAM, storage, screen, generation, variant, and part number. Verify a vitest that "2021 Apple Macbook Pro M1 14-Core 16GB RAM 1TB SSD 14\"" gives M1, 16 RAM, 1024 storage, and 14 inch; "Samsung 500C Chromebook 4GB 16GB" gives 4 RAM and 16 storage; "2021 Apple iPad (9th Gen) 64GB" gives 9th gen and 64 storage; "Audien Atom Pro 2" and "Audien Atom Pro" have different variants; "2886-20", "48-11-2425", and "DMAPL9910-S7" are parts; and "K135", "4-1/2", and "7-1/4" are not.
- [x] 3.2 `findComps` rejects a sale when a spec stated in both titles differs, and keeps one where a spec is missing from either. Verify a vitest that 250GB against 500GB on the same 2019 MacBook Pro does not match, "Atom Pro" does not price "Atom Pro 2", 2886-22 does not price 2886-20, two "2022 Apple Macbook Air M2 500GB" sales with no RAM can price the 8GB model, and the existing one-sale and year-conflict tests still pass.

## 4. Tools module

- [x] 4.1 Add `src/shared/tools.ts` for the pass, platform, tool-only or kit, amp-hours, and part number. Verify a vitest that the M18 FUEL trimmer is M18 FUEL and tool-only, "2457-21 … Ratchet Kit" is a kit, "Milwaukee M12 Fuel Hammer Drill #3" says not stated, "Milwaukee 7 inch straight jaw pliers" has no platform, "MSRP $148 Milwaukee M12 3.0 battery And M12 Charger" gives M12, 3.0 Ah, and a charger, description "3046-20" sets the part, and the pass stays off on an electronics show with one drill kit.
- [x] 4.2 Tool wants match on part number and on platform plus tool word, and send no chat. Verify a vitest that "3049-20?" highlights a later 3049-20 shop row and "M18 sawzall?" highlights an M18 SAWZALL lot.

## 5. Listing reads

- [x] 5.1 In `src/shared/electronics.ts`, add the retail forms, the `(X)` strip, the notes retail map and mismatch, the missing-accessory flag, seller promises, and the extra pull shapes. Verify a vitest that "(RETAIL26.00)Milwaukee…" is MSRP $26 with the name starting at Milwaukee, "BOKU $1999 DRONE WITH SCREEN" is MSRP $1999 and not a value, the ION title $489 against notes $295 shows both, "*NO CHARGER* Samsung 500C…" flags no charger, "1-Year Warranty" and "45-Day Return Policy" show beside no-cancellations, "fully unlocked" and "chargers are listed separately" show as promises, "10-14" on a Pallet Pulls show is a pull with tier 10-14, "HD TOOLS & MORE (NO CANCELLATIONS) #44" matching the show title is a pull, and "Batteries (2)" is a pull.

## 6. Shop

- [x] 6.1 `scoreShop` treats the shop's most common auction start as the opener when it is $5 or less and at least half the auctions share it. Verify a vitest that 23 of 24 auctions at $2 leaves a $2 auction unlisted for its price, a $169 "2457-21 M12 Ratchet Kit" under two higher 2457-21 sales is listed, and every scenario from the earlier shop tests still holds.

## 7. Appraisal and checks

- [x] 7.1 `noteForPrompt` drops password and passcode lines, referral codes, and URLs as well as coupons. When the tools pass is on, `appraisalContext` sends the tools hint and leaves out the electronics and estate hints. Verify a vitest that the "revolt" line and "Use my code 83QT8R" with its link are absent while the rest of the notes remain, and that "Milwaukee M12 Fuel Hammer Drill #3" on a tools show gets the tools hint and not the others, with one model call.
- [x] 7.2 Extend `checksFor` with `showType` and `title`. Add electronics checks, tools checks, and the two clone cues, capped at five, worded as checks. Verify a vitest in `src/shared/collection.test.ts` that a used phone lists activation lock, carrier lock, battery health, and serial; a tools show lists batteries and charger, nameplate part number, and platform; "P5 Handheld Retro Gaming Console – 520 Built-In Games" adds the unlicensed check; "1TB SD Card" at $1 adds the capacity test; and the existing coin and bullion tests still pass.

## 8. Surfaces

- [x] 8.1 Show the spec line, tools line, missing accessory, stated retail and mismatch, and promises on the Live panel and the on-page assistant, from the listing before an appraisal. Verify an overlay vitest that "$329 M18 FUEL 5 in. Flathead Braking Grinder 2886-20" renders M18 FUEL, tool-only, and 2886-20 before an appraisal, and that "2015 Apple Macbook Air 8GB RAM 250GB SSD i5 13\"" renders 2015, i5, 8GB RAM, 250GB, and 13 inch.

## 9. Delivery

- [x] 9.1 Bump `package.json` one minor version from the version on main after `everyday-electronics-shows` (expected 0.17.0), run `npm test` and `npm run build`, and verify `dist/manifest.json` and `dist-userscript/whatnot-auto-share.user.js` show the new version.
- [x] 9.2 Commit, push, and open a detailed pull request from `electronics-and-tools-shows` into main, then merge it with `gh pr merge --admin`. The commits contain no tokens, .env files, or Chrome profiles.

## Workflow follow-up

- Archive `everyday-electronics-shows` before this change, then archive this one after its pull request is merged.
