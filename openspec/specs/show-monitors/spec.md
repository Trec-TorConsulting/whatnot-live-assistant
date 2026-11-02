# Show monitors

## Purpose
The user can watch up to four other live shows in muted background tabs so the same alert content script runs there. Opening a monitor does not bid, chat, or enter a giveaway.

## Requirements

### Requirement: Add a monitor
MONITOR_ADD SHALL accept a live id of 6 to 64 characters from a /live/{id} link or the raw field. The system SHALL open that show in an inactive tab, then mute it and keep it from being discarded. The same live id SHALL NOT open a second tab while the existing monitor tab is still open.

#### Scenario: Bad link
- **WHEN** the user adds text that is not a live id or a /live/ link
- **THEN** the panel reports that it does not look like a show link and no tab opens

#### Scenario: Empty field
- **WHEN** the user submits an empty watch field
- **THEN** the panel asks for a show link and does not send MONITOR_ADD

### Requirement: Four-show cap
The system SHALL keep at most four monitors. A fifth new id SHALL be rejected. A monitor whose tab was closed SHALL be forgotten and SHALL NOT keep counting toward the cap.

#### Scenario: Fifth show
- **WHEN** four monitors are already open and the user adds a different show
- **THEN** the add fails and no fifth tab is created

### Requirement: Focus and stop
Focus SHALL activate the monitor tab, unmute it, and focus its window, and SHALL leave the monitor registered. Stop SHALL remove the record and close the tab. A missing id on remove SHALL still succeed.

#### Scenario: Closed tab
- **WHEN** the user focuses a monitor whose tab is already gone
- **THEN** the panel reports that the show tab was closed

### Requirement: Alerts from a monitor
A monitor tab SHALL run the same live alerts as any other live tab. Because the tab is in the background, buyer alerts SHALL also become desktop notifications.

#### Scenario: Outbid in a muted tab
- **WHEN** the user is outbid on a lot in a monitor tab
- **THEN** a desktop buyer alert can fire and no bid is placed
