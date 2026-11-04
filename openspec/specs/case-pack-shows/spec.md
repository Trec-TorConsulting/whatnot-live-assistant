# case-pack-shows Specification

## Purpose
On a case-pack or wholesale show, read how many pieces a lot holds and what each piece costs after shipping and tax, so a reseller can judge a pack in the seconds before it closes.

## Requirements

### Requirement: Case-pack line
On a wholesale show, the Live panel and the on-page assistant SHALL show a case-pack line for the current lot, built from the listing, the notes, chat, and the shipping already on the page. It SHALL show before any model call returns. It SHALL show the lot number, the piece count and its source, the size run when stated, the price per piece at the current bid (or at the start when nobody has bid), and the landed cost per piece.

#### Scenario: Dozen at the start
- **WHEN** the lot is "12/$12 SB, 11/4 am" at a $12 start with $5.25 shipping, no tax rate, and no earlier win in the show
- **THEN** the line shows 12 pieces from the title, $1.00 each, and $1.44 each landed, before the appraisal returns

#### Scenario: Not a wholesale show
- **WHEN** the show type is not wholesale
- **THEN** no case-pack line is shown

### Requirement: Landed cost per piece
Landed cost per piece SHALL be the current bid (or start), plus shipping that the shipping rules say is still owed, plus the user's sales tax on the bid, divided by the piece count. When no piece count is known, the system SHALL NOT show a per-piece price or landed cost.

#### Scenario: Mod count on a generic lot
- **WHEN** "Clothing Case Pack - Pink Tag #66" is at $21 with $7.75 shipping, no tax rate, no earlier win, and a mod line "Hats- 10"
- **THEN** the line shows Hats, 10 pieces from a mod, $2.10 each, and $2.88 each landed

#### Scenario: No count
- **WHEN** the lot title is "A Grinch 40 ounce" and no host, mod, or notes line gives a count
- **THEN** no per-piece figure is shown

### Requirement: Piece count from the listing
The system SHALL read a piece count from the lot title or subtitle only when a number is attached to a count word: N/$P, N pcs, N pieces, N pairs, N-pack, N pk, lot of N, case pack of N, N per, or dozen as 12. Sizes, weights, volumes, scales, heights, lot numbers, dollar figures, and "N count" product sizes SHALL NOT be counts.

#### Scenario: Pieces and pairs
- **WHEN** the titles are "CASEPACK 6PCS CT-3377 BLACK Oversize Top", "12 pairs Christmas socks 31079 size 9-11", and "Hasbro 3 per Transformers Cyberworld Grimlock"
- **THEN** the counts are 6, 12, and 3

#### Scenario: Numbers that are not counts
- **WHEN** the titles are "4-Foot Candy Cane Lane Inflatable Santa", "goldkey laundry pods 42 count", and "AMA Supercross 1:10 Scale #12"
- **THEN** none of them has a piece count from those numbers

### Requirement: Sets are one item
A count that describes the pieces of one set, such as "4 piece set" or "9 piece set", SHALL count as one item, not a pack of that many.

#### Scenario: Gift set
- **WHEN** the lot is "Holiday Beauty Set" with the description "9 piece set. Will bundle"
- **THEN** the count is 1 and the price is not divided by 9

### Requirement: Count precedence
The piece count SHALL come, in order, from a host or mod line for the current lot, then the lot title and subtitle, then a default ratio in the published notes. The line SHALL name which one was used. A subtitle that says the lot is sold per piece SHALL make the count 1.

#### Scenario: Notes default
- **WHEN** the notes say items run 12/$12 unless stated otherwise and the current lot title has no count
- **THEN** the count is 12 and the line says it came from the notes

#### Scenario: Mod overrides the notes
- **WHEN** the notes say 12/$12 unless stated otherwise and a mod writes "6/$12" for the current lot
- **THEN** the count is 6 and the line says it came from a mod

#### Scenario: Sold per piece
- **WHEN** the lot is "Wholesale Show" with the subtitle "Sold per piece" at $4
- **THEN** the count is 1 and the price per piece is $4

### Requirement: Conflicting counts
When the title and the subtitle or description state different piece counts, the line SHALL show both and SHALL use the lower count for per-piece math.

#### Scenario: Twenty or twenty-five
- **WHEN** the title says "CHILDREN'S CLOTHING • 20 PIECES", the description says "Get 25 brand-new pieces", and the start is $49
- **THEN** the line shows 20 and 25 pieces and $2.45 each from 20

### Requirement: Size run
When the listing states how the pack splits by size, the line SHALL show that size run. When the sizes add up to a different number than the piece count, the line SHALL say they disagree.

#### Scenario: Two of each
- **WHEN** a buy-it-now is "CASEPACK 6PCS TW-2340 Mock Neck Short Sleeve Sweater" with "Includes 2S, 2M, 2L" at $78
- **THEN** the line shows 6 pieces, 2 S · 2 M · 2 L, and $13.00 each

### Requirement: Weight-tier boxes
A lot priced by weight with no piece count SHALL show a price per pound instead of a price per piece.

#### Scenario: Three-pound box
- **WHEN** the lot is "3 lb" at a $30 start
- **THEN** the line shows $10.00 per lb and no per-piece price

### Requirement: Generic case-pack lots
A lot title that names no product SHALL be treated as a generic case-pack lot. Examples are a color tag ("Clothing Case Pack - Pink Tag"), a ratio only ("12/$12 Dozens"), a shipping or start rule ("$3.99 Shipping Cap"), "Wholesale Show", "Quality Item", "Random Items", "Case Pack or Bundle as Seen", a weight tier, "Pallet", or "Rewards Bundle". Its title SHALL NOT be shown as the item name.

#### Scenario: Shipping-cap lot
- **WHEN** the lot is "$3.99 Shipping Cap #308" and no host or mod line names it
- **THEN** the line shows lot 308 and does not call the item "$3.99 Shipping Cap"

### Requirement: Host and mod contents lines
On a wholesale show, a host or mod line that names the contents of the current generic lot SHALL be pinned to that lot number, with any count it states ("Hats- 10", "SQUISHY CHUBBY BANANA X2"). A later lot SHALL NOT reuse the pin. A viewer's line SHALL NOT be pinned. Nothing SHALL be sent to chat.

#### Scenario: Mod names the squishy
- **WHEN** the current lot is "$3.99 Shipping Cap #308" and a mod writes "JUMBO SQUISHY !? X1"
- **THEN** lot 308 shows Jumbo Squishy with 1 piece

#### Scenario: Viewer asks
- **WHEN** a viewer writes "Any more of the colored little purses"
- **THEN** nothing is pinned to the current lot

### Requirement: Per-piece run board
On a wholesale show, the system SHALL keep the newest twelve paid case-pack hammers in this show, each with its lot number, pinned name, count, price, and price per piece when a count was known. Giveaways and non-positive prices SHALL stay off the board.

#### Scenario: Hat pack sells
- **WHEN** lot 66 with the pin "Hats- 10" sells for $21
- **THEN** the board's newest row is lot 66, Hats, 10 pieces, $21, $2.10 each

### Requirement: Break-even resale per piece
When a landed cost per piece is known, the line SHALL show the resale price per piece that breaks even after the user's seller fee percent and the fixed fee per sale. When an appraisal gives a per-piece estimate, the line SHALL also show the estimated margin per piece and for the pack, labeled as an estimate.

#### Scenario: Hats at the default fee
- **WHEN** the landed cost is $2.88 each and the fee setting is 10.9% plus $0.30
- **THEN** the line shows break even at $3.57 each

### Requirement: Per-piece shop rows
On a wholesale show, the shop note SHALL list buy-it-now rows that have a readable piece count by price per piece, cheapest first, up to eight. These rows SHALL be labeled as per-piece prices and SHALL NOT be called steals or deals unless the shop scan's own rules list them. Whatnot's quantity SHALL be read as stock, not pieces.

#### Scenario: Three case packs
- **WHEN** the shop has "CASEPACK 6PCS NT-6068 H GREY Jumpsuit" at $48, "CASEPACK 4PCS IP-10019D4 BLACK Pants" at $52, and "CASEPACK 6PCS TW-2736 BLACK Sweater" at $104, each with a quantity of 16 to 50
- **THEN** the rows read $8.00, $13.00, and $17.33 each, in that order, and none is called a steal

### Requirement: Seller price claims
An MSRP figure, an "N+ value" figure, a leading dollar figure before the product name, and a flash sale's struck-through price SHALL be shown as the seller's claim. None of them SHALL set or raise a market value, a suggested max, or a comp.

#### Scenario: MSRP in the title
- **WHEN** the lot is "$79 msrp 10-Pack Solid Color T-Shirt Bundle" at $10
- **THEN** the line shows 10 pieces, $1.00 each, and "seller says MSRP $79", and no market value is taken from $79

#### Scenario: Flash sale
- **WHEN** a flash sale shows "12 pairs Christmas socks" at $9, struck through from $50, 82% off
- **THEN** the line shows 12 pieces, $0.75 each, and "seller's was-price $50", and $50 is not a market value
