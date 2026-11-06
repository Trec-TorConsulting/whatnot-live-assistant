# Spec Delta

## Purpose

Tracks user-specified keywords, items, and target price ceilings for Buy-It-Now shop and bin inventory across live shows, highlighting matches and alerting on new inventory drops.

## ADDED Requirements

### Requirement: Wishlist matching on shop inventory
The shop scan SHALL compare every buy-it-now item's title and subtitle against the active wishlist entries. A match SHALL require all words in the wishlist entry to appear in the listing text (case-insensitive). When multiple entries match, the entry with the most words SHALL be selected. Matching items SHALL be badged as a wishlist hit and prioritized in the shop hit list.

#### Scenario: Keyword match in buy-it-now title
- **WHEN** the wishlist contains "charizard base" and the seller's shop has a buy-it-now listing for "1999 Pokémon Charizard Base Set Holo"
- **THEN** the listing is tagged with a "Wishlist" badge and surfaced as a shop hit

#### Scenario: Multiple matching wishlist entries
- **WHEN** the wishlist contains both "morgan" and "1881-s morgan" and the shop has an "1881-S Morgan Dollar"
- **THEN** the item matches the more specific "1881-s morgan" entry

### Requirement: Wishlist price ceilings
A wishlist entry MAY specify an optional dollar price ceiling (e.g. `RTX 4090 $1100`). When a ceiling is specified, the shop scan SHALL evaluate the listing's price (and all-in landed cost when shipping and tax are known). If the price is at or below the ceiling, the listing SHALL be classified as a deal. If the price exceeds the ceiling, the listing SHALL retain the wishlist badge but SHALL NOT be promoted to a deal based on the ceiling.

#### Scenario: Buy-it-now priced below wishlist ceiling
- **WHEN** the wishlist entry is "milwaukee m18 fuel $120" and a buy-it-now listing for "Milwaukee M18 FUEL Impact Driver" is listed at $99
- **THEN** the listing is marked as a deal with the reason stating it is under the wishlist ceiling

#### Scenario: Buy-it-now priced above wishlist ceiling
- **WHEN** the wishlist entry is "silver eagle 2021 $35" and a buy-it-now listing is listed at $45
- **THEN** the listing is marked as a wishlist match but is not classified as a deal under the ceiling

### Requirement: Wishlist drop and restock alert
When the assistant detects a new buy-it-now listing matching the wishlist, or an existing wishlisted listing's inventory quantity increases during an active live show, it SHALL emit an immediate notification alert so the user can review the drop.

#### Scenario: New wishlisted item added during show
- **WHEN** a seller drops a new buy-it-now listing that matches an entry on the user's wishlist
- **THEN** an instant alert notification is triggered with the item title and price

#### Scenario: Quantity restock on wishlisted item
- **WHEN** a wishlisted buy-it-now item previously had 0 inventory and restocks to positive inventory
- **THEN** a restock notification is triggered for that listing

