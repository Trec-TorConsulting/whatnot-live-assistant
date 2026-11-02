// Console-injectable copy of the page detection, for checking selectors against a live Whatnot page
// without loading the extension: `npm run probe`, then paste dist-probe/probe.js into DevTools.
import { diagnose } from '../src/content/diagnostics';
import { overlay } from '../src/content/overlay';
import { bookmarkForCard, describeShowCard, findHostFollowControl, findShareButton, findShowCards } from '../src/content/selectors';

declare global {
  interface Window {
    wn2Probe: unknown;
  }
}

window.wn2Probe = {
  diagnose,
  follow: findHostFollowControl,
  cards: () =>
    findShowCards().map(({ liveId, card }) => ({ liveId, bookmark: bookmarkForCard(card)?.state ?? null, ...describeShowCard(card) })),
  share: findShareButton,
  overlay,
};
