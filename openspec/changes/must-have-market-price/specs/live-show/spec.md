# Spec Delta

## ADDED Requirements

### Requirement: Must-have market price
Every must-have in the shop check SHALL lead with its current market price: a PCGS auction median or guide, a card or record reference price, a local AI estimate, or the median of two or more watched sales. When none is known it SHALL say `Market: no price yet` until a lookup finds one. Steals and deals SHALL NOT show the placeholder.

#### Scenario: Key date with no sales
- **WHEN** a buy-it-now key date has no watched sales, no melt, and no reference price
- **THEN** it is listed as a must-have whose note starts with `Market: no price yet`

#### Scenario: Key date with watched sales
- **WHEN** a buy-it-now key date at $48 has two watched sales at $50 and $60
- **THEN** it is listed as a must-have whose note starts with `Market $55 (median of 2 sales)`

#### Scenario: PCGS price arrives
- **WHEN** a must-have says `Market: no price yet` and the PCGS lookup returns `Guide $110 (PCGS G-4)`
- **THEN** the note starts with `Guide $110 (PCGS G-4)` and no longer says `no price yet`

#### Scenario: Local AI estimate arrives
- **WHEN** a must-have says `Market: no price yet` and local AI estimates $220 to $350
- **THEN** the note starts with `AI est. $220–$350` and no longer says `no price yet`

#### Scenario: PSA check without a price
- **WHEN** a must-have's only reference result is a PSA cert verification
- **THEN** the note still starts with `Market: no price yet`

#### Scenario: Steal
- **WHEN** a buy-it-now is listed as a steal under melt
- **THEN** its note does not say `Market: no price yet`

### Requirement: Melt is not a market price
On a must-have, melt SHALL be shown as a floor after the market line and SHALL NOT replace it. Must-haves without a market price SHALL be looked up at PCGS, reference sources, and local AI before other shop rows.

#### Scenario: Silver key date with melt only
- **WHEN** a silver key date is priced above melt and has no watched sales
- **THEN** its note starts with `Market: no price yet` and then shows `Melt $X`, and it is sent to the price lookups ahead of rows that already have a market price
