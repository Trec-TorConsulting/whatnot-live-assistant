# Bulk follow and bookmark

## Purpose
From the current live host or profile, the user can follow that seller and bookmark upcoming shows that are not bookmarked yet, or undo those actions. Preview does not click follow or bookmark. Actions that are already done are skipped.

## Requirements

### Requirement: One current seller
The panel SHALL send one seller: the active tab's profile username, otherwise the live host without a leading @. Follow and bookmark SHALL follow only when not already following, then bookmark shows that are not bookmarked, up to the per-seller cap. Undo SHALL require at least one of unfollow and remove bookmarks, and a real undo SHALL ask the user to confirm.

#### Scenario: No host
- **WHEN** the active tab has no profile username and no live host
- **THEN** the job does not start

#### Scenario: Already following
- **WHEN** the seller is already followed
- **THEN** follow is not clicked and the step is reported as already done

### Requirement: Preview
Preview SHALL NOT click follow, unfollow, bookmark, or unbookmark, and SHALL NOT call the rate gate for those actions. It MAY open the profile in a background tab and click the expand-shows control so the list can be read. The result SHALL say what it would do.

#### Scenario: Preview follow
- **WHEN** the user runs Follow and Bookmark in preview
- **THEN** no follow or bookmark click is made and the result describes the actions it would take

### Requirement: Rate limits
A real click SHALL wait for a rate slot. Limits SHALL cover spacing, seller spacing, periodic breaks, hourly and daily action caps, follow caps, and bookmarks per seller. Saved values SHALL be clamped so an hourly cap cannot exceed the matching daily cap. Shares SHALL NOT consume these caps. A long wait SHALL park the seller and retry from the start, skipping steps that are already done.

#### Scenario: Over the hourly cap
- **WHEN** the next click is blocked by the hourly cap for more than a minute
- **THEN** the seller is parked until the retry time and is not marked finished

### Requirement: Pause on warning, logout, or stuck clicks
A warning or login prompt SHALL pause the job and retry that seller from the start. A warning, and two unverified clicks in a row, SHALL also start the warning cooldown that blocks sharing. Logout SHALL NOT start that cooldown. Three sellers in a row that error or fail to follow SHALL pause the job. Bookmark failures alone SHALL NOT.

#### Scenario: Logged out during a job
- **WHEN** a login prompt is visible during the seller task
- **THEN** the job pauses, tells the user to log in and resume, and does not start the warning cooldown

### Requirement: One job at a time
Only one bulk job SHALL run at a time. Pause, resume, stop, and clear SHALL be available. Resume SHALL clear the consecutive-failure count. Closing the worker tab or starting the browser SHALL pause the job. The worker tab SHALL be inactive. The extension SHALL NOT mute it.

#### Scenario: Second start
- **WHEN** a bulk job is already active
- **THEN** a new start fails
