# Spec Delta

## MODIFIED Requirements

### Requirement: Whatnot sold comps
Saved sales SHALL drop giveaways and non-positive prices and SHALL NOT store buyers. An appraisal comp SHALL need a strong title match under 180 days. Conflicting years SHALL NOT match. Specialty show types SHALL NOT match each other. A sale whose title is a template SHALL NOT match as a comp. The appraisal median SHALL count only when at least two comps match. One sale SHALL be shown as too few to set the value.

#### Scenario: One matching sale
- **WHEN** only one watched Whatnot sale matches the item
- **THEN** it does not set the appraisal market value

#### Scenario: Reused junk bag
- **WHEN** several watched sales are titled "Junk bag" at different prices and the current lot is also a junk bag
- **THEN** those sales do not set or move the market value
