# Appraisal

## Requirements

### Requirement: Live stream barcode detection
When the user triggers an appraisal and a live video stream element is present, the extension SHALL attempt to detect 1D and 2D barcodes (Code 128, Code 39, QR code) directly from the stream using the browser's native `BarcodeDetector` API when supported. If an NGC slab barcode (matching a 7-to-10 digit certification number or `XXXXXXX-XXX` format) or NGC verification URL is decoded, the extension SHALL ground the item's `cert_number` with the scanned value and set `is_slabbed` to true. If `BarcodeDetector` is unsupported or no barcode is detected, the appraisal SHALL proceed using the standard vision and listing read pipeline without failure.

#### Scenario: Barcode detected on camera
- **WHEN** an NGC slab barcode is clearly visible in the live stream video frame during appraisal
- **THEN** the extension decodes the barcode and assigns the certification number without waiting for OCR

#### Scenario: Barcode detector unsupported or barcode absent
- **WHEN** the browser does not support `BarcodeDetector` or no barcode is detected in the video frame
- **THEN** the appraisal continues using model vision and listing text without throwing an error

### Requirement: NGC cert quick read parsing
The listing text `quickRead` parser SHALL recognize hyphenated NGC certification numbers in the format `XXXXXXX-XXX` (7 digits, hyphen, 3 digits) as well as 7-to-10 digit cert numbers accompanied by NGC slab mentions. When an NGC cert is detected in the lot title or chat lines, the quick read result SHALL include the certification number and set `gradingService` to `'NGC'`.

#### Scenario: Hyphenated NGC cert in lot title
- **WHEN** a lot title contains `"1881-S Morgan NGC MS65 6066357-002"`
- **THEN** `quickRead` extracts `"6066357-002"` as the cert number and identifies the grading service as `"NGC"`

