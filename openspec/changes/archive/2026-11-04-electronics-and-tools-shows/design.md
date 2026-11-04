# Design

## Context

See proposal.md for why. This change builds on `everyday-electronics-shows`, which is planned and not yet implemented. That change adds the `electronics` show type, `src/shared/electronics.ts` (pull buckets, condition, MSRP, rules, wants, run board), the listing subtitle on shop rows, and pull and generic-class rejection in `findComps`. This change assumes that code exists.

Current behavior this change relies on:

- `findComps` in `src/shared/soldHistory.ts` scores word overlap from `titleTokens` in `src/shared/purchases.ts`. That tokenizer drops one-character tokens and splits on `-`. Year is the only conflict. "2886-20" and "2886-22" share "2886", "Atom Pro 2" becomes "atom pro", and "8GB 250GB" against "8GB 500GB" still clears the 0.6 overlap.
- `scoreShop` in `src/shared/shop.ts` skips an auction at $1 or less as the pre-bid opener. A $2 opener is scored.
- `noteForPrompt` in `src/shared/appraisal.ts` already removes coupon codes before the notes reach the model.
- `checksFor` in `src/shared/counterfeit.ts` lists checks by `ItemType`. It has nothing for `electronics` or `tools_household`, and no input for the lot title or show type.

## Goals / Non-Goals

**Goals:**

- Local, model-free reads (spec line, tools line, accessory flag, promises) that show with the listing.
- A comp conflicts only when both titles state a spec and the specs differ. A spec missing from either title is not a conflict.
- No change to model order, timeouts, or the number of calls.

**Non-Goals:**

- A spec database or catalog lookup. Everything comes from listing text, notes, chat, or the one appraisal answer.
- Rewriting `titleTokens` for purchases. Comps get their own spec extraction. Purchases keep working as they do.

## Decisions

### Tools is a show type, not a flavor of electronics

Add `tools` to `ShowType` in `src/shared/showType.ts`. A Tools category, or a tag naming a tool brand (Milwaukee Tools, Ryobi Tools, DeWalt), sets it. It outranks a Pallet Pulls tag, as electronics does. `sameKind` then keeps drill hammers out of iPad comps and out of the electronics calibration bucket.

Alternative: keep tools under electronics. Whatnot already lists Tools as its own subcategory. Tool values follow platform and kit, not storage and chip, and mixing them would skew calibration for both.

### Spec extraction is shared by the quick read and comps

New `src/shared/deviceSpecs.ts` returns `{ year, chip, ramGb, storageGb, screenIn, gen, variant, part }` from a title (and the description for `part`).

- RAM versus storage: GB marked RAM is RAM. With two unmarked GB values, the smaller is RAM and the larger is storage. A single unmarked value is storage. TB converts to GB.
- Chip: M1 through M4 (with Pro, Max, Ultra), i3, i5, i7, i9, Celeron, Ryzen N.
- Screen: a number followed by `"`, `in`, or `inch`, from 7 to 34.
- Generation: "9th Gen" or "(4th Gen)".
- Variant: the variant words Pro, Max, Plus, Ultra, Mini, Air, X, and the digit right after the family word or the last variant word ("Atom Pro 2" becomes `{pro, 2}`; "Atom Pro" becomes `{pro}`).
- Part: a Milwaukee-style `NNNN-NN` or `NN-NN-NNNN`, or a mixed code with at least two letters and three digits (`DMAPL9910-S7`, `CSBAM-760`). A one-letter stock code (`K135`) is rejected. Fractions such as `4-1/2` are rejected.

`findComps` rejects a sale when a field both titles state differs. Variant applies only after the base words already overlap. A missing digit after a variant word counts as a different generation ("Atom Pro" against "Atom Pro 2"). A missing chip or RAM does not. Part numbers conflict when the base or the suffix differs.

Alternative: keep one-character tokens in `titleTokens`. That would make "2" count toward overlap but would not make it conflict, and it changes purchase matching too.

### Tools reading lives in its own module

New `src/shared/tools.ts` reads platform from a fixed list, tool-only or kit from wording and the part suffix (Milwaukee -20 is the bare tool; -21 and -22 are kits), amp-hours, and part number via `deviceSpecs`. Tool wants reuse the electronics want list and add part-number and platform-plus-tool matching. When the listing does not say kit or tool-only, the line says so.

### Opener price is per shop

`scoreShop` computes the most common auction start in the scanned listings. If that price is $5 or less and at least half the auctions share it, it is the opener for that shop. The existing $1 rule stays. A start above the opener ($169 for a 2457-21 kit) is scored as before.

### MSRP forms and mismatch extend electronics

`src/shared/electronics.ts` adds the `(RETAIL26.00)`, `$58 value!`, a mid-title `$1999`, and `(Retail 39.99)` forms, and drops a leading `(X)` from the comp name. Notes lines such as "ION — Retail $295" are read into a model-to-retail map. When the lot's model matches a note line with a different figure, the panel shows both as stated retail. No figure enters sold history.

### Promises, accessories, and redaction are local text rules

Promise parsing (warranty, return window, fully unlocked, charger sold separately) sits next to the electronics rules and renders after the no-returns rules. `*NO CHARGER*`, `*NO ADAPTER*`, and "no power cord" set a per-lot flag. `noteForPrompt` drops note lines that mention a password or passcode, a referral code, or a URL, in addition to coupons. The Live panel still shows the full published note, as Whatnot does.

### Checks gain context

`CheckContext` in `src/shared/counterfeit.ts` gains optional `showType` and `title`. Electronics, and a phone or computer named by the appraisal, add activation lock, carrier lock, battery health, serial matching, and charger present. A tools show adds batteries and charger counted on camera, the nameplate part number, and platform. Clone cues come from the title: N-in-1 or hundreds of built-in games, and 512GB or more of storage card at a start of $5 or less. The cap of five stays.

### Surfaces

`src/content/overlay.ts` and `src/sidepanel/sections/live.ts` render the spec line, tools line, accessory flag, retail mismatch, and promises from a content module next to the electronics one. Everything renders from the listing before the appraisal returns.

## Risks / Trade-offs

- [Stricter comps leave fewer matches, so more values fall back to the labeled AI estimate] → This is intended: correctness first. The estimate stays labeled.
- [RAM and storage misread on a title such as "Samsung 500C Chromebook 4GB 16GB"] → The smaller-is-RAM rule reads it right. A single value is storage, so a phone's "128GB" never becomes RAM.
- [A model name contains a stray digit ("P9 Pro Max")] → Variant compares only after the base overlap clears. P9 against P9 still matches.
- [Part-number regex matches a size ("7-1/4")] → Fractions and inch marks are excluded. Tests cover `4-1/2` and `7-1/4`.
- [The opener heuristic hides a real $2 deal] → Only when half the shop shares that start, and only for the price itself. A watchlist hit is still shown as a watchlist match.
- [Order with the earlier change] → This delta restates the merged requirement text. Archive `everyday-electronics-shows` first, then this change.

## Migration Plan

Implement after `everyday-electronics-shows` merges. Bump `package.json` one minor version (0.17.0 if the earlier change shipped as 0.16.0). No stored-data migration. Old sold rows stay; the new conflict rules apply to them on read. Ship on branch `electronics-and-tools-shows` through a pull request into `main`, then `gh pr merge --admin`. Rollback is reverting the merge.
