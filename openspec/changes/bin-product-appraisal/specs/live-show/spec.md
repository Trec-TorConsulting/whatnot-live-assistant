# Spec Delta

## ADDED Requirements

### Requirement: Shop listing inline appraisal controls
The shop view in both the in-stream overlay and sidepanel SHALL render an "Appraise" action button on each displayed Buy-It-Now listing row. When clicked, the row SHALL transition through a loading state to display the appraised market value, spread indicator, and pricing source badge directly within the listing row.

#### Scenario: Shop row renders appraisal button
- **WHEN** the user views the shop list in the sidepanel or overlay
- **THEN** every Buy-It-Now row includes an "Appraise" button alongside the existing "Find" action

#### Scenario: Appraised result rendered in shop row
- **WHEN** appraisal completes for a listing in the sidepanel shop hits
- **THEN** the row displays the appraised market price, margin delta, and provider source badge

