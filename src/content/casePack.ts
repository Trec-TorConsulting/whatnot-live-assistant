// Case-pack and wholesale quick read: piece count, per-piece price, landed per-piece cost,
// size run, seller price claims, break-even resale, shipping rules, currency estimate, and run board.
import { casePackViewFromSession, shippingRulesKey } from '../shared/casePack';
import { parseShippingInfo, shippingRules } from '../shared/costs';
import type { Purchase } from '../shared/purchases';
import { getItem, onItemChanged } from '../shared/storage';
import { latestAppraisal } from './appraise';
import { buyerSettings } from './buyer';
import { liveSession, onLive, rememberCurrencyPair, rememberShipping, rememberShippingRules } from './live';
import { overlay } from './overlay';
import { findShippingText } from './selectors';
import { currentShowType } from './showType';

let purchases: Purchase[] = [];

export const refreshCasePack = () => {
  const session = liveSession();
  const showType = currentShowType();
  if (!session || showType !== 'wholesale') {
    overlay.setCasePack(null);
    return;
  }
  const shipInfo = parseShippingInfo(findShippingText());
  rememberShipping(shipInfo.shipping);
  if (shipInfo.code !== 'USD' && shipInfo.rawAmount != null) {
    rememberCurrencyPair({
      amount: shipInfo.rawAmount,
      code: shipInfo.code,
      usd: shipInfo.usd,
      tariffs: shipInfo.tariffs,
    });
  }
  const current = liveSession() ?? session;
  const sRules = shippingRules({
    notes: current.show.note?.text,
    showTitle: current.show.title,
    lotTitle: current.lot?.title,
  });
  const sKey = shippingRulesKey(sRules);
  if (sKey && sKey !== current.shippingRulesKey) {
    rememberShippingRules(sKey);
  }
  const s = liveSession() ?? current;
  const hasWin = purchases.some((p) => p.liveId === s.show.liveId);
  const buyer = buyerSettings();
  const rec = latestAppraisal();
  const appraisedPerPiece =
    rec && rec.valuation.marketValue !== null && rec.quantity > 0
      ? rec.valuation.marketValue / rec.quantity
      : null;

  overlay.setCasePack(
    casePackViewFromSession(s, {
      showType,
      shipping: shipInfo.shipping,
      tariffs: shipInfo.tariffs,
      hasWinThisShow: hasWin,
      taxPercent: buyer.taxPercent,
      feePercent: buyer.feePercent,
      appraisedPerPiece,
    }),
  );
};

export const startCasePack = () => {
  onLive(() => refreshCasePack());
  onItemChanged('purchases', (v) => {
    purchases = v ?? [];
    refreshCasePack();
  });
  void getItem('purchases').then((p) => {
    purchases = p ?? [];
    refreshCasePack();
  });
};
