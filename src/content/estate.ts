// Estate and electronics quick read: pull/template line, condition, shipping callout, rules,
// wants, and the run board. All of it is read from the session and the shipping line on the page.
import { parseShippingInfo, shippingOwed, shippingRules } from '../shared/costs';
import {
  electronicsRules,
  electronicsRulesAreNew,
  electronicsRulesKey,
  electronicsViewFromSession,
} from '../shared/electronics';
import { estateRules, estateViewFromSession, rulesAreNew, rulesKey } from '../shared/estate';
import type { Purchase } from '../shared/purchases';
import { runnerViewFromSession } from '../shared/runner';
import { getItem, onItemChanged } from '../shared/storage';
import { maybeRunIdleScan } from './appraise';
import { refreshCasePack } from './casePack';
import { liveSession, onLive, rememberCurrencyPair, rememberElectronicsRules, rememberRules, rememberShipping } from './live';
import { overlay } from './overlay';
import { findShippingText } from './selectors';
import { currentShowType } from './showType';

let purchases: Purchase[] = [];

export const refreshEstate = () => {
  const session = liveSession();
  if (!session) {
    overlay.setEstate(null);
    overlay.setElectronics(null);
    overlay.setRunner(null);
    return;
  }
  const shipInfo = parseShippingInfo(findShippingText());
  const shipping = shipInfo.shipping;
  rememberShipping(shipping);
  if (shipInfo.code !== 'USD' && shipInfo.rawAmount != null) {
    rememberCurrencyPair({ amount: shipInfo.rawAmount, code: shipInfo.code, usd: shipInfo.usd, tariffs: shipInfo.tariffs });
  }
  const current = liveSession() ?? session;
  const rules = estateRules(current.show.note?.text, current.lot?.title ?? null);
  if (rulesAreNew(current.estateRulesKey, rules)) rememberRules(rulesKey(rules));
  const eRules = electronicsRules(current.show.note?.text, current.lot?.title ?? null);
  if (electronicsRulesAreNew(current.electronicsRulesKey, eRules)) rememberElectronicsRules(electronicsRulesKey(eRules));
  const hasWin = purchases.some((p) => p.liveId === current.show.liveId);
  const sRules = shippingRules({
    notes: current.show.note?.text,
    showTitle: current.show.title,
    lotTitle: current.lot?.title,
  });
  const owed = shippingOwed({
    rules: sRules,
    lotTitle: current.lot?.title,
    pageShipping: shipping,
    hasWinThisShow: hasWin,
    tariffs: shipInfo.tariffs,
  });
  const showType = currentShowType();
  const s = liveSession() ?? current;
  overlay.setEstate(estateViewFromSession(s, { shippingPaid: owed.shippingPaid, shipping: owed.amount, showType }));
  overlay.setElectronics(electronicsViewFromSession(s, { shippingPaid: owed.shippingPaid, shipping: owed.amount, showType }));
  overlay.setRunner(runnerViewFromSession(s, { shipping: owed.amount, purchases }));
  refreshCasePack();
  void maybeRunIdleScan();
};

export const startEstate = () => {
  onLive(() => refreshEstate());
  onItemChanged('purchases', (v) => {
    purchases = v ?? [];
    refreshEstate();
  });
  void getItem('purchases').then((p) => {
    purchases = p ?? [];
    refreshEstate();
  });
};
