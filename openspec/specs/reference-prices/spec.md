# Reference prices

## Purpose
After the item is identified, the extension looks up coin, card, cert, and record prices from the sources the user has enabled. A lookup that names a different item is rejected. Missing tokens skip that source.

## Requirements

### Requirement: PCGS coin sales
PCGS SHALL be called only for coins, bullion, or tokens and medals, and only when a PCGS token is saved. Cert lookup SHALL require a slabbed PCGS cert of at least six digits. If CoinFacts names a different coin, that price SHALL be discarded and a spec lookup SHALL NOT run. The price guide SHALL NOT become the bid value. New calls SHALL stop near the daily cap. Cached entries SHALL still return.

#### Scenario: No PCGS token
- **WHEN** the item is a coin and no PCGS token is saved
- **THEN** PCGS is not called

#### Scenario: Cert names another coin
- **WHEN** the cert lookup returns a coin that does not match the identification
- **THEN** that price is not used

### Requirement: Greysheet BYOK pricing
Greysheet (CDN Publishing) SHALL be called only when the user has saved both an API key and an API token in Settings. Calls SHALL query the CDN Public API V2 for numismatic items and extract wholesale bid/ask and CPG retail guide values. If either credential is missing or rejected, Greysheet SHALL NOT run and other pricing sources SHALL proceed.

#### Scenario: Greysheet credentials configured
- **WHEN** an item is a coin and valid Greysheet API credentials are saved
- **THEN** the extension looks up wholesale and CPG values from the CDN Public API V2

#### Scenario: No Greysheet credentials
- **WHEN** an item is a coin and Greysheet credentials are empty
- **THEN** Greysheet is not called and the appraisal uses other available price sources

### Requirement: NumisMedia Fair Market Value (FMV) guide
US collector coins SHALL be matched against the NumisMedia FMV guide across Sheldon grade tiers (G-4 through MS-67). The guide price SHALL account for key dates, semi-key dates, and varieties. The FMV value SHALL serve as a verified retail benchmark without requiring an API token.

#### Scenario: Graded Morgan dollar
- **WHEN** a Morgan Dollar is appraised with grade MS-65
- **THEN** the NumisMedia FMV guide price for that grade tier is displayed on the appraisal card

#### Scenario: Key date premium
- **WHEN** a recognized key date coin (such as an 1893-S Morgan or 1921 Peace dollar) is appraised
- **THEN** the FMV calculation incorporates the key date premium

### Requirement: Recent auction and eBay sold comps
Recent auction and realized sale comps SHALL be queried from completed, sold eBay listings for identified coins, cards, and collectibles. The search SHALL filter out reproductions, copies, and non-sold listings. If matching sold items are found, the extension SHALL display the count, price range, and median realized sale price with a direct link to the search.

#### Scenario: Realized sales found
- **WHEN** completed eBay sales exist for the appraised coin
- **THEN** the median sold price and sold price range are displayed with a link to completed listings

#### Scenario: No sales or blocked search
- **WHEN** no realized sales are returned or a query fails
- **THEN** a link to search completed eBay sold listings is provided without breaking the appraisal

### Requirement: Card and record prices
Magic, Pokémon, and Yu-Gi-Oh prints SHALL be looked up without a token after the item is identified. A single clear market price MAY set a raw card's value. A spread of different prices SHALL be shown and SHALL NOT replace the current value. PSA SHALL require a token and SHALL verify a cert without setting a price. A PSA subject that does not match SHALL NOT rename the item. Discogs SHALL require a token and SHALL show an asking price that does not set market value.

#### Scenario: PSA token missing
- **WHEN** the item is a PSA slab and no PSA token is saved
- **THEN** no cert request is made and the card says to add a token

#### Scenario: Ambiguous print
- **WHEN** several printings have different prices
- **THEN** the spread is shown and the bid value is not replaced by it

### Requirement: Whatnot sold comps
Saved sales SHALL drop giveaways and non-positive prices and SHALL NOT store buyers. A comp SHALL need a strong title match under 180 days. A conflicting year, storage, RAM, screen size, chip, generation, model suffix, or part-number suffix SHALL rule it out. Specialty show types SHALL NOT match each other. A template, pull bucket, or generic device-class title SHALL NOT match. A stated MSRP SHALL NOT count as a sold price. The median SHALL need two comps; one SHALL show as too few.

#### Scenario: One matching sale
- **WHEN** only one watched Whatnot sale matches the item
- **THEN** it does not set the appraisal market value

#### Scenario: Reused junk bag
- **WHEN** several watched sales are titled "Junk bag" at different prices and the current lot is also a junk bag
- **THEN** those sales do not set or move the market value

#### Scenario: Reused size pull
- **WHEN** several watched sales are titled "SMALL Random Item" at different prices and the current lot is also a small random item
- **THEN** those sales do not set or move the market value

#### Scenario: Generic iPad hammer
- **WHEN** several watched sales are titled "APPLE IPAD" with no model or storage and the current lot is "APPLE IPAD"
- **THEN** those sales do not set or move the market value

#### Scenario: Specific model still matches
- **WHEN** two watched sales within 180 days are titled "2020 Apple MacBook Air M1" and the current lot is that model
- **THEN** those sales can set the market value

#### Scenario: MSRP is not a comp
- **WHEN** a title states "($200 Retail)" and no watched sale matches the product name
- **THEN** the $200 figure does not set the market value

#### Scenario: Storage conflict
- **WHEN** the item is "2019 Apple Macbook Pro i5 8GB 250GB 13\"" and the watched sales are the same model with 500GB
- **THEN** those sales do not match

#### Scenario: Model suffix
- **WHEN** the item is "Audien Atom Pro 2" and the watched sales are "Audien Atom Pro"
- **THEN** those sales do not match

#### Scenario: Bare tool against a kit
- **WHEN** the item is part 2886-20 and the watched sales are 2886-22
- **THEN** those sales do not match

#### Scenario: Missing spec does not conflict
- **WHEN** the item is "2022 Apple Macbook Air M2 8GB 500GB" and two watched sales are "2022 Apple Macbook Air M2 500GB" with no RAM stated
- **THEN** those sales can match

### Requirement: Generic case-pack titles are not comps
A watched sale whose title is a generic case-pack lot SHALL NOT match as a Whatnot comp. The sale SHALL still count in the live show's sales summary and the per-piece run board.

#### Scenario: Reused pink tag
- **WHEN** several "Clothing Case Pack - Pink Tag #N" lots have sold and the next pink tag lot is appraised
- **THEN** none of those sales sets the market value

### Requirement: Pack counts must agree
A comp SHALL NOT match when the two titles state different piece counts, or when one states a pack of more than one and the other states none.

#### Scenario: Pack against a single
- **WHEN** "12 pairs Christmas socks" sold for $9 and the item being appraised is a single pair of Christmas socks
- **THEN** that sale is not a comp

#### Scenario: Same pack size
- **WHEN** two "Joggers Casepack size LARGE (12 pairs)" lots sold and a third 12-pair joggers pack is appraised
- **THEN** those two sales can be comps
