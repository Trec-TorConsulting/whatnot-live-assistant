# Proposal: NGC Slab Certification Verification & Live Video Barcode Scanning

## Why

NGC (Numismatic Guaranty Company) is one of the two premier numismatic third-party grading services alongside PCGS. Coin auctions on Whatnot (such as high-volume Morgan and bullion shows) feature NGC slabs with prominent linear barcodes and certification numbers.

Currently, the extension values NGC coins using Sheldon grade market tiers from NumisMedia FMV, Greysheet CPG, and eBay sold comps, but exhibits three major gaps during appraisal:

1. **No Direct NGC Cert Verification Link**: While PCGS has CoinFacts integration and PSA has cert checks, appraisals for NGC slabs provide no direct verification link to the official NGC database (`ngccoin.com/certlookup/`). Buyers who need to verify coin attribution, variety, and NGC population images must manually retype the cert number and grade on an external device or separate browser window.
2. **Untapped Barcode Decoding on Live Video**: NGC slabs prominently display a high-contrast linear barcode (and on newer holders, a 2D QR code on the reverse). The camera stream frequently frames this barcode clearly when sellers present slabs. The extension currently relies entirely on optical character recognition (OCR) / vision models to guess cert digits, which can misread numbers or suffer from glare. The browser's native `BarcodeDetector` API can instantly decode the barcode off the live `<video>` element with zero network latency and 100% digit accuracy.
3. **Hyphenated NGC Cert Number Stripping in Listing Quick Reads**: NGC certification numbers follow a `XXXXXXX-XXX` (7-digit submission number, hyphen, 3-digit coin/line number) or 10-digit format. The current listing `quickRead` parser strictly filters for `\bPCGS\b` and a 7-9 digit regex (`CERT_RE`), omitting NGC hyphenated serial numbers in lot titles and chat lines.

## What Changes

1. **Native Live Video Barcode Scanner (`src/content/barcode.ts`, `src/content/appraise.ts`)**:
   - Introduce a fast, zero-latency barcode reader utilizing Chrome's native `BarcodeDetector` API for `code_128`, `code_39`, and `qr_code`.
   - On appraisal, inspect the active stream video element to detect any visible slab barcode or QR code.
   - If a valid NGC cert number (e.g. `XXXXXXX-XXX` or 7-10 digits) or direct NGC URL is found, ground the appraisal item's `cert_number`, set `is_slabbed: true`, and default `grading_service: 'NGC'`.
2. **NGC Cert Direct URL Resolver & Ref Price Entry (`src/shared/refPrice.ts`, `src/background/refPrices.ts`)**:
   - Implement `formatNgcCert` and `ngcCertUrl`: format NGC numbers cleanly and construct the direct lookup link: `https://www.ngccoin.com/certlookup/{cert}/{grade}/` (or `https://www.ngccoin.com/certlookup/{cert}/`).
   - Add `'ngc'` to `RefSource` (`REF_LABEL['ngc'] = 'NGC cert'`).
   - When an NGC slab is appraised with a valid cert, automatically surface a verified reference item with a direct link to NGC's cert lookup.
3. **Clickable External Links on Appraisal Card Facts (`src/content/overlay.ts`, `src/content/appraisalView.ts`)**:
   - Extend `Fact` in `overlay.ts` to support optional `link`.
   - In `appraisalView.ts`, populate `link` from `ref.link` for verified cert checks (NGC cert, PSA cert, PCGS CoinFacts) and reference sources.
   - In `overlay.ts`, render facts with links as styled clickable links with external icon (`↗`) that open in a new tab without obstructing the live show.
4. **NGC Cert Recognition in Quick Read (`src/shared/appraisal.ts`)**:
   - Extend `quickRead` to detect NGC slab cert patterns (both `1234567-001` and 7-10 digit numbers accompanied by `NGC` in listing titles or chat).
   - Preserve detected `gradingService` so quick appraisals immediately reflect NGC attribution.
5. **Version Bump**:
   - Bump package version to `0.24.0` in `package.json` (and `README.md`) to reflect the new feature addition.

## Capabilities

### Modified Capabilities

- `appraisal`: Detects visible slab barcodes directly from the live video stream using `BarcodeDetector`, recognizing NGC certification numbers and preventing misread cert digits.
- `reference-prices`: Introduces NGC cert reference verification with structured URL generation (`ngccoin.com/certlookup/{cert}/{grade}`) and clickable links on the appraisal overlay.

## Out of Scope

- Automated web scraping of NGC's bot-protected cert pages (NGC uses Cloudflare Turnstile/anti-bot; users are provided a direct 1-click verification link to open in their browser).
- Placing bids, entering giveaways, or submitting automated auction actions.
- Storing third-party passwords or private keys.

## Branch & Landing

- **Branch:** `feature/ngc-cert-and-barcode-verification`
- **Landing:** Work lands through a pull request into `main` and merges via `gh pr merge --admin`.

