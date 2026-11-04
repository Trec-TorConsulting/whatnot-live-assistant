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
The system SHALL label a show as coins, cards, jewelry, collectibles, flea, or general from its title, category tags, and published show notes. Category matches SHALL outweigh title and note matches. Notes SHALL fill in the type when the title and tags match nothing. Flea-market wording, including in the notes, SHALL outweigh item words. The label SHALL be a hint for sold history, appraisal, and the flea table scan. It SHALL NOT choose a bid.

#### Scenario: No match
- **WHEN** the title and categories match none of the known wording and the notes do not either
- **THEN** the show type is general

#### Scenario: Notes name the items
- **WHEN** the title and categories match nothing and the notes name silver coins
- **THEN** the show type is coins

#### Scenario: Tags already decided
- **WHEN** the categories are sports cards and the notes mention silver coins
- **THEN** the show type stays cards

### Requirement: Share worker silence
A tab marked as the auto-share worker SHALL NOT forward live signals, refetch break data, or request prize values.

#### Scenario: Worker sees a win
- **WHEN** a sale matching the user happens in the share-worker tab
- **THEN** no win signal is sent from that tab

### Requirement: Shop buy-it-now scan
When a live show opens, the system SHALL read that show's shop and SHALL list buy-it-now items and named one-off auctions priced under melt, under watched sales, on the watchlist, or a known key date. A named one-off auction has a title that is not a template and a quantity under 20. A $1 auction price is the pre-bid opener and SHALL NOT be listed. Template auctions, giveaways, and other pre-bid listings SHALL be ignored. The scan SHALL NOT buy or place a bid.

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

#### Scenario: Copper Libertad
- **WHEN** a buy-it-now title names a Libertad as copper, cobre, bronze, or brass
- **THEN** it is not listed as under silver melt

#### Scenario: Category placeholder
- **WHEN** the shop has a template titled "*z - Category - Coins" at $1 with a quantity in the hundreds
- **THEN** that listing is not listed as a deal

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
