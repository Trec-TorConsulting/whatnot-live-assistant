# Spec Delta

## MODIFIED Requirements

### Requirement: Quick melt
Before the frame returns, a listing line with a known series or an explicit ounce weight SHALL produce a melt floor from spot metal prices. Fractional weights (including `1/10th oz`, `1/4th oz`, `1/2nd oz`, `.10 oz`, `0.25 oz`, `tenth oz`, `quarter oz`, and `half oz`) SHALL use that fraction, SHALL NOT match a 1 oz bullion pattern, and SHALL cap `fine_weight_oz`. Spot SHALL come from gold-api.com without delaying the model call. Plated or filled stamps SHALL have no melt, and quick read SHALL NOT call PCGS.

A coin series pattern for a precious metal (including `$20 Gold Double Eagle`, `1 oz Krugerrand`, `1 oz Gold Eagle`, `Gold Buffalo`, `Gold Maple`, `Gold Britannia`, `Gold Philharmonic`, and `Gold Kangaroo`) SHALL NOT match a listing that states a conflicting metal (`silver`, `copper`, `cobre`, `brass`, `bronze`, `platinum`, or `palladium`) or alternative currency markers (`NORFED`, `Liberty Dollar`). When a listing explicitly states a bullion metal and weight (such as `1 oz .999 Silver`), the explicit metal SHALL take precedence over conflicting series patterns. South African Krugerrand listings SHALL distinguish between silver (`1 oz Silver Krugerrand`) and gold (`1 oz Krugerrand`), and SHALL NOT default to gold when silver is stated.

Listings that represent multi-coin sets, collections, lots, proof sets, mint sets, or presentation cases without an explicit per-piece or total bullion weight SHALL NOT be assumed to contain 1 oz bullion coins, SHALL NOT multiply 1 oz melt by the coin count, and SHALL return no quick melt.

#### Scenario: Spot price is slow
- **WHEN** the listing has a metal weight and the spot price has not come back yet
- **THEN** the frame is still sent to the model

#### Scenario: No metal in the title
- **WHEN** the listing has no year-or-ounce metal line
- **THEN** there is no quick melt

#### Scenario: Fractional ounce
- **WHEN** the listing states a fraction of an ounce, such as 1/1000 oz gold
- **THEN** melt uses that fraction of an ounce, not the number after the slash

#### Scenario: Ordinal fractional gold eagle
- **WHEN** the listing is "1/10th oz gold eagle ms70 2022" and gold spot is $4,130
- **THEN** quick melt uses 0.1 oz ($413) rather than a full 1 oz Gold Eagle ($4,130), and a model answer of 1 oz is capped at 0.1 oz

#### Scenario: NORFED Silver Liberty Dollar
- **WHEN** the listing is "2009 NORFED $20 Liberty Dollar – 1 oz .999 Silver – Cali Evergreen RCO Stamp( mintage 250)" and silver spot is $32.50
- **THEN** quick read identifies the coin as 1 oz silver ($32.50 melt) rather than a $20 Gold Double Eagle ($3,900+ gold melt)

#### Scenario: Unweighted multi-coin Krugerrand set
- **WHEN** the listing is "2007 Gold Krugerrand Investment Coin Set 3 Coins Limited Edition of 5000 Display Case & Booklet"
- **THEN** quick read does not assume 3 x 1 oz gold coins and returns null for quick melt

#### Scenario: Silver Krugerrand
- **WHEN** the listing is "2021 South Africa 1 oz Silver Krugerrand BU"
- **THEN** quick read identifies the coin as 1 oz silver rather than 1 oz gold

