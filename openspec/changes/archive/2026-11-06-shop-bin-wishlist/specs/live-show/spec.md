# Spec Delta

## MODIFIED Requirements

### Requirement: Shop hit controls and scarcity badges
The overlay and sidepanel SHALL show remaining stock on buy-it-now hits (`1 left` or `N in stock`), allow dismissing individual hits (`×`) for the current show to reveal the next ranked hit from the scored pool, and provide `BIN only`, `Wishlist`, and `All` filter toggles to focus on specific hit categories.

#### Scenario: Dismissing a hit reveals the ninth hit
- **WHEN** nine shop hits are scored and the user dismisses one of the top eight
- **THEN** the dismissed hit is hidden for that show and the ninth hit appears in the list

#### Scenario: Filter to buy-it-now only
- **WHEN** the shop has both buy-it-now and auction hits and the user selects `BIN only`
- **THEN** only buy-it-now hits are displayed

#### Scenario: Filter to wishlist items only
- **WHEN** the shop contains both general deals and wishlist matches and the user selects `Wishlist`
- **THEN** only hits matching the user's wishlist are displayed in the shop list

