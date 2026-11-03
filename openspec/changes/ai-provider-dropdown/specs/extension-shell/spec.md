# Spec Delta

## MODIFIED Requirements

### Requirement: Permissions and hosts
The extension SHALL request storage, alarms, side panel, notifications, active tab, and scripting. It SHALL be allowed to call Whatnot, Gemini, gold-api.com, PCGS, Scryfall, Pokémon TCG, YGOPRODeck, PSA, and Discogs, plus loopback HTTP for a local Ollama server. Saving a key for OpenAI, Anthropic, or OpenRouter SHALL require an optional host permission for that provider. Any other Ollama origin SHALL require an optional host permission granted from Settings.

#### Scenario: Loopback Ollama
- **WHEN** the user saves an Ollama URL on localhost or 127.0.0.1
- **THEN** no extra host permission is requested

#### Scenario: Remote Ollama denied
- **WHEN** the user saves a non-loopback Ollama URL and denies the permission prompt
- **THEN** the settings are not saved

#### Scenario: Backup provider denied
- **WHEN** the user saves an OpenAI, Anthropic, or OpenRouter key and denies the permission prompt
- **THEN** the settings are not saved

### Requirement: Local credentials
Gemini, OpenAI, Anthropic, OpenRouter, PCGS, PSA, Discogs, and Ollama settings, plus the Whatnot username, SHALL be stored in chrome.storage.local under the wn2_ prefix. The extension SHALL NOT write those values to chrome.storage.sync.

#### Scenario: Fresh profile
- **WHEN** no appraisal settings are stored
- **THEN** every credential string is empty and Ollama-only is off
