import { parseKeywords, sanitizeAlertSettings, type AlertSettings, type WatchedShow } from '../../shared/alerts';
import { parseWatchlist, parseWishlist, sanitizeBuyerSettings, watchLine, wishLine, type BuyerSettings } from '../../shared/buyer';
import { getAlertSettings, getBuyerSettings, getItem, onItemChanged, setItem } from '../../shared/storage';
import type { ShowMatch } from '../../shared/discover';
import { send } from '../../shared/messages';
import { $, li, runCommand } from '../ui';

const el = {
  giveaways: $<HTMLInputElement>('#alert-giveaways'),
  wins: $<HTMLInputElement>('#alert-wins'),
  starting: $<HTMLInputElement>('#alert-starting'),
  lead: $<HTMLInputElement>('#alert-lead'),
  keywords: $<HTMLTextAreaElement>('#alert-keywords'),
  save: $<HTMLButtonElement>('#alert-save'),
  note: $('#alert-note'),
  watched: $('#alert-watched'),
  outbid: $<HTMLInputElement>('#buyer-outbid'),
  mentions: $<HTMLInputElement>('#buyer-mentions'),
  sound: $<HTMLInputElement>('#buyer-sound'),
  seconds: $<HTMLInputElement>('#buyer-seconds'),
  tilt: $<HTMLInputElement>('#buyer-tilt'),
  watch: $<HTMLTextAreaElement>('#buyer-watch'),
  wishlist: $<HTMLTextAreaElement>('#buyer-wishlist'),
  templates: $<HTMLTextAreaElement>('#buyer-templates'),
  buyerSave: $<HTMLButtonElement>('#buyer-save'),
  buyerNote: $('#buyer-note'),
  tax: $<HTMLInputElement>('#buyer-tax'),
  fee: $<HTMLInputElement>('#buyer-fee'),
  shows: $<HTMLTextAreaElement>('#buyer-shows'),
  matches: $('#show-matches'),
};

const renderMatches = (list: ShowMatch[]) => {
  const now = Date.now();
  const upcoming = list.filter((m) => (m.startsAt ?? m.seenAt) > now - 3 * 60 * 60 * 1000).slice(0, 30);
  el.matches.replaceChildren(
    ...upcoming.map((m) => {
      const when = m.startsAt === null ? 'Live' : new Date(m.startsAt).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
      const item = li(`${when} · “${m.keyword}” · ${m.host ? `@${m.host} · ` : ''}${m.title}`);
      const open = Object.assign(document.createElement('button'), { className: 'secondary small', textContent: 'Open', type: 'button' });
      open.addEventListener('click', () => void chrome.tabs.create({ url: `https://www.whatnot.com/live/${m.liveId}` }));
      const watch = Object.assign(document.createElement('button'), { className: 'secondary small', textContent: 'Watch', type: 'button', title: 'Watch it in a muted background tab' });
      watch.addEventListener('click', () => void runCommand(send('MONITOR_ADD', { liveId: m.liveId }), 'Watching in the background.'));
      item.append(' ', open, ' ', watch);
      return item;
    }),
  );
  if (!upcoming.length) el.matches.replaceChildren(li('None yet. Add words under "Find shows", then browse Whatnot.', 'muted'));
};

const fillBuyer = (s: BuyerSettings) => {
  el.outbid.checked = s.outbid;
  el.mentions.checked = s.mentions;
  el.sound.checked = s.sound;
  el.seconds.value = String(s.lastSeconds);
  el.tilt.value = String(s.tiltLosses);
  el.watch.value = s.watchlist.map(watchLine).join('\n');
  el.wishlist.value = (s.wishlist ?? []).map(wishLine).join('\n');
  el.templates.value = s.chatTemplates.join('\n');
  el.tax.value = String(s.taxPercent);
  el.fee.value = String(s.feePercent);
  el.shows.value = s.showKeywords.join(', ');
};

const fill = (s: AlertSettings) => {
  el.giveaways.checked = s.giveaways;
  el.wins.checked = s.myWins;
  el.starting.checked = s.showStarting;
  el.lead.value = String(s.leadMinutes);
  el.keywords.value = s.chatKeywords.join(', ');
};

const renderWatched = (list: WatchedShow[]) => {
  const upcoming = list.filter((s) => s.startsAt > Date.now() - 15 * 60_000).slice(0, 20);
  el.watched.replaceChildren(
    ...upcoming.map((s) =>
      li(
        `${new Date(s.startsAt).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })} · ${s.host ? `@${s.host} · ` : ''}${s.title}${
          s.notifiedAt ? ' (notified)' : ''
        }`,
      ),
    ),
  );
  if (!upcoming.length) el.watched.replaceChildren(li('None yet. Open a seller profile with bookmarked shows, or run Follow + Bookmark.', 'muted'));
};

export const initAlerts = async () => {
  fill(await getAlertSettings());
  renderWatched((await getItem('watched')) ?? []);
  onItemChanged('watched', (v) => renderWatched(v ?? []));

  el.save.addEventListener('click', async () => {
    const clean = sanitizeAlertSettings({
      giveaways: el.giveaways.checked,
      myWins: el.wins.checked,
      showStarting: el.starting.checked,
      leadMinutes: Number(el.lead.value),
      chatKeywords: parseKeywords(el.keywords.value),
    });
    await setItem('alertSettings', clean);
    fill(clean);
    el.note.textContent = 'Saved.';
  });

  fillBuyer(await getBuyerSettings());
  renderMatches((await getItem('showMatches')) ?? []);
  onItemChanged('showMatches', (v) => renderMatches(v ?? []));
  el.buyerSave.addEventListener('click', async () => {
    const watchLines = el.watch.value.split('\n').filter((l) => l.trim());
    const watchlist = parseWatchlist(el.watch.value);
    const wishLines = el.wishlist.value.split('\n').filter((l) => l.trim());
    const wishlist = parseWishlist(el.wishlist.value);
    const clean = sanitizeBuyerSettings({
      outbid: el.outbid.checked,
      mentions: el.mentions.checked,
      sound: el.sound.checked,
      lastSeconds: Number(el.seconds.value),
      tiltLosses: Number(el.tilt.value),
      watchlist,
      wishlist,
      chatTemplates: el.templates.value.split('\n'),
      taxPercent: Number(el.tax.value || 0),
      feePercent: el.fee.value === '' ? undefined : Number(el.fee.value),
      showKeywords: parseKeywords(el.shows.value),
    });
    await setItem('buyerSettings', clean);
    fillBuyer(clean);
    const skipped = (watchLines.length - watchlist.length) + (wishLines.length - wishlist.length);
    el.buyerNote.textContent = `Saved. ${clean.watchlist.length} on watchlist, ${clean.wishlist.length} on wishlist${skipped > 0 ? `, ${skipped} line${skipped === 1 ? '' : 's'} skipped (no words)` : ''}.`;
  });
};
