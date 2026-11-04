# Proposal

## Why

Estate Sales shows on Whatnot sell through reusable shipping-tier listings ("item on screen", "random pull", "junk bag") whose title never names the object. The item is whatever is on camera for a few seconds, the floor is a few dollars, and shipping often costs as much as the bid. The assistant already treats these shows as flea markets, so it scans the table and reads show notes, but it still sends the template title in as the item and ignores every auction in the shop. Watched on 3 Nov 2026, eight live shows in that category worked this way.

## What Changes

- Recognize a template lot: a shipping bucket or grab-bag title, not a specific item. Show its lot number, weight tier, floor, and shipping as soon as the listing is known, before any model call.
- Keep the show type as flea. Add an estate reading hint so the model trusts the image, reads maker marks, clothing size and flaws, and hallmarks, and does not name the item from the template title.
- Keep a run board of this show's recent template hammers, with the recognized name when an appraisal or a host or mod line supplied one.
- Pin a host or mod identification onto the current lot number. Collect buyer wants ("any pixies?", "run the duck") and highlight a later lot whose recognized name matches. Do not send chat.
- Show the show's buying rules once (no returns, as-is, not laundered, solo-ship or fragile). On clothing, show size and a stated flaw or care line.
- Call out when shipping has not already been paid in this show and shipping is at least half the current bid, or half the start price when nobody has bid. A $5 lot with $4.47 shipping qualifies. A later paid win in the show clears it.
- **BREAKING** for the shop scan: a named one-off auction is scored with the same steal, deal, and must rules as buy-it-now. Template auctions and giveaways stay out. The scan still buys nothing.
- Template sale titles are not Whatnot comps. A reused "Junk bag" hammer must not price the next junk bag.

## Capabilities

### New Capabilities

- `estate-shows`: Template lots, the run board, pinned identifications, buyer wants, the rules chip, and the shipping-versus-floor callout on an estate-style show.

### Modified Capabilities

- `live-show`: The shop scan scores named one-off auctions and still skips template auctions and giveaways.
- `appraisal`: An estate-style show adds a reading hint, and a template title is not the item name sent to the model.
- `reference-prices`: A template sale title does not match as a Whatnot comp.

## Impact

- New `src/shared/estate.ts` for template detection, lot numbers, rules, wants, and the run board. Live session, shop scoring, appraisal context, and sold-comp matching call it.
- `src/shared/shop.ts`, `src/shared/appraisal.ts`, `src/shared/soldHistory.ts`, `src/shared/live.ts`, the live side panel, and the on-page overlay.
- No new host, no extra model call, and no change to model order. The template line is local. The estate hint is a few sentences on the appraisal request that already runs. The flea table scan still runs after the answer and still does not move the max bid.
- Version becomes 0.15.0 in `package.json` (a requested feature, so a minor bump). The manifest and userscript pick that up from the build.
- Branch `estate-sale-shows`, opened as a pull request into `main`, then merged with `gh pr merge --admin`.

## Out of scope

- A new show type, or a separate calibration bucket. These shows stay flea.
- Wheel odds, envelope boards, and prize values.
- The iPhone userscript.
- Sending chat, bidding, entering giveaways, or claiming a coupon.
- Guessing an item that is not on camera, or inventing a size, weight, or certification number.
- Treating a weight-template quantity (hundreds of "item on screen") as a deal.
- Changing keyword alerts or the watchlist ceiling. Wants are a separate list on this show.
