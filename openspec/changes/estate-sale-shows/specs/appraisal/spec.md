# Spec Delta

## ADDED Requirements

### Requirement: Estate reading hint
When the estate pass is on, the appraisal request SHALL say that a template title is only a shipping bucket, that the image decides the item, and that the model should read maker marks, pattern names, clothing brand, size, and flaws, and hallmarks. The hint SHALL NOT add a model call. A coupon in the notes SHALL still be omitted.

#### Scenario: Template lot on an estate show
- **WHEN** the active lot is "E Random 1-2lb #10" and the estate pass is on
- **THEN** the appraisal request includes that hint and does not call a second model for it

#### Scenario: Coupon stays out
- **WHEN** the estate notes contain a coupon code
- **THEN** the appraisal request omits the code

### Requirement: Template title is not the item
When the active lot is a template, the appraisal request SHALL NOT present that title as the item's name. It MAY include the lot number and the weight tier as listing context. The identified name SHALL come from the image. The request SHALL NOT ask the model to invent a size, weight, or certification number.

#### Scenario: Item on screen
- **WHEN** the lot title is "*c - 2 oz Item on screen #57"
- **THEN** the appraisal request does not call the item "Item on screen" and may include lot 57 and the 2 oz tier

#### Scenario: No name in the title
- **WHEN** the image shows a sticker sheet and the title is "Junk bag #70"
- **THEN** the identified name comes from the image
