# Spec Delta

## MODIFIED Requirements

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
