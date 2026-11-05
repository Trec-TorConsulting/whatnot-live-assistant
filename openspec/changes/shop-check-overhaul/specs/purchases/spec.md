# Spec Delta

## ADDED Requirements

### Requirement: Shop collection and set-builder matching
The shop scan SHALL check each candidate listing against the user's saved collection, active set ranges (`compareToCollection`), and recorded purchase titles. A non-overpriced listing that fills a missing date or mint in an active set SHALL be listed as at least a `must` hit with `Needed for your set: …`. A shop hit that matches an already-owned item or date in the set SHALL append `Already in your set: …` or `You own N like this` to its reason.

#### Scenario: Missing date in a saved Morgan set
- **WHEN** the user's set list has `morgan dollar 1878-1921`, the user does not own an 1895-O, and the shop has a non-overpriced "1895-O Morgan Dollar" buy-it-now
- **THEN** the listing is surfaced in the shop hits with `Needed for your set: morgan dollar 1878-1921`

#### Scenario: Duplicate of an owned item
- **WHEN** a shop steal matches two items already in the user's collection or purchases
- **THEN** the hit remains a steal and its reason includes `You own 2 like this`

