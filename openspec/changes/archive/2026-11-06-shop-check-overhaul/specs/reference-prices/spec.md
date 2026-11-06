# Spec Delta

## ADDED Requirements

### Requirement: Shop PCGS and reference price enrichment
When the shop scan looks up a graded key-date coin via `GRADE_GUIDE`, an auction median from at least two PCGS sales (`Market $X`) SHALL promote a `must` hit to `steal` at or below 60 percent of market or `deal` at or below `maxBidPercent` of market, and SHALL drop non-watchlist `must` hits priced above 125 percent of market. A PCGS price guide figure (`Guide $X`) SHALL NOT promote a hit to `steal` or `deal`, and non-watchlist `must` hits above 150 percent of guide SHALL be dropped.

#### Scenario: PCGS auction median promotes key date to steal
- **WHEN** a graded key-date coin is listed at $60 and `GRADE_GUIDE` returns 3 PCGS auction sales with a $120 median
- **THEN** the hit is promoted from `must` to `steal` with `Market $120`

#### Scenario: PCGS guide stays a must-have
- **WHEN** a graded key-date coin is listed at $79 and `GRADE_GUIDE` returns a $110 guide price with fewer than 2 auction sales
- **THEN** the hit stays `must` and shows `Guide $110`

### Requirement: Shop card, cert, and record lookups
When a shop listing states a Magic, Pokémon, or Yu-Gi-Oh card number or set code, a PSA slab with a 7-to-9-digit cert number, or a vinyl record, the shop scan SHALL query `REF_LOOKUP` for up to six candidates. A single exact-print market price (`kind: 'market'`) on a raw card MAY promote a hit to `steal` or `deal`. A multi-print range, a Discogs lowest-listed price, or a PSA cert verification SHALL attach a note without setting market value. Cert numbers SHALL NOT be invented.

#### Scenario: Raw Pokémon card with exact set number under TCGplayer market
- **WHEN** a raw shop listing "Charizard 4/102 Base Set" is priced at $100 and `REF_LOOKUP` returns a single-print market price of $350
- **THEN** the listing is scored as a `steal` with `Market $350 (pokemontcg)`

#### Scenario: Stated PSA cert mismatch in shop
- **WHEN** a shop listing states "PSA 10 Charizard Cert #12345678" and `REF_LOOKUP` returns `mismatch: true` for that cert
- **THEN** the hit reason warns of the PSA cert mismatch and does not promote the listing

