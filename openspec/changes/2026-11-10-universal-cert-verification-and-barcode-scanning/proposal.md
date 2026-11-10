# Proposal: Universal Slab Certification Verification & Multi-Service Barcode Scanning

## Why

Third-party authentication and grading slabs represent the highest-value transactions across Whatnot collectible shows (coins, banknotes, trading cards, and comics). Slabs from major grading services—including PCGS, NGC, PMG, PCGS Banknote, PSA, CGC Cards, CGC Comics, CACG, ANACS, BGS, and SGC—carry certified barcodes and unique certification serial numbers.

Following the addition of NGC verification in v0.24.0, buyers and dealers in other major collectible categories still face verification friction:

1. **Category Inconsistencies for Certified Holders**:
   - **Paper Money**: Banknote shows frequently auction **PMG** (Paper Money Guaranty) and **PCGS Banknote** slabs. PMG uses the exact same parent (CCG) verification architecture as NGC (`pmgnotes.com/certlookup/{cert}/{grade}/`), while PCGS Banknote provides a direct deep link (`pcgs.com/banknote/cert/{cert}`). Currently, these slabs do not generate one-click verification links on the appraisal card.
   - **Trading Cards & Pop Culture**: Card shows feature **CGC Cards** (`cgccards.com/certlookup/{cert}/`), **Beckett/BGS** (`beckett.com/grading/card-lookup`), and **SGC** (`gosgc.com/cert-code-lookup`), while comic auctions feature **CGC Comics** (`cgccomics.com/certlookup/{cert}/`). Currently, only PSA has cert handling.
   - **Numismatic Specialists**: Slabs certified by **CACG (CAC Grading)** and **ANACS** are common across coin streams. While their lookup systems rely on portal forms rather than dynamic URL pathing, buyers currently receive no direct link to verify these certificates.
2. **Barcode Scanner Limitation**:
   - The stream barcode decoder currently parses only NGC and generic 7-9 digit strings, omitting PMG URLs, CGC 10-13 digit formats, PSA QR codes, and PCGS Banknote cert paths.

## What Changes

1. **Universal Cert Verification URL Resolver (`src/shared/refPrice.ts`, `src/background/refPrices.ts`)**:
   - Expand `RefSource` and `REF_LABEL` to include `'pmg'`, `'cgc'`, `'cacg'`, `'anacs'`, `'bgs'`, and `'sgc'`.
   - Implement universal URL resolution:
     - **Direct Deep-Link Providers**:
       - **PMG**: `https://www.pmgnotes.com/certlookup/{cert}/{grade}/` (or `https://www.pmgnotes.com/certlookup/{cert}/`)
       - **PCGS Banknote**: `https://www.pcgs.com/banknote/cert/{cert}`
       - **CGC Cards**: `https://www.cgccards.com/certlookup/{cert}/`
       - **CGC Comics**: `https://www.cgccomics.com/certlookup/{cert}/`
       - **PCGS Coins**: `https://www.pcgs.com/cert/{cert}`
       - **NGC Coins**: `https://www.ngccoin.com/certlookup/{cert}/{grade}/`
       - **PSA**: `https://www.psacard.com/cert/{cert}`
     - **Portal Search Providers (Form-based)**:
       - **CACG**: `https://www.cacgrading.com/certlookup`
       - **ANACS**: `https://portal.anacs.com/Verify/CertVerification.aspx`
       - **Beckett (BGS)**: `https://www.beckett.com/grading/card-lookup`
       - **SGC**: `https://gosgc.com/cert-code-lookup`
   - In `refPrices.ts`, automatically surface a verified cert reference fact on appraisal for all supported services when a cert number is present.
2. **Multi-Service Stream Barcode & QR Decoding (`src/content/barcode.ts`)**:
   - Expand `parseBarcodeValue` to decode:
     - **QR URLs**: PMG, CGC Cards, CGC Comics, PCGS Banknote, PCGS Coins, NGC Coins, PSA.
     - **Linear Barcodes**: Code 128 and Code 39 for PMG (hyphenated `XXXXXXX-XXX` or 10 digits), CGC (10-13 digits), PCGS (7-9 digits), PSA (7-9 digits).
   - Normalize grading service detection (`PMG`, `CGC`, `PCGS`, `NGC`, `PSA`, `CACG`, `ANACS`, `BGS`, `SGC`).
3. **Quick Read Listing Text Recognition (`src/shared/appraisal.ts`)**:
   - Extend `quickRead` regex patterns to detect cert numbers accompanied by PMG, CGC, CACG, ANACS, BGS, and SGC in listing titles and chat lines.
4. **Appraisal View & Overlay Integration (`src/content/overlay.ts`, `src/content/appraisalView.ts`)**:
   - Ensure all verified cert reference facts render clickable links (`↗`) with corresponding grading service badges.
5. **Version Bump**:
   - Bump minor version to `0.25.0` in `package.json` and `README.md`.

## Capabilities

### Modified Capabilities

- `appraisal`: Expands live video stream barcode and QR detection across all major third-party grading services (NGC, PMG, CGC, PCGS, PSA), auto-populating cert numbers, grades, and grading services.
- `reference-prices`: Introduces universal certification lookup with direct asset deep-links for direct providers (PCGS, NGC, PMG, PCGS Banknote, PSA, CGC) and official portal links for form-based providers (CACG, ANACS, BGS, SGC).

## Out of Scope

- Automated form submission, captcha solving, or bot scraping of third-party verification portals.
- Placing bids, entering giveaways, or submitting automated auction actions.
- Storing third-party passwords or authentication secrets.

## Branch & Landing

- **Branch:** `feature/universal-cert-verification-and-barcode-scanning`
- **Landing:** Work lands through a pull request into `main` and merges via `gh pr merge --admin`.

