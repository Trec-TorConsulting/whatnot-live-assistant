# Spec Delta

## MODIFIED Requirements

### Requirement: Value versus asking price comparison
Upon receiving an appraisal result for a BIN listing, the system SHALL calculate and display the net spread and margin percentage between the appraised market value and the seller's asking price. If the market value exceeds asking price by more than 15%, the item SHALL be badged as a deal. If asking price exceeds market value by more than 15%, the item SHALL be labeled as overpriced.

Buy-It-Now listings for multi-coin sets, collector albums, or lots that do not state an explicit per-coin or total bullion weight SHALL NOT be evaluated against fabricated 1 oz melt floors or flagged as under melt steals. Listings for alternative silver currencies (such as NORFED Liberty Dollars) SHALL evaluate against silver spot rather than gold melt.

#### Scenario: Listing priced below market value
- **WHEN** a BIN item with asking price $40 has an appraised market value of $65
- **THEN** the listing displays "Value: $65 vs Ask: $40 (+$25 / +62%)" with a deal badge

#### Scenario: Listing priced above market value
- **WHEN** a BIN item with asking price $50 has an appraised market value of $28
- **THEN** the listing displays "Value: $28 vs Ask: $50 (-$22 / -44%)" with an overpriced indicator

#### Scenario: Unweighted coin set in shop inventory
- **WHEN** the shop inventory includes a "2007 Gold Krugerrand Investment Coin Set 3 Coins" listed at $325 without stated bullion weights
- **THEN** the listing is not flagged as a steal under $12,000+ melt value

#### Scenario: NORFED 1 oz silver round in shop inventory
- **WHEN** the shop inventory includes a "2009 NORFED $20 Liberty Dollar – 1 oz .999 Silver" listed at $350
- **THEN** the listing evaluates against 1 oz silver melt (~$32) and is not badged as an under-melt steal

