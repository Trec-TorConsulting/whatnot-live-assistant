# Wheel odds and prizes

## Purpose
Wheel odds show whether the next spin is worth the current bid, using prize values from melt, watched sales, or a model. Envelope titles are not priced from the name alone. The wheel never places a bid.

## Requirements

### Requirement: Odds for the active break
The live wheel SHALL be the break whose id matches the session break. The spin price SHALL be the current bid of the matching lot, otherwise that lot's next bid. Each remaining copy SHALL be equally likely. Missing prices SHALL count as zero in the floor, and the expected value SHALL be labeled a floor while any remaining prize is unpriced.

#### Scenario: No spin price
- **WHEN** the active lot is not this break or has no positive bid
- **THEN** the verdict waits for a price

#### Scenario: Empty wheel
- **WHEN** no spots remain
- **THEN** the verdict is empty

### Requirement: Worth and not worth
The spin SHALL be worth it when the expected value minus the price is at least zero. It SHALL be not worth it when that edge is negative and every remaining prize has a price. It SHALL be unclear when some prizes are unpriced and the floor is still under the price. The side panel SHALL say a hot or cold streak does not change the next spin's odds.

#### Scenario: All prices known and edge negative
- **WHEN** every remaining prize has a price and the expected value is below the spin price
- **THEN** the verdict is not worth it

### Requirement: Values do not bid
A typed prize value SHALL beat an automatic value. The displayed max bid SHALL be the floor of the expected value as text. It SHALL NOT be written into the bid box and SHALL NOT change the bid guard. Quick bid and Appraise SHALL be hidden while the wheel card is showing. Manual hit, undo, and reset SHALL edit only the saved wheel.

#### Scenario: User marks a hit
- **WHEN** the user marks a hit on the manual wheel
- **THEN** the saved wheel changes and no Whatnot control is clicked

### Requirement: Hidden prize titles
Envelope, bag, mystery, and similar titles SHALL NOT be priced from the title. A title that states a metal and a weight MAY use melt when spot is available, except chase, rip, box, pack, break, mystery, random, chance, and spot titles. Otherwise the system SHALL use watched sales, then a model. The model SHALL NOT be asked to answer zero, and non-positive answers SHALL be dropped.

#### Scenario: Envelope title
- **WHEN** a prize title is an envelope number
- **THEN** that title is not sent to the model for a name-only price

### Requirement: Camera reads
Envelope items SHALL be tied to a prize only when the visible label matches a requested title or a unique number on that wheel. Unlabeled items SHALL become a shared board, not guessed assignments. Extra board items SHALL keep the cheapest until the unmatched envelopes are filled. Items that were not on camera SHALL stay unpriced.

#### Scenario: Number not on this wheel
- **WHEN** the model pairs an item with an envelope number that is not on this wheel
- **THEN** that pairing is discarded

#### Scenario: Empty later read
- **WHEN** a later camera read returns no items
- **THEN** the last board remains

### Requirement: Share worker and hidden tab
The share-worker tab SHALL NOT refetch breaks or request prize values. Envelope and named-prize camera reads SHALL be skipped while the document is hidden. Odds SHALL still render from the last break snapshot.

#### Scenario: Hidden document
- **WHEN** the show tab is hidden
- **THEN** no new envelope frame is read
