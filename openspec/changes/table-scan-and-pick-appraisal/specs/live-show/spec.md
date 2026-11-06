# Spec Delta

## ADDED Requirements

### Requirement: Table scan action and overlay card
The live show overlay and sidepanel SHALL provide a "Scan Table" button and keyboard shortcut (Alt+Shift+T). When triggered, the assistant SHALL capture the current video frame, initiate a table scan appraisal, and display the ranked picks, spatial locations, and any warnings in a dedicated on-screen card.

#### Scenario: User clicks Scan Table in overlay
- **WHEN** the user clicks the "Scan Table" button on the in-stream assistant overlay
- **THEN** the extension captures the video frame, queries the appraisal model, and displays the table scan card with top picks and locations

#### Scenario: User presses Alt+Shift+T shortcut
- **WHEN** the user presses Alt+Shift+T on an active Whatnot show
- **THEN** the extension executes the table scan action and presents the resulting picks card

