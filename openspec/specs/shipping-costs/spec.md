# shipping-costs Specification

## Purpose
Work out how much shipping a win still adds, using the show's own shipping rules instead of assuming that any earlier win means shipping is paid.

## Requirements

### Requirement: Shipping already paid
The all-in and the landed cost SHALL treat shipping as already paid only when the user has a win in this show and no shipping rule for the current lot says it ships separately. Otherwise they SHALL add the shipping on the page. The line SHALL say which case applies.

#### Scenario: Second win, no rules
- **WHEN** the user won a lot earlier in this show and the notes state no shipping rules
- **THEN** the all-in adds no shipping and says shipping is already paid this show

#### Scenario: First win
- **WHEN** the user has no win in this show and the page shows $5.25 shipping
- **THEN** the all-in adds $5.25

### Requirement: Shipping cap
When the notes, the show title, the lot title, or a host or mod line states a maximum shipping charge for the show, the system SHALL show that cap once as a show rule. The shipping added for the first win SHALL NOT exceed the cap. When the notes say shop and live purchases combine, a buy-it-now win in this show SHALL count as a win.

#### Scenario: Cap covers a later win
- **WHEN** the notes say "Max bundled shipping $9.99 no matter how much you buy" and the user already won in this show
- **THEN** the all-in adds no shipping and says the $9.99 cap covers it

#### Scenario: Mod states the cap
- **WHEN** a mod writes "$12.99 max shipping"
- **THEN** the show rules show a $12.99 shipping cap

### Requirement: Tiers that ship separately
When the notes say a named tier does not bundle, or say a lot ships solo, a lot in that tier SHALL add its shipping even after a win in this show. The line SHALL say this tier ships on its own.

#### Scenario: Large does not bundle
- **WHEN** the notes say "Small, medium, and large do not bundle shipping", the user already won in this show, and the current lot title names the large tier
- **THEN** the all-in adds the page's shipping and says this tier ships on its own

### Requirement: Bundle weight limit
When the notes say shipping bundles only up to a stated weight, a later win SHALL be labeled as likely combined up to that weight, not as paid. A weight-tier lot above that weight SHALL add its shipping.

#### Scenario: Five-pound limit
- **WHEN** the notes say "Whatnot bundles your shipping up to 5 lbs", the user already won in this show, and the current lot is "Case 6-10 pounds" with $12.99 shipping
- **THEN** the all-in adds $12.99 and says the lot is past the 5 lb bundle

### Requirement: Pallet freight
When the notes or the shop name freight for a pallet beyond the on-screen shipping, the all-in for a pallet lot SHALL add the freight row for the user's US time zone, read from the browser. Without a match, it SHALL show the range of rows and add none. On-screen shipping SHALL be labeled as not the freight. A liftgate or residential row SHALL be shown as optional and not added.

#### Scenario: Eastern buyer
- **WHEN** the browser time zone is America/New_York, the shop has Eastern $246, Central $257, Mountain $376, and Pacific $460 freight rows and a $200 residential liftgate row, and "Pallet #4" is at $540 with $4.47 on-screen shipping and no tax rate
- **THEN** the all-in is $790.47 with Eastern freight $246, on-screen $4.47 is labeled as not the freight, and the $200 liftgate is shown as optional

#### Scenario: Time zone unknown
- **WHEN** the browser time zone is not a US zone and the same freight rows exist
- **THEN** the all-in shows freight from $246 to $460 and adds none of it

#### Scenario: Coffin box ships as shown
- **WHEN** the notes say coffin boxes ship for what is on screen and the current lot is "Coffin"
- **THEN** no pallet freight is added

### Requirement: Shipping rules shown once
The Live panel and the on-page assistant SHALL show the show's shipping rules once per show: the cap, combined shop shipping, tiers that ship separately, the bundle weight limit, and pallet freight. A rule that is not stated SHALL NOT be shown. Nothing SHALL be bought, including a freight row.

#### Scenario: No rules stated
- **WHEN** the notes and title state no shipping rules
- **THEN** no shipping-rule line is shown
