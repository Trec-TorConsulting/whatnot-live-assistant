# Spec Delta

## MODIFIED Requirements

### Requirement: Show type
The system SHALL label a show as coins, cards, jewelry, collectibles, flea, wholesale, or general from its title, category tags, and published show notes. Category matches SHALL outweigh title and note matches. Notes SHALL fill in the type when the title and tags match nothing. Flea-market wording, including in the notes, SHALL outweigh item words. A Case Packs & Bundles category SHALL make the show wholesale, whatever its other tags say. Reseller Bundles and Wholesale/Lots tags SHALL outweigh flea and item words in the tags. Inside "case pack", the word "pack" SHALL NOT count as a card word. The label SHALL be a hint for sold history, appraisal, and the flea table scan. It SHALL NOT choose a bid.

#### Scenario: No match
- **WHEN** the title and categories match none of the known wording and the notes do not either
- **THEN** the show type is general

#### Scenario: Notes name the items
- **WHEN** the title and categories match nothing and the notes name silver coins
- **THEN** the show type is coins

#### Scenario: Tags already decided
- **WHEN** the categories are sports cards and the notes mention silver coins
- **THEN** the show type stays cards

#### Scenario: Case pack is not a card pack
- **WHEN** the categories are Case Packs & Bundles, Reseller Bundles, Wholesale/Lots, and Squishy Toys, and the title is "12/$12 SB Casepack:Novelties,Keychains,Jewelry,Accessories"
- **THEN** the show type is wholesale

#### Scenario: Fashion jewelry dozens
- **WHEN** the categories are Case Packs & Bundles, Reseller Bundles, Wholesale/Lots, and Fashion Jewelry, and the title advertises 12/$12 earrings and necklaces
- **THEN** the show type is wholesale, not jewelry

#### Scenario: Warehouse pallet pulls
- **WHEN** the categories are Case Packs & Bundles, Reseller Bundles, Wholesale/Lots, and Pallet Pulls
- **THEN** the show type is wholesale, not flea

#### Scenario: Card packs stay cards
- **WHEN** the title is "Pokemon packs" and the categories name no wholesale or case-pack tag
- **THEN** the show type is cards

#### Scenario: Wholesale does not scan by default
- **WHEN** the show type is wholesale and the user has not turned scan on
- **THEN** no flea table scan is requested
