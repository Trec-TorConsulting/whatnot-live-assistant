# Design

## Context

See proposal.md for why. Show type lives in `src/shared/showType.ts`. `detectShowType` scores flea at triple weight, and `pallets?` matches "Pallet Pulls", so an Everyday Electronics show becomes flea and `scansByDefault` turns the table scan on. Estate logic in `src/shared/estate.ts` treats "as shown" as a template and then adds a clothing and hallmark hint from `appraisalContext` in `src/shared/appraisal.ts`. It does not treat "Pallet Pull (1-2LB)", "XS-XSMALL PULL", or "APPLE IPAD" as templates, because leftover words such as "pallet" fail `weightOnly`. `scoreShop` in `src/shared/shop.ts` skips `isTemplate` and `quantity >= 20`, so a real "XGIMI MoGo Pro+" with quantity 26 never scores, while a generic class is skipped only because the quantity is fake. `findComps` in `src/shared/soldHistory.ts` drops template titles and still accepts "APPLE IPAD". Listing subtitles already carry "Open-box", "Brand New", and "For parts, not fully functioning, or untested". The shop parser keeps title, price, quantity, and mode, and drops the subtitle.

`estate-sale-shows` is implemented and not archived. Its shop delta (named one-off auctions, $1 pre-bids ignored, templates ignored) matches the code. The main `live-show` spec still says auctions are ignored. This change's shop requirement is the combined behavior.

## Goals / Non-Goals

**Goals:**

- A local quick read (lot, tier, condition, shipping, rules) before the one appraisal call that already runs.
- Pull hammers and generic device classes stop moving comps. A specific model still matches.
- Electronics shows leave the flea calibration bucket and do not table-scan unless the user turns scan on.

**Non-Goals:**

- A second model call, a product catalog, or a new price source.
- Extending `isTemplate` so estate clothing tests start treating iPads as junk bags.
- Sending chat or storing a phone number from a solicitation.

## Decisions

### Electronics is its own show type

Add `electronics` to `ShowType` and `SHOW_TYPES` in `src/shared/showType.ts`. An electronics category (everyday electronics, laptops, phones, tablets, and the same words) outranks flea hits in the category tags. Flea wording still wins when the electronics words are only in the title of a garage sale. `scansByDefault` stays flea-only.

Alternative: keep these shows as flea and add a hint, the way estate did. That leaves the table scan on and mixes garage-sale hammers into the same calibration bucket as a MacBook. The category is stable enough to be its own type.

### Pull detection stays beside estate, and electronics wins the hint

New `src/shared/electronics.ts` decides the pass, pull bucket, tier, lot number, condition, MSRP label, rules, wants, and the run board. Do not widen `isTemplate`. "ELECTRONIC AS SHOWN" remains a template for the existing comp filter. "APPLE IPAD" and "Medium Pallet Pull (1-2LB)" are pull buckets only in the electronics helper, and `findComps` rejects those too.

When the electronics pass is on, `appraisalContext` adds the electronics hint and does not add `ESTATE_HINT`. The estate card stays hidden on that show so the user does not see a clothing line on a pallet pull. Shipping text reuses `shippingCallout` from `src/shared/estate.ts`.

Alternative: one shared "bucket listing" module for estate and electronics. The words differ (weight and clothing versus model and parts), and merging them would churn the estate tests that just landed.

### Specific versus generic is lexical

A listing is specific when the title has a model token, a storage size, or a year next to a product word. A brand plus a class ("APPLE IPAD", "Android Smartphone") with none of those is generic, whatever the quantity is. `scoreShop` skips pull buckets, generic classes, giveaways, and a buy-it-now whose title is a giveaway announcement or whose price is at least $10,000 with quantity of 20 or more (the $999,999 "giveaway now" row). A $1 auction stays a pre-bid. A specific title with quantity 26 is scored. Parts or untested, read from the subtitle, is not a steal or a deal against working comps.

`ShopListing` gains an optional subtitle. `src/shared/shop.ts` reads it from the listing node the shop query already returns.

### MSRP is stripped before the name is matched

Leading "$349 •", "($200 Retail)", and "N$ retail" come off the string passed to `findComps` and off the name sent as the item. The panel may show the figure as stated MSRP. It is not written into sold history as the price.

### Rules, pins, and wants are local and per show

Parse notes and the current subtitle once, the way `estateRules` does. Charger copy depends on the lot class: notes that exclude chargers for phones and tablets show that only on a phone or tablet lot; a laptop lot shows the opposite when the notes say so. Missing notes produce no invented rule. Sudden death is a label from the tags or notes.

Pins and wants follow the estate shapes (`pinFrom`, `wantFrom`) but store on electronics fields of the live session in `src/shared/live.ts`, cleared when the live path changes. A line that asks for a phone number or iMessage is not a want. A want highlights a later recognized name or a shop title. Nothing is sent.

The run board keeps twelve pull hammers. Giveaways and non-positive prices stay off.

### One appraisal call

`appraisalContext` appends a few sentences. No new request, no change to model order, no change to the timeout. The quick read renders from the listing before that call returns, in `src/content/overlay.ts` and `src/sidepanel/sections/live.ts`, fed by a content module next to `src/content/estate.ts`.

## Risks / Trade-offs

- [A long generic title looks specific and gets scored] → Require a model token, storage size, or year. "AI GLASSES W/ CAMERA" stays generic.
- [Past pallet shows were stored as flea, so they will not comp against new electronics shows] → `sameKind` already separates types. Leave old rows. New sales store `electronics`.
- [Archiving `estate-sale-shows` after this change could restore the older shop requirement] → This delta keeps the named-auction and template scenarios. If that change archives later, put those scenarios back before syncing.
- [$10,000 with quantity 20 is a heuristic for the joke row] → A real one-off above that price with low quantity still scores. The watched $999,999 row has quantity 999.
- [Host chat is noisy and a pin can be wrong] → A later appraisal for the same lot number replaces the pin. Emoji, joins, and greetings do not pin.

## Migration Plan

Bump `package.json` from 0.15.5 to 0.16.0 once. No stored-data migration. Rollback is reverting the branch. Ship on branch `everyday-electronics-shows` through a pull request into `main`, then `gh pr merge --admin`.

## Open Questions

None. The $10,000 joke-price cutoff is a design choice, not a spec change: the spec names the giveaway row, and the scenarios cover it.
