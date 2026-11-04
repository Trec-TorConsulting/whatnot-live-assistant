# Spec Delta

## ADDED Requirements

### Requirement: Electronics reading hint
When the electronics pass is on, the appraisal request SHALL tell the model to read brand, model, storage, and a visible condition, and to trust the image over a pull title. The hint SHALL say not to invent storage, carrier lock, battery health, an IMEI, a serial, or a certification number. The hint SHALL NOT add a model call. The estate reading hint SHALL NOT be added on that request. A coupon in the notes SHALL still be omitted.

#### Scenario: As-shown electronics lot
- **WHEN** the active lot is "ELECTRONIC AS SHOWN #150" and the electronics pass is on
- **THEN** the request includes the electronics hint, omits the estate hint, and does not call a second model

#### Scenario: Coupon stays out
- **WHEN** the electronics notes contain a coupon code
- **THEN** the appraisal request omits the code

### Requirement: Pull title is not the device
When the active lot is a pull bucket or a generic device class, the appraisal request SHALL NOT present that title as the item name. It MAY include the lot number and the tier as listing context. The identified name SHALL come from the image or from a pinned host or mod line.

#### Scenario: Generic iPad bucket
- **WHEN** the lot title is "APPLE IPAD" and the image shows a specific tablet
- **THEN** the request does not call the item "APPLE IPAD" and the identified name comes from the image

#### Scenario: Random item
- **WHEN** the lot title is "SMALL Random Item #202"
- **THEN** the request does not call the item "Random Item" and may include lot 202 and the small tier

### Requirement: MSRP is not the sold price
The appraisal request SHALL label a stated MSRP or retail price as a claim, not a sold price. The estimate SHALL NOT copy that number as the market value unless a watched sale or the model range, labeled as an estimate, supports it.

#### Scenario: Leading retail price
- **WHEN** the title begins with "$349" and then names an ECOVACS window robot
- **THEN** the request treats $349 as a stated MSRP and does not use it as a sold comp
