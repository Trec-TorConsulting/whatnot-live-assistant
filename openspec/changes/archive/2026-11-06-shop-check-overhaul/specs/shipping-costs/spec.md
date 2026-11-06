# Spec Delta

## ADDED Requirements

### Requirement: Shop all-in cost and flip margin
When shipping or tax context is known for the open show, the shop scan SHALL compare a listing's landed cost (`allInPrice` with `shippingOwed` and the user's tax rate) against melt, watched comps, and watchlist ceilings. On steals and deals with a known reference value, the reason SHALL include the landed cost or combined-shipping status, the net resale profit (`flipProfit`) when positive, and any published show coupon code.

#### Scenario: Unpaid shipping prevents false low-dollar melt steal
- **WHEN** a silver coin with $15 melt is listed at $13 buy-it-now, the user has no earlier win in the show, and page shipping is $4.50 ($17.50 landed)
- **THEN** the coin is not scored as a steal under melt

#### Scenario: Combined shipping unlocks low-dollar melt steal and shows flip profit
- **WHEN** the same $13 coin ($15 melt) is evaluated after the user has already won a lot in the show with combined shipping, and watched sales have a $25 median
- **THEN** the coin is scored as a steal and its reason notes combined shipping and the net flip profit after fees
