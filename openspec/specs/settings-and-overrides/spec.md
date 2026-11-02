# Settings and selector overrides

## Purpose
Settings stores the Whatnot username, appraisal providers, and selector overrides so a Whatnot redesign can point a button at a new selector without a new build. Pacing limits for bulk actions are edited on the Bulk tab.

## Requirements

### Requirement: Account and providers
The username SHALL be trimmed and a single leading @ SHALL be removed. Appraisal save SHALL store the Gemini key and model, PCGS, PSA, and Discogs tokens, the Ollama URL and model, and the Ollama-only flag. Test buttons SHALL save first, then call the matching test. Key and token fields SHALL be password inputs.

#### Scenario: Username with @
- **WHEN** the user saves @name
- **THEN** the stored username is name

### Requirement: Pacing guardrails
Bulk pacing values SHALL be clamped to the documented guardrails, and an hourly cap SHALL be reduced so it does not exceed its daily cap. Missing pacing settings SHALL become the defaults. If a save is adjusted, the Bulk form SHALL say so and show the clamped values.

#### Scenario: Hourly above daily
- **WHEN** the user saves an hourly action cap higher than the daily cap
- **THEN** the stored hourly cap is lowered to the daily cap

### Requirement: Override document
Overrides SHALL accept only the known button selectors, share targets, and a warning pattern. Unknown keys SHALL be ignored. A selector or pattern SHALL be a non-empty string of at most 400 characters, and the warning pattern SHALL compile as a case-insensitive regular expression. Empty pasted text SHALL mean no inline overrides.

#### Scenario: Unknown key
- **WHEN** the pasted JSON contains a key that is not a known override
- **THEN** that key is ignored and recorded as an error

### Requirement: URL and inline merge
A non-empty overrides URL SHALL be fetched with no cache and a ten-second timeout. Remote keys SHALL override inline keys. Share targets SHALL merge per target, with remote winning. A failed fetch SHALL store the error, leave remote overrides empty, and SHALL still mark the source as the URL. The fetch SHALL NOT request a new host permission. A hosted file has to allow CORS.

#### Scenario: Remote follow button
- **WHEN** pasted JSON and the URL both set the follow button
- **THEN** the active follow button selector is the URL's

#### Scenario: Fetch failed
- **WHEN** the overrides URL returns an HTTP error
- **THEN** remote overrides are empty and the error is stored

### Requirement: Page filter
The content script SHALL drop a selector that throws in querySelector and SHALL reload overrides when they change. The Settings page SHALL refuse to store pasted text that is not valid JSON or not a JSON object.

#### Scenario: Bad selector on the page
- **WHEN** a stored selector is not valid in the page
- **THEN** the content script treats that selector as absent
