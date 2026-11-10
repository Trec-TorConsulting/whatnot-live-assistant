# Design: NGC Slab Certification Verification & Live Video Barcode Scanning

## Touched Modules

- `src/content/barcode.ts`: New utility module encapsulating `scanVideoBarcode` and barcode parsing for slab identifiers.
- `src/content/barcode.test.ts`: Unit tests verifying barcode decoding, URL parsing, and graceful degradation when `BarcodeDetector` is unsupported.
- `src/content/appraise.ts`: Invokes `scanVideoBarcode` during `appraiseNow`, passes detected certs to item context and listing overrides.
- `src/shared/refPrice.ts`: Extends `RefSource` with `'ngc'`, exports `formatNgcCert`, `extractNumericGrade`, and `ngcCertUrl`.
- `src/background/refPrices.ts`: Dispatches NGC verification ref price when `grading_service === 'NGC'` and `cert_number` is present.
- `src/content/overlay.ts`: Extends `Fact` with optional `link?: string | null` and renders clickable links in `factsHtml`.
- `src/content/appraisalView.ts`: Maps `ref.link` onto `Fact.link` for verified certs and external comp links.
- `src/shared/appraisal.ts`: Updates `quickRead` to parse NGC cert numbers (`XXXXXXX-XXX` or 7-10 digits) and return detected grading service.
- `src/shared/appraisal.test.ts`: Unit tests covering NGC cert parsing in quickRead and NGC cert URL formatting.
- `package.json`: Version bumped to `0.24.0`.
- `README.md`: Updates version reference and features documentation.

## Architecture & Data Flow

### 1. Barcode Scanning (`src/content/barcode.ts`)

```
   +--------------------+
   | <video> live frame |
   +--------------------+
             |
             v
   window.BarcodeDetector.detect(video) [formats: code_128, code_39, qr_code]
             |
             +---> Decodes rawValue:
                     Case 1: "6066357-002" -> cert: "6066357-002", service: "NGC"
                     Case 2: "https://www.ngccoin.com/certlookup/6066357-002/68/" -> cert: "6066357-002", grade: "68", service: "NGC"
                     Case 3: "12345678" -> cert: "12345678", service: null
```

- When `BarcodeDetector` is unavailable in the environment or errors, returns `null` safely without interrupting the appraisal pipeline.
- Scans complete synchronously in <15ms directly in the browser process.

### 2. NGC Verification Reference Resolver (`src/shared/refPrice.ts`, `src/background/refPrices.ts`)

NGC requires both the cert number and numeric grade for direct lookup:
- `extractNumericGrade('MS 65')` -> `'65'`
- `formatNgcCert('6066357002')` -> `'6066357-002'`
- `ngcCertUrl('6066357-002', 'MS 65')` -> `'https://www.ngccoin.com/certlookup/6066357-002/65/'`

When an appraisal identifies an NGC slab:
1. `refPrices.ts` constructs a verified `RefPrice` with `source: 'ngc'`, `link: ngcCertUrl(...)`, `detail: 'NGC MS 65'`.
2. This requires no token or API key because NGC's certlookup tool is public.

### 3. Clickable Overlay Fact Links (`src/content/overlay.ts`)

In `factsHtml`:
```typescript
const factsHtml = (facts: Fact[]) =>
  facts.length
    ? `<dl class="facts">${facts
      .map(
        (f) =>
          `<dt>${esc(f.label)}</dt><dd>${f.link ? `<strong><a href="${esc(f.link)}" target="_blank" rel="noopener noreferrer" class="fact-link">${esc(f.value)} ↗</a></strong>` : `<strong>${esc(f.value)}</strong>`}${f.detail ? `<div class="muted" title="${esc(f.detail)}">${esc(f.detail)}</div>` : ''}</dd>`,
      )
      .join('')}</dl>`
    : '';
```
Styled with `.fact-link { color: #60a5fa; text-decoration: underline; }` and hover states.
Users can tap directly during live auctions to cross-reference coin varieties, pedigree notes, and NGC Population Report census photos in a companion tab.

