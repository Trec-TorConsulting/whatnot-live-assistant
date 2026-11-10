# Reference prices

## Requirements

### Requirement: NGC slab certificate lookup
When an appraised coin or collectible is identified as an NGC slab (`grading_service === 'NGC'`) with a certification number of at least seven digits, the extension SHALL generate an NGC reference item with a direct link to the official NGC Cert Lookup tool (`https://www.ngccoin.com/certlookup/{cert}/{grade}/`). If a numeric grade is present (such as `65` from `MS 65`), the link SHALL target the specific cert and grade path. If no numeric grade is present, the link SHALL target the cert path. The reference item SHALL be labeled `'NGC cert'` and displayed on the appraisal card with a clickable external link opening in a new tab.

#### Scenario: Graded NGC coin with numeric grade
- **WHEN** an appraised item is slabbed by NGC with grade `"MS 65"` and cert `"6066357-002"`
- **THEN** the extension creates a reference item with label `'NGC cert'` and direct link `"https://www.ngccoin.com/certlookup/6066357-002/65/"`

#### Scenario: Graded NGC coin with non-numeric grade
- **WHEN** an appraised item is slabbed by NGC with grade `"UNC Details"` and cert `"1234567-001"`
- **THEN** the extension creates a reference item with label `'NGC cert'` and link `"https://www.ngccoin.com/certlookup/1234567-001/"`

### Requirement: Clickable reference and cert links
Any reference item or verified cert check containing a valid URL SHALL be rendered in the on-screen appraisal overlay as a clickable link with target `_blank` and `rel="noopener noreferrer"`. Clicking the link SHALL open the verification page in a new tab without closing or refreshing the live show.

#### Scenario: User clicks cert link on overlay
- **WHEN** an appraisal fact displays a verified cert or reference with a link
- **THEN** clicking the link opens the target cert lookup in a new browser tab

