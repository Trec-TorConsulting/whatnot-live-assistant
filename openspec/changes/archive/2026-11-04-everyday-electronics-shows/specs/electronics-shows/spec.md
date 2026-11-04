# Spec Delta

## Purpose

On an electronics show, tell a shipping-bucket pull from a specific device, and show condition, rules, and wants before the model answers. The assistant does not bid or send chat.

## ADDED Requirements

### Requirement: Electronics pass
The electronics pass SHALL turn on when the show type is electronics. It SHALL also turn on when the active lot is a pull bucket. It SHALL NOT turn on for a coin, card, or jewelry show whose title merely mentions a phone or a laptop.

#### Scenario: Everyday Electronics with a pallet tag
- **WHEN** the categories include Everyday Electronics and Pallet Pulls
- **THEN** the electronics pass is on

#### Scenario: Coin show mentions a phone
- **WHEN** the categories are coins and the title mentions a phone
- **THEN** the electronics pass stays off

### Requirement: Pull bucket
A pull bucket SHALL be a size or weight tier, a pallet pull, a random item, an as-shown or as-seen title, a warehouse size code, or a device class with no model, storage size, or year. A year, a storage size, or a model name SHALL keep the listing specific.

#### Scenario: Size pull
- **WHEN** the title is "1. XS-XSMALL PULL"
- **THEN** the listing is a pull bucket

#### Scenario: Weight pallet
- **WHEN** the title is "Medium Pallet Pull (1-2LB)"
- **THEN** the listing is a pull bucket and the tier is 1-2 lb

#### Scenario: Specific model
- **WHEN** the title is "2020 Apple MacBook Air Laptop Apple M1 Chip (USED)"
- **THEN** the listing is not a pull bucket

#### Scenario: As shown and a warehouse code
- **WHEN** the title is "ELECTRONIC AS SHOWN" or "No Risk Pallet Pulls (ABC LARGE)"
- **THEN** the listing is a pull bucket

#### Scenario: Generic device class
- **WHEN** the title is "APPLE IPAD" or "Android Smartphone (not a Samsung)"
- **THEN** the listing is a pull bucket

### Requirement: Pull quick read
On a pull bucket, the Live panel and the on-page overlay SHALL show the lot number, tier, start price, and shipping as soon as the listing is known, before any model call. The line SHALL NOT name the item from the pull title.

#### Scenario: Numbered small pull
- **WHEN** the active lot is "SMALL Random Item #202" with a $3 start and $6.75 shipping
- **THEN** the quick read shows lot 202, the small tier, the $3 start, and $6.75 shipping, and does not call the item "Random Item"

### Requirement: Listing condition
The pass SHALL read the listing subtitle or title condition as brand new, open-box, used and working, certified refurbished, or for parts or untested. The quick read SHALL show that condition before any model call. A certified-refurbished show tag SHALL NOT override a for-parts subtitle on the current lot.

#### Scenario: For parts on a refurbished show
- **WHEN** the show tag says Certified Refurbished and the lot subtitle says "For parts, not fully functioning, or untested"
- **THEN** the quick read says for parts or untested

#### Scenario: Open box
- **WHEN** the subtitle is "Open-box"
- **THEN** the quick read says open-box

### Requirement: Parts are not a steal
A pull or shop row whose condition is for parts or untested SHALL NOT be listed as a steal or a deal against working-condition sales. The panel MAY show it as a parts lot.

#### Scenario: Untested pallet
- **WHEN** "No Risk Pallet Pulls (ABC LARGE)" is for parts and working sales of a similar device are higher
- **THEN** it is not listed as a steal or a deal

### Requirement: Stated MSRP
A price introduced as MSRP, retail, or a leading dollar amount in a title or a host line SHALL be shown as a stated MSRP label. It SHALL NOT set the market value and SHALL NOT be sent to the model as a sold price.

#### Scenario: Retail in the title
- **WHEN** the title is "($200 Retail) Viaim Black RecDot AI Voice Recorder Earbuds"
- **THEN** the panel may show MSRP $200 and the item name used for comps omits that retail clause

#### Scenario: Host states MSRP
- **WHEN** the host writes "MSRP $140 ARZOPA 17.3 portable monitor"
- **THEN** $140 is a stated MSRP and does not set the market value

### Requirement: Buying rules
The pass SHALL show, once per distinct set, rules read from the published notes or the current lot: no returns or no cancellations, a bundle cap, a region that will not ship, and whether a charger is included for this kind of device. A rule SHALL NOT be invented. A referral link or a Discord link SHALL NOT be opened or claimed.

#### Scenario: No Canada and no phone charger
- **WHEN** the notes say no shipping to Canada, laptops come with chargers, and phones and tablets do not
- **THEN** the rules show no Canada shipping, and a phone or tablet lot shows that a charger is not included

#### Scenario: Bundle cap
- **WHEN** the notes say bundle shipping up to 6 items
- **THEN** the rules show a bundle cap of 6

### Requirement: Sudden death
When the show tags or published notes say sudden death, the panel SHALL show a sudden-death label. The label SHALL NOT place a bid or change the max bid.

#### Scenario: Sudden death tag
- **WHEN** the categories include Sudden Death
- **THEN** the panel shows sudden death and does not bid

### Requirement: Shipping against the floor
On a pull bucket, when shipping has not already been paid in this show and shipping is at least half the current bid, or half the start price when nobody has bid, the panel SHALL say so. A later paid win in the show clears it.

#### Scenario: Shipping above the start
- **WHEN** the lot is "Large #4" at a $1 start with $11.05 shipping and the user has not paid shipping in this show
- **THEN** the panel says shipping is at least half the start

### Requirement: Run board
The pass SHALL keep the newest twelve pull sales in this show, with the hammer and the recognized name when an appraisal or a host or mod line supplied one. A giveaway and a non-positive price SHALL stay off the board. The board SHALL clear when the live path changes.

#### Scenario: Named pull hammer
- **WHEN** pull lot 46 sells for $24 and the appraisal named it
- **THEN** the board shows lot 46, $24, and that name

#### Scenario: Giveaway stays off
- **WHEN** a giveaway completes between two pull sales
- **THEN** the giveaway is not on the board

### Requirement: Pinned identification
A host or mod line that names the item SHALL pin onto the current pull lot number. A join, a greeting, or an emoji-only line SHALL NOT pin. A later lot SHALL NOT rewrite an earlier pin. The pin SHALL be replaced when the appraisal names that same lot.

#### Scenario: Mod names the piece
- **WHEN** a mod writes "Apple AirPods Pro 1" during pull lot 150
- **THEN** lot 150 is pinned to that name

#### Scenario: Cheer does not pin
- **WHEN** a mod writes only crowns
- **THEN** nothing is pinned

### Requirement: Buyer wants
The pass SHALL keep buyer lines that ask for an item, including "any optiplex?" and "GoPro", and SHALL highlight a later lot or shop row whose recognized name matches. It SHALL NOT send chat. A line that asks for a phone number, an iMessage, or a handle SHALL NOT be stored as a want.

#### Scenario: Later shop row matches
- **WHEN** a buyer asks "any optiplex?" and a later recognized lot or shop row is an OptiPlex
- **THEN** that want is highlighted and no chat is sent

#### Scenario: Solicitation is dropped
- **WHEN** a line asks the viewer to message a cellphone number
- **THEN** it is not stored as a want
