# Spec Delta

## ADDED Requirements

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
