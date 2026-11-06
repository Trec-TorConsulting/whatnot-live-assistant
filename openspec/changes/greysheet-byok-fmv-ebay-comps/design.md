# Design: Greysheet BYOK, FMV Guide, and eBay Sold Comps

## Architecture

1. **Storage & Credentials (`src/shared/storage.ts`)**:
   - `AppraisalSettings` stores `greysheetApiKey: string` and `greysheetToken: string`.
   - Credentials remain in local extension storage (`chrome.storage.local`).

2. **Greysheet API Client (`src/background/greysheet.ts`)**:
   - Communicates with CDN Public API V2 (`https://cpgpublicapiv2.greysheet.com/api`).
   - Authenticates via custom request headers: `x-api-key` and `x-api-token`.
   - `testGreysheet()` validates credentials against node status endpoints.
   - `greysheetLookup()` queries items and extracts CPG retail values and wholesale bid/ask figures.

3. **NumisMedia FMV Guide (`src/shared/fmv.ts`)**:
   - Detects US coin series from name, year, and mint mark.
   - Converts grades (verbal or numeric) to Sheldon grade tiers (G-4 to MS-67).
   - Maps base retail market valuations and applies key-date premiums.
   - Returns a `RefPrice` with source `'fmv'`.

4. **Recent Auction / eBay Sold Comps (`src/background/ebayComps.ts`)**:
   - Constructs target search query and fetches completed listings (`LH_Sold=1&LH_Complete=1&_sop=13`).
   - Parses sold listings, filters out replicas/novelties, and computes median, low, high, and last sold prices.
   - Returns a `RefPrice` with source `'ebay'` and a direct link to the realized sales.

5. **Reference Price Integration (`src/background/refPrices.ts`)**:
   - Expands `asksFor` to include Greysheet (if BYOK credentials present), FMV guide, and eBay sold comps for coins and collectibles.
   - Respects cache TTLs to avoid redundant network calls.

6. **UI & Overlay (`src/content/appraisalView.ts`, `src/sidepanel/index.html`)**:
   - Settings UI includes input fields for Greysheet API Key and Token with a Test button.
   - Appraisal card displays Greysheet CPG/Wholesale, NumisMedia FMV, and eBay Sold Comps.

