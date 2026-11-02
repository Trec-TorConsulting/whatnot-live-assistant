# Quick bid and quick chat

## Purpose
Quick bid types an amount into Whatnot's custom max-bid box. Quick chat puts a line in the chat box and copies it. The user sends both. The extension does not press Set Max Bid, Buy Now, or Enter.

## Requirements

### Requirement: Quick bid amounts
Plus one and plus five SHALL be the current bid plus that amount, and SHALL be unavailable when there is no current bid. Max SHALL be the guard ceiling when that ceiling is greater than zero. Buttons SHALL show only for an active lot with a visible Custom bid control, while the overlay is expanded and the wheel card is not showing.

#### Scenario: No current bid
- **WHEN** the user chooses plus one and the lot has no current bid
- **THEN** no amount is typed

### Requirement: Fill the custom box only
fillMaxBid SHALL open the Custom box only when the max-bid input is not already visible, wait up to 1.5 seconds for the input, and set the amount. It SHALL NOT click Set Max Bid. If that amount is over the ceiling, the notice SHALL say Set Max Bid will ask twice.

#### Scenario: Custom box never appears
- **WHEN** Custom is clicked and the input does not appear
- **THEN** the result is that the custom box could not be opened and no bid is submitted

### Requirement: Quick chat does not send
Chat text SHALL be at most 150 UTF-16 code units. pasteToChat SHALL set the value on a visible, enabled, writable chat input and SHALL also copy the line. It SHALL NOT submit the chat form. If the box is missing or disabled, the line SHALL be copied when the clipboard allows it.

#### Scenario: Disabled chat box
- **WHEN** the chat input is disabled or missing
- **THEN** the form is not submitted and the line is copied or the user is told both paths failed

### Requirement: Ask seller
Ask seller SHALL paste one fixed question chosen from appraisal cautions, or nothing when none match. Saved quick-chat templates SHALL be at most eight lines, each trimmed to 150 characters.

#### Scenario: No matching caution
- **WHEN** the user chooses Ask seller and no caution maps to a question
- **THEN** no chat line is pasted
