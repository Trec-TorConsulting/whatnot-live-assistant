# Appraisal

## Requirements

### Requirement: Multi-service live stream barcode and QR decoding
When an appraisal is initiated and a stream video element is present, the extension SHALL detect Code 128, Code 39, and QR code formats using `BarcodeDetector` when supported. The detector SHALL recognize URLs and serial codes for NGC, PMG, CGC Cards, CGC Comics, PCGS, PCGS Banknote, and PSA. Decoded certification numbers, grading services, and numeric grades SHALL ground the appraisal item. If `BarcodeDetector` is unsupported or no barcode is detected, the appraisal SHALL proceed using the standard model vision and listing text read without error.

#### Scenario: PMG QR code detected on stream
- **WHEN** a PMG holder reverse QR code encoding `"https://www.pmgnotes.com/certlookup/2517345-003/64/"` is scanned from the video frame
- **THEN** the extension extracts cert `"2517345-003"`, grade `"64"`, and sets `grading_service` to `"PMG"`

#### Scenario: CGC trading card barcode detected
- **WHEN** a CGC slab barcode encoding `"1401022941001"` is scanned from the video frame
- **THEN** the extension extracts cert `"1401022941001"` and sets `grading_service` to `"CGC"`

### Requirement: Multi-service cert quick read parsing
The listing text `quickRead` parser SHALL recognize certification numbers across all supported grading services (PCGS, NGC, PMG, CGC, CACG, ANACS, BGS, SGC). When a cert number accompanied by a supported service is identified in the lot title or chat lines, `quickRead` SHALL return the cert number and identify the corresponding `gradingService`.

#### Scenario: PMG cert in lot title
- **WHEN** a lot title contains `"1928 $10 Gold Certificate PMG 64 EPQ 2517345-003"`
- **THEN** `quickRead` extracts cert `"2517345-003"` and sets `gradingService` to `"PMG"`

