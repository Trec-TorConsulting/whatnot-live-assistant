# Wheel odds and prizes

## Purpose
Wheel odds show whether the next spin is worth the current bid. Named instant hits use melt, watched sales, or a model. Envelopes stay sealed until the wheel or the show ends, and their items are the camera pool left after instant hits are matched. The wheel never places a bid.

## Requirements

### Requirement: Large wheel prize list valuation
Wheel breaks SHALL NOT be arbitrarily truncated at 200 items. All listed prize spots SHALL be deduplicated by normalized prize key and priced in batches of 15–20 items. Responses from background AI models SHALL support generation tokens up to at least 1024 tokens to prevent truncated JSON schemas.

#### Scenario: Wheel break with 250 spots
- **WHEN** a wheel break contains 250 spot options
- **THEN** all 250 spots are passed for valuation rather than being truncated at 200 items

#### Scenario: Repetitive prizes in large wheels
- **WHEN** a 250-spot wheel break has 50 copies of one prize and 200 copies of another
- **THEN** only the 2 distinct prize keys are sent to the valuation model, and the resulting prices are mapped across all 250 copies

### Requirement: Freeform manifest and floor rule extraction
When regex pattern matching fails to extract a structured prize manifest or floor guarantee from break descriptions or published show notes, background local AI (prioritizing local Ollama) SHALL parse unstructured phrasing into structured prize names, quantities, and guaranteed minimum floor items/values.

#### Scenario: Unstructured notes describe a multi-tier break
- **WHEN** the seller notes state "10 graded slab chases, 40 silver eagles, remaining 200 spots are 1 oz silver rounds or 90% silver halves"
- **THEN** background local AI extracts the 10 slabs, 40 eagles, and marks the remaining spots as 1 oz silver round / 90% silver half with a minimum melt floor

#### Scenario: Unstructured floor guarantee
- **WHEN** the seller writes "Guaranteed minimum $15 value in every mystery envelope"
- **THEN** background AI extracts a floor rule with a value of $15

### Requirement: Mystery envelope floor fallback
When an envelope break contains unassigned mystery envelopes and camera board reads or sold histories are incomplete (such that `envelopeSummary.average` is null), but a verified manifest floor item or floor value exists, each unassigned envelope spot SHALL receive that floor value labeled as a floor. Unassigned mystery spots SHALL NOT collapse to $0 when a verifiable floor guarantee is present.

#### Scenario: 237 unassigned envelopes with 1 oz silver floor
- **WHEN** an envelope wheel has 5 chase prizes read from the video board and 237 unassigned envelopes, and the stream notes guarantee a 1 oz Silver Round floor ($31 melt)
- **THEN** each of the 237 unassigned envelopes reports a value of $31 labeled as a floor rather than $0, and the expected value reflects the floor

