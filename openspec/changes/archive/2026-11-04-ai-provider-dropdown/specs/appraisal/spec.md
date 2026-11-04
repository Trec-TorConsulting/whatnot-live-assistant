# Spec Delta

## MODIFIED Requirements

### Requirement: Model order
Unless Ollama-only is on, the on-device model SHALL be asked immediately. An answer from it within about two seconds SHALL be final and SHALL NOT call a cloud provider. If it is missing, fails, or is still running after about two seconds, saved cloud providers SHALL run, preferred first, and the first good answer SHALL win. Another saved provider and Ollama, when configured, SHALL start if the preferred provider fails or has not answered within about five seconds. Ollama-only SHALL skip on-device and cloud providers, and SHALL fail without calling them when the Ollama URL or model is blank.

#### Scenario: On-device answers quickly
- **WHEN** the on-device model answers within about two seconds
- **THEN** no cloud provider is called

#### Scenario: On-device is still running
- **WHEN** the on-device model has not answered after about two seconds and a saved cloud provider then answers
- **THEN** that cloud answer is the one shown

#### Scenario: No model available
- **WHEN** the on-device model is unavailable, no cloud provider key is saved, and Ollama is not configured
- **THEN** appraisal fails and asks for on-device AI, a cloud key, or Ollama

#### Scenario: Ollama only without a server
- **WHEN** Ollama-only is on and the URL or model is blank
- **THEN** no cloud provider is called

#### Scenario: Preferred answer is fast
- **WHEN** the preferred provider answers before about five seconds
- **THEN** no other cloud provider is called

#### Scenario: Preferred provider is overloaded
- **WHEN** the preferred provider is overloaded and another provider has a saved key
- **THEN** that other provider is asked on the same click and a good answer from it wins

#### Scenario: Preferred key is blank
- **WHEN** the preferred provider has no key and another provider has a key
- **THEN** the provider with a key is asked

#### Scenario: Every saved provider is overloaded
- **WHEN** every saved cloud provider is overloaded through the deadline
- **THEN** appraisal fails and names the providers it tried

## ADDED Requirements

### Requirement: Automatic models
A blank model SHALL use that provider's cheapest vision model that returns JSON, then one fallback. Gemini's automatic order SHALL be gemini-2.5-flash-lite, gemini-3.1-flash-lite, gemini-3.5-flash-lite, then gemini-2.5-flash. A model the user typed SHALL be tried first. When that model is overloaded, missing, or too slow, the provider's automatic models SHALL be tried. A good answer from the first model before the hedge SHALL NOT call a later model.

#### Scenario: Gemini overload reaches 3.5 Flash-Lite
- **WHEN** the Gemini model is blank and gemini-2.5-flash-lite and gemini-3.1-flash-lite are overloaded
- **THEN** gemini-3.5-flash-lite is tried before the deadline

#### Scenario: Typed model answers
- **WHEN** the user sets a Gemini model and that model answers
- **THEN** that model is the one that answered
