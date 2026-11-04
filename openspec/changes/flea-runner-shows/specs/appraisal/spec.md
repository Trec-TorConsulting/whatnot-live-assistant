# Spec Delta

## ADDED Requirements

### Requirement: Runner notes past the cap
On a runner show, an appraisal and a table scan SHALL include the parsed price ladder and the buying-rules lines from the published notes when those lines sit past the ordinary note cap. Buying-rules lines are no cancellation, no refund, no return, as-is, untested, and not cleaned. The image SHALL still decide what the item is. A coupon code SHALL NOT be sent to the model. A show that is not a runner SHALL keep the ordinary note cap.

#### Scenario: Ladder sits past the cap
- **WHEN** the runner pass is on, the published notes are longer than the ordinary cap, and the ladder and the no-return lines begin after that cap
- **THEN** the appraisal request and the table-scan request include the ladder and those rules

#### Scenario: Coupon stays out
- **WHEN** those same notes also contain a coupon code
- **THEN** the request omits the code

#### Scenario: Ordinary show
- **WHEN** the runner pass is off and the notes are longer than the ordinary cap
- **THEN** the request keeps the ordinary cap and does not add the later lines
