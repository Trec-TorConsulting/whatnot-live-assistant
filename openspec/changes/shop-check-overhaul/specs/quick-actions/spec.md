# Spec Delta

## ADDED Requirements

### Requirement: Click shop hit to search Whatnot shop
When the user clicks a shop hit in the on-page overlay or the sidepanel Live tab, the content script SHALL copy the listing title to the clipboard, click Whatnot's Shop tab button if the shop search input is not already visible, wait up to 1.5 seconds for the shop search input, and fill the search input with the listing title via `setReactValue`. It SHALL NOT click Buy Now, Pre-bid, or any purchase button.

#### Scenario: Shop search input opens and fills
- **WHEN** the user clicks a shop hit and Whatnot's Shop tab opens a search input
- **THEN** the search input is populated with the hit's title and no purchase button is clicked

#### Scenario: Shop search input not found
- **WHEN** the user clicks a shop hit and no shop search input appears within 1.5 seconds
- **THEN** the title remains copied to the clipboard and the user is notified to paste it into Shop search

