# Page hook

## Purpose
The main-world hook observes Whatnot live and auction sockets and selected GraphQL responses, fetches break data on request, and can quiet clipboard writes and share popups. It does not bid or send chat.

## Requirements

### Requirement: One install per window
The hook SHALL install at most once per window. It SHALL post messages only to the page origin and SHALL ignore messages whose source is not this window.

#### Scenario: Second install
- **WHEN** the hook script runs again in a window that is already hooked
- **THEN** it does not wrap WebSocket or fetch a second time

### Requirement: Socket and GraphQL observation
The hook SHALL mirror string frames from sockets whose URL matches the live or auction service. It SHALL forward LiveStream and break GraphQL bodies, and SHALL forward only the operation name for any other GraphQL call. Observation failures SHALL NOT fail the page's own fetch.

#### Scenario: Other GraphQL operation
- **WHEN** the page calls a GraphQL operation that is not LiveStream or the break query
- **THEN** the content script receives the operation name and not the response body

### Requirement: Buffered handshake
Until the content script sends ready, the hook SHALL buffer outbound events, dropping the oldest past 400. On ready it SHALL send hello and flush the buffer.

#### Scenario: Socket before content script
- **WHEN** a live socket frame arrives before ready
- **THEN** the frame is delivered after ready, within the 400-event cap

### Requirement: Quiet mode
While quiet mode is active, clipboard writes and copy commands SHALL succeed without writing, window.open SHALL return null, and clicks on target=_blank links SHALL be prevented. Quiet SHALL last at most 10 seconds. After the deadline, those APIs SHALL behave as the page defined them.

#### Scenario: Share popup during quiet
- **WHEN** the content script asks for quiet and a share path calls window.open before the deadline
- **THEN** no window opens

### Requirement: Break fetch
A break fetch SHALL run only for an all-digit break id, as a credentialed POST to the page's own GraphQL endpoint, aborted after 5 seconds. soldAfter SHALL be sent only when it is a string shorter than 200 characters.

#### Scenario: Non-numeric break id
- **WHEN** the content script requests a break whose id is not all digits
- **THEN** the hook does not fetch
