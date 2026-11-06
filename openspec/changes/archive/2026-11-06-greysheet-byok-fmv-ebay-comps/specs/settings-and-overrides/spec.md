# Spec Delta

## MODIFIED Requirements

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
