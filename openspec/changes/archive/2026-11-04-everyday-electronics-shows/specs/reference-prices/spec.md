# Spec Delta

## MODIFIED Requirements

### Requirement: Whatnot sold comps
Saved sales SHALL drop giveaways and non-positive prices and SHALL NOT store buyers. An appraisal comp SHALL need a strong title match under 180 days. Conflicting years SHALL NOT match. Specialty show types SHALL NOT match each other. A template, pull bucket, or generic device-class title SHALL NOT match as a comp. A stated MSRP SHALL NOT count as a sold price. The appraisal median SHALL count only when at least two comps match. One sale SHALL be shown as too few to set the value.

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
