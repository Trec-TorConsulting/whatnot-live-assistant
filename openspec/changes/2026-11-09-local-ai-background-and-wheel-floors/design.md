# Design: Local AI Routing for Background Tasks and Wheel Floor Manifests

## Context and Architecture

The extension operates across two distinct latency regimes:

1. **Foreground Live Operations (Sub-second / Instant)**:
   - When a buyer clicks "Appraise" or inspects an active auction lot on screen, time-to-verdict must be sub-second (under 1–2 seconds).
   - This path prioritizes Chrome's on-device AI (if ready within 2 seconds) or preferred cloud providers (Gemini 2.5 Flash / Pro) racing with a 5-second Ollama hedge.
2. **Background Non-Instant Operations (Batched / Latency-Tolerant)**:
   - When a wheel break loads with 250 spots, when the shop inventory is crawled, or when camera boards are monitored, responses are not needed in 500ms; they are background enrichment tasks.
   - Using paid cloud tokens for these operations wastes quota and risks rate-limiting foreground appraisals.
   - When a local Ollama server is configured, these tasks must run locally first, falling back to cloud providers only if local AI is unreachable or fails.

```
+---------------------------------------------------------------------------------------+
|                                    LATENCY REGIMES                                    |
+---------------------------------------------------------------------------------------+
|                                                                                       |
|   FOREGROUND (Live Appraisals):                                                       |
|   User Click / Active Lot  -->  On-Device AI (2s)  -->  Cloud Gemini (Preferred)     |
|                                                         [Ollama as 5s hedge backup]   |
|                                                                                       |
|   BACKGROUND (Non-Instant):                                                           |
|   Wheel Prizes (250+ spots) \                                                         |
|   Manifest / Floor Notes     +--> Local Ollama (First) --> On-Device --> Cloud (Fail) |
|   Envelope Board Reads      /                                                         |
|   Shop Scan AI Enrichment  /                                                          |
|                                                                                       |
+---------------------------------------------------------------------------------------+
```

---

## Detailed Design Decisions

### 1. Large Wheel Architecture: Removing the 200 Cap & Deduplication

In [`src/background/index.ts`](file:///Users/trecto282@cable.comcast.com/Projects/Personal/whatnot-live-assistant/src/background/index.ts#L107), `WHEEL_VALUE` currently does:
```ts
WHEEL_VALUE: ({ prizes, context }) => valuePrizes(prizes.slice(0, 200), context),
```
- **Change**: Remove the `.slice(0, 200)` limit entirely.
- **Deduplication**: In a 250-spot wheel, 200 spots are often repeated identical entries (e.g. 50x "Morgan Dollar Fair", 100x "Silver Eagle BU"). In `src/background/prizeValues.ts`, unique prize keys are already deduplicated using `new Map(items.map(p => [prizePriceKey(p), p]))`, meaning 250 spots typically condense down to 10–25 unique items.
- **Batch Sizing**: Reduce `AI_BATCH` from 40 to 15–20 items. 15 items per batch avoids token blowout and context degradation on local models.
- **Ollama Generation Ceiling**: In `src/background/appraisal.ts`, change `ollamaJson` `options.num_predict` from `384` to `1024`. This guarantees that JSON output containing 15–20 structured items never gets truncated before closing braces.

### 2. Freeform Manifest & Floor Rule AI Extraction

Currently, `manifestFrom` and `extractFloorsFromNotes` use regex matching:
- If a host writes: `"Floor: each envelope has at least 1 oz silver round or better"`, regex catches it.
- If a host writes: `"Every spot gets minimum an oz of silver bullion or a 90% half dollar, top 5 get gold"`, regex fails, and `extractFloorsFromNotes` returns empty.

#### Structured Output Schema for Manifest Extraction (`MANIFEST_SCHEMA`):
```json
{
  "type": "object",
  "properties": {
    "floor_name": { "type": "string", "description": "Guaranteed minimum item in every spot, e.g. 1 oz silver round, 90% silver half" },
    "floor_value": { "type": "number", "description": "Estimated minimum dollar value of the floor, or null if unknown" },
    "items": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": { "type": "string" },
          "qty": { "type": "integer" }
        },
        "required": ["name", "qty"]
      }
    }
  },
  "required": ["items", "floor_name"]
}
```

#### Manifest AI Task Execution:
1. When a wheel loads or show notes update, if regex `manifestFrom` finds zero items or no floor, invoke `EXTRACT_MANIFEST_AI` via `askAi`.
2. Cache the extracted manifest in session storage under `breakManifests[breakId]`.
3. Combine regex extraction with AI extraction: regex provides instant deterministic hits, while local AI enriches unstructured notes in the background.

### 3. Resolving the Mystery Envelope Gap in `wheelRows`

In [`src/shared/envelopes.ts`](file:///Users/trecto282@cable.comcast.com/Projects/Personal/whatnot-live-assistant/src/shared/envelopes.ts#L254):
```ts
if (summary.average === null) return { ...row, value: null, auto: null, inside: null, ...(isFloor ? { floor: true } : {}) };
```
When only 5 chase prizes are read from video and 237 mystery envelopes remain:
- If `summary.average` is null, but a verified floor rule exists (either from note extraction or the parsed manifest), assign the floor item's value to the unassigned rows, marked with `floor: true`.
- Example: If the floor is a 1 oz Silver Round (melt ~$31), the 237 mystery envelopes report `value: 31, floor: true`.
- This ensures the wheel's expected value immediately reflects the true game floor instead of crashing down to $0.

---

## Failure Modes & Recovery

| Failure Mode | Impact | Recovery Behavior |
| :--- | :--- | :--- |
| Local Ollama server offline / network error | Background tasks cannot reach `http://127.0.0.1:11434` | Fall back immediately to on-device AI or cloud Gemini (if API keys exist). If no keys exist, gracefully report status as "Ollama offline". |
| Ollama model gives invalid JSON | JSON parse failure | Retry once without strict schema formatting; if still invalid, fall back to next provider in waterfall. |
| Seller notes contain no floor or prize breakdown | Unstructured text has no prize info | Keep unassigned envelopes unpriced ($0) and display standard warning; user can still type a custom value in the side panel. |
| Wheel has 300+ unique (non-duplicate) items | Processing time exceeds 30 seconds | Items are processed in 20-item chunks; each chunk updates session storage incrementally so prices appear progressively in the UI. |

