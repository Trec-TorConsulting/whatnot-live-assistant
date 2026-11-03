# Spec Delta

## MODIFIED Requirements

### Requirement: Shop buy-it-now scan
When a live show opens, the system SHALL read that show's shop and SHALL list buy-it-now items and named one-off auctions priced under melt, under watched sales, on the watchlist, or a known key date. A named one-off auction has a title that is not a template and a quantity under 20. Template auctions, giveaways, and other pre-bid listings SHALL be ignored. The scan SHALL NOT buy or place a bid.

#### Scenario: Pre-bid next to a cheap buy-it-now
- **WHEN** the shop has a template auction that can be pre-bid and a buy-it-now coin priced under melt
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

#### Scenario: Category placeholder
- **WHEN** the shop has a template titled "*z - Category - Coins" at $1 with a quantity in the hundreds
- **THEN** that listing is not listed as a deal
