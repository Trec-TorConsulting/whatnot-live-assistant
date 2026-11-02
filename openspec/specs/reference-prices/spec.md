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

### Requirement: Card and record prices
Magic, Pokémon, and Yu-Gi-Oh prints SHALL be looked up without a token after the item is identified. A single clear market price MAY set a raw card's value. A spread of different prices SHALL be shown and SHALL NOT replace the current value. PSA SHALL require a token and SHALL verify a cert without setting a price. A PSA subject that does not match SHALL NOT rename the item. Discogs SHALL require a token and SHALL show an asking price that does not set market value.

#### Scenario: PSA token missing
- **WHEN** the item is a PSA slab and no PSA token is saved
- **THEN** no cert request is made and the card says to add a token

#### Scenario: Ambiguous print
- **WHEN** several printings have different prices
- **THEN** the spread is shown and the bid value is not replaced by it

### Requirement: Whatnot sold comps
Saved sales SHALL drop giveaways and non-positive prices and SHALL NOT store buyers. An appraisal comp SHALL need a strong title match under 180 days. Conflicting years SHALL NOT match. Specialty show types SHALL NOT match each other. The appraisal median SHALL count only when at least two comps match. One sale SHALL be shown as too few to set the value.

#### Scenario: One matching sale
- **WHEN** only one watched Whatnot sale matches the item
- **THEN** it does not set the appraisal market value
