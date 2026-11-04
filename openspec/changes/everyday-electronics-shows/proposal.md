# Proposal

## Why

Everyday Electronics shows on Whatnot sell three different things through one category, and the assistant reads all three wrong. Watched on 4 Nov 2026, ten live shows in that feed (out of the fifteen-plus on the tab) were size or weight pull buckets, parts and untested pallet codes, or named devices with a model and a condition. "Pallet Pulls" currently forces the flea show type, so the table scan and flea calibration run on a wall of stock. A title such as "ELECTRONIC AS SHOWN" turns on the estate hint and asks for clothing hallmarks. A reusable "APPLE IPAD" or "Small Pallet Pull" hammer can become the comp for the next one.

## What Changes

- Add an electronics show type. An electronics category tag (Everyday Electronics, Laptops, Phones & Tablets, and the same kind of tag) outweighs flea wording in those tags, including "pallet". A garage-sale title with no electronics category stays flea. The table scan stays off unless the user turns it on.
- Recognize a pull bucket: a size or weight tier, "pallet pull", "random item", "as shown" / "as seen on screen", a warehouse code such as "ABC LARGE", or a generic device class with no model ("APPLE IPAD", "Android Smartphone"). Show lot number, tier, start, shipping, and the listing condition before any model call.
- Keep a run board of this show's recent pull hammers, with the recognized name when an appraisal or a host or mod line supplied one. A pull title is not a Whatnot comp. A generic device-class title is not a comp either. A specific model, storage size, or year-plus-product title still is.
- Pin a host or mod identification onto the current pull lot. Collect buyer wants ("any optiplex?", "GoPro") and highlight a later lot or shop row whose recognized name matches. Do not send chat, and do not collect a phone number or a handle from a line that asks for one.
- Show the show's buying rules once: no returns or no cancellations, bundle cap, a named region that will not ship, whether a charger is included for this kind of device, and sudden death when the tags or notes say so. Sudden death is a label. It does not bid.
- Read the listing subtitle as the condition: brand new, open-box, used and working, certified refurbished, or for parts / untested. A parts or untested lot is not a steal against working comps. A stated MSRP in the title or a host line is a label, not a sold price.
- **BREAKING** for show type: a show whose category is electronics and whose tags also say pallet is electronics, not flea. Calibration and sold comps for that show use the electronics bucket.
- **BREAKING** for the shop scan: a specific model with quantity of 20 or more can still be scored. Pull buckets, generic device classes, giveaway announcements, and a buy-it-now priced as a joke (the $999,999 "giveaway now" row) stay out. A $1 auction is still only the pre-bid opener. The scan still buys nothing.

## Capabilities

### New Capabilities

- `electronics-shows`: Pull buckets, condition, MSRP, charger and bundle and region rules, sudden death, pinned identifications, buyer wants, and the run board on an electronics show.

### Modified Capabilities

- `live-show`: Electronics is a show type and outweighs a pallet tag on an electronics category. The shop scan scores a specific in-stock model and still skips pull buckets, generic device classes, joke-priced giveaway rows, and $1 pre-bids.
- `appraisal`: An electronics show adds a reading hint. A pull or generic device title is not the item name sent to the model. The estate hint is not added on that show. MSRP is not a sold price.
- `reference-prices`: A pull title or a generic device-class title does not match as a Whatnot comp. A stated MSRP is not a sold price. A specific model title still matches.

## Impact

- New `src/shared/electronics.ts` for the show pass, pull detection, condition, MSRP, rules, wants, and the run board. Show type, live session, shop scoring, appraisal context, and sold-comp matching call it.
- `src/shared/showType.ts`, `src/shared/shop.ts`, `src/shared/appraisal.ts`, `src/shared/soldHistory.ts`, `src/shared/live.ts`, the live side panel, and the on-page overlay.
- No new host, no extra model call, and no change to model order. The pull line, condition, and rules are local and show before the appraisal returns. The electronics hint is a few sentences on the appraisal request that already runs. Time-to-answer for the quick read gets shorter. The model answer takes the same one call, and it is more accurate because the title no longer names a shipping bucket as the item.
- Version becomes 0.16.0 in `package.json` (a requested feature, so a minor bump from 0.15.5). The manifest and userscript pick that up from the build.
- Branch `everyday-electronics-shows`, opened as a pull request into `main`, then merged with `gh pr merge --admin`.

## Out of scope

- Bidding, sending chat, entering giveaways, claiming a coupon, joining a Discord, or opening a referral link.
- The iPhone userscript.
- Wheel odds, envelope boards, and prize values.
- Inventing storage, carrier lock, battery health, an IMEI, a serial, or a certification number.
- A product catalog, an eBay scrape, or a new price API. Value still comes from a watched sale, melt, or a labeled estimate.
- Treating a stated MSRP as the market value.
- Warning on, or replying to, scam lines in chat.
- Changing keyword alerts or the watchlist ceiling. Wants are a separate list on this show.
- The unfinished `flea-runner-shows` change.
