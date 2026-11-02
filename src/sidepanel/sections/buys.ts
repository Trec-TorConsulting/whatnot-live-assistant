import { send } from '../../shared/messages';
import { formatMoney } from '../../shared/money';
import { purchasesCsv, summarizeSpend, type Purchase } from '../../shared/purchases';
import { DEFAULT_BUYER_SETTINGS, sanitizeBuyerSettings, type BuyerSettings } from '../../shared/buyer';
import { sanitizeCollection, type CollectionSettings } from '../../shared/collection';
import { flipLine, flipProfit, portfolioValue } from '../../shared/costs';
import { bestTimeLine, bestTimes } from '../../shared/discover';
import { isLate, isOpen, orderLine, type Order } from '../../shared/orders';
import { getBuyerSettings, getCollection, getItem, onItemChanged, setItem } from '../../shared/storage';
import { $, li, numberOf, runCommand, toast } from '../ui';

const el = {
  today: $('#spend-today'),
  month: $('#spend-month'),
  all: $('#spend-all'),
  vs: $('#spend-vs'),
  days: $('#spend-days'),
  shows: $('#spend-shows'),
  list: $('#buys-list'),
  exportBtn: $<HTMLButtonElement>('#buys-export'),
  title: $<HTMLInputElement>('#buy-title'),
  price: $<HTMLInputElement>('#buy-price'),
  appraised: $<HTMLInputElement>('#buy-appraised'),
  date: $<HTMLInputElement>('#buy-date'),
  add: $<HTMLButtonElement>('#buy-add'),
  portValue: $('#port-value'),
  portCost: $('#port-cost'),
  portGain: $('#port-gain'),
  portCount: $('#port-count'),
  orders: $('#orders-list'),
  ordersOpen: $<HTMLButtonElement>('#orders-open'),
  flipCost: $<HTMLInputElement>('#flip-cost'),
  flipResale: $<HTMLInputElement>('#flip-resale'),
  flipResult: $('#flip-result'),
  bestTimes: $('#best-times'),
  owned: $<HTMLTextAreaElement>('#collection-owned'),
  sets: $<HTMLTextAreaElement>('#collection-sets'),
  collectionSave: $<HTMLButtonElement>('#collection-save'),
  collectionNote: $('#collection-note'),
};

let purchases: Purchase[] = [];
let photos: Record<string, string> = {};
let orders: Record<string, Order> = {};
let buyer: BuyerSettings = DEFAULT_BUYER_SETTINGS;
let spot: { gold: number | null; silver: number | null } = { gold: null, silver: null };

const renderPortfolio = () => {
  const p = portfolioValue(purchases, spot);
  el.portValue.textContent = p.valued ? formatMoney(p.value) : '—';
  el.portCost.textContent = p.valued ? formatMoney(p.valuedCost) : '—';
  el.portGain.textContent = p.valued ? `${p.gain >= 0 ? '+' : '−'}${formatMoney(Math.abs(p.gain))}` : '—';
  el.portGain.className = p.gain >= 0 ? 'good' : 'bad-text';
  el.portCount.textContent = `${p.valued} of ${p.count}`;
};

const renderOrders = () => {
  const now = Date.now();
  const list = Object.values(orders).sort((a, b) => Number(isLate(b, now)) - Number(isLate(a, now)) || Number(isOpen(b)) - Number(isOpen(a)) || (b.orderedAt ?? 0) - (a.orderedAt ?? 0));
  el.orders.replaceChildren(
    ...list.slice(0, 25).map((o) => {
      const item = li(orderLine(o, now), isLate(o, now) ? 'bad-text' : isOpen(o) ? '' : 'muted');
      if (o.image) item.prepend(thumb(o.image, o.title));
      item.addEventListener('click', () => void chrome.tabs.create({ url: `https://www.whatnot.com/order/${o.id}` }));
      item.style.cursor = 'pointer';
      return item;
    }),
  );
  if (!list.length) el.orders.replaceChildren(li('None yet. Click Open Purchases once to load your orders.', 'muted'));
};

const thumb = (src: string, alt: string) => {
  const img = document.createElement('img');
  img.src = src;
  img.alt = alt;
  img.className = 'thumb';
  img.loading = 'lazy';
  return img;
};

const renderFlip = () => {
  const cost = numberOf(el.flipCost);
  const resale = numberOf(el.flipResale);
  el.flipResult.textContent = cost !== null && resale !== null ? flipLine(flipProfit(resale, cost, buyer.feePercent)) : '';
};

const renderBestTimes = async () => {
  const sold = (await getItem('soldHistory')) ?? [];
  const list = bestTimes(sold, buyer.watchlist);
  el.bestTimes.replaceChildren(...list.map((b) => li(bestTimeLine(b))));
  if (!list.length) {
    el.bestTimes.replaceChildren(
      li(buyer.watchlist.length ? 'No clear cheap time yet for your watchlist items.' : 'Add watchlist items (Alerts tab) to see when they sell cheapest.', 'muted'),
    );
  }
};

const fillCollection = (c: CollectionSettings) => {
  el.owned.value = c.owned.join('\n');
  el.sets.value = c.sets.map((s) => s.text).join('\n');
};

const render = () => {
  const s = summarizeSpend(purchases, Date.now());
  el.today.textContent = formatMoney(s.today);
  el.month.textContent = formatMoney(s.thisMonth);
  el.all.textContent = `${formatMoney(s.allTime)} (${s.count})`;
  el.vs.textContent = s.appraisedPaid ? `${formatMoney(s.appraisedPaid)} / ${formatMoney(s.appraisedValue)}` : '—';

  const peak = Math.max(1, ...s.days.map((d) => d.total));
  el.days.replaceChildren(
    ...s.days.map((d) => {
      const bar = document.createElement('div');
      bar.style.height = `${Math.max(3, (d.total / peak) * 100)}%`;
      bar.title = `${new Date(d.day).toLocaleDateString()}: ${formatMoney(d.total)}`;
      const label = document.createElement('span');
      label.textContent = new Date(d.day).toLocaleDateString([], { weekday: 'narrow' });
      bar.append(label);
      return bar;
    }),
  );
  el.shows.replaceChildren(...s.shows.map((x) => li(`${x.title}: ${formatMoney(x.total)} (${x.count})`)));

  el.list.replaceChildren(
    ...[...purchases]
      .sort((a, b) => b.at - a.at)
      .slice(0, 50)
      .map((p) => {
        const item = li(
          `${new Date(p.at).toLocaleDateString()} · ${p.title} · ${formatMoney(p.price)}${
            p.appraisedValue !== null ? ` (appraised ${formatMoney(p.appraisedValue)})` : ''
          }${p.host ? ` · @${p.host}` : ''}`,
        );
        const photo = photos[p.key];
        if (photo) item.prepend(thumb(photo, p.title));
        const del = document.createElement('button');
        del.className = 'secondary del';
        del.textContent = '×';
        del.title = 'Delete';
        del.addEventListener('click', () => {
          if (confirm(`Delete "${p.title}"?`)) void runCommand(send('PURCHASE_DELETE', { key: p.key }));
        });
        item.append(del);
        return item;
      }),
  );
  if (!purchases.length) el.list.replaceChildren(li('No purchases yet.', 'muted'));
  renderPortfolio();
};

const resetForm = () => {
  el.title.value = '';
  el.price.value = '';
  el.appraised.value = '';
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  el.date.value = now.toISOString().slice(0, 16);
};

export const initBuys = async () => {
  [purchases, photos, orders, buyer] = await Promise.all([
    getItem('purchases').then((v) => v ?? []),
    getItem('purchasePhotos').then((v) => v ?? {}),
    getItem('orders').then((v) => v ?? {}),
    getBuyerSettings(),
  ]);
  onItemChanged('purchases', (v) => {
    purchases = v ?? [];
    render();
  });
  onItemChanged('purchasePhotos', (v) => {
    photos = v ?? {};
    render();
  });
  onItemChanged('orders', (v) => {
    orders = v ?? {};
    renderOrders();
  });
  onItemChanged('buyerSettings', (v) => {
    buyer = sanitizeBuyerSettings(v);
    renderFlip();
    void renderBestTimes();
  });
  renderOrders();
  void renderBestTimes();
  void send('SPOT_GET', {})
    .then((s) => {
      spot = s;
      renderPortfolio();
    })
    .catch(() => undefined);

  el.ordersOpen.addEventListener('click', () => void chrome.tabs.create({ url: 'https://www.whatnot.com/?activityTab=purchases' }));
  el.flipCost.addEventListener('input', renderFlip);
  el.flipResale.addEventListener('input', renderFlip);

  fillCollection(await getCollection());
  el.collectionSave.addEventListener('click', async () => {
    const setLines = el.sets.value.split('\n').filter((l) => l.trim());
    const clean = sanitizeCollection({
      owned: el.owned.value.split('\n'),
      sets: setLines.map((text) => ({ text })),
    });
    await setItem('collection', clean);
    fillCollection(clean);
    const skipped = setLines.length - clean.sets.length;
    el.collectionNote.textContent = `Saved: ${clean.owned.length} items, ${clean.sets.length} sets${skipped > 0 ? ` (${skipped} set line${skipped === 1 ? '' : 's'} need years like 1878-1921)` : ''}.`;
  });
  resetForm();

  el.add.addEventListener('click', async () => {
    const title = el.title.value.trim();
    const price = numberOf(el.price);
    if (!title || price === null || price < 0) return toast('Enter the item and price.');
    const at = el.date.value ? new Date(el.date.value).getTime() : Date.now();
    const ok = await runCommand(
      send('PURCHASE_ADD', {
        purchase: {
          at,
          liveId: null,
          showTitle: null,
          host: null,
          title,
          price,
          kind: 'manual',
          appraisedValue: numberOf(el.appraised),
          meltValue: null,
          appraisalId: null,
          source: 'manual',
        },
      }),
      'Purchase added.',
    );
    if (ok) resetForm();
  });

  el.exportBtn.addEventListener('click', () => {
    const blob = new Blob([purchasesCsv(purchases)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `whatnot-purchases-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  render();
};
