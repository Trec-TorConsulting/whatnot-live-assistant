# Design: Slab Appraisal and Certification Precision Hardening

## Overview

This design refines the appraisal pipeline to treat professional third-party grading slabs (PCGS, NGC, ANACS, CACG for coins; PMG, PCGS Banknote, CGA for paper currency) with the precision expected of certified numismatics. It introduces structured slab metadata extraction, slab-aware valuation priority waterfalls, premium preservation rules, and precision eBay sold comp queries.

## Modules Touched

1. `src/shared/appraisal.ts`
   - Extend `AppraisalItem` interface and `APPRAISAL_SCHEMA` with certified slab fields:
     - `finish`: Strike and finish varieties (`'regular' | 'proof' | 'burnished' | 'reverse_proof' | 'enhanced' | 'matte' | 'specimen'`)
     - `designation`: Strike quality qualifiers (`'dcam' | 'cameo' | 'pl' | 'dmpl' | 'fb' | 'fsb' | 'fbl' | 'fh' | 'fs' | 'rd' | 'rb' | 'bn' | 'none'`)
     - `pedigree`: Timing and release pedigrees (`'first_day_of_issue' | 'early_releases' | 'first_strike' | 'advance_release' | 'none'`)
     - `signature`: Name of recognized signer / artist (`string | null`)
     - `cac`: CAC sticker status (`'none' | 'green' | 'gold'`)
     - `paper_quality`: Paper money preservation qualifier (`'none' | 'epq' | 'ppq'`)
     - `star_note`: Paper money replacement status (`boolean`)
     - `catalog_number`: Friedberg or Pick catalog number (`string | null`)
   - Update `APPRAISAL_INSTRUCTIONS` to prompt vision models specifically on slab headers, autographs, pedigrees, CAC stickers, and paper EPQ/PPQ/Star banners.
   - Refactor `computeValue` to evaluate whether an item possesses premium slab attributes. When premium attributes exist, a standard common-date bullion FMV guide SHALL NOT override an AI estimate or premium-aware comps.
   - Replace static `BASIS_LABEL['market']` with a dynamic basis resolver that formats labels according to the actual reference source (`'NumisMedia FMV retail guide'`, `'Greysheet CPG'`, `'eBay sold comps'`, or `'TCGplayer market price'`).

2. `src/shared/fmv.ts`
   - Add slab designation awareness to `fmvLookup`. If the coin has recognized finish variations (Burnished, Reverse Proof, Enhanced) or signature labels, the lookup SHALL indicate that standard FMV represents the base coin floor, not the premium slab value.
   - Add basic retail benchmark tiers for major US Paper Currency series (e.g. $1 Silver Certificates Fr. 1606/Fr. 1610, $2 Red Seals Fr. 1509/Fr. 1510) with multipliers for EPQ and Star note designations.

3. `src/background/ebayComps.ts`
   - Enhance `buildEbayQuery(item: Partial<AppraisalItem>)`:
     - If `item.is_slabbed` is true, include `grading_service` and certified grade (e.g., `"NGC MS 70"`).
     - Include `signature` when present (e.g., `"Elizabeth Jones"` or `"Mercanti"`).
     - Include `finish` when not regular (e.g., `"Burnished"` or `"Reverse Proof"`).
     - Include `pedigree` when present (e.g., `"First Day of Issue"` or `"FDI"`).
     - For paper money (`banknote`), include `paper_quality` (`"EPQ"` / `"PPQ"`), `"Star"`, and `catalog_number` (`"Fr."`).
   - Add negative filter tokens in eBay queries (`-reprint -copy -tribute`) to keep comps pristine.

4. `src/shared/refPrice.ts`
   - Refine `marketOf(refs, slabbed)` to select the highest-fidelity graded comp rather than blindly returning the first market ref. If eBay comps match the exact slab metadata, prefer the realized eBay comp median over a generic static FMV.

5. `src/content/appraisalView.ts`
   - Display certified slab badges in the appraisal card header:
     - Grading service & Grade pill (e.g., `NGC MS 70`, `PMG 66 EPQ`)
     - Signature pill (e.g., `Signed: Elizabeth Jones`)
     - CAC sticker pill (Green CAC / Gold CAC)
     - Pedigree pill (e.g., `First Day of Issue`)
   - Ensure the Market label shows the accurate price basis (`NumisMedia FMV`, `eBay sold comps`, `Greysheet CPG`, `PCGS sales`) instead of `"TCGplayer market price"`.

## Architecture & Data Flow

```
[Camera / Frame Capture]
       │
       ▼
[Gemini Vision Model with Slab Instructions]
       │ Extracts: grading_service, grade, finish, pedigree, signature, CAC, EPQ, Star, Fr.#
       ▼
[Appraisal Record with Structured Slab Metadata]
       │
       ├───► [eBay Sold Comps Lookup]
       │       Queries: "{Name} {Grade} {Signature} {Finish} {Pedigree} {EPQ}"
       │       Returns: Realized sale median & range for the EXACT slab variant
       │
       ├───► [NumisMedia FMV / Greysheet Lookup]
       │       Returns: Base common coin/currency retail guide
       │
       ▼
[Valuation Arbiter (computeValue)]
       ├── Has Premium Slab Attributes? (Signature, FDI, Burnished, CAC, EPQ, Star)
       │     YES ──► Priority: Realized Comps > AI Calibrated Estimate > Base FMV
       │     NO  ──► Priority: Realized Comps > Base FMV > AI Estimate > Melt
       ▼
[Overlay UI Rendering]
       Displays: Certified Grade, Signature Badge, Accurate Basis Label, Fair Market Value
```

