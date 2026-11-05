# Spec Delta

## MODIFIED Requirements

### Requirement: Shop buy-it-now scan
When a live show opens, the system SHALL read that show's shop and SHALL list buy-it-now items and named one-off auctions priced under melt, under watched sales, on the watchlist, needed for a saved set, or a known key, semi-key, or variety date. A specific title qualifies at any positive quantity. Zero-quantity rows, the auction opener ($1, or the shared low start at $5 or less), templates, pull buckets, generic device classes, giveaways, joke-priced rows, and parts rows SHALL NOT be listed as deals. The scan SHALL NOT buy or bid.

#### Scenario: Pre-bid next to a cheap buy-it-now
- **WHEN** the shop has a template auction that can be pre-bid and a buy-it-now coin priced under melt
- **THEN** only the buy-it-now coin is listed

#### Scenario: Dollar pre-bid next to a cheap buy-it-now
- **WHEN** the shop has a named auction at the $1 pre-bid start and a buy-it-now coin of the same kind priced under melt
- **THEN** only the buy-it-now coin is listed

#### Scenario: Named auction next to a template
- **WHEN** the shop has a template auction, a named one-off auction priced under its watched sales, and a buy-it-now coin priced under melt
- **THEN** the named auction and the buy-it-now coin are listed and the template auction is not

#### Scenario: Nothing under market
- **WHEN** every buy-it-now price and every named one-off auction price is at or above melt and the watched sale median, and none match the watchlist, a saved set, or a key date
- **THEN** the shop note says there are no deals

#### Scenario: Fractional ounce
- **WHEN** a buy-it-now title says 1/1000 oz gold and the price is above that fraction of spot
- **THEN** it is not listed as under melt

#### Scenario: Ordinal fractional gold eagle above fractional melt
- **WHEN** a buy-it-now title says "1/10th oz gold eagle ms70 2022" at $525 and gold spot is $4,130 ($413 melt)
- **THEN** it is not listed as a steal under melt

#### Scenario: Copper Libertad
- **WHEN** a buy-it-now title names a Libertad as copper, cobre, bronze, or brass
- **THEN** it is not listed as under silver melt

#### Scenario: Category placeholder
- **WHEN** the shop has a template titled "*z - Category - Coins" at $1 with a quantity in the hundreds
- **THEN** that listing is not listed as a deal

#### Scenario: Stocked model
- **WHEN** the shop has an "XGIMI MoGo Pro+" buy-it-now with quantity 26 priced under its watched sales
- **THEN** that listing is listed

#### Scenario: Generic device class
- **WHEN** the shop has an "APPLE IPAD" auction with quantity in the hundreds
- **THEN** that listing is not listed as a deal

#### Scenario: Joke giveaway price
- **WHEN** the shop has a buy-it-now titled as a giveaway and priced at $999,999
- **THEN** that listing is not listed as a deal

#### Scenario: Parts row
- **WHEN** a shop row is subtitled for parts or untested and working sales of a similar device are higher
- **THEN** it is not listed as a steal or a deal

#### Scenario: Two dollar opener
- **WHEN** 23 of the shop's 24 auctions start at $2
- **THEN** a $2 auction is not listed as a deal for that price

#### Scenario: Real start above the opener
- **WHEN** a tools shop auction for "2457-21 M12 Ratchet Kit" starts at $169 and two watched sales of 2457-21 are higher
- **THEN** that auction can be listed

#### Scenario: Zero-quantity listing is ignored
- **WHEN** a buy-it-now node has quantity or inventory equal to 0
- **THEN** it is not included in the parsed shop listings or scored as a hit

## ADDED Requirements

### Requirement: Live shop sync and rescan
When a shop GraphQL response arrives again or the user clicks Rescan, the system SHALL update existing listings by id, apply any changed price or quantity, and remove listings whose status is sold or whose quantity is zero. When a paid sale event arrives on the live socket matching a shop listing by id or buy-it-now title, the system SHALL decrement that listing's quantity or remove it when none remain.

#### Scenario: Price drop on re-read
- **WHEN** an active buy-it-now listing's price drops from $40 to $18 on a later shop read below $30 melt
- **THEN** the updated price replaces the old entry and the item is scored as a steal at $18

#### Scenario: Live sale exhausts buy-it-now stock
- **WHEN** a buy-it-now steal has quantity 1 and a paid sale for that listing arrives on the live socket
- **THEN** the listing is removed from the shop hits immediately

#### Scenario: Manual rescan
- **WHEN** the user triggers Rescan on the overlay or sidepanel
- **THEN** the content script requests a fresh shop fetch from the first page

### Requirement: Shop subtitle and spec enrichment
The shop scan SHALL read a listing's subtitle alongside its title for melt weight and purity, watchlist matching, sold comps, key-date callouts, device specs, tool platform and part numbers, missing-charger warnings, and buyer chat-want matches.

#### Scenario: Metal weight in subtitle
- **WHEN** a buy-it-now row is titled "Vintage Ring #14" with subtitle "14K Gold 5.2 grams" at $100 and gold melt is $250
- **THEN** `shopMelt` reads the subtitle weight and scores the ring as a steal under melt

#### Scenario: Tool specs and chat want on a shop hit
- **WHEN** a buyer asked "2457-21?" in chat and a shop deal is titled "2457-21 M12 Ratchet Kit"
- **THEN** the hit reason includes the tool quick read and notes that it matches a chat want

### Requirement: Shop hit controls and scarcity badges
The overlay and sidepanel SHALL show remaining stock on buy-it-now hits (`1 left` or `N in stock`), allow dismissing individual hits (`×`) for the current show to reveal the next ranked hit from the scored pool, and provide a `BIN only` / `All` toggle when the shop has one-off auctions.

#### Scenario: Dismissing a hit reveals the ninth hit
- **WHEN** nine shop hits are scored and the user dismisses one of the top eight
- **THEN** the dismissed hit is hidden for that show and the ninth hit appears in the list

#### Scenario: Filter to buy-it-now only
- **WHEN** the shop has both buy-it-now and auction hits and the user selects `BIN only`
- **THEN** only buy-it-now hits are displayed

