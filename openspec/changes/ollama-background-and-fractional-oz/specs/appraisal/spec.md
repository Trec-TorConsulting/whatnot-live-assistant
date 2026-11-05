# Spec Delta

## MODIFIED Requirements

### Requirement: Quick melt
Before the frame returns, a listing line with a known series or an explicit ounce weight SHALL produce a melt floor from spot metal prices. Fractional weights (including `1/10th oz`, `1/4th oz`, `1/2nd oz`, `.10 oz`, `0.25 oz`, `tenth oz`, `quarter oz`, and `half oz`) SHALL use that fraction, SHALL NOT match a 1 oz bullion pattern, and SHALL cap `fine_weight_oz`. Spot SHALL come from gold-api.com without delaying the model call. Plated or filled stamps SHALL have no melt, and quick read SHALL NOT call PCGS.

#### Scenario: Spot price is slow
- **WHEN** the listing has a metal weight and the spot price has not come back yet
- **THEN** the frame is still sent to the model

#### Scenario: No metal in the title
- **WHEN** the listing has no year-or-ounce metal line
- **THEN** there is no quick melt

#### Scenario: Fractional ounce
- **WHEN** the listing states a fraction of an ounce, such as 1/1000 oz gold
- **THEN** melt uses that fraction of an ounce, not the number after the slash

#### Scenario: Ordinal fractional gold eagle
- **WHEN** the listing is "1/10th oz gold eagle ms70 2022" and gold spot is $4,130
- **THEN** quick melt uses 0.1 oz ($413) rather than a full 1 oz Gold Eagle ($4,130), and a model answer of 1 oz is capped at 0.1 oz

## ADDED Requirements

### Requirement: Background local Ollama routing
When an Ollama URL and model are configured with Ollama-only unchecked, foreground live appraisals SHALL try on-device AI and the preferred cloud provider first with Ollama as the five-second hedge, while background AI tasks SHALL try the local Ollama server first. On wheel, camera, and table-scan tasks, an Ollama failure SHALL fall back to on-device and saved cloud providers without retrying Ollama. Background shop enrichment SHALL use local AI only.

#### Scenario: Ollama configured with Ollama-only unchecked on a background task
- **WHEN** a Gemini key and a local Ollama server are both saved, Ollama-only is unchecked, and background prize valuation runs
- **THEN** the local Ollama server is asked first and Gemini is not called when Ollama answers

#### Scenario: Ollama fails on a background task
- **WHEN** a Gemini key and a local Ollama server are both saved, Ollama-only is unchecked, and the local Ollama server fails during background prize valuation
- **THEN** the request falls back to on-device AI or Gemini without retrying Ollama
