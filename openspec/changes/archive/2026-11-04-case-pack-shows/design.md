# Design

## Context

See proposal.md, "Why", for what the 11 shows showed. This section covers only the current code that shapes the approach.

- **Show type.** `detectShowType` in `src/shared/showType.ts` scores five keyword patterns. Category tags count double, and flea counts triple. The cards pattern includes `packs?`, so the tag "Case Packs & Bundles" (or the slug "case packs bundles") scores for cards on every show in this category. Ties go to the first pattern in list order, and cards comes before collectibles, which is why "Squishy Toys" never wins. The show type feeds the appraisal hint (`SHOW_TYPES[type].hint` in `appraisalContext`), `calibrationFor`, the sold-comp bucket (`sameKind` with `SPECIALTY` in `src/shared/soldHistory.ts`), the same-frame cache key in `src/background/appraisal.ts`, and `scansByDefault`.
- **Template lots and pins.** `src/shared/estate.ts` already handles template lots, lot numbers, weight tiers, `pinFrom`, `wantFrom`, and the run board. `noteChat` in `src/shared/live.ts` pins a host or mod line only when `isTemplate(lot.title)`. "Clothing Case Pack - Pink Tag #66", "$3.99 Shipping Cap #308", and "12/$12 SB" are not templates, so the "Hats- 10" line is dropped today.
- **Shipping.** `parseShipping` in `src/shared/costs.ts` reads the first `$` after "shipping". "Shipping is CA$18.50 (est. $13.26)" therefore comes out as 18.50. `allInPrice` adds nothing once any purchase exists for the live id. `src/content/bidGuard.ts` and `src/content/estate.ts` both compute `shippingPaid` that way.
- **Currency.** `moneyValue` in `src/shared/money.ts` and the shop's `money()` in `src/shared/shop.ts` divide `amount` by 100 and ignore `currency`. The shop query already requests `price { amount currency }`. Whatnot renders "CA$20 (est. $14.34)" in the shop rows and "(est. $13.26)" in the shipping line, inside `[data-testid="show-shipping-info"]`.
- **Valuation.** `computeValue` in `src/shared/appraisal.ts` multiplies the per-piece price by `quantity`, which comes from the model's answer. `quickRead` only counts `x10`, `10 pcs`, and `10 coins` on lines that contain a year or "oz".
- **Purchases.** `Purchase` in `src/shared/purchases.ts` has a `price` with no currency. Budgets and `summarizeSpend` add up `price`.

## Goals / Non-Goals

**Goals:**

- Every number on a case-pack show comes from the listing, the notes, chat, or Whatnot's own estimate, and shows before the appraisal returns.
- Fix the show type in one place, so that hints, calibration, comps, and the cache key all follow it.
- Never compare an amount in another currency as if it were US dollars.

**Non-Goals:**

- Widening `isTemplate`. Estate tests and comp filtering depend on its current meaning.
- A second model call, OCR of a scale or a tag, or a currency or retail API.
- Parsing every possible title. When the count is unclear, the system shows no per-piece figure rather than guessing.

## Decisions

### `wholesale` is a show type, and the category decides it

Add `wholesale` to `ShowType` and `SHOW_TYPES` with the label "Case packs & wholesale" and a hint of `null`. The case-pack hint lives in `casePack.ts`, so it can carry the stated count. Before scoring, `detectShowType` does two things:

1. A Case Packs & Bundles category returns `wholesale` immediately.
2. "case pack", "case packs", and "casepack" are removed from the text the cards pattern sees.

A wholesale pattern (`reseller bundles?`, `wholesale`, `case ?packs?`, `closeouts?`, `dozens?`, `\d+/\$\d+`, `bulk buys?`) is weighted above flea in tags, so a Wholesale/Lots tag outranks a Pallet Pulls tag on a show without the category. `scansByDefault` stays flea-only. Add `wholesale` to `SPECIALTY` in `soldHistory.ts`, so a squishy-pack sale never comps a card and the reverse.

Alternative considered: keep these shows as flea and add a hint, the way estate shows work. That turns the table scan on in warehouses full of boxes, mixes case-pack hammers into flea calibration, and still leaves the cards bug on shows without a pallet tag.

Coordination: three pending changes also edit `detectShowType`. The early return for the category stays first. An electronics category check, if it has landed, sits next to it. The order between the two category checks only matters for a show tagged with both, and no such show was observed.

### One local module for case-pack reading

New `src/shared/casePack.ts`, a pure module with no DOM access:

- `packCount(title, subtitle)`: the count words named in the spec. It rejects a number followed by foot, ounce, oz, lb, count, ct, scale, or a size, and a number after `#` or `$`. A "N piece set" or "Npc … Set" returns 1. It returns every count it finds, so the caller can show a conflict and use the lower one.
- `notesRatio(notes)`: reads "N/$P … unless stated otherwise", "sold by the dozen", and "sold per piece".
- `contentsLine(text)`: parses a host or mod line into a name and a count (`Hats- 10`, `SQUISHY CHUBBY BANANA X2`, `6/$12`).
- `isGenericCaseLot(title)`: true for a template (via `isTemplate`), or a title made only of tag, color, ratio, shipping-rule, start, "wholesale", "quality item", "random item", "pallet", "case", weight-tier, or "rewards bundle" words.
- `sizeRun`, `priceClaims` (MSRP, "N+ value", a leading `$N` before the product name, a flash strike price), `perPiece`, `landedPerPiece`, `breakEven(landed, feePercent, feeFixed)`, `perPieceShopRows`, and `buildCasePackView`.

`breakEven` is `(landed + feeFixed) / (1 − feePercent/100)`. That is the price at which `flipProfit` returns zero for one piece. It uses `DEFAULT_FEE_FIXED` and the user's `feePercent` from `src/shared/buyer.ts`.

Alternative considered: add these words to `estate.ts`. The two concerns differ: estate names a hidden item, while a case pack counts known pieces. Merging them would also churn the estate tests. `casePack.ts` imports `isTemplate`, `lotNumber`, `weightTier`, and `pinFrom` from `estate.ts` and reuses them.

### Session fields and the content module

`LiveSession` in `src/shared/live.ts` gains `casePins` (lot number → `{ text, name, count }`), `caseRuns` (newest 12), `currency` (`{ code, rate, basis }` or null), and `shippingRulesKey`. `noteChat` pins on a wholesale show when `isGenericCaseLot(lot.title)` and the author is a host or mod. The show type is passed into `ingest` the same way `currentShowType()` already reaches `soldFromSale`. `addSale` appends to `caseRuns` for a generic lot or a lot with a readable count. Giveaways and non-positive prices stay out. A new live id resets everything through `emptySession`.

New `src/content/casePack.ts` mirrors `src/content/estate.ts`. On `onLive` and on purchase changes, it reads the shipping text, the session, and purchases, then calls `overlay.setCasePack(view)`. On a wholesale show, the estate card is hidden, so a generic lot does not get both cards.

### Shipping rules extend `costs.ts`

Add `shippingRules(notes, title, hostLines)` to `src/shared/costs.ts`. It returns:

- `cap`
- `combinesShop`
- `separateTiers` (a list of tier words)
- `soloShip`
- `bundleLimitLb`
- `freight`: `{ rows: { zone, amount }[], liftgate: number | null, exempt: string[] }`

Freight rows come from shop listings whose titles match "<zone> time zone shipping" or "liftgate|residential", plus notes wording such as "not all the shipping". Shop listings are already parsed. `exempt` holds words like "coffin" from "coffin boxes … pay shipping … by what is on screen".

A new `shippingOwed({ rules, lotTitle, pageShipping, hasWinThisShow, browserZone })` returns `{ amount, reason, freight }`. `allInPrice` takes that result in place of the `shippingPaid` boolean. Both `bidGuard.ts` and `casePack.ts` call it, so the guard and the case-pack line can never disagree.

The browser zone comes from `Intl.DateTimeFormat().resolvedOptions().timeZone`. It maps to Eastern, Central, Mountain, or Pacific through a small table of IANA zones. Anything else gets the range.

Alternative considered: subtract the shipping already paid from the cap. A `Purchase` does not record the shipping paid, so the result would be a guess. Instead, the first win adds `min(pageShipping, cap)` and later wins add nothing, unless a tier, solo, or weight rule applies.

### Currency from Whatnot's own estimate

New `src/shared/currency.ts`:

- `readAmountText(s)` returns `{ amount, code, usd }`, for example from "CA$18.50 (est. $13.26)".
- `rateFrom(pairs)` uses the pair with the largest amount.
- `toUsd(amount, code, rate)` returns null when there is no rate.

`parseShipping` uses `readAmountText` and returns the `usd` value, plus a `tariffs` flag when "Tariffs" appears. The shop parser keeps `currency` on `ShopListing` and records each row's "est." pair when the row text carries one. `scoreShop` converts or skips. `moneyValue` call sites that feed the lot, sales, and purchases keep the code. `readCommerce` stores `currency` on `Lot` and `Sale` when the Money object carries one.

`Purchase` gains optional `currency` and `priceUsd`. `summarizeSpend`, budget spend, and the guard use `priceUsd ?? (currency ? null : price)` and count the nulls, so the Buys panel can say how many purchases were left out. Old purchases have no currency, so they read as US dollars, unchanged.

`soldFromSale` stores the USD figure and drops a foreign sale that has no rate. `formatMoney` already accepts a currency code, so CA$ renders without new formatting code.

Alternative considered: a free exchange-rate API. That adds a host, a timeout, and a privacy note. Whatnot already shows the estimate it will use, so this design reuses that figure.

### Appraisal context and count

`appraisalContext` in `src/shared/appraisal.ts` takes an optional `casePack` input: `{ lotNumber, count, countSource, pin }`. On a wholesale show:

- The case-pack hint replaces `SHOW_TYPES[type].hint` and `ESTATE_HINT`.
- A generic title is replaced by "Listing context: lot N, pack of C stated by <source>", plus the pin text.
- The coupon rule and the note cap are unchanged.

In `src/content/appraise.ts`, after the model returns, `reconcileCount(stated, modelQty)` picks the count passed to `computeValue` and `lotRollup`. If the stated count exists and the model returned 1, it uses the stated count. If the counts differ, it uses the lower one. If nothing is stated, it uses the model's count. It returns a label for `src/content/appraisalView.ts`, such as "12 stated" or "10 counted · 12 stated". The suggested max follows from `computeValue`, so it uses the same count.

### Comps

`findComps` in `src/shared/soldHistory.ts` adds `isGenericCaseLot(title)` to the existing `isTemplate` filter. It also rejects a pair whose `packCount` results disagree, or where exactly one side has a count above 1. The sale itself is still saved, as it is today for templates.

### Surfaces

- `src/content/overlay.ts`: a case-pack block next to the estate block, with the line, the conflict note, the size run, claims, break-even, the shipping-rule line, and the run board.
- `src/sidepanel/sections/live.ts` and `src/sidepanel/index.html`: the same fields, plus per-piece shop rows under the shop note.
- `src/sidepanel/sections/buys.ts`: currency on each row, and the "left out of totals" count.
- `src/content/selectors.ts`: `findShippingText` is unchanged. Shop-row text for "est." pairs comes from the parsed shop body, not the DOM.

## Risks / Trade-offs

- [A seller writes a count the parser does not know, such as "Monogram 16 International …"] → No per-piece figure is shown, because a missing number is better than a wrong one. A mod line or the notes can still supply the count. Tests pin the observed titles.
- [Treating "set" as one item drops a real pack, such as "12 gift sets"] → A count word ahead of "sets" ("12 gift sets", "lot of 6 sets") is still a pack. Only "N piece set" or "Npc … set" counts as one.
- [A mod line pinned to the wrong lot because the lot changed mid-message] → Pins key on the lot number at the moment the line arrives. A later lot never reads an earlier lot's pin.
- [The browser time zone is not where the pallet ships] → The line names the zone it used, and the range is one tap away in the rules line. The liftgate row is never added.
- [The rate comes from a rounded estimate (CA$3 → est. $2.15)] → The largest amount sets the rate. A shipping line or a $99 row gives about four significant digits.
- [Three other changes edit `detectShowType` and the shop scan] → This change edits only the Show type requirement and adds new requirements elsewhere. Tasks call out the rebase step.

## Migration Plan

- No storage migration. New session fields start empty. New `Purchase` fields are optional, and old rows read as US dollars.
- Calibration and comps for shows detected as cards before this change keep their history. New case-pack appraisals go to the wholesale bucket. Card calibration stops absorbing case-pack ratios from the next show onward.
- Rollback: revert the pull request. Stored purchases with `currency` still load, because the extra fields are ignored by older code.

## Open Questions

- Whether Whatnot's commerce `new_bid` Money objects carry `currency` on CAD shows, or only the listing nodes do. Either way, the rate comes from the page. If the bid has no code, the show-level currency from the listing nodes applies. This affects only where the code is read, not the behavior.
