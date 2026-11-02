# Wheel odds and prizes

## Purpose
Wheel odds show whether the next spin is worth the current bid. Named instant hits use melt, watched sales, or a model. Envelopes stay sealed until the wheel or the show ends, and their items are the camera pool left after instant hits are matched. The number on an envelope does not say which item is inside. The wheel never places a bid.

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
A prize whose title or detail is an envelope, lope, bag, mystery, or a similar hidden name SHALL NOT be priced from that name. A title that states a metal and a weight MAY use melt when spot is available, except chase, rip, box, pack, break, mystery, random, chance, and spot titles. Otherwise a named prize SHALL use watched sales, then a model. The model SHALL NOT be asked to answer zero, and non-positive answers SHALL be dropped.

#### Scenario: Envelope title
- **WHEN** a prize title is an envelope number
- **THEN** that title is not sent to the model for a name-only price

#### Scenario: Envelope only in the description
- **WHEN** a prize title is "Family Pack #7" and its description is "Envelope"
- **THEN** that prize is an envelope and is not priced from the title

### Requirement: Camera reads
A visible item SHALL be tied to a named instant-hit prize only when its label matches that prize. A number on the shelf SHALL NOT assign an item to an envelope, including when that number matches an envelope on the wheel. Unmatched items SHALL become the shared envelope pool. The pool SHALL keep its highest-priced item when the photo shows more items than envelopes left. Items that were not on camera SHALL stay unpriced.

#### Scenario: Number not on this wheel
- **WHEN** the model pairs an item with an envelope number that is not on this wheel
- **THEN** that pairing is discarded

#### Scenario: Shelf number matches an envelope
- **WHEN** a shelf label shows the same number as an envelope still on the wheel
- **THEN** that item stays in the pool and is not assigned to that envelope

#### Scenario: Empty later read
- **WHEN** a later camera read returns no items
- **THEN** the last board remains

#### Scenario: Shelf mixes floors and instant hits
- **WHEN** the photo shows a named instant hit beside other items and envelopes remain
- **THEN** the instant hit prices that spot and the other items stay in the envelope pool

#### Scenario: Extra items include the top item
- **WHEN** the photo shows more unmatched items than envelopes left, and one item is priced higher than the rest
- **THEN** that higher-priced item stays in the pool

### Requirement: Envelope average
When the unmatched items are no more than the original envelope count, each sealed envelope SHALL be worth their average. A missing or unpriced item SHALL count as zero and the average SHALL be labeled a floor. When more unmatched items remain than that count, the card SHALL keep showing the top item and SHALL label the envelope average incomplete.

#### Scenario: Priced pool
- **WHEN** the wheel has two envelopes and the unmatched pool is a $1000 item and a $20 item, both priced
- **THEN** each envelope is worth $510

#### Scenario: Shelf still larger than the wheel
- **WHEN** unmatched items outnumber the envelopes the wheel started with
- **THEN** the top item stays on the card and the envelope average is incomplete

### Requirement: Sealed jackpot share
Until a reveal, the top pool item's share of each envelope SHALL be its price divided by the original envelope count. That count SHALL be the remaining envelope spots plus the sold envelope spots. The wheel card SHALL show the top item, that share, and the envelope average. Selling a sealed envelope SHALL NOT raise the value of the envelopes still left.

#### Scenario: Most envelopes already sold
- **WHEN** the wheel started with 10 envelopes, 2 remain, none are opened, and the top item is $1000
- **THEN** each remaining envelope's jackpot share is $100

### Requirement: Incomplete envelope history
When the sold list is incomplete, the jackpot share SHALL be shown as incomplete. It SHALL NOT use the envelopes still left as the divisor.

#### Scenario: Joined after envelopes sold
- **WHEN** envelopes remain, the top item is priced, and the sold list is incomplete
- **THEN** the card does not divide the top item by the envelopes still left

### Requirement: Opened envelopes leave the pool
When a later camera read shows fewer pool items after an envelope spot is won, the missing items SHALL leave the pool, unless that read drops most of the previous board at once. The top item's share SHALL then be its price divided by the envelopes still sealed. An empty read SHALL keep the last board.

#### Scenario: Seller opens as they go
- **WHEN** an envelope is won and the next read no longer shows the previous top item, with one envelope still sealed
- **THEN** that item leaves the pool and the remaining envelope does not keep a share of it

#### Scenario: Read loses most of the board
- **WHEN** an envelope is won and the next camera read is missing most of the previous pool items
- **THEN** that read does not count as a reveal and the last board remains

### Requirement: Next spin mix
The next spin's expected value SHALL weight each remaining envelope at the envelope average and each remaining instant hit at its own price, divided by spots left. It SHALL rise when a cheaper instant hit leaves and the envelope average is higher. It SHALL NOT rise only because a sealed envelope was sold.

#### Scenario: Cheap spots still in
- **WHEN** 2 envelopes average $118 and 18 instant hits are priced at $8
- **THEN** the next spin is worth $19

#### Scenario: Cheap spots gone
- **WHEN** only those 2 envelopes remain
- **THEN** the next spin is worth $118

### Requirement: Talk is not a prize
A chat or host line that is not a listed prize SHALL NOT change wheel odds.

#### Scenario: Unlock talk
- **WHEN** chat says "Unlocked Second cousin" and the prize list is unchanged
- **THEN** the odds stay the same

### Requirement: Share worker and hidden tab
The share-worker tab SHALL NOT refetch breaks or request prize values. Envelope and named-prize camera reads SHALL be skipped while the document is hidden. Odds SHALL still render from the last break snapshot.

#### Scenario: Hidden document
- **WHEN** the show tab is hidden
- **THEN** no new envelope frame is read
