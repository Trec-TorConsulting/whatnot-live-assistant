# device-listings Specification

## Purpose
On electronics and tools shows, read a device listing's specs, missing accessories, stated retail, seller promises, and bucket shapes from the listing text, and list what to check before trusting the item.

## Requirements

### Requirement: Spec line
On an electronics or tools show, the quick read SHALL show year, chip, RAM, storage, screen size, and generation when the title states them. It SHALL show only what is stated. It SHALL NOT wait on a model.

#### Scenario: MacBook title
- **WHEN** the title is "2021 Apple Macbook Pro M1 14-Core 16GB RAM 1TB SSD 14\""
- **THEN** the spec line shows 2021, M1, 16GB RAM, 1TB, and 14 inch

#### Scenario: iPad generation
- **WHEN** the title is "2021 Apple iPad (9th Gen) 64GB GRAY"
- **THEN** the spec line shows 2021, 9th gen, and 64GB

#### Scenario: Nothing stated
- **WHEN** the title is "AI SMART GLASSES"
- **THEN** no spec line is shown

### Requirement: Missing accessory
A title or subtitle that says no charger, no adapter, or no power cord SHALL show a missing-accessory flag on that lot, before any model call. A note that says chargers are sold separately SHALL show on the rules, not on every lot.

#### Scenario: No charger prefix
- **WHEN** the title is "*NO CHARGER* Samsung 500C Chromebook 4GB 16GB Black"
- **THEN** the lot shows no charger

### Requirement: Stated retail forms
A stated MSRP SHALL also be read from "(RETAIL26.00)", "$58 value!", "$1999" inside a product title, and "(Retail 39.99)". A leading "(X)" SHALL be dropped from the name. The figure SHALL NOT set the market value.

#### Scenario: Retail without a space
- **WHEN** the title begins "(RETAIL26.00)Milwaukee Red Helix ... Drill Bit Set"
- **THEN** MSRP $26 is shown and the name starts at Milwaukee

#### Scenario: Price inside the title
- **WHEN** the title is "BOKU $1999 DRONE WITH SCREEN" and the bid is $56
- **THEN** $1999 is a stated MSRP and does not set the market value

### Requirement: Retail mismatch
When the published notes give a different retail for the same model as the lot title, the panel SHALL show both figures as stated retail. Neither SHALL set the market value.

#### Scenario: ION retail
- **WHEN** the title says "Audien ION ... MSRP $489" and the notes say "ION — Retail $295"
- **THEN** the panel shows both and labels them as stated retail

### Requirement: Seller promises
The rules SHALL show a return window, a warranty, fully unlocked, and charger sold separately when the published notes state them. They SHALL be shown next to, and SHALL NOT replace, a no-returns or no-cancellations rule. A promise SHALL NOT be invented.

#### Scenario: Return window and warranty
- **WHEN** the notes say "1-Year Warranty" and "45-Day Return Policy"
- **THEN** the rules show a 1-year warranty and a 45-day return window

#### Scenario: Unlocked and chargers sold separately
- **WHEN** the notes say everything is fully unlocked and chargers are listed separately in Buy It Now
- **THEN** the rules show fully unlocked and charger sold separately

### Requirement: More pull shapes
On an electronics or tools show, a pull bucket SHALL also include a bare weight range ("1-2", "10-14"), a lot whose title is the show banner, and a class bucket ("Batteries (2)", "Chargers", "Small item"). A title with a model, part number, or storage size SHALL stay specific.

#### Scenario: Bare range on a pallet show
- **WHEN** the show tags say Pallet Pulls and the lot is "10-14"
- **THEN** the lot is a pull bucket with a 10-14 tier

#### Scenario: Banner title
- **WHEN** the lot is "HD TOOLS & MORE (NO CANCELLATIONS) #44" and that matches the show title
- **THEN** the lot is a pull bucket

#### Scenario: Class bucket
- **WHEN** the lot is "Batteries (2)"
- **THEN** the lot is a pull bucket and not a comp

### Requirement: Device checks
After an appraisal names an electronics or tools item, the panel SHALL list at most five things to check. They SHALL be worded as checks and SHALL NOT say the item is fake.

#### Scenario: Used phone
- **WHEN** the appraisal names a used phone
- **THEN** checks include activation lock, carrier lock, battery health, and serial on the box matching the device

#### Scenario: Bare tool
- **WHEN** the appraisal names a cordless tool
- **THEN** checks include counting batteries and charger on camera, the nameplate part number, and the battery platform

### Requirement: Clone cues
A device check SHALL be added for a console sold as N-in-1 or with hundreds of built-in games, and for a storage card claiming 512GB or more at a start of $5 or less. The check SHALL be worded as something to verify.

#### Scenario: Built-in games console
- **WHEN** the lot is "P5 Handheld Retro Gaming Console – 520 Built-In Games"
- **THEN** checks include that built-in multi-game consoles are usually unlicensed

#### Scenario: Cheap terabyte card
- **WHEN** the lot is "1TB SD Card" at a $1 start
- **THEN** checks include testing the card's real capacity
