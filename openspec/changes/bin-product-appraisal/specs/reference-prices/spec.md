# Spec Delta

## ADDED Requirements

### Requirement: Text-based reference pricing for shop listings
The reference pricing pipeline SHALL support querying PCGS, Greysheet, NumisMedia FMV, eBay sold comps, and melt values directly from parsed text attributes of shop listings (title, subtitle, grade, and denomination) without requiring an image or camera frame.

#### Scenario: Shop coin listing queried against reference guides
- **WHEN** a shop listing has title "1885-O Morgan Dollar PCGS MS64"
- **THEN** reference price lookups query PCGS, Greysheet, and FMV using the parsed text attributes and return the verified guide value

#### Scenario: Raw bullion shop listing queried against spot
- **WHEN** a shop listing has title "10 oz Silver Bar .999 Fine"
- **THEN** the system calculates the melt value using current spot metal prices and returns the melt value benchmark

