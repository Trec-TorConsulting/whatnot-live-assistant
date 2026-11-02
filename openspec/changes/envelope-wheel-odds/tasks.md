# Tasks

## 1. Branch

- [ ] 1.1 Create branch `envelope-wheel-odds` from main and verify `git status` shows that branch. Leave tokens, .env files, and Chrome profiles out of every commit.

## 2. Envelope detection

- [ ] 2.1 Treat a prize as hidden when its title or its detail matches the hidden-name test, and verify a "Family Pack #7" prize with detail "Envelope" is hidden while a plain "Proof Quarter" is not.
- [ ] 2.2 Count a sold hit toward the original envelope total when its title stem matches a hidden prize on this break, and verify emoji and the trailing number do not break the match. When sold pages remain, verify the jackpot share is incomplete instead of using envelopes left.

## 3. Camera pool

- [ ] 3.1 Keep shelf items unmatched to envelopes, including when a shelf number equals an envelope number, and verify that item stays in the pool.
- [ ] 3.2 Match a labeled instant hit to its named spot and leave the other board items in the pool, and verify the instant hit is not averaged into the envelopes.
- [ ] 3.3 Stop trimming the board to the cheapest rows. When unmatched items fit the original envelope count, verify each sealed envelope is their average and gaps count as zero. When they do not fit, verify the top item stays and the average is incomplete.

## 4. Odds card

- [ ] 4.1 Show the top pool item, its sealed share (top divided by the original envelope count), and the envelope average on the wheel card, and verify selling a sealed envelope does not raise the value of the ones left.
- [ ] 4.2 After an envelope hit, a later read that drops some pool items shall remove those items and divide the top item by envelopes still sealed. Verify an empty read keeps the last board, and a read that loses most of the board at once does not count as a reveal.
- [ ] 4.3 Value the next spin as remaining envelopes at the envelope average plus remaining instant hits at their own prices, and verify 2 envelopes at $118 with 18 instant hits at $8 is $19, and those 2 envelopes alone are $118.
- [ ] 4.4 Verify a chat line such as "Unlocked Second cousin" leaves the odds unchanged.

## 5. Delivery

- [ ] 5.1 Bump the patch version in package.json once, run the build, and verify dist/manifest.json and dist-userscript/whatnot-auto-share.user.js show that version.
- [ ] 5.2 Commit, push, and open a detailed pull request from `envelope-wheel-odds` into main, then merge it with `gh pr merge --admin`. The commits contain no tokens, .env files, or Chrome profiles.

## Workflow follow-up

- Archive this change only after the pull request into main is merged.
