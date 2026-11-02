import type { DiagnosticsReport } from '../shared/messages';
import type { ShareTarget } from '../shared/types';
import { isVisible } from './dom';
import { hookInstalled, liveSession } from './live';
import { overrides } from './overridesState';
import {
  bookmarkForCard,
  describeShowCard,
  findBidButtons,
  findExpandShowsButton,
  findHostFollowControl,
  findShareButton,
  findShareTarget,
  findShowCards,
  findStreamVideo,
  isLivePath,
  isProfilePath,
  labelOf,
} from './selectors';
import { findLoginPrompt, findWarning } from './warnings';

const outline = (els: (Element | null | undefined)[], color: string) => {
  for (const el of els) {
    if (!(el instanceof HTMLElement)) continue;
    const prev = el.style.outline;
    el.style.outline = `3px solid ${color}`;
    setTimeout(() => (el.style.outline = prev), 4000);
  }
};

export const diagnose = (highlight: boolean): DiagnosticsReport => {
  const follow = findHostFollowControl();
  const cards = findShowCards();
  const shareButton = findShareButton();
  const video = findStreamVideo();
  const bidButtons = findBidButtons();
  const session = liveSession();
  const targets = Object.fromEntries((['copy', 'x', 'facebook'] as ShareTarget[]).map((t) => [t, Boolean(findShareTarget(t))]));

  if (highlight) {
    outline([follow?.el], '#22c55e');
    outline(cards.map((c) => bookmarkForCard(c.card)?.el), '#f5c518');
    outline([shareButton], '#3b82f6');
    outline(bidButtons, '#ef4444');
  }

  const o = overrides();
  return {
    url: location.href,
    page: isProfilePath() ? 'profile' : isLivePath() ? 'live' : 'other',
    loggedOutPrompt: findLoginPrompt(),
    warning: findWarning(),
    follow: follow ? { state: follow.state, label: labelOf(follow.el).slice(0, 60) } : null,
    showCards: cards.slice(0, 40).map(({ liveId, card }) => {
      const b = bookmarkForCard(card);
      return { liveId, state: b?.state ?? null, label: b ? labelOf(b.el).slice(0, 60) : '', startsText: describeShowCard(card).timeText };
    }),
    expandButton: Boolean(findExpandShowsButton()),
    share: { button: isVisible(shareButton), targets },
    video: video ? { width: video.videoWidth, height: video.videoHeight } : null,
    bidButtons: bidButtons.slice(0, 6).map((b) => labelOf(b).slice(0, 40)),
    hookInstalled: hookInstalled(),
    live: session
      ? {
          eventCounts: session.eventCounts,
          samples: session.samples,
          graphqlOps: session.graphqlOps,
          show: session.show,
          lot: session.lot,
          breakId: session.breakId,
          wheel: session.wheel,
        }
      : null,
    overrides: Object.entries(o)
      .filter(([, v]) => v !== undefined && (typeof v !== 'object' || Object.values(v).some(Boolean)))
      .map(([k]) => k),
  };
};
