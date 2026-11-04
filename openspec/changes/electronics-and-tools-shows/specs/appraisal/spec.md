# Spec Delta

## MODIFIED Requirements

### Requirement: Show notes as context
Appraisal and a flea table scan SHALL include the seller's published show notes when the show has them. The notes SHALL be labeled as rules for the show, and the image SHALL still decide what the item is. A coupon code, a device password line, and a referral code or link in the notes SHALL NOT be sent to the model.

#### Scenario: Notes and a coupon
- **WHEN** the show notes name the kind of item and contain a coupon code
- **THEN** the appraisal request includes the item wording and omits the code

#### Scenario: Device password
- **WHEN** the notes say "Some devices may have a password — just use “revolt”"
- **THEN** the appraisal request omits that line and keeps the rest of the notes

#### Scenario: Referral code
- **WHEN** the notes contain "Use my code 83QT8R" and a referral link
- **THEN** the appraisal request omits the code and the link

## ADDED Requirements

### Requirement: Tools reading hint
When the tools pass is on, the appraisal request SHALL tell the model to read the brand, the battery platform, the part number on the nameplate or box, and whether a battery and charger are in frame. It SHALL say not to invent a part number or a battery capacity. The hint SHALL NOT add a model call. The electronics and estate hints SHALL NOT be added on that request.

#### Scenario: Hammer drill on a tools show
- **WHEN** the active lot is "Milwaukee M12 Fuel Hammer Drill #3" on a tools show
- **THEN** the request includes the tools hint, omits the electronics and estate hints, and does not call a second model
