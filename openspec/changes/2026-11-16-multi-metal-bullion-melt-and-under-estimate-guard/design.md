# Design: Multi-Metal Bullion Melt Parsing and Under-Estimation Guard

## Context

In `src/shared/appraisal.ts`, `BULLION_RE` previously matched precious metal names and ounce amounts with an unconstrained lazy matcher (`[^\n]*?`). In compound listings such as `All Seeing Eye 2.5g Gold 3oz Silver`, it ignored `2.5g`, matched the word `Gold`, matched across the space, and paired it with `3oz`. This caused `quickRead` to report the item as `3 oz of Gold` ($11,636 at ~$3,878/oz gold spot) rather than 3 oz of silver with 2.5g of gold (~$413 melt).

## Goals / Non-Goals

**Goals:**
- Extract all precious metal components with strict adjacent weight binding (e.g., `2.5g` strictly binds to `Gold`, `3oz` strictly binds to `Silver`).
- Compute exact combined melt value in `shopMelt` and `quickAppraise` across all parsed metal components.
- Enforce the "under-estimate over over-estimate" safety principle: when ambiguity exists or a metal lacks a stated weight, evaluate only the verified floor and never fabricate a gold melt calculation.
- Eliminate false under-melt steal alerts on composite gold/silver items.

**Non-Goals:**
- Rewriting cloud model appraisal prompts or cert verification logic.
- Adding new external network calls (continues using cached spot prices).

## Decisions

### 1. Dedicated Multi-Metal Component Extractor (`parseBullionComponents`)
Extract components using strict adjacent patterns:
- **Weight before Metal**: `(?<weight>\d+...)\s*(?:fine|pure|\.999|solid)?\s*(?<metal>silver|gold|platinum|palladium)`
  - Examples: `2.5g Gold`, `3oz Silver`, `1/10 oz Gold`, `1 kilo Silver`, `100 grain Silver`.
- **Metal before Weight**: `\b(?<metal>silver|gold|platinum|palladium)\b\s*(?:bar|round|coin|bullion)?\s*(?<weight>\d+...)(?!\s*(?:silver|gold|platinum|palladium)\b)`
  - Examples: `Silver round 2 oz`, `Gold bar 2.5g`.
  - The negative lookahead `(?!\\s*(?:silver|gold|platinum|palladium)\\b)` guarantees that if the weight is followed by a metal token (such as `3oz Silver`), it is NOT captured as belonging to the preceding metal (`Gold`).

### 2. Multi-Metal Melt in `shopMelt`
In `src/shared/shop.ts`, update `shopMelt`:
- Parse all components from the listing title and subtitle.
- If multiple components are found, sum their melt values:
  $$\sum (\text{component.oz} \times \text{spot}[\text{component.metal}])$$
  For `All Seeing Eye 2.5g Gold 3oz Silver`:
  $$(2.5 / 31.1035 \times \text{spot.gold}) + (3.0 \times \text{spot.silver}) = \$311.75 + \$100.50 = \$412.25$$
- Against asking price $777, the listing is not under melt and is not declared a steal.

### 3. Conservative Fallback in `quickRead`
In `src/shared/appraisal.ts`, update `quickRead`:
- When multiple bullion components are detected, populate `read.components = [...]`.
- Set the legacy single `metal` and `oz` fields to the conservative lower-value metal (silver) and its weight, rather than attributing multi-ounce weights to gold.
- This ensures any legacy consumer that only reads `read.metal` and `read.oz` will safely under-estimate rather than catastrophically over-estimate.

## Modules Touched

- `src/shared/appraisal.ts`
- `src/shared/shop.ts`
- `src/background/appraisal.ts`
- `src/shared/appraisal.test.ts`
- `src/shared/shop.test.ts`

## Risks / Trade-offs

- **[Risk]**: A multi-metal item with unstated gold weight (e.g. `3 oz Silver with 24k Gold Inlay`) is only valued at 3 oz silver.
  - **Mitigation**: This satisfies the user's explicit directive: *"I rather it under est then over."* Valuing the silver component (~$101) is safe, whereas guessing gold weight could fabricate thousands of dollars in fake melt value.
