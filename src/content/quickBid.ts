// Quick bids: opens Whatnot's Custom bid box with your amount typed in. It never presses Set Max
// Bid; you do, and the bid guard checks that click like any other bid.
import { clickLikeUser, setReactValue, waitFor } from './dom';
import { findCustomBidButton, findMaxBidInput } from './selectors';

export type QuickBidResult = 'filled' | 'no-auction' | 'no-box';

const OPEN_TIMEOUT_MS = 1500;

const amountText = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

export const fillMaxBid = async (amount: number): Promise<QuickBidResult> => {
  let input = findMaxBidInput();
  if (!input) {
    const custom = findCustomBidButton();
    if (!custom) return 'no-auction';
    clickLikeUser(custom);
    input = await waitFor(findMaxBidInput, OPEN_TIMEOUT_MS);
  }
  if (!input) return 'no-box';
  setReactValue(input, amountText(Math.round(amount * 100) / 100));
  return 'filled';
};

export type QuickBidKind = 'plus1' | 'plus5' | 'max';

// +$1 and +$5 go over the current bid; "max" is your ceiling from the bid guard.
export const quickBidAmount = (kind: QuickBidKind, currentBid: number | null, ceiling: number | null): number | null => {
  if (kind === 'max') return ceiling && ceiling > 0 ? ceiling : null;
  if (currentBid === null) return null;
  return currentBid + (kind === 'plus1' ? 1 : 5);
};
