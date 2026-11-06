# table-scan Specification

## Purpose
Analyzes full livestream video frames across multi-item displays, identifying and ranking top valuable items with spatial location cues and replica or trap warnings.

## Requirements

### Requirement: Full-frame item identification and ranking
When table scan runs on a live show video frame, the system SHALL prompt the vision model to detect all visible collectible items in the frame and rank the top one to three items by estimated market value. Each ranked item SHALL include an item name, estimated value or price range, and a brief justification note.

#### Scenario: Multi-item display ranked by value
- **WHEN** the user triggers a table scan on a table displaying a poured silver skull, graded slabs, and loose world coins
- **THEN** the returned scan ranks the poured silver skull and high-tier slabs as the top items with estimated values and labels the loose coins as low value

#### Scenario: No collectible items detected
- **WHEN** the camera is pointing at an empty desk or background wall
- **THEN** the scan returns an empty picks list with a message stating no collectible items were clearly visible

### Requirement: Spatial location indicators
Each identified item in the table scan ranking SHALL include a spatial region indicator describing where the item appears in the video frame (e.g. "top left", "middle shelf", "bottom right", "center tray"). The indicator SHALL guide the user to find the item quickly during fast pick auctions.

#### Scenario: Spatial position returned for top pick
- **WHEN** an assay gold bar appears on the right tier and a large silver round sits in the center
- **THEN** the scan reports the gold bar with location "middle shelf right" and the silver round with location "center"

### Requirement: Replica and souvenir trap detection
The table scan prompt SHALL specifically instruct the model to inspect prominent items for signs of non-circulating replicas, souvenir cards, gold/silver clad or plated novelty bars, and fantasy coins. When an item resembles a high-value rarity but is an official or unofficial replica (such as a Bureau of Engraving and Printing souvenir card or fantasy token), the system SHALL tag it with a prominent warning and state its true collector value rather than genuine note value.

#### Scenario: BEP souvenir card detected
- **WHEN** a print depicting the 1896 $5 Educational Series note is displayed with Bureau of Engraving and Printing souvenir text
- **THEN** the scan classifies it as a "BEP Souvenir Card" with estimated value under $50 and displays a warning that it is a replica card, not genuine currency

#### Scenario: Clad or plated novelty bar detected
- **WHEN** a 100 mills or gold-clad novelty bar is displayed on the table
- **THEN** the scan labels the piece as clad or novelty with a warning rather than solid bullion
