// Estate line, shipping callout, rules, wants, and the run board. All of it is read from the
// session and the shipping line already on the page. No model call.
import { parseShipping } from '../shared/costs';
import { estateRules, estateViewFromSession, rulesAreNew, rulesKey } from '../shared/estate';
import type { Purchase } from '../shared/purchases';
import { getItem, onItemChanged } from '../shared/storage';
import { liveSession, onLive, rememberRules, rememberShipping } from './live';
import { overlay } from './overlay';
import { findShippingText } from './selectors';

let purchases: Purchase[] = [];

export const refreshEstate = () => {
  const session = liveSession();
  if (!session) {
    overlay.setEstate(null);
    return;
  }
  const shipping = parseShipping(findShippingText());
  rememberShipping(shipping);
  const current = liveSession() ?? session;
  const rules = estateRules(current.show.note?.text, current.lot?.title ?? null);
  if (rulesAreNew(current.estateRulesKey, rules)) rememberRules(rulesKey(rules));
  const paid = purchases.some((p) => p.liveId === current.show.liveId);
  overlay.setEstate(estateViewFromSession(liveSession() ?? current, { shippingPaid: paid, shipping }));
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
