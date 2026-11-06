# Settings and selector overrides

## Purpose
Settings stores the Whatnot username, appraisal providers, and selector overrides so a Whatnot redesign can point a button at a new selector without a new build. Pacing limits for bulk actions are edited on the Bulk tab.

## Requirements

### Requirement: Account and providers
The username SHALL be trimmed and a single leading @ SHALL be removed. Appraisal save SHALL store the preferred cloud provider, a key and optional model for Gemini, OpenAI, Anthropic, and OpenRouter, PCGS, Greysheet (API key and token), PSA, and Discogs tokens, the Ollama URL and model, and the Ollama-only flag. Test buttons SHALL save first, then test the provider on screen. Key and token fields SHALL be password inputs.

#### Scenario: Username with @
- **WHEN** the user saves @name
- **THEN** the stored username is name

#### Scenario: Second key kept
- **WHEN** the user saves an OpenAI key, selects Gemini, and saves again
- **THEN** the OpenAI key remains and Gemini is the preferred provider

#### Scenario: Existing Gemini key
- **WHEN** stored settings contain only a Gemini key
- **THEN** the dropdown shows Gemini and that key

#### Scenario: Greysheet BYOK saved
- **WHEN** the user enters a Greysheet API key and API token and clicks Save keys
- **THEN** both credentials are saved in extension storage and the Test Greysheet button validates connection to the CDN Public API V2

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

### Requirement: Provider dropdown
The cloud provider dropdown SHALL list only Gemini, OpenAI, Anthropic, and OpenRouter. Selecting a provider SHALL show that provider's saved key and model. A blank model SHALL stay blank. Clearing the key on screen and saving SHALL remove that provider's key and SHALL leave every other provider's key unchanged.

#### Scenario: Only those four
- **WHEN** the appraisal settings are shown
- **THEN** the provider choices are Gemini, OpenAI, Anthropic, and OpenRouter

#### Scenario: Switch shows the saved key
- **WHEN** OpenAI has a saved key and the user selects OpenAI
- **THEN** that key is shown

#### Scenario: Clear one key
- **WHEN** the user clears the OpenAI key and saves
- **THEN** OpenAI has no key and the Gemini key is unchanged
