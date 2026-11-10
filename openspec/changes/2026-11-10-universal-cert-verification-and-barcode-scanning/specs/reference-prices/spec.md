# Reference prices

## Requirements

### Requirement: Universal slab certificate lookup
When an appraised coin, paper currency, trading card, or comic is identified as slabbed by a recognized grading service (PCGS, NGC, PMG, PCGS Banknote, PSA, CGC Cards, CGC Comics, CACG, ANACS, Beckett/BGS, SGC) with a valid certification number, the extension SHALL generate a verified reference item with a link to the official verification tool.

1. **Direct Deep-Link Services**:
   - For **PCGS** coins, the link SHALL target `https://www.pcgs.com/cert/{cert}`.
   - For **PCGS Banknote**, the link SHALL target `https://www.pcgs.com/banknote/cert/{cert}`.
   - For **NGC** coins, the link SHALL target `https://www.ngccoin.com/certlookup/{cert}/{grade}/` (or without grade if non-numeric).
   - For **PMG** banknotes, the link SHALL target `https://www.pmgnotes.com/certlookup/{cert}/{grade}/` (or without grade if non-numeric).
   - For **CGC Cards**, the link SHALL target `https://www.cgccards.com/certlookup/{cert}/`.
   - For **CGC Comics**, the link SHALL target `https://www.cgccomics.com/certlookup/{cert}/`.
   - For **PSA**, the link SHALL target `https://www.psacard.com/cert/{cert}`.

2. **Portal Search Services**:
   - For **CACG**, the link SHALL target `https://www.cacgrading.com/certlookup`.
   - For **ANACS**, the link SHALL target `https://portal.anacs.com/Verify/CertVerification.aspx`.
   - For **Beckett (BGS)**, the link SHALL target `https://www.beckett.com/grading/card-lookup`.
   - For **SGC**, the link SHALL target `https://gosgc.com/cert-code-lookup`.

The reference item SHALL be labeled with the service name (e.g. `'PMG cert'`, `'CGC cert'`, `'PCGS cert'`, `'CACG cert'`) and rendered as a clickable link on the appraisal card opening in a new tab.

#### Scenario: Graded PMG banknote
- **WHEN** an appraised item is slabbed by PMG with grade `"EPQ 64"` and cert `"2517345-003"`
- **THEN** the extension creates a reference item with label `'PMG cert'` and direct link `"https://www.pmgnotes.com/certlookup/2517345-003/64/"`

#### Scenario: Graded PCGS Banknote
- **WHEN** an appraised banknote is slabbed by PCGS Banknote with cert `"80123456"`
- **THEN** the extension creates a reference item with label `'PCGS cert'` and direct link `"https://www.pcgs.com/banknote/cert/80123456"`

#### Scenario: Graded CGC trading card
- **WHEN** an appraised trading card is slabbed by CGC with cert `"1401022941001"`
- **THEN** the extension creates a reference item with label `'CGC cert'` and direct link `"https://www.cgccards.com/certlookup/1401022941001/"`

#### Scenario: Graded CACG coin
- **WHEN** an appraised coin is slabbed by CACG with cert `"10012345"`
- **THEN** the extension creates a reference item with label `'CACG cert'` and portal link `"https://www.cacgrading.com/certlookup"`

