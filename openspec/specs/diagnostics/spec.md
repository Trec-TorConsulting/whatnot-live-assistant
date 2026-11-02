# Diagnostics

## Purpose
Diagnose shows what the extension can see on the current Whatnot page and can outline those elements. It does not click follow, share, or bid.

## Requirements

### Requirement: Whatnot tab required
Diagnose SHALL run only when the active tab is a Whatnot page. Otherwise the panel SHALL say to open a Whatnot page and SHALL NOT send a diagnosis. It SHALL ensure the content script is present before asking for the report.

#### Scenario: Active tab is not Whatnot
- **WHEN** the user runs Diagnose and the active tab is not a Whatnot page
- **THEN** an error is shown and no diagnosis message is sent

### Requirement: Report contents
The report SHALL include the URL, whether the page is a profile, a live show, or something else, the login prompt, any warning, the follow control, show cards, the share button and its targets, video size, bid-button labels, whether the page hook has said hello, a slice of the live session, and which override keys are set.

#### Scenario: Hook never connected
- **WHEN** the page is a live show and the hook has not said hello
- **THEN** the summary says the page hook is not connected and tells the user to refresh

### Requirement: Highlight
When highlight is on, matching follow, bookmark, share, and bid elements SHALL be outlined for about four seconds and then restored. Highlight SHALL NOT click those elements. The panel SHALL show a summary and the raw JSON, and Copy SHALL write that JSON or say to run a diagnosis first.

#### Scenario: Copy before a run
- **WHEN** the user copies a diagnosis before one has been run
- **THEN** the panel says to run a diagnosis first
