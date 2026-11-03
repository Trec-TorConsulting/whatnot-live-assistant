# Spec Delta

## Purpose

Names the item on an estate-style Whatnot show when the listing is only a shipping bucket, and shows the floor, the rules, and what just sold.

## ADDED Requirements

### Requirement: Estate pass
The estate pass SHALL turn on when the active lot is a template, or when the show title, categories, or published notes contain "estate sale" or "estate show". It SHALL NOT change the show type. It SHALL NOT bid, send chat, or enter a giveaway.

#### Scenario: Category is Estate Sales
- **WHEN** the categories include Estate Sales and the title does not say estate
- **THEN** the estate pass is on and the show type is unchanged

#### Scenario: Template lot on another show
- **WHEN** the show is not described as an estate and the active lot title is "Junk bag #3"
- **THEN** the estate pass is on

#### Scenario: Ordinary coin lot
- **WHEN** the show type is coins and the lot title names a 1921 Morgan dollar
- **THEN** the estate pass is off

### Requirement: Template listing
A title SHALL be a template when it contains "item on screen", "random pull", "random pulls", "junk bag", or "random beauties", when it is only a weight, size, or shipping bucket, when it is a category placeholder, or when it says "as shown" or "as seen" and names no brand, maker, or four-digit year. A title that names a brand, maker, or four-digit year SHALL NOT be a template. Quantity alone SHALL NOT make a named title a template.

#### Scenario: Item on screen
- **WHEN** the title is "*c - 2 oz Item on screen #57"
- **THEN** it is a template, the lot number is 57, and the tier is 2 oz

#### Scenario: Junk bag
- **WHEN** the title is "Junk bag #70 Bid responsibly no refund"
- **THEN** it is a template and the lot number is 70

#### Scenario: Random pulls
- **WHEN** the title is "E Random 1-2lb #10"
- **THEN** it is a template, the lot number is 10, and the tier is 1-2 lb

#### Scenario: Weight bucket
- **WHEN** the title is "Cool Vintage Small 8-11 oz"
- **THEN** it is a template and the tier is 8-11 oz

#### Scenario: Category placeholder
- **WHEN** the title is "*z - Category - Coins"
- **THEN** it is a template

#### Scenario: As shown with no maker
- **WHEN** the title is "Sewing Patterns Vintage As Shown"
- **THEN** it is a template

#### Scenario: Named clothing
- **WHEN** the title is "Chico's Blue Textured Fringe Trim Sweater Jacket Size 1 Medium"
- **THEN** it is not a template

#### Scenario: Year is not a lot number
- **WHEN** the title is "Better Homes & Gardens Cookbook 1953"
- **THEN** it is not a template and 1953 is not a lot number

### Requirement: Template line
While the estate pass is on and the active lot is a template, the Live panel and the on-page assistant SHALL show the lot number when the title has one, the weight or size tier when the title has one, the start price, and the shipping quote. That line SHALL come from the listing alone and SHALL NOT wait on a model. The template title SHALL NOT be shown as the item name.

#### Scenario: Before the appraisal returns
- **WHEN** the active lot is "*c - 2 oz Item on screen #57" at a $4 start with shipping of $4.47 and no appraisal has returned
- **THEN** both surfaces show lot 57, the 2 oz tier, the $4 start, and $4.47 shipping, and neither names the item "Item on screen"

### Requirement: Shipping against the floor
On a template lot, when shipping is known and the user has no paid win in this show, the Live panel and the on-page assistant SHALL say that shipping is at least half the price when shipping is at least half the current bid, or half the start price if nobody has bid. A later paid win in this show SHALL remove that callout. The callout SHALL NOT block or place a bid.

#### Scenario: Shipping is most of a five-dollar bid
- **WHEN** the template lot is at $5, shipping is $4.47, and the user has no paid win in this show
- **THEN** both surfaces say that shipping is at least half the bid

#### Scenario: Bid has pulled away
- **WHEN** the same lot is at $36 and shipping is $4.47
- **THEN** that shipping callout is not shown

#### Scenario: Shipping already paid this show
- **WHEN** the user already has a paid win in this show
- **THEN** that shipping callout is not shown

#### Scenario: No bid yet
- **WHEN** nobody has bid, the start is $3, and shipping is $4.47
- **THEN** both surfaces compare shipping with the $3 start and show the callout

### Requirement: Run board
The Live panel and the on-page assistant SHALL list up to twelve sold template lots from this show, newest first. Each entry SHALL show the lot number, the hammer, and the recognized name when one was pinned before the sale. An entry with no name SHALL still show the number and the hammer. Giveaways and non-positive prices SHALL be left off. The board SHALL clear when the live show changes.

#### Scenario: Same title, different hammers
- **WHEN** this show sold template lot #40 for $36 and template lot #42 for $1
- **THEN** the board lists both numbers with those prices

#### Scenario: Name pinned before the hammer
- **WHEN** a host line named lot #10 before it sold for $20
- **THEN** the board entry for #10 includes that name and $20

#### Scenario: Giveaway
- **WHEN** a giveaway ends between two template sales
- **THEN** the board does not list the giveaway

### Requirement: Pinned identification
A host or moderator chat line that names an item SHALL pin that name to the current template lot number. A line that is only a greeting, a join, thanks, or emoji SHALL NOT pin. A later appraisal name for that same lot SHALL replace the pin. The system SHALL NOT send chat.

#### Scenario: Mod names the glass
- **WHEN** the active template lot is #10 and a moderator writes "manganese toothpick holder"
- **THEN** lot #10 shows that name

#### Scenario: Thanks does not pin
- **WHEN** the host writes "Ty!"
- **THEN** no name is pinned

#### Scenario: Appraisal replaces the pin
- **WHEN** lot #10 was pinned "toothpick holder" and the appraisal names "Manganese glass toothpick holder"
- **THEN** the shown name is the appraisal name

### Requirement: Buyer wants
A buyer line SHALL be kept as a want when it asks with "any", "run", or "please", or when it is an item question of one to four words. Lines about shipping, sound, or the seller SHALL NOT be wants. At most twenty wants SHALL be kept for the show. A want SHALL match the current lot when its longest word of four or more letters appears in the recognized name. A match SHALL be highlighted. Wants SHALL clear when the show changes. A match SHALL NOT bid, send chat, or change the watchlist.

#### Scenario: Run the duck
- **WHEN** a buyer writes "Can you run the duck with the heart dress?"
- **THEN** that line is kept as a want

#### Scenario: Sterling question
- **WHEN** a buyer writes "Sterling?"
- **THEN** sterling is kept as a want

#### Scenario: Not a want
- **WHEN** a buyer writes "No sound?" or "How do the bulk ship?"
- **THEN** neither line is a want

#### Scenario: Later lot matches
- **WHEN** lion is a want and the current lot's recognized name is "Chalkware lion bookend"
- **THEN** that want is highlighted

#### Scenario: Watchlist unchanged
- **WHEN** a want matches the current lot
- **THEN** the watchlist is unchanged and no bid is placed

### Requirement: Rules once
While the estate pass is on, the Live panel and the on-page assistant SHALL show buying rules found in the published notes or the active lot title: no returns, as-is or as seen, not laundered or clean before wearing, and solo-ship or fragile. The same set SHALL show once and SHALL NOT be added again on the next lot. A coupon code SHALL NOT be shown as a rule and SHALL NOT be claimed.

#### Scenario: Notes and a coupon
- **WHEN** the notes say the items were not washed and contain "/coupon SAVE10"
- **THEN** both surfaces show the clean-before-wear rule and do not show or claim SAVE10

#### Scenario: Next template lot
- **WHEN** the next template lot carries the same rules
- **THEN** the rules are not added a second time

#### Scenario: No returns on the title
- **WHEN** the lot title says "no refund" and "as seen"
- **THEN** both surfaces show no returns and as-is

### Requirement: Clothing line
When the recognized item is clothing, the Live panel and the on-page assistant SHALL show the brand, the size, and a flaw or care line that the listing, the notes, or the appraisal states. A size, measurement, or flaw that was not stated SHALL NOT be filled in.

#### Scenario: Size on the listing
- **WHEN** the recognized item is a Chico's jacket and the listing says size 1
- **THEN** both surfaces show Chico's and size 1

#### Scenario: Unstated measurement
- **WHEN** no measurement was stated for that clothing item
- **THEN** no measurement is shown
