# Appraisal

## Purpose
Appraisal reads the listing and the item on screen, then fills in prices it can look up. A figure with no sale behind it is an estimate. The extension does not invent certification numbers or place a bid.

## Requirements

### Requirement: Model order
Unless Ollama-only is on, the on-device model SHALL be asked immediately. An answer from it within about two seconds SHALL be final and SHALL NOT call a cloud provider. If it is missing, fails, or is still running after about two seconds, saved cloud providers SHALL run, preferred first, and the first good answer SHALL win. Another saved provider and Ollama, when configured, SHALL start if the preferred provider fails or has not answered within about five seconds. Ollama-only SHALL skip on-device and cloud providers, and SHALL fail without calling them when the Ollama URL or model is blank.

#### Scenario: On-device answers quickly
- **WHEN** the on-device model answers within about two seconds
- **THEN** no cloud provider is called

#### Scenario: On-device is still running
- **WHEN** the on-device model has not answered after about two seconds and a saved cloud provider then answers
- **THEN** that cloud answer is the one shown

#### Scenario: No model available
- **WHEN** the on-device model is unavailable, no cloud provider key is saved, and Ollama is not configured
- **THEN** appraisal fails and asks for on-device AI, a cloud key, or Ollama

#### Scenario: Ollama only without a server
- **WHEN** Ollama-only is on and the URL or model is blank
- **THEN** no cloud provider is called

#### Scenario: Preferred answer is fast
- **WHEN** the preferred provider answers before about five seconds
- **THEN** no other cloud provider is called

#### Scenario: Preferred provider is overloaded
- **WHEN** the preferred provider is overloaded and another provider has a saved key
- **THEN** that other provider is asked on the same click and a good answer from it wins

#### Scenario: Preferred key is blank
- **WHEN** the preferred provider has no key and another provider has a key
- **THEN** the provider with a key is asked

#### Scenario: Every saved provider is overloaded
- **WHEN** every saved cloud provider is overloaded through the deadline
- **THEN** appraisal fails and names the providers it tried

### Requirement: No invented certs
The extension SHALL NOT create a PCGS number or a certification number when the model omits them. A cert SHALL be used only when it was read. Instructions SHALL tell the model not to invent a PCGS number, not to guess jewelry weight, and not to supply mintage or population.

#### Scenario: Model omits the cert
- **WHEN** the identification has no certification number
- **THEN** the extension does not fill one in

### Requirement: Market value order
Per piece, market value SHALL prefer a PCGS auction median, then a raw card market price, then the median of at least two matching Whatnot sales, then the midpoint of a positive AI estimate, then melt. The PCGS price guide SHALL be shown and SHALL NOT set the market value or the suggested max. Suggested max SHALL be the configured percent of market value, except melt which uses 100 percent of melt, and SHALL NOT sit below melt. Low confidence SHALL NOT produce a bid headline.

#### Scenario: Guide only
- **WHEN** the only PCGS figure is the price guide and no other price source applies
- **THEN** market value and suggested max stay empty

#### Scenario: Estimate below melt
- **WHEN** the AI estimate does not clear melt
- **THEN** the basis is melt rather than the estimate

### Requirement: Answer before sale lookups
The identification SHALL be shown when the model answers. A PCGS lookup, Whatnot comps, and show-type calibration SHALL fill in afterward and SHALL NOT delay that first answer.

#### Scenario: Price lookup is still running
- **WHEN** the model has identified the item and the sale-price lookup has not returned
- **THEN** the card shows the identification

### Requirement: Same frame cache
The same JPEG under the same show type SHALL reuse the identification for about ten minutes. Melt SHALL be recomputed. A different show type SHALL miss the cache.

#### Scenario: Repeat appraisal
- **WHEN** the same frame and show type are appraised again within ten minutes
- **THEN** the model is not called again for that identification

### Requirement: Quick melt
Before the frame returns, a listing line with a known series or an explicit ounce weight SHALL produce a melt floor from spot metal prices. Fetching that spot price SHALL NOT delay sending the frame to the model. Spot SHALL come from gold-api.com, with a short session cache. Plated, filled, and similar stamps SHALL have no melt. A failed spot fetch with no cache SHALL leave melt empty. The quick read SHALL NOT call PCGS.

#### Scenario: Spot price is slow
- **WHEN** the listing has a metal weight and the spot price has not come back yet
- **THEN** the frame is still sent to the model

#### Scenario: No metal in the title
- **WHEN** the listing has no year-or-ounce metal line
- **THEN** there is no quick melt

#### Scenario: Fractional ounce
- **WHEN** the listing states a fraction of an ounce, such as 1/1000 oz gold
- **THEN** melt uses that fraction of an ounce, not the number after the slash

### Requirement: Automatic appraisal and flea scan
Automatic appraisal SHALL run for each new auction only when that overlay preference is on. A flea-market table scan SHALL run only when scan is on, which defaults to on for a flea show type. The scan SHALL list other visible items and SHALL NOT change the main max bid.

#### Scenario: Non-flea show
- **WHEN** the show type is not flea and the user has not turned scan on
- **THEN** no table scan is requested

### Requirement: Show notes as context
Appraisal and a flea table scan SHALL include the seller's published show notes when the show has them. The notes SHALL be labeled as rules for the show, and the image SHALL still decide what the item is. A coupon code in the notes SHALL NOT be sent to the model.

#### Scenario: Notes and a coupon
- **WHEN** the show notes name the kind of item and contain a coupon code
- **THEN** the appraisal request includes the item wording and omits the code

### Requirement: Calibration
Show-type calibration SHALL scale only the AI estimate range, and only after enough comparable sales for that show type. It SHALL NOT scale PCGS, card, Whatnot, or melt values.

#### Scenario: Realized price basis
- **WHEN** the market value comes from a PCGS median or Whatnot comps
- **THEN** calibration does not change that value

### Requirement: Automatic models
A blank model SHALL use that provider's cheapest vision model that returns JSON, then one fallback. Gemini's automatic order SHALL be gemini-2.5-flash-lite, gemini-3.1-flash-lite, gemini-3.5-flash-lite, then gemini-2.5-flash. A model the user typed SHALL be tried first. When that model is overloaded, missing, or too slow, the provider's automatic models SHALL be tried. A good answer from the first model before the hedge SHALL NOT call a later model.

#### Scenario: Gemini overload reaches 3.5 Flash-Lite
- **WHEN** the Gemini model is blank and gemini-2.5-flash-lite and gemini-3.1-flash-lite are overloaded
- **THEN** gemini-3.5-flash-lite is tried before the deadline

#### Scenario: Typed model answers
- **WHEN** the user sets a Gemini model and that model answers
- **THEN** that model is the one that answered

### Requirement: Estate reading hint
When the estate pass is on, the appraisal request SHALL say that a template title is only a shipping bucket, that the image decides the item, and that the model should read maker marks, pattern names, clothing brand, size, and flaws, and hallmarks. The hint SHALL NOT add a model call. A coupon in the notes SHALL still be omitted.

#### Scenario: Template lot on an estate show
- **WHEN** the active lot is "E Random 1-2lb #10" and the estate pass is on
- **THEN** the appraisal request includes that hint and does not call a second model for it

#### Scenario: Coupon stays out
- **WHEN** the estate notes contain a coupon code
- **THEN** the appraisal request omits the code

### Requirement: Template title is not the item
When the active lot is a template, the appraisal request SHALL NOT present that title as the item's name. It MAY include the lot number and the weight tier as listing context. The identified name SHALL come from the image. The request SHALL NOT ask the model to invent a size, weight, or certification number.

#### Scenario: Item on screen
- **WHEN** the lot title is "*c - 2 oz Item on screen #57"
- **THEN** the appraisal request does not call the item "Item on screen" and may include lot 57 and the 2 oz tier

#### Scenario: No name in the title
- **WHEN** the image shows a sticker sheet and the title is "Junk bag #70"
- **THEN** the identified name comes from the image
