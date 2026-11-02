# Proposal

## Why

Envelope wheels are a game inside the wheel. A spin can land on a numbered envelope whose item stays secret until the wheel or the show ends, while the camera shows that pool mixed with floors and instant hits. The current spec prices an envelope only when the title looks like "envelope #3", and when the photo has extra items it keeps the cheapest ones. On a live wheel such as familymetals' Coffee & Fun, the spots are titled "Family Pack #7" with the description "Envelope", so the jackpot never enters the pool and the top item can be dropped. Those rules were worked out against that show and live only in the retired Whatnot-screen-tap-shares session.

## What Changes

- Treat a spot as an envelope when the title or the description is an envelope, lope, bag, or the same kind of hidden name. The number identifies the physical envelope. It does not identify the item.
- Split the camera board: match items that are clearly named instant hits and price those spots from the match. The unmatched items are the envelope pool, floors included.
- Value every still-sealed envelope as the average of that pool. The top item's share of each envelope is its price divided by how many envelopes the wheel started with, because a sold envelope may already hold it and nothing is opened until the end.
- When a later photo shows the board shrink after an envelope is won, treat that seller as opening as they go: drop the missing items and divide the top item by the envelopes still sealed. An empty read, or a read that drops most of the board at once, keeps the last board and is not a reveal.
- The next spin is worth the mix of remaining envelopes and remaining instant hits. That number moves when cheap instant hits sell. Selling a sealed envelope does not make the ones left more valuable.
- **BREAKING** for the wheel spec: stop filling extra board items with only the cheapest ones. That rule drops the top item when floors and instant hits share the photo.
- Chat lines such as "Unlocked Second cousin" do not change the odds.
- Record the repo move in OpenSpec context: the source of truth is `whatnot-live-assistant`. Keep the version-bump and appraisal-speed rules that lived in the old folder, pointed at this repo's `package.json`.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `wheel-and-prizes`: Envelope detection, the camera board, and the value of a sealed envelope versus the next spin.
- `build-and-delivery`: A code change bumps `package.json` at the repo root, and the built manifest and userscript show that version. The old `extension-v2` and v1 paths are retired.

## Impact

- `src/shared/breaks.ts` (`isHiddenPrize`), `src/shared/envelopes.ts` (`wheelRows`), `src/shared/wheel.ts` (`wheelOdds`), `src/content/wheel.ts`, `src/content/envelopes.ts`, `src/shared/prizeValue.ts`, `src/background/prizeValues.ts`, and the wheel side panel.
- `openspec/config.yaml` names this repository and keeps the appraisal priority and version rules.
- Branch `envelope-wheel-odds`, opened as a pull request into `main`, then merged with `gh pr merge --admin`. No bid is placed. No envelope is matched to a shelf item by number.

## Out of scope

- Guessing which envelope holds which shelf item.
- Treating host or chat talk as a second game.
- Changing appraisal model order, PCGS lookup, or the bid guard. Those requirements already stand in `appraisal` and `bid-guard`.
- Deleting or migrating the retired `Whatnot-screen-tap-shares` folder.
- Bidding, giveaway entry, or inventing a certification number.
