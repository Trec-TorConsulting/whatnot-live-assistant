# Spec Delta

## ADDED Requirements

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
