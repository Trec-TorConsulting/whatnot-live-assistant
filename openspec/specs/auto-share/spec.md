# Auto share

## Purpose
Auto Share repeats Copy link, X, or Facebook for one open live show in a muted background tab, once, for a count, or until the user stops. Sharing pauses when Whatnot shows a warning. The watcher's tab is left alone.

## Requirements

### Requirement: Start on a live show
Share once SHALL run a count of one. Share N SHALL run a positive integer count. Auto SHALL run until stop. The worker SHALL be a new inactive tab on the same show, then muted. Only one non-stopped session SHALL exist per show tab.

#### Scenario: Not a live tab
- **WHEN** the user starts sharing from a tab that is not a Whatnot live show
- **THEN** start fails and no worker tab is opened

#### Scenario: Already sharing
- **WHEN** a session is already running for that show tab
- **THEN** a second start is rejected until the user stops it

### Requirement: Delay and quiet
Each click SHALL wait for a random delay from the saved share settings. Quiet mode, on by default, SHALL ask the page hook to suppress clipboard writes and share popups around the click. The click itself SHALL still be a real share click.

#### Scenario: Quiet share
- **WHEN** quiet mode is on and the worker clicks Copy link
- **THEN** the share click happens and clipboard and popup side effects are suppressed for that window

### Requirement: Stop on warning or logout
A visible Whatnot warning or human-verification frame before the click SHALL stop the session and SHALL start the warning cooldown for both share and bulk actions. A login dialog SHALL stop the session and SHALL NOT start that cooldown. A missing Share button or menu option SHALL stop the session without counting a share.

#### Scenario: Warning before the click
- **WHEN** a warning is visible at the start of a share round
- **THEN** sharing stops, the warning text is reported, and bulk actions wait out the cooldown

#### Scenario: Logged out
- **WHEN** a login dialog is visible
- **THEN** sharing stops with a logged-out message and no cooldown

### Requirement: Session ends with the tabs
Closing the show tab SHALL delete the session and close the worker. Closing the worker SHALL stop the session. Share sessions SHALL live in session storage and SHALL NOT resume after a browser restart. Alt+Shift+S SHALL start until-stop or stop the current session.

#### Scenario: Worker closed
- **WHEN** the muted share tab is closed
- **THEN** the session stops and reports that the share tab was closed

### Requirement: Picked selectors
Built-in selectors SHALL find the Share button and Copy link, X, and Facebook. Saved overrides SHALL be tried first. The picker SHALL run on the show tab, not the worker, and SHALL time out after two minutes. A picker step that opens the menu SHALL NOT be added to the share count.

#### Scenario: Override present
- **WHEN** a share-button override is saved and matches
- **THEN** that selector is used before the built-in one
