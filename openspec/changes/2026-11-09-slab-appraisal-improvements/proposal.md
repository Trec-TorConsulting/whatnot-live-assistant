# Proposal: Slab Appraisal and Certification Precision Hardening

## Why

Professional third-party grading slabs (PCGS, NGC, ANACS, CACG for coins; PMG, PCGS Banknote, CGA for paper currency; PSA, BGS, SGC, CGC for trading cards) are the definitive standard of authenticity and condition in live auctions. Because slabs are graded by professional numismatists and authenticators, their labels contain certified metadata that dramatically impacts market value.

Currently, the extension's appraisal pipeline exhibits five critical flaws when valuing slabbed items:

1. **Static Common-Date FMV Guide Overriding Premium Slabs**: When an item is recognized as a coin, `fmvLookup` returns a static common-date retail value based solely on base series and numeric grade (e.g., standard bullion American Silver Eagle MS 70 = $75). Because the valuation priority waterfall places reference market guides above the AI estimate (`perCoin = auctions ?? marketPrice ?? compMedian ?? estimateMid`), this generic $75 baseline suppresses the AI estimate and clobbers real secondary market value. Special attributes—such as Elizabeth Jones hand-signed labels, First Day of Issue (FDI) pedigrees, Burnished uncirculated strikes, and CAC stickers—often triple the realized price to $175+, but the system reports the standard $75 common bullion figure.
2. **Missing Structured Slab Attributes for Coins and Paper Currency**: The vision appraisal schema (`APPRAISAL_SCHEMA`) captures `is_slabbed`, `grade`, `grade_number`, `plus_grade`, and a generic `special` string, but lacks structured fields for strike/finish (Burnished, Reverse Proof, Enhanced, Matte), strike qualifiers (Cameo, Deep Cameo, Proof-Like, DMPL, Full Steps, Full Bands), pedigrees (First Day of Issue, Early Releases, Advance Release), signature labels (Elizabeth Jones, John Mercanti, Ed Moy, David Ryder), CAC endorsement (green/gold), and paper currency qualifiers (EPQ, PPQ, Star Note, Friedberg number).
3. **Paper Currency Slab Neglect (PMG & PCGS Banknote)**: Slabs frequently encase paper currency (US Silver Certificates, Gold Certificates, Legal Tender Red Seals, Federal Reserve Notes). The single most crucial value driver on a PMG or PCGS Banknote slab is **EPQ** (Exceptional Paper Quality) or **PPQ** (Premium Paper Quality), along with **Star Notes (★)** and **Friedberg (Fr.) catalog numbers**. A PMG 64 EPQ note can trade for 2x to 3x an identical non-EPQ note. Currently, paper currency slabs lack specialized valuation rules and are subjected to generic estimation without EPQ/Fr.-aware query comp matching.
4. **Slab-Blind eBay Sold Comp Searches (`buildEbayQuery`)**: The background eBay completed/sold comp query builder constructs searches using only `item_name`, `year`, `mint_mark`, and `grade`. It omits `special` designations, signature names, strike types, EPQ/PPQ, and CAC stickers. Consequently, an eBay comp search for a $175 signed slab searches for generic "2017 W American Silver Eagle MS 70", returning common $75 bullion sales and skewing the comp median.
5. **UI Labeling Bug on Graded Coin & Paper Lookups**: In `src/shared/appraisal.ts`, `BASIS_LABEL['market']` is hardcoded to `'TCGplayer market price'`. When NumisMedia FMV, Greysheet, or eBay comps resolve as `marketPrice` for a slabbed coin or note, the appraisal UI displays `"Market $75 · TCGplayer market price"`, confusing coin and currency buyers with trading-card terminology.

## What Changes

- **1. Slab Premium Preservation & Valuation Protection (`src/shared/appraisal.ts`, `src/shared/fmv.ts`)**:
  - Enhance `AppraisalItem` with structured slab metadata: `finish` (regular, proof, burnished, reverse_proof, enhanced, matte, specimen), `designation` (cameo, dcam, pl, dmpl, fs, fb, fbl, fh, rd, rb, bn), `pedigree` (first_day_of_issue, early_releases, first_strike, advance_release), `signature` (signer name), `cac` (none, green, gold), `paper_quality` (none, epq, ppq), and `catalog_number` (Friedberg Fr. / Pick P number).
  - Update `computeValue` and `fmvLookup`: when an item has recognized premium slab attributes (signature label, special finish, FDI pedigree, CAC sticker, or EPQ), the common-date baseline FMV guide price SHALL NOT unilaterally override the AI valuation or slab-specific comps; instead, it is designated as a baseline floor or bypassed in favor of premium-aware comps / calibrated AI estimate.
- **2. Enhanced Vision System Instructions & Extraction (`src/shared/appraisal.ts`)**:
  - Update `APPRAISAL_INSTRUCTIONS` to explicitly direct vision models to inspect slab headers for:
    - **Coins**: Engraver / official signatures (Elizabeth Jones, John Mercanti, Ed Moy, Thomas Cleveland, etc.), special strikes (Burnished "W", Reverse Proof), release windows (First Day of Issue, Early Releases), and CAC stickers.
    - **Paper Currency (PMG / PCGS Banknote)**: EPQ / PPQ banners, Star (★) notes, Friedberg (Fr.) numbers, serial number varieties, and seal colors.
- **3. Slab-Aware eBay Comps Generation (`src/background/ebayComps.ts`)**:
  - Update `buildEbayQuery` to incorporate grading service, exact certified grade, signature signer, special finish, pedigree (FDI), and paper designations (EPQ, Star note) to ensure comp searches retrieve realized sales for the exact certified variety.
- **4. Currency Slab Valuation & EPQ Awareness (`src/shared/fmv.ts`, `src/background/refPrices.ts`)**:
  - Introduce catalog-aware paper currency matching for US notes (Silver Certificates, Legal Tender, Gold Certificates, Federal Reserve Notes) recognizing Friedberg ranges and applying EPQ/PPQ premiums.
- **5. Context-Aware Market Basis UI Labeling (`src/shared/appraisal.ts`, `src/content/appraisalView.ts`)**:
  - Replace the monolithic `'TCGplayer market price'` string with context-sensitive labels based on item type and active ref source (e.g. `'NumisMedia FMV'`, `'Greysheet CPG'`, `'eBay sold comps'`, or `'TCGplayer market price'`).

## Capabilities

### Modified Capabilities

- `appraisal`: Detects and structures all certified slab header metadata (signatures, finishes, pedigrees, CAC, EPQ, Star notes, Friedberg numbers) and prevents common-date guide prices from overriding premium slab values.
- `reference-prices`: Generates slab-specific eBay search queries containing signatures, strike types, and paper quality designations, and refines market basis labels to match the actual price source.

## Out of Scope

- Automated bidding, sniping, or giveaway entry (prohibited by system invariants).
- Direct scraping of restricted or anti-bot third-party grading verification portals (NGC, PMG, PCGS) without official API access or sanctioned user tokens.
- Altering precious metal melt calculations (melt remains pure metal arithmetic based on Troy ounces and live spot).

## Branch & Landing

- **Branch:** `feature/slab-appraisal-improvements`
- **Landing:** Work lands through a pull request into `main` and merges via `gh pr merge --admin`.

