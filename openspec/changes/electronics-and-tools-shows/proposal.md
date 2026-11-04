# Proposal

## Why

The Electronics feed is the parent of Everyday Electronics. It also carries Laptops, Phones & Tablets and Tools. On 4 Nov 2026 it had 27 live or upcoming shows. I opened ten that the `everyday-electronics-shows` change does not cover: four Tools shows (larry_tool_deals, whoopinmywallet, mrgt500, lmcliquidations), torquex, the audienhearing hearing-aid show, voltage_electronics, discountcomputerdepot, techempire, and auctionhaus.

Their value depends on details the assistant ignores. A Milwaukee `2886-20` is the bare tool and a `-22` is a kit. M12 and M18 batteries do not interchange. A `2019 MacBook Pro i5 8GB 250GB` is not the 500GB one. `Atom Pro 2` is not `Atom Pro`. Today a comp only conflicts on year, and one-character tokens are dropped. So a bare tool can price a kit, a 250GB laptop can price a 500GB one, and the older hearing aid can price the newer one.

MSRP shows up in more forms than the electronics change reads: `(RETAIL26.00)`, `$58 value!`, `BOKU $1999 DRONE`. One show's title MSRP disagreed with its own notes (ION at $489 in the title, $295 in the notes). voltage_electronics opens every auction at $2, so the $1-only pre-bid rule misses it. Its notes also print a device unlock password, and today the show notes go to the model.

## What Changes

- Add a **tools** show type. A Tools category, or tags such as Milwaukee Tools or Ryobi Tools, sets it. It outranks a Pallet Pulls tag, the same way electronics does. Tools sales do not comp against electronics or flea sales.
- Tools quick read, before any model call: battery platform (M12, M18, FUEL, Ryobi ONE+ 18V, DeWalt 20V MAX, FLEXVOLT), tool-only or kit, part number from the title or description, and battery amp-hours. When the listing does not say kit or tool-only, it says so. A buyer want matches on part number (`3049-20`) and platform (`M18 sawzall`).
- Device spec line, before any model call: year, chip (M1/M2, i5/i7, Celeron), RAM, storage, screen size, and generation, read from the title. `*NO CHARGER*` and `*NO ADAPTER*` show as a missing accessory on that lot.
- **BREAKING** for comps: a conflicting storage, RAM, screen size, chip, generation, model suffix (`Pro 2` against `Pro`, `Max`, `Plus`), or tool part-number suffix (`-20` against `-22`) rules a sale out. One-digit model numbers are kept.
- Stated MSRP also covers `(RETAIL26.00)`, `$58 value!`, a dollar figure inside the title, and an `(X)` prefix. When the notes give a different retail for the same model, the panel shows both and uses neither as value.
- **BREAKING** for the shop scan: the opener is the auction start most of the shop shares when it is $5 or less, such as $2 at voltage_electronics. It is not listed as a deal. $1 still counts as an opener.
- Seller promises in the notes show as rules: a return window, a warranty, fully unlocked, and a charger sold separately. They show next to the no-returns rules and never replace them.
- A device password line in the notes is not sent to the model. Neither is a referral code. Coupons were already left out.
- More pull shapes on electronics and tools shows: bare-number weight tiers (`1-2`, `10-14`), a lot titled with the show banner, and class buckets (`Batteries (2)`, `Chargers`).
- Checks to make before trusting an item. Electronics: activation lock, carrier lock, battery health, serial on the box matches the device, and charger present. Clone cues: an N-in-1 built-in game console, or a 1TB SD card at a dollar start. Tools: count the batteries and charger on camera, match the nameplate part number, and match your platform. These are checks, not findings.

## Capabilities

### New Capabilities

- `tools-shows`: Tools pass, battery platform, tool-only or kit, part number, battery capacity, the tools quick read, and part-number and platform wants.
- `device-listings`: The spec line, missing-accessory flags, the wider MSRP forms and title-versus-notes mismatch, seller promises, the extra pull shapes, and device and tool checks.

### Modified Capabilities

- `live-show`: The show type adds tools. The shop scan treats the shop's shared low auction start as the opener.
- `appraisal`: Show notes sent to the model leave out device passwords and referral codes. The tools reading hint is added.
- `reference-prices`: Whatnot sold comps rule out conflicting specs, models, and part-number suffixes.

## Impact

- New `src/shared/tools.ts` and `src/shared/deviceSpecs.ts`. Changes in `src/shared/showType.ts`, `src/shared/soldHistory.ts`, `src/shared/purchases.ts` (token rules used by comps), `src/shared/shop.ts`, `src/shared/appraisal.ts`, `src/shared/counterfeit.ts`, `src/shared/electronics.ts` (from the earlier change), the live side panel, and the on-page overlay.
- No new host, no extra model call, and no change to model order. The spec line, tools line, accessory flag, and rules are local and show before the appraisal returns, so the quick read is faster. The tools hint is a few sentences on the request that already runs. Comps are stricter, so fewer of them qualify. A value that used to come from a wrong comp now falls back to the labeled estimate.
- Depends on `everyday-electronics-shows`. Implement and merge that change first. Then bump `package.json` one minor version for this change (0.17.0 if that change shipped as 0.16.0).
- Branch `electronics-and-tools-shows`, opened as a pull request into `main`, then merged with `gh pr merge --admin`.

## Out of scope

- Bidding, sending chat, entering giveaways, or claiming a coupon or referral.
- The iPhone userscript, wheel odds, and envelope boards.
- Reading or storing a device password. Inventing an IMEI, a serial, battery health, carrier status, or a certification number.
- A product catalog, a Milwaukee or Apple spec database, or a new price API.
- Seller reputation from chat complaints, and replying to scam lines.
- Medical advice on hearing aids. They are read as devices with a model and a condition.
- Cameras & Photography and other Electronics subcategories that had no live show on 4 Nov 2026.
