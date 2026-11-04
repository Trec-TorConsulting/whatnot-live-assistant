# Spec Delta

## MODIFIED Requirements

### Requirement: Show type
The system SHALL label a show as coins, cards, jewelry, collectibles, flea, electronics, or general from its title, category tags, and published show notes. Category matches SHALL outweigh title and note matches. Notes SHALL fill in the type when the title and tags match nothing. Flea-market wording, including in the notes, SHALL outweigh item words. Electronics tags SHALL outrank flea. The label SHALL be a hint for sold history, appraisal, and the flea table scan. It SHALL NOT choose a bid.

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

### Requirement: Shop buy-it-now scan
When a live show opens, the system SHALL read that show's shop and SHALL list buy-it-now items and named one-off auctions priced under melt, under watched sales, on the watchlist, or a known key date. A specific title still qualifies at quantity 20 or more. A $1 price, a template, a pull bucket, a generic device class, a giveaway, a joke-priced giveaway row, and a parts or untested row SHALL NOT be listed as a steal or a deal. The scan SHALL NOT buy or place a bid.

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
