# Reference prices

## Purpose
After an item is identified, the extension queries reference pricing sources including Greysheet, NumisMedia FMV, completed eBay sold listings, and card databases. For certified slabs, lookups target the exact grade, variety, signature, and paper quality.

## Requirements

### Requirement: Slab-aware eBay sold comp queries
Recent auction and realized sale comps from completed, sold eBay listings SHALL be constructed using available certified slab attributes. For slabbed coins, the query SHALL incorporate the grading service, certified grade, recognized finish, signature name, and timing pedigree. For slabbed paper currency, the query SHALL incorporate the grading service, grade, EPQ or PPQ qualifier, Star Note status, and catalog reference number when present. Searches SHALL filter out reprints, copies, and non-sold items.

#### Scenario: Query for signed coin slab
- **WHEN** an NGC MS 70 2017-W Burnished Silver Eagle with an Elizabeth Jones signature is queried for eBay sold comps
- **THEN** the search query includes the year 2017-W, Burnished, MS 70, and Elizabeth Jones

#### Scenario: Query for paper money slab with EPQ
- **WHEN** a PMG 66 EPQ Silver Certificate is queried for eBay sold comps
- **THEN** the search query includes PMG, 66, and EPQ

### Requirement: Paper currency reference benchmarks
US paper currency series (including Silver Certificates, Legal Tender notes, Gold Certificates, and Federal Reserve Notes) SHALL be matched against catalog benchmarks. When paper currency is graded by PMG or PCGS Banknote with an EPQ or PPQ designation, the benchmark valuation SHALL reflect the paper quality premium over non-EPQ notes.

#### Scenario: PMG graded note with EPQ
- **WHEN** a PMG 64 EPQ Silver Certificate is evaluated
- **THEN** the reference price reflects the EPQ grade premium over base paper

### Requirement: Realized comp priority over generic guide
When matching realized eBay sold comps exist for a certified slab with specific premium attributes (such as signatures, varieties, or CAC stickers), the median realized comp price SHALL take precedence over a static common-date retail guide.

#### Scenario: Realized signature comps available
- **WHEN** eBay sold comps for an Elizabeth Jones signed MS 70 eagle return a median of $175 and common-date FMV is $75
- **THEN** the reference market price is set to the $175 realized comp median

