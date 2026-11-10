# Design: Universal Slab Certification Verification & Multi-Service Barcode Scanning

## Touched Modules

- `src/shared/refPrice.ts`: Expands `RefSource` and `REF_LABEL` with `'pmg'`, `'cgc'`, `'cacg'`, `'anacs'`, `'bgs'`, and `'sgc'`. Adds `certLookupUrl(service, cert, grade, itemType)` helper for all providers.
- `src/shared/refPrice.test.ts`: Unit tests verifying URL generation across all 11 grading services.
- `src/background/refPrices.ts`: Dispatches verified cert reference entries for all recognized grading services when a slab has a cert number.
- `src/background/refPrices.test.ts`: Integration tests for PMG, CGC, CACG, ANACS, BGS, and SGC reference resolution.
- `src/content/barcode.ts`: Expands barcode and QR decoding to support PMG, CGC Cards, CGC Comics, PCGS Banknote, PSA, and generic serials.
- `src/content/barcode.test.ts`: Tests for multi-service barcode and QR parsing.
- `src/content/appraise.ts`: Grounds detected grading service and cert numbers for all supported services.
- `src/shared/appraisal.ts`: Updates `quickRead` to parse cert numbers across all supported grading services in listing text.
- `src/shared/appraisal.test.ts`: Tests for multi-service cert parsing in quickRead.
- `package.json`: Version bumped to `0.25.0`.
- `README.md`: Updates documentation for universal cert verification and barcode support.

## Architecture & Data Flow

### 1. Unified Cert URL Resolution Matrix (`src/shared/refPrice.ts`)

```
+-------------------------------------------------------------------------------------------------------+
| Provider        | Category       | Mode   | URL Pattern                                               |
+-------------------------------------------------------------------------------------------------------+
| PCGS            | Coins          | Direct | https://www.pcgs.com/cert/{cert}                          |
| PCGS Banknote   | Banknotes      | Direct | https://www.pcgs.com/banknote/cert/{cert}                 |
| NGC             | Coins          | Direct | https://www.ngccoin.com/certlookup/{cert}/{grade}/        |
| PMG             | Banknotes      | Direct | https://www.pmgnotes.com/certlookup/{cert}/{grade}/       |
| CGC Cards       | Cards          | Direct | https://www.cgccards.com/certlookup/{cert}/               |
| CGC Comics      | Comics/Books   | Direct | https://www.cgccomics.com/certlookup/{cert}/              |
| PSA             | Cards/Holders  | Direct | https://www.psacard.com/cert/{cert}                       |
| CACG            | Coins          | Portal | https://www.cacgrading.com/certlookup                     |
| ANACS           | Coins          | Portal | https://portal.anacs.com/Verify/CertVerification.aspx     |
| Beckett (BGS)   | Cards          | Portal | https://www.beckett.com/grading/card-lookup               |
| SGC             | Cards          | Portal | https://gosgc.com/cert-code-lookup                        |
+-------------------------------------------------------------------------------------------------------+
```

### 2. Multi-Service Barcode & QR Parsing (`src/content/barcode.ts`)

When `BarcodeDetector` decodes a barcode from `<video>`:
1. **QR Code URL Matchers**:
   - `pmgnotes.com/certlookup/([a-zA-Z0-9-]+)(?:/(\d{1,2}))?` -> service: `'PMG'`, cert, grade
   - `cgccards.com/certlookup/([a-zA-Z0-9]+)` -> service: `'CGC'`, cert
   - `cgccomics.com/certlookup/([a-zA-Z0-9]+)` -> service: `'CGC'`, cert
   - `pcgs.com/banknote/cert/(\d{7,9})` -> service: `'PCGS Banknote'`, cert
   - `pcgs.com/cert/(\d{7,9})` -> service: `'PCGS'`, cert
   - `ngccoin.com/certlookup/([a-zA-Z0-9-]+)(?:/(\d{1,2}))?` -> service: `'NGC'`, cert, grade
   - `psacard.com/cert/(\d{7,9})` -> service: `'PSA'`, cert
2. **Linear Serial Numbers**:
   - Hyphenated `(\d{7})-(\d{3})` -> NGC / PMG format
   - 10-digit serials -> NGC / PMG format
   - 10-13 digit serials -> CGC format
   - 7-9 digit serials -> PCGS / PSA format

### 3. Appraisal Overlay Card UI

All verified cert entries appear under Facts on the on-screen card:
- Displays `[Service] cert` (e.g. `PMG cert`, `CGC cert`, `PCGS cert`, `NGC cert`, `CACG cert`)
- Value shows verified grade or cert status with clickable `↗` icon
- Subtitle or detail shows the item name and cert number
- Clicking immediately opens the verification target in a companion tab without interrupting live show video or chat

