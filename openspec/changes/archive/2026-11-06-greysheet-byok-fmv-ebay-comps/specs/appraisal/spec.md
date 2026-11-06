# Spec Delta

## MODIFIED Requirements

### Requirement: Market value order
Per piece, market value SHALL prefer a PCGS auction median, then a verified numismatic or raw card market price (from Greysheet, NumisMedia FMV, eBay sold median, or TCGplayer), then the median of at least two matching Whatnot sales, then the midpoint of a positive AI estimate, then melt. The PCGS price guide SHALL be shown and SHALL NOT set the market value or the suggested max. Suggested max SHALL be the configured percent of market value, except melt which uses 100 percent of melt, and SHALL NOT sit below melt. Low confidence SHALL NOT produce a bid headline.

#### Scenario: Guide only
- **WHEN** the only PCGS figure is the price guide and no other price source applies
- **THEN** market value and suggested max stay empty

#### Scenario: Estimate below melt
- **WHEN** the AI estimate does not clear melt
- **THEN** the basis is melt rather than the estimate
