# Reference prices

## Purpose
After the item is identified, the extension looks up coin, card, cert, and record prices from the sources the user has enabled. A lookup that names a different item is rejected. Missing tokens skip that source. External lookups are rate-limited per domain, and background spot fetches fail silently without throwing unhandled exceptions.

## Requirements

### Requirement: External provider rate limiting
All outbound queries to external reference hosts (Scryfall, Pokémon TCG, YGOPRODeck, PSA, Discogs, eBay, Greysheet, PCGS) SHALL pass through a centralized rate gate. The rate gate SHALL throttle queries to respect per-domain concurrency limits and prevent HTTP 429 errors. When burst scans occur, queries SHALL queue and drain in order without dropping active appraisals.

#### Scenario: Burst shop scan lookups
- **WHEN** a shop scan triggers 30 simultaneous reference price queries to Scryfall
- **THEN** the rate gate schedules requests with a maximum rate of 10 requests per second and completes all lookups without HTTP 429 rate limit errors

### Requirement: Resilient spot price warming
Background spot metal price warming (such as calls to `api.gold-api.com`) SHALL catch and suppress network, DNS resolution, and abort errors. If the user is offline or the host is unreachable, spot lookups SHALL return `null` and SHALL NOT emit unhandled promise rejections or unhandled runtime exceptions.

#### Scenario: Offline spot price lookup
- **WHEN** an appraisal runs while the machine is offline or `api.gold-api.com` fails to resolve
- **THEN** spot price warming logs a debug notice, returns `null`, and the appraisal completes using non-metal pricing without throwing an error

### Requirement: PCGS coin sales
PCGS SHALL be called only for coins, bullion, or tokens and medals, and only when a PCGS token is saved. Cert lookup SHALL require a slabbed PCGS cert of at least six digits. If CoinFacts names a different coin, that price SHALL be discarded and a spec lookup SHALL NOT run. The price guide SHALL NOT become the bid value. New calls SHALL stop near the daily cap. Cached entries SHALL still return.

#### Scenario: No PCGS token
- **WHEN** the item is a coin and no PCGS token is saved
- **THEN** PCGS is not called

#### Scenario: Cert names another coin
- **WHEN** the cert lookup returns a coin that does not match the identification
- **THEN** that price is not used

### Requirement: Greysheet BYOK pricing
Greysheet (CDN Publishing) SHALL be called only when the user has saved both an API key and an API token in Settings. Calls SHALL query the CDN Public API V2 for numismatic items and extract wholesale bid/ask and CPG retail guide values. If either credential is missing or rejected, Greysheet SHALL NOT run and other pricing sources SHALL proceed.

#### Scenario: Greysheet credentials configured
- **WHEN** an item is a coin and valid Greysheet API credentials are saved
- **THEN** the extension looks up wholesale and CPG values from the CDN Public API V2

#### Scenario: No Greysheet credentials
- **WHEN** an item is a coin and Greysheet credentials are empty
- **THEN** Greysheet is not called and the appraisal uses other available price sources

### Requirement: NumisMedia Fair Market Value (FMV) guide
US collector coins SHALL be matched against the NumisMedia FMV guide across Sheldon grade tiers (G-4 through MS-67). The guide price SHALL account for key dates, semi-key dates, and varieties. The FMV value SHALL serve as a verified retail benchmark without requiring an API token.

#### Scenario: Graded Morgan dollar
- **WHEN** a Morgan Dollar is appraised with grade MS-65
- **THEN** the NumisMedia FMV guide price for that grade tier is displayed on the appraisal card

#### Scenario: Key date premium
- **WHEN** a recognized key date coin (such as an 1893-S Morgan or 1921 Peace dollar) is appraised
- **THEN** the FMV calculation incorporates the key date premium

### Requirement: Recent auction and eBay sold comps
Recent auction and realized sale comps SHALL be queried from completed, sold eBay listings for identified coins, cards, and collectibles. The search SHALL filter out reproductions, copies, and non-sold listings. If matching sold items are found, the extension SHALL display the count, price range, and median realized sale price with a direct link to the search.

#### Scenario: Realized sales found
- **WHEN** completed eBay sales exist for the appraised coin
- **THEN** the median sold price and sold price range are displayed with a link to completed listings

#### Scenario: No sales or blocked search
- **WHEN** no realized sales are returned or a query fails
- **THEN** a link to search completed eBay sold listings is provided without breaking the appraisal

### Requirement: TCG and card reference prices
When the item is identified as a trading card with a printed set number or code, the extension SHALL look up market prices from Scryfall (Magic), Pokémon TCG, or YGOPRODeck. If multiple printings match, the appraisal SHALL present the price range and label it as an estimate.

#### Scenario: Card with unique set number
- **WHEN** an identified card matches a single card in the database
- **THEN** the current market price from that provider is displayed

### Requirement: PSA cert verification
A slabbed card with a visible PSA certification number SHALL verify the cert against the PSA registry when a PSA token is saved. If the grade or card title in the registry does not match the appraisal read, the extension SHALL display a warning banner.

#### Scenario: PSA cert verified
- **WHEN** a PSA cert is verified successfully
- **THEN** the verified grade and registry details appear on the appraisal card

### Requirement: Discogs vinyl records
When the item is identified as a vinyl record, release details and historical sales SHALL be queried from Discogs using the user's Discogs token. The lowest listed price and historical median SHALL be displayed.

#### Scenario: Record lookup
- **WHEN** a record is identified and a Discogs token is present
- **THEN** release pricing and condition medians from Discogs appear on the card

### Requirement: Reference lookup for shop listings
When a shop listing states a Magic, Pokémon, or Yu-Gi-Oh card number or set code, a PSA slab with a 7-to-9-digit cert number, or a vinyl record, the shop scan SHALL query `REF_LOOKUP` for up to six candidates. A single exact-print market price (`kind: 'market'`) on a raw card MAY promote a hit to `steal` or `deal`. A multi-print range, a Discogs lowest-listed price, or a PSA cert verification SHALL attach a note without setting market value. Cert numbers SHALL NOT be invented.

#### Scenario: Raw Pokémon card with exact set number under TCGplayer market
- **WHEN** a raw shop listing "Charizard 4/102 Base Set" is priced at $100 and `REF_LOOKUP` returns a single-print market price of $350
- **THEN** the listing is scored as a `steal` with `Market $350 (pokemontcg)`

#### Scenario: Stated PSA cert mismatch in shop
- **WHEN** a shop listing states "PSA 10 Charizard Cert #12345678" and `REF_LOOKUP` returns `mismatch: true` for that cert
- **THEN** the hit reason warns of the PSA cert mismatch and does not promote the listing

### Requirement: Text-based reference pricing for shop listings
The reference pricing pipeline SHALL support querying PCGS, Greysheet, NumisMedia FMV, eBay sold comps, and melt values directly from parsed text attributes of shop listings (title, subtitle, grade, and denomination) without requiring an image or camera frame.

#### Scenario: Shop coin listing queried against reference guides
- **WHEN** a shop listing has title "1885-O Morgan Dollar PCGS MS64"
- **THEN** reference price lookups query PCGS, Greysheet, and FMV using the parsed text attributes and return the verified guide value

#### Scenario: Raw bullion shop listing queried against spot
- **WHEN** a shop listing has title "10 oz Silver Bar .999 Fine"
- **THEN** the system calculates the melt value using current spot metal prices and returns the melt value benchmark

