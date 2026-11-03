# Design

## Context

See proposal.md for why. Today `detectShowType` already folds "estate sale" into flea, so the table scan defaults on and show notes already reach `appraisalContext`. `parseShopListings` keeps only buy-it-now. `findComps` matches on title tokens and would treat a reused "Junk bag" title as one item. Chat is already on the live session with `isHost` and `isModerator`. Shipping and "already paid this show" already exist in `parseShipping` and `allInPrice`.

The estate pass is a flag on top of that. It does not add a show type, a host, or a model call.

## Goals / Non-Goals

**Goals:**

- One pure module owns template detection, lot numbers, rules, wants, the shipping callout, and the run-board entry.
- The template line renders from the listing the session already has. The model is not on that path.
- Named one-off auctions join the existing shop score. Template auctions do not.
- Template sale titles stay stored and stop matching as comps.

**Non-Goals:**

- A new `ShowType`, a new calibration bucket, or a wheel-style prize pool.
- A clothing field on the appraisal schema. Brand, size, and flaw are read from text the listing, notes, or appraisal already returned.
- Replaying chat that arrived before this page load onto earlier lot numbers.

## Decisions

### One estate module, flea stays flea

`src/shared/estate.ts` exports the predicates and the small parsers. `detectShowType` is unchanged, so a show titled with both "estate sale" and "coins" stays flea and calibration stays with flea.

The pass is on when `isTemplate(lotTitle)` or the title, categories, or published notes match `estate sale` or `estate show`. "Estate Sales" as a category matches. A 1921 Morgan on a coin show does not.

Alternative: a new show type. Rejected because it would split flea comps and calibration for the same mixed lots.

### Template titles

`isTemplate` is true when the lowercased title contains `item on screen`, `random pull`, `random pulls`, `junk bag`, or `random beauties`; when the only product words left are a weight, a size, or a shipping word (oz, lb, small, medium, large, solo, fragile, ship); when it contains `category`; or when it contains `as shown` or `as seen` and has no brand-like token and no four-digit year. A four-digit year keeps "Better Homes & Gardens Cookbook 1953" named, and that year is not a lot number.

The lot number is the `#` plus digits token. The tier is the ounce or pound span in the title. Both are null when absent.

Alternative: treat quantity above 20 as a template by itself. Rejected because a named listing can be quantity 1 in the shop and the same words can be a template on the live lot. Quantity is only the shop gate below.

### Session fields, snapshotted at the sale

The live session gains:

- `estatePins`: lot number to recognized name
- `estateWants`: up to 20 want strings, newest kept
- `estateRuns`: up to 12 `{ number, name, price }` entries, newest first
- `estateRulesKey`: the rule set already shown

These die with the session when the path is no longer that live show. Nothing new is written to `chrome.storage`.

A host or mod line is pinned only when it arrives, and only onto the template lot that is active then. "Ty!", a join, and an emoji-only line do not pin. An appraisal name for that same lot number replaces the pin. When a template sale is recorded, the current pin for its number is copied onto the run entry. The next lot cannot rewrite a hammer that already happened.

Wants come from buyer lines with "any", "run", or "please", or from an item question of one to four words. Lines about shipping, sound, or the seller ("are you tall", "bulk ship", "no sound") are dropped. A want matches when its longest word of four or more letters appears in the recognized name, case-insensitive, with one trailing "s" ignored so "pixies" matches "pixie". A match highlights on the two surfaces. It does not write the watchlist and it does not send chat.

Alternative: replay the whole chat log whenever the lot changes. Rejected because the session does not store which lot was active for each old line.

### Shop keeps a named auction

`ShopListing` gains `mode: 'bin' | 'auction'`. `parseShopListings` still drops giveaways, sold listings, and listings with no title or price. An auction is kept. `isPreBid: true` no longer drops a listing by itself. `scoreShop` then drops templates and anything with quantity 20 or more, and scores what remains with the current melt, comps, watchlist, and key-date rules. A hit from an auction is labeled Auction on the row so it is not read as buy-it-now. The summary says "shop" once an auction is in the set. Template titles such as `*z - Category - Coins` never become hits.

Alternative: fetch a second shop query. Rejected. The payload already has these listings. The current parser throws them away.

### Comps ignore template titles

`findComps` rejects a saved sale whose title `isTemplate` before the token overlap. The sale stays in sold history so a later run board, or a seller comparison that does not go through comps, can still see the hammer. "Junk bag" at $3 and "Junk bag" at $50 do not move market value.

### Appraisal prompt, same cache, same call

`appraisalContext` takes the template summary when there is one. It does not send the template title as "Current lot title". It sends the lot number and tier as listing context, plus a fixed hint: the title is a shipping bucket, the image decides the item, read maker marks, pattern names, clothing brand, size, and flaws, and hallmarks. Coupon stripping is unchanged. The hint is on the request that already runs. The frame cache key stays show type plus image, so the hint does not cause a second model call.

The flea table scan still runs after the answer and still does not change the max bid. Its "being sold now" line uses the appraisal name once that exists. Before that it says the piece closest to the camera, not "Item on screen".

### Template line and shipping callout

The Live panel and the on-page assistant render the lot number, tier, start price, and shipping from the lot and the shipping line already on the page. No model. The shipping callout uses the current bid, or the start when there is no bid, and the same "paid win in this show" fact the all-in line uses. It shows when shipping is at least half that price and this show has no paid win yet. The existing all-in line stays. The callout does not hold a click.

### Rules and clothing, from text already in hand

Rules are four flags parsed from the published note and the active lot title: no returns (`no return`, `no refund`), as-is (`as is`, `as-is`, `as seen`), clean before wearing (`not washed`, `not laundered`, `clean before`), and solo or fragile ship. The chip renders while the pass is on and any flag is set. `estateRulesKey` stops a second chip when the next lot has the same flags. Coupon text is not a rule.

Clothing is detected from garment words in the appraisal name or the listing (jacket, blouse, coat, dress, jeans, sweater, shirt, and the same kind of word). Size is a "size" plus a token, or a Chico's size digit, only when that text is present. A flaw or care line is shown only when the listing, the notes, or the appraisal notes already say it (pilling, stain, hole, not washed, clean before wearing). No measurement is invented, and the appraisal schema does not grow a clothing object.

### Time to answer

The template line, the shipping callout, wants, rules, and the run board are local reads of the session and the page. They add no network and no model call. The estate hint adds a short paragraph to the appraisal prompt that already runs, and it does not change the cache key. Shop scoring walks listings the shop fetch already returned. Accuracy moves the other way: a template title no longer names the item, and a reused template hammer no longer sets a comp.

## Risks / Trade-offs

- [A grab-bag title we did not see slips through as named] → The shop still requires quantity under 20, and the scenarios lock the titles from the 3 Nov 2026 shows. New filler words belong in `isTemplate` with a test, not a new spec, as long as those scenarios hold.
- [A host line is small talk and gets pinned] → Only host and mod lines pin, and greetings, joins, thanks, and emoji-only lines do not. A later appraisal replaces the pin.
- ["pixies" versus "pixie"] → One trailing s is ignored. Other stem changes will miss, and the want stays on the list until the show changes.
- [Chat from before the extension attached has no lot number] → Those lines are not pinned. The run board still shows the number and the hammer.
- [Frame cache can reuse an identification made without the estate hint] → Accepted. The cache key stays show type plus image so a repeat frame does not call the model again. The image still decides the item.
- [Named auctions increase shop hits] → Capped by the existing hit limit. Templates and quantity of 20 or more never enter.

## Migration Plan

Bump `package.json` from 0.14.0 to 0.15.0 once. The manifest and the userscript take that version at build. No stored data is rewritten. Junk-bag sales already saved stay saved and stop matching as comps. Rollback is reverting the commit. The ship chain is the branch `estate-sale-shows`, a pull request into `main`, and `gh pr merge --admin`.

## Open Questions

None. Phrase lists can grow inside `estate.ts` without a spec change while the scenarios stay true.
