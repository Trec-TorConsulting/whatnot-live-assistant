# Spec Delta

## ADDED Requirements

### Requirement: Case-pack reading hint
On a wholesale show, the appraisal request SHALL add a case-pack hint: count the pieces in the pack, read brand, style code, and size tags, and give the resale price of one new piece, not the pack price and not an MSRP. It SHALL NOT add the card, jewelry, or estate hints on that show. It SHALL add no model call.

#### Scenario: Fashion jewelry on a case-pack show
- **WHEN** the show is wholesale and its tags include Fashion Jewelry
- **THEN** the request includes the case-pack hint and omits the hallmark and scale hint

#### Scenario: As-seen lot on a case-pack show
- **WHEN** the show is wholesale and the lot is "Case Pack or Bundle as Seen #335"
- **THEN** the request includes the case-pack hint and omits the estate hint

### Requirement: Generic case-pack title is not the item
On a wholesale show, a generic case-pack lot title SHALL NOT be sent as the item name. The request SHALL give the lot number, the stated piece count and its source when known, and any host or mod contents line pinned to that lot.

#### Scenario: Pink tag lot
- **WHEN** the lot is "Clothing Case Pack - Pink Tag #66" and a mod pinned "Hats- 10"
- **THEN** the request gives lot 66, 10 pieces stated by a mod, and "Hats- 10", and does not name the item "Clothing Case Pack - Pink Tag"

### Requirement: Stated count and the model's count
When a stated piece count exists and the model counted one piece, the market value and suggested max SHALL use the per-piece estimate times the stated count, labeled as the stated count. When the model counted more than one and the counts differ, the value SHALL use the lower count and show both. With no stated count, the model's count SHALL apply as before.

#### Scenario: Model saw one keychain
- **WHEN** the stated count is 12, the model returns quantity 1, and its per-piece estimate is $2 to $3
- **THEN** the market value is built from 12 pieces and is labeled "12 stated"

#### Scenario: Counts disagree
- **WHEN** the stated count is 12 and the model counts 10
- **THEN** the value uses 10 and the card shows 10 counted and 12 stated

#### Scenario: Nothing stated
- **WHEN** no piece count is stated and the model counts 3
- **THEN** the value uses 3
