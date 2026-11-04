# Spec Delta

## Purpose

Turns a flea-market runner's notes and the host's vendor price into a run start and an all-in, before the auction exists, and scans the stall once while the show is waiting.

## ADDED Requirements

### Requirement: Runner pass
The runner pass SHALL turn on when the published notes instruct chat to answer R for run and P for pass, and those notes also contain at least one vendor-price rung. It SHALL NOT change the show type. It SHALL NOT bid, send chat, enter a giveaway, or claim a coupon. It SHALL NOT turn on for one named seller.

#### Scenario: Leesport notes
- **WHEN** the published notes say to put in R for Run and P for Pass, and they list vendor price $1 running for $6, and the show type is flea
- **THEN** the runner pass is on and the show type stays flea

#### Scenario: Flea notes with no ladder
- **WHEN** the published notes describe a flea market and do not give a vendor-price rung
- **THEN** the runner pass is off

#### Scenario: Unpublished notes
- **WHEN** the only copy of the ladder is an unpublished note
- **THEN** the runner pass is off

### Requirement: Price ladder
The system SHALL read each explicit rung, a doubled-above threshold, and one optional flat add named for glass, multiple items, or bubble wrap. The Live panel and the on-page assistant SHALL show that ladder once. Notes that do not parse SHALL NOT be given an invented rung.

#### Scenario: Leesport ladder
- **WHEN** the notes say vendor $1 runs for $6, $2 for $7, $3 for $8, $4 for $9, anything $5 and up is doubled, and large glass or multiple items add $5
- **THEN** both surfaces show those four rungs, the double from $5, and the $5 add

#### Scenario: Notes are read again
- **WHEN** the same published notes are fetched a second time
- **THEN** the ladder is still shown once

#### Scenario: No rung to parse
- **WHEN** the notes tell chat to answer R or P and state no vendor price and no run price
- **THEN** neither surface shows a ladder

### Requirement: Run quote
When the host or a mod states one vendor price, both surfaces SHALL show that vendor price, the ladder start, shipping when it is known, and the sum of the start, any wrap, and that shipping. The quote SHALL be shown from the notes and that chat line, with no model call.

#### Scenario: Vendor price at eight dollars
- **WHEN** the host says the vendor wants $8 and the ladder doubles from $5, and shipping is $7.75
- **THEN** both surfaces show a vendor price of $8, a start of $16, shipping of $7.75, and a sum of $23.75, with no wrap

#### Scenario: Two-dollar rung
- **WHEN** the host says the vendor price is $2 and that rung runs for $7
- **THEN** both surfaces show a start of $7

#### Scenario: Before any appraisal
- **WHEN** the host states a vendor price and no appraisal is in flight
- **THEN** the quote is already showing

### Requirement: Wrap on the quoted line
Wrap SHALL be included only when the host or mod line that set the vendor price mentions glass, multiple items, a bundle, or bubble wrap.

#### Scenario: Glass on the same line
- **WHEN** the host says large glass at a vendor price of $3, that rung runs for $8, and the ladder adds $5 for glass
- **THEN** both surfaces show a start of $8, wrap of $5, and a merchandise total of $13 before shipping

#### Scenario: No wrap words
- **WHEN** the host states a vendor price of $8 and does not mention glass, multiple items, a bundle, or bubble wrap
- **THEN** the quote includes no wrap

### Requirement: Lines that do not set a quote
A viewer's amount SHALL NOT set the quote. A host or mod line that only restates the known shipping amount SHALL NOT set the quote. A line with more than one vendor amount SHALL NOT set the quote. The system SHALL NOT type R or P and SHALL NOT put either letter in the chat box.

#### Scenario: Viewer names a price
- **WHEN** a viewer who is not the host or a mod says they would pay $50
- **THEN** the quote is unchanged

#### Scenario: Host restates shipping
- **WHEN** the host says shipping is $7.75 and the known shipping quote is $7.75
- **THEN** the quote is unchanged

#### Scenario: Two amounts
- **WHEN** the host says the vendor wants $8 or $10
- **THEN** the quote is unchanged

#### Scenario: No chat is filled
- **WHEN** a quote is showing
- **THEN** the chat box is not filled with R or P

### Requirement: Quote lifetime
A newer host or mod vendor price SHALL replace the quote. The start of a new auction SHALL clear it.

#### Scenario: Host corrects the price
- **WHEN** the host states a vendor price of $2 and then states a vendor price of $8
- **THEN** the quote uses $8

#### Scenario: Auction starts
- **WHEN** a new auction starts while a quote is showing
- **THEN** the quote is cleared

### Requirement: Shipping against the run
When shipping is known and is not yet paid in this show, both surfaces SHALL say that shipping is at least half the price when it is at least half the run start, or at least half the current bid once a lot is active. A paid win in this show SHALL remove that callout. A giveaway the user wins SHALL remove it when that giveaway's description says the seller pays shipping. The callout SHALL NOT place a bid or enter a giveaway.

#### Scenario: Shipping is most of a seven-dollar start
- **WHEN** the run start is $7, shipping is $7.75, and the user has no paid win in this show
- **THEN** both surfaces say that shipping is at least half the start

#### Scenario: Bid has pulled away
- **WHEN** the active lot is at $40 and shipping is $7.75
- **THEN** that shipping callout is not shown

#### Scenario: Shipping already paid
- **WHEN** the user already has a paid win in this show
- **THEN** that shipping callout is not shown

#### Scenario: Giveaway pays shipping
- **WHEN** the user wins a giveaway whose description says the seller pays shipping on giveaways
- **THEN** that shipping callout is removed and the giveaway is not entered by the extension

#### Scenario: Giveaway does not mention shipping
- **WHEN** the user wins a giveaway whose description does not say the seller pays shipping, and the user has no paid win
- **THEN** the shipping callout stays

### Requirement: Idle stall scan
While the runner pass is on, table scan is on, and no auction is active, the system SHALL scan the current camera frame once for other items. It SHALL NOT scan again until an auction has started and then ended. It SHALL NOT scan while the document is hidden or from the share-worker tab. An auction that starts SHALL be appraised without waiting for that scan. A scan result that arrives after the auction has started SHALL NOT replace that auction's appraisal. The scan SHALL NOT change the max bid.

#### Scenario: Waiting for the next item
- **WHEN** the runner pass is on, table scan is on, and the show is awaiting the next item
- **THEN** one table scan of the current frame is requested

#### Scenario: Still waiting
- **WHEN** that scan has already been requested and no auction has started since
- **THEN** no second idle scan is requested

#### Scenario: Lot starts during the scan
- **WHEN** an auction starts while the idle scan is still running
- **THEN** that auction is appraised without waiting, and the idle scan's result does not replace the appraisal

#### Scenario: Scan is off
- **WHEN** the user has turned table scan off
- **THEN** no idle scan is requested

#### Scenario: Share worker
- **WHEN** the tab is the auto-share worker
- **THEN** no idle scan is requested

#### Scenario: Hidden document
- **WHEN** the document is hidden
- **THEN** no idle scan is requested

### Requirement: Named as-seen lot
On a runner show, a lot title that is a specific item followed only by "as seen" or "as shown" SHALL keep that item name, and the estate template pass SHALL stay off for that lot. A title that is a template for another reason SHALL stay a template. On a show that is not a runner, a title that says "as seen" or "as shown" and names no brand, maker, or four-digit year SHALL stay a template.

#### Scenario: Cannons as seen
- **WHEN** the runner pass is on and the lot title is "Cannons As seen"
- **THEN** the item name is Cannons and the estate template pass is off for that lot

#### Scenario: Junk bag on a runner show
- **WHEN** the runner pass is on and the lot title is "Junk bag #3"
- **THEN** that title stays a template

#### Scenario: As shown off a runner show
- **WHEN** the runner pass is off and the lot title is "Sewing Patterns Vintage As Shown"
- **THEN** that title stays a template
