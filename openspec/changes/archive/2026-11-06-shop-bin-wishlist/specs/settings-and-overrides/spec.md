# Spec Delta

## ADDED Requirements

### Requirement: Shop wishlist storage
The extension SHALL persist up to 100 shop wishlist entries in local storage. Each entry SHALL be parsed from user input (one per line) into lowercase keywords and an optional trailing dollar ceiling. Blank lines SHALL be ignored. Changes SHALL take effect immediately across open live shows.

#### Scenario: Save wishlist entries
- **WHEN** the user saves a list of wishlist items
- **THEN** valid entries are parsed, normalized, and persisted to extension storage

#### Scenario: Line without price ceiling
- **WHEN** the user enters "charizard base holo" with no trailing dollar amount
- **THEN** the entry is saved with keywords and a null price ceiling

