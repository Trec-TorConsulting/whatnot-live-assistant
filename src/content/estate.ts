// Estate and electronics quick read: pull/template line, condition, shipping callout, rules,
// wants, and the run board. All of it is read from the session and the shipping line on the page.
import { parseShipping } from '../shared/costs';
import {
  electronicsRules,
  electronicsRulesAreNew,
  electronicsRulesKey,
  electronicsViewFromSession,
} from '../shared/electronics';
import { estateRules, estateViewFromSession, rulesAreNew, rulesKey } from '../shared/estate';
import type { Purchase } from '../shared/purchases';
import { getItem, onItemChanged } from '../shared/storage';
import { liveSession, onLive, rememberElectronicsRules, rememberRules, rememberShipping } from './live';
import { overlay } from './overlay';
import { findShippingText } from './selectors';
import { currentShowType } from './showType';

let purchases: Purchase[] = [];

export const refreshEstate = () => {
  const session = liveSession();
  if (!session) {
    overlay.setEstate(null);
    overlay.setElectronics(null);
    return;
  }
  const shipping = parseShipping(findShippingText());
  rememberShipping(shipping);
  const current = liveSession() ?? session;
  const rules = estateRules(current.show.note?.text, current.lot?.title ?? null);
  if (rulesAreNew(current.estateRulesKey, rules)) rememberRules(rulesKey(rules));
  const eRules = electronicsRules(current.show.note?.text, current.lot?.title ?? null);
  if (electronicsRulesAreNew(current.electronicsRulesKey, eRules)) rememberElectronicsRules(electronicsRulesKey(eRules));
  const paid = purchases.some((p) => p.liveId === current.show.liveId);
  const showType = currentShowType();
  const s = liveSession() ?? current;
  overlay.setEstate(estateViewFromSession(s, { shippingPaid: paid, shipping, showType }));
  overlay.setElectronics(electronicsViewFromSession(s, { shippingPaid: paid, shipping, showType }));
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
