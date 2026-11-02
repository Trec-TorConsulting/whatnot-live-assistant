# Max-bid guard

## Purpose
The guard shows whether the current bid is inside the user's ceilings and holds one over-limit click so a second click within four seconds can go through. It never places a bid by itself.

## Requirements

### Requirement: Ceilings
The tightest active ceiling SHALL be the lowest of the per-lot max, otherwise the watchlist max, otherwise a positive default max, and any remaining show, day, week, or month budget. A zero budget or zero default SHALL be off. The week SHALL start Monday at local midnight. The appraisal suggested max SHALL apply only when no lot max, watchlist max, or default max is set.

#### Scenario: Watchlist max beats the default
- **WHEN** a lot title matches a watchlist line with a dollar max and no per-lot max is saved
- **THEN** that watchlist max is the ceiling

#### Scenario: No ceilings
- **WHEN** every money ceiling is off and market warnings are off
- **THEN** the guard level is ok

### Requirement: Over and near
A bid above the tightest ceiling SHALL be over. A bid at or above 90 percent of that ceiling, and not over it, SHALL be near. When warn-over-market is on and the bid is above the appraised market value, the level SHALL be over even if the bid is under the dollar ceiling.

#### Scenario: Under ceiling but over market
- **WHEN** warn-over-market is on and the bid is under the dollar ceiling and over the market value
- **THEN** the guard reports over and includes the market reason

### Requirement: Hold one click
When confirm-over-max is on, a trusted click on a visible bid button or Set Max Bid that is over the limit SHALL be prevented once and armed for four seconds. A second trusted click on that same element before the deadline SHALL be allowed through. The extension SHALL NOT click the button itself. Buy Now SHALL NOT be treated as a bid button.

#### Scenario: Second click
- **WHEN** the user clicks the same over-limit bid control again within four seconds
- **THEN** that click is not prevented

#### Scenario: Confirm off
- **WHEN** confirm-over-max is off
- **THEN** over-limit clicks are not held

### Requirement: Spend used by budgets
Show spend SHALL be the sum of stored purchases for that live id. Day, week, and month spend SHALL sum purchase prices since local midnight, Monday, and the first of the month. The guard SHALL NOT subtract giveaways that were stored with a price.

#### Scenario: Sold lot
- **WHEN** the current lot is missing or sold
- **THEN** the on-page guard clears and quick-bid buttons hide
