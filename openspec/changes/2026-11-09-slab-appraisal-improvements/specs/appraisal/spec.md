# Appraisal

## Purpose
Appraisal reads the listing and the item on screen, extracts certified third-party grading slab metadata for coins, paper currency, and collectibles, and computes a market valuation that preserves slab premiums.

## Requirements

### Requirement: Certified slab metadata extraction
When an item is enclosed in a third-party grading slab (PCGS, NGC, ANACS, CACG, PMG, PCGS Banknote, CGA, PSA, BGS, SGC, CGC), the appraisal system SHALL extract available certified label metadata including the grading service, numeric grade, strike or finish (such as Burnished, Proof, Reverse Proof), strike designations (such as DCAM, Cameo, Proof-Like, Full Steps, Full Bands), release pedigrees (such as First Day of Issue, Early Releases), designer or official signature labels (such as Elizabeth Jones, John Mercanti, Ed Moy), CAC endorsement stickers (green or gold), paper quality qualifiers (such as EPQ or PPQ), star note designations, and catalog reference numbers (such as Friedberg Fr. numbers). The model SHALL NOT invent certification numbers or attribute unverified signatures.

#### Scenario: Coin slab with signature and pedigree
- **WHEN** an NGC or PCGS slab presents a 2017-W Burnished American Silver Eagle graded MS 70 with a First Day of Issue pedigree and an Elizabeth Jones signature label
- **THEN** the appraisal records the grading service, grade 70, finish as burnished, pedigree as First Day of Issue, and signature as Elizabeth Jones

#### Scenario: Paper currency slab with EPQ and Star Note
- **WHEN** a PMG slab presents a 1928 $1 Silver Certificate Fr. 1606 graded 64 EPQ with a star serial number
- **THEN** the appraisal records the grading service as PMG, grade as 64, paper quality as EPQ, and star note as true

### Requirement: Premium slab valuation protection
Per piece, market value SHALL prefer realized sales (exact slab eBay sold comps or PCGS auction sales), then the midpoint of an AI estimate or specialized comp, then static guide benchmarks, then melt. When an item possesses certified premium slab attributes (including signature labels, First Day of Issue pedigrees, non-standard strikes like Burnished or Reverse Proof, CAC stickers, or EPQ designations), a generic common-date baseline guide price (such as standard bullion NumisMedia FMV) SHALL NOT overwrite a higher AI estimate or slab-specific realized sale. The common-date guide price MAY still serve as a price floor.

#### Scenario: Signature slab overrides generic bullion guide
- **WHEN** an MS 70 Silver Eagle has an Elizabeth Jones signature label and First Day of Issue pedigree, NumisMedia common bullion FMV is $75, and the AI estimate or realized comp is $175
- **THEN** the market value is $175 rather than being clobbered down to the $75 common bullion guide price

#### Scenario: Standard common bullion coin uses FMV
- **WHEN** a standard raw or common bullion MS 70 Silver Eagle without signatures or special pedigrees is appraised
- **THEN** the NumisMedia FMV guide price of $75 sets the market value

### Requirement: Context-aware market basis labeling
The market value label on the appraisal overlay SHALL accurately reflect the underlying price source. When market value is derived from NumisMedia FMV, Greysheet CPG, or eBay sold comps, the label SHALL display the actual source name rather than a card-specific label.

#### Scenario: Graded coin priced from FMV
- **WHEN** an appraised coin derives its value from NumisMedia FMV
- **THEN** the overlay displays the basis as NumisMedia FMV rather than TCGplayer market price

