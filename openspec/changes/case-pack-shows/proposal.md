# Proposal

## Why

Case Packs & Bundles shows sell several pieces for one price, and the number that matters to a reseller is the cost per piece after shipping. The assistant cannot see that number, and it labels most of these shows as card shows. On 4 Nov 2026, 21 shows were live in that category. Eleven of them were reviewed: vikolino, fashionten, catchndealzwholesale, thebinbarn, findsteals, insanedealsusa, closeout_expo, thriftaddict07, rsnj, goldenglam, and twsd. Run against the titles and tags of 14 of those 21 shows, `detectShowType` returns cards for 12 of them. That happens because "Case Packs" matches the card word `packs?`. The other two came back as jewelry (a "Fashion Jewelry" tag) and flea (a "Pallet Pulls" tag). As a result, the card hint goes into every appraisal on these shows, case-pack hammers are saved as card sales, and calibration for real card shows absorbs case-pack ratios.

What the shows actually do:

- **The piece count is in a title, a subtitle, the notes, or a mod line.** Examples: "12/$12 SB" (12 pieces for $12, unless the host says 4/$12 or 24/$24), "CASEPACK 6PCS … Includes 2S, 2M, 2L", "12 pairs Christmas socks", "Joggers Casepack size LARGE (12 pairs)". On generic lots ("Clothing Case Pack - Pink Tag #66", "$3.99 Shipping Cap #308"), a mod types the contents: "Hats- 10", "SQUISHY CHUBBY BANANA X2". That hat pack sold for $21 with $7.75 shipping, which is $2.88 per hat landed. Nothing on screen says that.
- **Shipping rules decide the real cost.** Examples: a cap per show ("pay up to $7.75", "Max bundled shipping $9.99 … shop and live purchases will be combined"), tiers that do not bundle ("Small, medium, and large do not bundle shipping"), and bundling only up to 5 lb. A pallet hammered at $540 showed "Shipping is $4.47". Its notes and shop add freight of $246 to $460 by time zone, plus $200 for a liftgate. The assistant treats any earlier win in the show as shipping already paid.
- **Counts conflict, and sets are not packs.** A thebinbarn lot was titled "20 PIECES" while its description said "25 brand-new pieces". "Bee Venom Gift Set — 4 piece set" and "Toddler 4pc … Pajama Set" are one item each. "Grinch 40 ounce" and "4-Foot Inflatable Santa" contain no piece count.
- **Price claims are not sales.** Examples: "$79 msrp", "$100+ MSRP Value", "HD Drone $299 MSRP", and a flash sale reading "$50 → $9, 82% Off" with a 38-second timer.
- **Some shows are not in US dollars.** twsd prices in CAD. Whatnot shows "CA$20 (est. $14.34)" and "Shipping is CA$18.50 (est. $13.26) + Taxes + Tariffs". `parseShipping` reads 18.50. Shop scoring, the commerce bid, sold history, and the bid guard all treat CAD amounts as US dollars.

## What Changes

- Add a `wholesale` show type, labeled "Case packs & wholesale". A Case Packs & Bundles category decides the type. A Reseller Bundles or Wholesale/Lots tag, or case-pack wording in the title or notes, also counts. Inside the phrase "case pack", "pack" is no longer a card word. "Pokémon packs" stays cards. Fashion Jewelry, Squishy Toys, and Pallet Pulls tags on a Case Packs show do not change the type. The table scan stays off by default.
- Show a case-pack line before any model call: lot number, piece count with where it came from, size run, price per piece at the current bid or start, and landed cost per piece (bid plus unpaid shipping plus tax, divided by the count). A weight-tier box shows price per pound instead. With no readable count, there is no per-piece figure.
- Read the count from, in priority order: a host or mod line for the current lot, then the lot title and subtitle, then the seller's default ratio in the notes ("12/$12 unless stated otherwise", "sold by the dozen", "sold per piece"). A set counts as one item. When the title and the description disagree, show both counts and use the lower one.
- Pin a host or mod contents line ("Hats- 10", "JUMBO SQUISHY X1") to the current generic lot. Keep a board of the show's recent case-pack hammers with name, count, price, and price per piece.
- Show per-piece break-even resale using the user's fee setting. When an appraisal has a per-piece estimate, also show margin per piece and for the whole pack.
- List the shop's buy-it-now case packs by price per piece, cheapest first. They are labeled as per-piece prices, not as deals.
- Label MSRP figures, "$N+ value" claims, and a flash sale's struck-through price as the seller's claim. None of them is a market value.
- Read shipping rules from the notes, the title, and host or mod lines: a cap per show, combined live-and-shop shipping, tiers that do not bundle, solo-ship, and a bundle weight limit. Pallet freight and liftgate rows in the notes or the shop get added on top of the on-screen shipping. The all-in stops saying "shipping already paid" when the rules say otherwise.
- Read amounts in another currency. The rate comes from Whatnot's own "est. $" figures on the page, so no new host is needed. Bids, shipping, shop prices, sold comps, budgets, and the guard compare US dollars. With no rate, they say the amount is not converted and make no comparison. The all-in says tariffs are not included.
- On a wholesale show, the appraisal gets a case-pack hint and the stated count. A generic case-pack title is not the item name. When the model counted one piece and the listing states 12, the value is the per-piece estimate times 12, labeled as the stated count.
- Generic case-pack titles are not Whatnot comps. Neither is a pack sale for a single piece, or a pack of a different count.
- **BREAKING** for show type: a Case Packs & Bundles show is `wholesale`, not cards, jewelry, collectibles, or flea. From then on, its appraisals and sales use the wholesale calibration and comp bucket.
- **BREAKING** for all-in and guard math on a show priced in another currency: amounts are converted or marked unconverted. They are no longer read as US dollars.

## Capabilities

### New Capabilities

- `case-pack-shows`: Piece count and its source, unit and landed cost per piece, size run, weight tiers, the seller's default ratio, sets versus packs, conflicting counts, host and mod contents lines, the per-piece run board, break-even resale, per-piece shop rows, and seller price claims.
- `shipping-costs`: Shipping rules read from notes, the title, and host or mod lines (cap, combined shop shipping, tiers that do not bundle, solo-ship, weight limit), pallet freight and liftgate add-ons, and when the all-in may treat shipping as paid.
- `listing-currency`: Recognizing a non-USD amount, getting the rate from Whatnot's own estimate, and converting or refusing to compare bids, shipping, shop prices, comps, budgets, and recorded wins.

### Modified Capabilities

- `live-show`: Show type gains `wholesale`. Inside "case pack", "pack" is not a card word.
- `appraisal`: Adds the case-pack hint, the stated count passed with the request, and the rule for reconciling the stated count with the model's count.
- `reference-prices`: Adds that generic case-pack titles and pack sales of a different count are not comps.

## Impact

- New `src/shared/casePack.ts` (count, unit math, notes ratio, contents lines, run board, claims, break-even, shop rows) and `src/shared/currency.ts` (currency text, rate from "est. $" pairs). Shipping rules extend `src/shared/costs.ts`.
- `src/shared/showType.ts`, `src/shared/appraisal.ts`, `src/shared/soldHistory.ts`, `src/shared/shop.ts`, `src/shared/live.ts`, `src/shared/purchases.ts`, `src/shared/money.ts`, `src/content/bidGuard.ts`, `src/content/live.ts`, a new `src/content/casePack.ts`, `src/content/overlay.ts`, `src/content/selectors.ts`, and `src/sidepanel/sections/live.ts`.
- No new host, no extra model call, and no change to model order or timeouts. The case-pack line, shipping rules, and currency math are local, and they show before the appraisal returns. That shortens time-to-answer for the number that matters on these shows. The appraisal request gains a few sentences. Accuracy improves in four ways: these shows stop using the card hint and card calibration, the value multiplies by a stated count instead of the model's guess at a bag of keychains, CAD is no longer read as USD, and pallet freight is no longer hidden.
- Version: a minor bump, because this is a requested feature. It is 0.16.0 if this change lands before `everyday-electronics-shows` and `flea-runner-shows`, which both plan 0.16.0. Otherwise it is the next minor version not yet used on main. The manifest and userscript pick that up from the build.
- Branch `case-pack-shows`, opened as a pull request into `main`, then merged with `gh pr merge --admin`.
- `live-show` "Show type" is also rewritten by `everyday-electronics-shows`, `parent-electronics`, and `electronics-and-tools-shows`. Whichever lands second keeps both clauses and all scenarios. An electronics category still outranks a Wholesale/Lots tag, and a Case Packs & Bundles category outranks a Pallet Pulls tag.

## Out of scope

- Bidding, buying a buy-it-now or a freight row, sending chat, typing "bundle", entering giveaways, sponsoring a gift card, or claiming a coupon or a Whatnot reward.
- The iPhone userscript.
- A wholesale price catalog, a retail or eBay lookup, or a currency API. Value still comes from a watched sale, melt, or a labeled estimate. The rate comes only from Whatnot's own estimate.
- Tariff or duty amounts. They are named as not included, not computed.
- Reading a piece count or a weight from the scale or the box in the image, or from a viewer's chat line.
- Sudden-death labels and MSRP handling on electronics shows, which belong to `everyday-electronics-shows`. Runner price ladders, which belong to `flea-runner-shows`.
- Rewards-bundle bookkeeping, swap requests, and abandoned-bundle warnings.
- Changing keyword alerts or the watchlist ceiling.
