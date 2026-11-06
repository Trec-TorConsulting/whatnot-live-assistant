# Spec Delta

## MODIFIED Requirements

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
