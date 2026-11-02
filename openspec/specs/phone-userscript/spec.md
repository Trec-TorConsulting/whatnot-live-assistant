# iPhone auto-share userscript

## Purpose
The userscript repeats the chosen share option on one live show in the page itself and counts LogShare responses Whatnot accepted. It does not include appraisal, alerts, the bid guard, bulk follow, or a background tab.

## Requirements

### Requirement: Where it runs
The built script SHALL match whatnot.com, inject at document start, and grant nothing. The panel SHALL show only on a live path. The user installs it with the Userscripts app and allows whatnot.com. Whatnot's mobile block screen SHALL stop the loop and tell the user to request the desktop website.

#### Scenario: Mobile block screen
- **WHEN** a visible mobile-block element is on the page
- **THEN** sharing stops and the desktop-site message is shown

### Requirement: Loop until stop
Start SHALL run until the user stops, leaves the show, the live id changes, a warning or login prompt is visible, or the Share control is missing. There SHALL be no once or count mode. The delay SHALL default to 3 seconds and clamp between 0.5 and 120 seconds. Targets SHALL be Copy link, X, and Facebook.

#### Scenario: Leave the show
- **WHEN** the live id changes or the path is no longer a live show
- **THEN** the loop stops and says the user left the show

#### Scenario: Warning
- **WHEN** a warning is visible at the start of a round
- **THEN** the loop stops, includes the warning text, and does not start a cooldown timer

### Requirement: Sent and confirmed
Sent SHALL increment when the option is clicked. Confirmed SHALL increment only while running, when a GraphQL LogShare response is OK and has no errors. The two counts SHALL be allowed to differ. A LogShare failure SHALL NOT increment confirmed.

#### Scenario: Click without confirmation
- **WHEN** the share control is clicked and LogShare returns errors
- **THEN** sent can be higher than confirmed

### Requirement: What it does not include
The userscript SHALL NOT run appraisal, alerts, the bid guard, bulk follow or bookmark, purchases, the rate gate, selector overrides, or a muted background tab. Quiet mode SHALL patch clipboard, copy, window.open, and blank-target links around each tap. Settings SHALL be stored in localStorage on that page.

#### Scenario: Appraisal shortcut
- **WHEN** the user is on the userscript panel
- **THEN** there is no appraisal, alert, or bid-guard control
