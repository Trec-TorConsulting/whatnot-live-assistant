# listing-currency Specification

## Purpose
Read prices in a show that is not priced in US dollars, convert them with Whatnot's own estimate, and refuse to compare amounts that cannot be converted.

## Requirements

### Requirement: Recognize another currency
An amount that Whatnot carries with a currency other than USD, or writes with a prefix such as CA$, SHALL keep that currency. The Live panel and the on-page assistant SHALL show it with its symbol, followed by the US estimate when one is known.

#### Scenario: Canadian lot
- **WHEN** a lot sells for CA$5 and Whatnot shows "est. $3.58" beside it
- **THEN** the panel shows CA$5 (≈ $3.58), not $5

### Requirement: Rate from Whatnot's estimate
The rate for a currency SHALL come from a pair Whatnot shows on the page: an amount in that currency and its "est. $" figure. The largest such amount seen in the show SHALL set the rate, and it SHALL apply to other amounts in that currency in the same show. No exchange-rate host SHALL be called.

#### Scenario: Shipping pair sets the rate
- **WHEN** the page shows "CA$18.50 (est. $13.26)" and the current bid is CA$40
- **THEN** the bid is shown as about $28.67 and no network request is made for the rate

### Requirement: No rate, no comparison
Until a rate is known, the all-in, the guard verdict, the shop score, the sold comp, and the budget totals SHALL NOT use an amount in another currency as US dollars. Each of them SHALL say that the amount is not converted.

#### Scenario: Bid before any estimate
- **WHEN** the current bid is CA$40 and no "est. $" pair has been seen in this show
- **THEN** the guard shows neither over nor near and says the CA$ bid is not converted

### Requirement: Shipping in another currency
A shipping line with an amount in another currency and an "est. $" figure SHALL be read as the US estimate. When the line says tariffs apply, the all-in SHALL say that tariffs are not included.

#### Scenario: Cross-border shipping
- **WHEN** the shipping line is "Shipping is CA$18.50 (est. $13.26) + Taxes + Tariffs"
- **THEN** shipping is $13.26 and the all-in says tariffs are not included

### Requirement: Guard in US dollars
The guard SHALL compare the converted bid with the user's US-dollar ceilings and with the appraised market value.

#### Scenario: Over a ceiling after conversion
- **WHEN** the rate is 0.7168, the bid is CA$40, and the per-lot max is $25
- **THEN** the guard reports over, because about $28.67 is above $25

### Requirement: Shop prices in another currency
The shop scan SHALL convert a listing's price before comparing it with melt, watched sales, or a watchlist max. A listing in another currency with no rate SHALL NOT be scored.

#### Scenario: Toaster in CAD
- **WHEN** a shop row is CA$20 and Whatnot estimates it at $14.34
- **THEN** it is compared at $14.34

### Requirement: Sold comps in another currency
A watched sale in another currency SHALL be saved with its US estimate when a rate is known. Without a rate, it SHALL NOT be saved as a comp.

#### Scenario: Sale before a rate
- **WHEN** a CA$35 tablet sells before any "est. $" pair has been seen
- **THEN** it is not saved as a Whatnot comp

### Requirement: Wins in another currency
A recorded win in another currency SHALL keep its amount and currency, together with the US estimate when a rate is known. Spend totals and budgets SHALL use the US estimate. A win with no rate SHALL be left out of US totals, and the Buys panel SHALL say how many were left out.

#### Scenario: Win with a rate
- **WHEN** the user wins a CA$5 lot and the rate is 0.7168
- **THEN** the purchase shows CA$5 and about $3.58, and $3.58 counts toward the show budget
