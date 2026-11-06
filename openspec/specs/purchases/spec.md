# Purchases and orders

## Purpose
Buys records what the user paid, what an appraisal said an item was worth, and Whatnot orders seen on screen. Recording a purchase does not place a bid.

## Requirements

### Requirement: Record a win
A live sale whose buyer matches the saved username SHALL be stored unless that purchase key already exists. The key SHALL be the live id, the product id or title, and the price. Giveaways MAY be stored and SHALL be excluded from the seller's win history on the Live panel. Spend totals SHALL include stored prices. The list SHALL drop the oldest past the cap. A recent matching appraisal MAY be attached.

#### Scenario: Duplicate win
- **WHEN** the same sale key arrives again
- **THEN** a second purchase is not stored

### Requirement: Manual add and delete
A manual purchase SHALL require a title and a price of at least zero. Duplicates SHALL be rejected. Delete SHALL remove the purchase and its photo after the user confirms. CSV export SHALL include date, title, price, kind, show, host, appraised value, and melt value.

#### Scenario: Blank title
- **WHEN** the user adds a purchase with a blank title or a negative price
- **THEN** it is not saved

### Requirement: Portfolio and flip math
Portfolio value SHALL be the higher of the stored appraisal and the metal value at the current spot, or the stored melt when spot is missing. Items with neither SHALL be counted and left out of the gain. The flip line SHALL apply the configured seller fee when resale is positive, and SHALL show fees, net, profit, and margin when both resale and cost are set.

#### Scenario: No worth
- **WHEN** an item has no appraisal and no metal value
- **THEN** it is excluded from the valued portfolio total

### Requirement: Orders
Order cards scanned on screen SHALL be merged into saved orders. The panel SHALL list recent orders and open an order from its id. Late undelivered orders SHALL notify at most once a week. The order list SHALL be separate from the live-show revenue count and from the purchase ledger.

#### Scenario: Open purchases
- **WHEN** the user opens Purchases from the panel
- **THEN** Whatnot's purchases activity page is opened

### Requirement: Collection and timing notes
Collection status SHALL say whether the user already has the item, needs it, or owns similar ones. It SHALL NOT change the appraisal value. Best time to buy SHALL use sold history and the watchlist, and SHALL stay quiet until there are enough matching sales.

#### Scenario: Already in the set
- **WHEN** the appraised item matches something in the collection
- **THEN** the panel says so and the market value is unchanged

### Requirement: Shop collection and set-builder matching
The shop scan SHALL check each candidate listing against the user's saved collection, active set ranges (`compareToCollection`), and recorded purchase titles. A non-overpriced listing that fills a missing date or mint in an active set SHALL be listed as at least a `must` hit with `Needed for your set: …`. A shop hit that matches an already-owned item or date in the set SHALL append `Already in your set: …` or `You own N like this` to its reason.

#### Scenario: Missing date in a saved Morgan set
- **WHEN** the user's set list has `morgan dollar 1878-1921`, the user does not own an 1895-O, and the shop has a non-overpriced "1895-O Morgan Dollar" buy-it-now
- **THEN** the listing is surfaced in the shop hits with `Needed for your set: morgan dollar 1878-1921`

#### Scenario: Duplicate of an owned item
- **WHEN** a shop steal matches two items already in the user's collection or purchases
- **THEN** the hit remains a steal and its reason includes `You own 2 like this`
