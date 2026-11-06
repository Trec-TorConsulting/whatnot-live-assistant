# Spec Delta

## ADDED Requirements

### Requirement: Table scan appraisal mode
The appraisal engine SHALL support a table scan mode separate from the active lot focus mode. In table scan mode, instructions SHALL direct the vision model to inspect the entire visible scene across all trays, shelves, and backgrounds, identifying the top valuable items and potential traps rather than restricting valuation to the item in the seller's hand or lot title.

#### Scenario: Table scan mode invoked
- **WHEN** table scan mode is triggered from the assistant interface
- **THEN** the appraisal engine uses the full-scene instructions instead of the single-lot focus instruction and returns multi-item ranked findings

#### Scenario: Standard lot appraisal remains focused
- **WHEN** standard auction appraisal runs
- **THEN** the appraisal engine continues to enforce single-lot focus instructions and ignores background items

