# Alerts

## Purpose
Alerts notify the user about giveaways, wins, bookmarked shows that are about to start, chat keywords, outbids, mentions, and lots near close. A watchlist can set the bid ceiling for a matching lot. Alerts never place a bid or enter a giveaway.

## Requirements

### Requirement: Giveaway, keyword, and win notifications
Giveaway alerts SHALL fire at most once per giveaway within seven days and SHALL NOT enter the giveaway. Chat keyword alerts SHALL match whole words, at most once per keyword per show per minute. A win SHALL be stored as a purchase only when that purchase key is new, and SHALL notify only when my-wins is on and the sale buyer matches the saved username.

#### Scenario: Giveaways turned off
- **WHEN** giveaway alerts are off
- **THEN** a new giveaway does not send a giveaway notification

#### Scenario: Username unset
- **WHEN** no Whatnot username is saved
- **THEN** win matching does not treat a sale as the user's win

### Requirement: Bookmarked shows starting soon
Bookmarked shows SHALL notify when the start is inside the lead time and not more than 15 minutes in the past, and they have not already been notified. The lead time SHALL clamp to 1 through 120 minutes. The check SHALL run on a five-minute alarm. Shows more than six hours past start SHALL be dropped.

#### Scenario: Starting alerts off
- **WHEN** show-starting alerts are off
- **THEN** the alarm check does not notify

### Requirement: Outbid, closing, and mentions
An outbid alert SHALL fire only after the user was the leader and a later update on an active lot names someone else. Closing SHALL be checked about every 250 milliseconds and SHALL fire when the lot end is inside the last-seconds window and the user is leading, outbid, or the title matches the watchlist. A mention SHALL match @username as its own token and SHALL ignore the user's own messages.

#### Scenario: No leader on the update
- **WHEN** a bid update does not name a leader
- **THEN** it is not an outbid

#### Scenario: Last seconds off
- **WHEN** last-seconds is 0
- **THEN** closing alerts do not fire

### Requirement: Watchlist ceiling
A watchlist line SHALL be words plus an optional trailing dollar max. Match SHALL require every word in the lot title, and the entry with the most words SHALL win. At most 100 lines SHALL be kept. The dollar max SHALL be a bid-guard ceiling. The watchlist SHALL NOT place a bid.

#### Scenario: More specific line
- **WHEN** both "morgan" and "1921 morgan" match the lot title
- **THEN** the 1921 morgan entry supplies the ceiling

### Requirement: Show keyword discovery
When show keywords are non-empty, show cards seen while browsing SHALL be matched on title and host, stored, and listed under Alerts. Empty keywords SHALL ignore those sightings. Discovery SHALL NOT choose who gets followed or shared.

#### Scenario: No keywords
- **WHEN** show keywords are empty
- **THEN** shows seen are not stored as matches

### Requirement: Desktop notifications when hidden
Buyer alerts SHALL always show an on-page notice. A desktop notification SHALL be sent only when the document is hidden. The background SHALL dedupe that desktop alert for about ten minutes. Clicking a giveaway notification SHALL focus the show tab when it is still known, otherwise open the live URL.

#### Scenario: Visible show tab
- **WHEN** the user is outbid on the visible show tab
- **THEN** the on-page notice shows and a desktop buyer notification is not required
