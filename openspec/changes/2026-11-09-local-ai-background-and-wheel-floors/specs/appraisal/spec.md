# Appraisal

## Purpose
Appraisal identifies items on screen and computes market valuations. Background tasks use local AI to conserve cloud API tokens, while instant live appraisals prioritize sub-second latency.

## Requirements

### Requirement: Background local-first AI routing
All non-instant background AI tasks—including wheel prize valuation (`WHEEL_VALUE`), camera board reads (`ENVELOPE_READ`), named prize video reads (`PRIZE_READ`), manifest/floor rule extraction (`EXTRACT_MANIFEST_AI`), shop item enrichment (`SHOP_AI`), and shelf table scans (`SCAN_TABLE`)—SHALL query the configured local Ollama server first before falling back to Chrome on-device models or saved cloud providers. Instant live camera appraisals (`APPRAISE`) SHALL maintain on-device and cloud-first racing to deliver sub-second verdicts.

#### Scenario: Background prize valuation with Ollama configured
- **WHEN** 50 wheel prizes are queued for background valuation and a local Ollama server is configured
- **THEN** the valuation request is sent to the local Ollama server first, and cloud providers are not called unless Ollama fails or times out

#### Scenario: Instant appraisal on active auction lot
- **WHEN** the user clicks Appraise on an active auction lot
- **THEN** on-device AI and preferred cloud providers race immediately to provide sub-second latency

### Requirement: Local generation token budget
When generating structured JSON responses for background operations (such as multi-prize valuation batches or parsed manifests), requests to local Ollama models SHALL set a token generation limit (`num_predict`) of at least 1024 tokens to ensure multi-item JSON arrays close with valid syntax without premature truncation.

#### Scenario: 20-item prize batch on Ollama
- **WHEN** a batch of 20 prizes is submitted to local Ollama
- **THEN** Ollama generates the full JSON array up to 1024 tokens without truncation

