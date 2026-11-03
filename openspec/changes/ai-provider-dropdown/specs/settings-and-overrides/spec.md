# Spec Delta

## MODIFIED Requirements

### Requirement: Account and providers
The username SHALL be trimmed and a single leading @ SHALL be removed. Appraisal save SHALL store the preferred cloud provider, a key and optional model for Gemini, OpenAI, Anthropic, and OpenRouter, PCGS, PSA, and Discogs tokens, the Ollama URL and model, and the Ollama-only flag. Test buttons SHALL save first, then test the provider on screen. Key and token fields SHALL be password inputs.

#### Scenario: Username with @
- **WHEN** the user saves @name
- **THEN** the stored username is name

#### Scenario: Second key kept
- **WHEN** the user saves an OpenAI key, selects Gemini, and saves again
- **THEN** the OpenAI key remains and Gemini is the preferred provider

#### Scenario: Existing Gemini key
- **WHEN** stored settings contain only a Gemini key
- **THEN** the dropdown shows Gemini and that key

## ADDED Requirements

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
