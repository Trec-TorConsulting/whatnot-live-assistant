# Live show

## Purpose
The Live panel shows the show the user already has open: title, lot, viewers, revenue, orders, giveaways, and top buyers, from Whatnot's live feed. It records what happened. It does not bid, send chat, or enter giveaways.

## Requirements

### Requirement: Session lifetime
The content script SHALL keep one in-memory session for the live id in the page path, and SHALL clear it when the path is no longer a live show. Phoenix frames that are not useful auction or live events SHALL be ignored. The background SHALL store a snapshot of the sending tab's session.

#### Scenario: Leave the live path
- **WHEN** the page path no longer identifies a live show
- **THEN** the in-memory session is cleared

### Requirement: Current lot
The system SHALL track the active auction's bid, next bid, leader, end time, and status from commerce events. A new auction_started SHALL replace the lot and SHALL NOT keep the previous bid, leader, or bid count. nextBid SHALL come from the live next-bid fields, not from a listing's auction minimum.

#### Scenario: Listing minimum after a live bid
- **WHEN** a later update has a null next bid and a one-dollar auction minimum
- **THEN** the previously read live next bid is kept

### Requirement: Sales summary
Giveaway sales SHALL count as giveaways and SHALL NOT add to revenue, order count, or a buyer's spend. Every other sale SHALL count as one order. The panel SHALL list at most five buyers, by spend then by order count. These figures SHALL describe the show feed, not the user's personal purchase ledger.

#### Scenario: Mixed sales
- **WHEN** the session has paid sales and one giveaway
- **THEN** revenue and order count exclude the giveaway

### Requirement: Giveaway already running
The first livestream update SHALL be a baseline. A giveaway already active in that first update SHALL NOT raise a giveaway-started signal. A later change of the active giveaway id SHALL.

#### Scenario: Join mid-giveaway
- **WHEN** the first show update already has an active giveaway
- **THEN** no giveaway-started alert is emitted for that id

### Requirement: Show type
The system SHALL label a show as coins, cards, jewelry, collectibles, flea, electronics, tools, wholesale, or general from its title, category tags, and published show notes. Category matches SHALL outweigh title and note matches. Notes SHALL fill in the type when the title and tags match nothing. Flea-market wording, including in the notes, SHALL outweigh item words. Electronics and tools tags SHALL outrank flea. A Case Packs & Bundles category SHALL make the show wholesale, whatever its other tags say. Reseller Bundles and Wholesale/Lots tags SHALL outweigh flea and item words in the tags. Inside "case pack", the word "pack" SHALL NOT count as a card word. The label SHALL be a hint for sold history, appraisal, and the flea table scan. It SHALL NOT choose a bid.

#### Scenario: No match
- **WHEN** the title and categories match none of the known wording and the notes do not either
- **THEN** the show type is general

#### Scenario: Notes name the items
- **WHEN** the title and categories match nothing and the notes name silver coins
- **THEN** the show type is coins

#### Scenario: Tags already decided
- **WHEN** the categories are sports cards and the notes mention silver coins
- **THEN** the show type stays cards

#### Scenario: Electronics category with a pallet tag
- **WHEN** the categories include Everyday Electronics and Pallet Pulls
- **THEN** the show type is electronics

#### Scenario: Laptops category
- **WHEN** the categories include Laptops, Phones & Tablets
- **THEN** the show type is electronics

#### Scenario: Garage sale stays flea
- **WHEN** the title is a garage sale that mentions a laptop and the categories are not an electronics category
- **THEN** the show type is flea

#### Scenario: Tools with a pallet tag
- **WHEN** the categories are Tools, Pallet Pulls, and Ryobi Tools
- **THEN** the show type is tools

#### Scenario: Milwaukee tag
- **WHEN** the categories are Tools, DIY, and Milwaukee Tools
- **THEN** the show type is tools

#### Scenario: Case pack is not a card pack
- **WHEN** the categories are Case Packs & Bundles, Reseller Bundles, Wholesale/Lots, and Squishy Toys, and the title is "12/$12 SB Casepack:Novelties,Keychains,Jewelry,Accessories"
- **THEN** the show type is wholesale

#### Scenario: Fashion jewelry dozens
- **WHEN** the categories are Case Packs & Bundles, Reseller Bundles, Wholesale/Lots, and Fashion Jewelry, and the title advertises 12/$12 earrings and necklaces
- **THEN** the show type is wholesale, not jewelry

#### Scenario: Warehouse pallet pulls
- **WHEN** the categories are Case Packs & Bundles, Reseller Bundles, Wholesale/Lots, and Pallet Pulls
- **THEN** the show type is wholesale, not flea

#### Scenario: Card packs stay cards
- **WHEN** the title is "Pokemon packs" and the categories name no wholesale or case-pack tag
- **THEN** the show type is cards

#### Scenario: Wholesale does not scan by default
- **WHEN** the show type is wholesale and the user has not turned scan on
- **THEN** no flea table scan is requested

### Requirement: Share worker silence
A tab marked as the auto-share worker SHALL NOT forward live signals, refetch break data, or request prize values.

#### Scenario: Worker sees a win
- **WHEN** a sale matching the user happens in the share-worker tab
- **THEN** no win signal is sent from that tab

### Requirement: Shop buy-it-now scan
When a live show opens, the system SHALL read that show's shop and SHALL list buy-it-now items and named one-off auctions priced under melt, under watched sales, on the watchlist, or a known key, semi-key, or variety date. When local AI is available, a background pass SHALL add a conservative `AI est.` range and collector note to unpriced hits and list items priced at or below 60 percent of the local AI low estimate as a deal. Openers, templates, pull buckets, generic device classes, giveaways, joke rows, and parts rows SHALL NOT be listed, and the scan SHALL NOT buy or bid.

#### Scenario: Pre-bid next to a cheap buy-it-now
- **WHEN** the shop has a template auction that can be pre-bid and a buy-it-now coin priced under melt
- **THEN** only the buy-it-now coin is listed

#### Scenario: Dollar pre-bid next to a cheap buy-it-now
- **WHEN** the shop has a named auction at the $1 pre-bid start and a buy-it-now coin of the same kind priced under melt
- **THEN** only the buy-it-now coin is listed

#### Scenario: Named auction next to a template
- **WHEN** the shop has a template auction, a named one-off auction priced under its watched sales, and a buy-it-now coin priced under melt
- **THEN** the named auction and the buy-it-now coin are listed and the template auction is not

#### Scenario: Nothing under market
- **WHEN** every buy-it-now price and every named one-off auction price is at or above melt and the watched sale median, and none match the watchlist or a key date
- **THEN** the shop note says there are no deals

#### Scenario: Fractional ounce
- **WHEN** a buy-it-now title says 1/1000 oz gold and the price is above that fraction of spot
- **THEN** it is not listed as under melt

#### Scenario: Ordinal fractional gold eagle above fractional melt
- **WHEN** a buy-it-now title says "1/10th oz gold eagle ms70 2022" at $525 and gold spot is $4,130 ($413 melt)
- **THEN** it is not listed as a steal under melt

#### Scenario: Copper Libertad
- **WHEN** a buy-it-now title names a Libertad as copper, cobre, bronze, or brass
- **THEN** it is not listed as under silver melt

#### Scenario: Category placeholder
- **WHEN** the shop has a template titled "*z - Category - Coins" at $1 with a quantity in the hundreds
- **THEN** that listing is not listed as a deal

#### Scenario: Stocked model
- **WHEN** the shop has an "XGIMI MoGo Pro+" buy-it-now with quantity 26 priced under its watched sales
- **THEN** that listing is listed

#### Scenario: Generic device class
- **WHEN** the shop has an "APPLE IPAD" auction with quantity in the hundreds
- **THEN** that listing is not listed as a deal

#### Scenario: Joke giveaway price
- **WHEN** the shop has a buy-it-now titled as a giveaway and priced at $999,999
- **THEN** that listing is not listed as a deal

#### Scenario: Parts row
- **WHEN** a shop row is subtitled for parts or untested and working sales of a similar device are higher
- **THEN** it is not listed as a steal or a deal

#### Scenario: Two dollar opener
- **WHEN** 23 of the shop's 24 auctions start at $2
- **THEN** a $2 auction is not listed as a deal for that price

#### Scenario: Real start above the opener
- **WHEN** a tools shop auction for "2457-21 M12 Ratchet Kit" starts at $169 and two watched sales of 2457-21 are higher
- **THEN** that auction can be listed

#### Scenario: Zero-quantity listing is ignored
- **WHEN** a buy-it-now node has quantity or inventory equal to 0
- **THEN** it is not included in the parsed shop listings or scored as a hit

#### Scenario: Local AI enriches key date and finds underpriced deal
- **WHEN** the shop has an unpriced key-date coin and a specific collectible priced at no more than 60 percent of the local AI low estimate
- **THEN** the background local AI pass adds the `AI est.` range and collector info to the key-date hit and lists the underpriced item as a deal

### Requirement: Show notes
The system SHALL read the seller's published show notes for the open show and SHALL read a later edit. The Live panel SHALL show the note and any coupon code in it. A code SHALL NOT be claimed. The note text SHALL be included in appraisal and wheel prompts. Lines of the form "2x 2024 1oz silver" in the notes SHALL price numbered wheel hits when the break description has no such list or was cut off. An unpublished note SHALL be ignored.

#### Scenario: Coupon in the notes
- **WHEN** the published note contains "/coupon SAVE10"
- **THEN** the Live panel shows SAVE10 and the extension does not claim it

#### Scenario: Note removed
- **WHEN** a later show-notes response has no published note
- **THEN** the stored note is cleared

### Requirement: Seller note on the live show
The Live panel SHALL show the current host's saved profile numbers, the user's private note, and a one-time warning when that seller is blocked. Profile numbers SHALL be fetched at most about once a day and SHALL NOT be the bulk-follow target by themselves.

#### Scenario: Host changes during fetch
- **WHEN** the host changes before a profile fetch returns
- **THEN** the late result is not applied to the new host

### Requirement: Must-have market price
Every must-have in the shop check SHALL lead with its current market price: a PCGS auction median or guide, a card or record reference price, a local AI estimate, or the median of two or more watched sales. When none is known it SHALL say `Market: no price yet` until a lookup finds one. Steals and deals SHALL NOT show the placeholder.

#### Scenario: Key date with no sales
- **WHEN** a buy-it-now key date has no watched sales, no melt, and no reference price
- **THEN** it is listed as a must-have whose note starts with `Market: no price yet`

#### Scenario: Key date with watched sales
- **WHEN** a buy-it-now key date at $48 has two watched sales at $50 and $60
- **THEN** it is listed as a must-have whose note starts with `Market $55 (median of 2 sales)`

#### Scenario: PCGS price arrives
- **WHEN** a must-have says `Market: no price yet` and the PCGS lookup returns `Guide $110 (PCGS G-4)`
- **THEN** the note starts with `Guide $110 (PCGS G-4)` and no longer says `no price yet`

#### Scenario: Local AI estimate arrives
- **WHEN** a must-have says `Market: no price yet` and local AI estimates $220 to $350
- **THEN** the note starts with `AI est. $220–$350` and no longer says `no price yet`

#### Scenario: PSA check without a price
- **WHEN** a must-have's only reference result is a PSA cert verification
- **THEN** the note still starts with `Market: no price yet`

#### Scenario: Steal
- **WHEN** a buy-it-now is listed as a steal under melt
- **THEN** its note does not say `Market: no price yet`

### Requirement: Melt is not a market price
On a must-have, melt SHALL be shown as a floor after the market line and SHALL NOT replace it. Must-haves without a market price SHALL be looked up at PCGS, reference sources, and local AI before other shop rows.

#### Scenario: Silver key date with melt only
- **WHEN** a silver key date is priced above melt and has no watched sales
- **THEN** its note starts with `Market: no price yet` and then shows `Melt $X`, and it is sent to the price lookups ahead of rows that already have a market price

### Requirement: Live shop sync and rescan
When a shop GraphQL response arrives again or the user clicks Rescan, the system SHALL update existing listings by id, apply any changed price or quantity, and remove listings whose status is sold or whose quantity is zero. When a paid sale event arrives on the live socket matching a shop listing by id or buy-it-now title, the system SHALL decrement that listing's quantity or remove it when none remain.

#### Scenario: Price drop on re-read
- **WHEN** an active buy-it-now listing's price drops from $40 to $18 on a later shop read below $30 melt
- **THEN** the updated price replaces the old entry and the item is scored as a steal at $18

#### Scenario: Live sale exhausts buy-it-now stock
- **WHEN** a buy-it-now steal has quantity 1 and a paid sale for that listing arrives on the live socket
- **THEN** the listing is removed from the shop hits immediately

#### Scenario: Manual rescan
- **WHEN** the user triggers Rescan on the overlay or sidepanel
- **THEN** the content script requests a fresh shop fetch from the first page

### Requirement: Shop subtitle and spec enrichment
The shop scan SHALL read a listing's subtitle alongside its title for melt weight and purity, watchlist matching, sold comps, key-date callouts, device specs, tool platform and part numbers, missing-charger warnings, and buyer chat-want matches.

#### Scenario: Metal weight in subtitle
- **WHEN** a buy-it-now row is titled "Vintage Ring #14" with subtitle "14K Gold 5.2 grams" at $100 and gold melt is $250
- **THEN** `shopMelt` reads the subtitle weight and scores the ring as a steal under melt

#### Scenario: Tool specs and chat want on a shop hit
- **WHEN** a buyer asked "2457-21?" in chat and a shop deal is titled "2457-21 M12 Ratchet Kit"
- **THEN** the hit reason includes the tool quick read and notes that it matches a chat want

### Requirement: Shop hit controls and scarcity badges
The overlay and sidepanel SHALL show remaining stock on buy-it-now hits (`1 left` or `N in stock`), allow dismissing individual hits (`×`) for the current show to reveal the next ranked hit from the scored pool, and provide `BIN only`, `Wishlist`, and `All` filter toggles to focus on specific hit categories.

#### Scenario: Dismissing a hit reveals the ninth hit
- **WHEN** nine shop hits are scored and the user dismisses one of the top eight
- **THEN** the dismissed hit is hidden for that show and the ninth hit appears in the list

#### Scenario: Filter to buy-it-now only
- **WHEN** the shop has both buy-it-now and auction hits and the user selects `BIN only`
- **THEN** only buy-it-now hits are displayed

#### Scenario: Filter to wishlist items only
- **WHEN** the shop contains both general deals and wishlist matches and the user selects `Wishlist`
- **THEN** only hits matching the user's wishlist are displayed in the shop list

### Requirement: Table scan action and overlay card
The live show overlay and sidepanel SHALL provide a "Scan Table" button and keyboard shortcut (Alt+Shift+T). When triggered, the assistant SHALL capture the current video frame, initiate a table scan appraisal, and display the ranked picks, spatial locations, and any warnings in a dedicated on-screen card.

#### Scenario: User clicks Scan Table in overlay
- **WHEN** the user clicks the "Scan Table" button on the in-stream assistant overlay
- **THEN** the extension captures the video frame, queries the appraisal model, and displays the table scan card with top picks and locations

#### Scenario: User presses Alt+Shift+T shortcut
- **WHEN** the user presses Alt+Shift+T on an active Whatnot show
- **THEN** the extension executes the table scan action and presents the resulting picks card

### Requirement: Shop listing inline appraisal controls
The shop view in both the in-stream overlay and sidepanel SHALL render an "Appraise" action button on each displayed Buy-It-Now listing row. When clicked, the row SHALL transition through a loading state to display the appraised market value, spread indicator, and pricing source badge directly within the listing row.

#### Scenario: Shop row renders appraisal button
- **WHEN** the user views the shop list in the sidepanel or overlay
- **THEN** every Buy-It-Now row includes an "Appraise" button alongside the existing "Find" action

#### Scenario: Appraised result rendered in shop row
- **WHEN** appraisal completes for a listing in the sidepanel shop hits
- **THEN** the row displays the appraised market price, margin delta, and provider source badge
