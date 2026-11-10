// Free card, record, and cert databases, asked once the model has named the item. A price only
// counts as the item's market price when the database lands on one exact print; a name that fits
// several prints shows their spread instead.
import { isPcgsPriceable, type AppraisalItem, type CardId } from '../shared/appraisal';
import { fmvLookup } from '../shared/fmv';
import { titleTokens } from '../shared/purchases';
import { formatNgcCert, ngcCertUrl, type RefLookupResult, type RefPrice } from '../shared/refPrice';
import { getAppraisalSettings, getItem, setItem, type AppraisalSettings } from '../shared/storage';
import { DAY, SECOND } from '../shared/time';
import { fetchWithTimeout } from './appraisal';
import { ebaySoldLookup } from './ebayComps';
import { greysheetLookup } from './greysheet';
import { scheduleDomain } from './rateGate';

const TIMEOUT_MS = 4 * SECOND;
const PRICE_TTL_MS = DAY;
const CERT_TTL_MS = 30 * DAY;
const MAX_CACHED = 300;

class LookupError extends Error {}

const getJson = async <T>(url: string, headers: Record<string, string> = {}): Promise<T | null> => {
  let res: Response;
  try {
    res = await scheduleDomain(url, () =>
      fetchWithTimeout(url, { headers: { Accept: 'application/json', ...headers } }, TIMEOUT_MS),
    );
  } catch (err) {
    throw new LookupError((err as Error).name === 'AbortError' ? `took over ${TIMEOUT_MS / SECOND}s` : 'unreachable');
  }
  if (res.status === 404 || res.status === 400) return null;
  if (res.status === 401 || res.status === 403) throw new LookupError('token rejected');
  if (res.status === 429) throw new LookupError('rate limited, try again later');
  if (!res.ok) throw new LookupError(`HTTP ${res.status}`);
  return (await res.json().catch(() => null)) as T | null;
};

const money = (v: unknown) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
};

const norm = (s: string | null | undefined) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const fits = (have: string | null | undefined, want: string | null | undefined) => {
  const h = norm(have);
  const w = norm(want);
  return Boolean(h && w && (h.includes(w) || w.includes(h)));
};

// "4/102" is printed number 4 of a 102-card set.
const printedNumber = (n: string | null | undefined) => String(n ?? '').trim().split('/')[0]!.replace(/^0+(?=\d)/, '');

const spread = (source: RefPrice['source'], name: string, prices: number[], link: string | null, what: string): RefPrice | null => {
  if (!prices.length) return null;
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  if (prices.length === 1 || low === high) return { source, kind: 'market', value: low, name, detail: what, link };
  return { source, kind: 'range', value: low, high, name, detail: `${prices.length} printings; set and number decide which`, link };
};

// --- Magic: Scryfall (free, no key), daily TCGplayer prices ---

interface ScryfallCard {
  name: string;
  set_name: string;
  collector_number: string;
  prices?: { usd?: string | null; usd_foil?: string | null; usd_etched?: string | null };
  scryfall_uri?: string;
}

const magic = async (card: CardId, itemName: string): Promise<RefPrice | null> => {
  const q = `!"${card.name}"${card.number ? ` cn:"${printedNumber(card.number)}"` : ''}`;
  const body = await getJson<{ data?: ScryfallCard[] }>(`https://api.scryfall.com/cards/search?unique=prints&q=${encodeURIComponent(q)}`);
  let prints = body?.data ?? [];
  if (card.set) {
    const inSet = prints.filter((p) => fits(p.set_name, card.set));
    if (inSet.length) prints = inSet;
  }
  const foil = /\bfoil\b/i.test(itemName);
  const priceOf = (p: ScryfallCard) => money(foil ? (p.prices?.usd_foil ?? p.prices?.usd_etched) : p.prices?.usd);
  const priced = prints.filter((p) => priceOf(p) !== null);
  const first = priced[0];
  if (!first) return null;
  const name = priced.length === 1 ? `${first.name} · ${first.set_name} #${first.collector_number}` : first.name;
  return spread('scryfall', name, priced.map((p) => priceOf(p)!), priced.length === 1 ? (first.scryfall_uri ?? null) : null, foil ? 'foil market' : 'market');
};

// --- Pokémon: pokemontcg.io, TCGplayer market prices by variant ---

interface PokemonCard {
  name: string;
  number: string;
  set?: { name?: string };
  tcgplayer?: { url?: string; prices?: Record<string, { market?: number | null; mid?: number | null }> };
}

const variantFor = (variants: string[], itemName: string) => {
  const s = itemName.toLowerCase();
  const pick = (re: RegExp) => variants.find((v) => re.test(v));
  if (/1st\s*ed/.test(s)) return pick(/^1stEdition/i) ?? null;
  if (/reverse/.test(s)) return pick(/^reverseHolofoil$/i) ?? null;
  if (/\bholo/.test(s)) return pick(/^holofoil$/i) ?? null;
  return variants.length === 1 ? variants[0]! : (pick(/^normal$/i) ?? null);
};

const pokemon = async (card: CardId, itemName: string): Promise<RefPrice | null> => {
  const num = printedNumber(card.number);
  const q = `name:"${card.name.replace(/"/g, '')}"${num ? ` number:${num}` : ''}`;
  const body = await getJson<{ data?: PokemonCard[] }>(
    `https://api.pokemontcg.io/v2/cards?pageSize=30&select=name,number,set,tcgplayer&q=${encodeURIComponent(q)}`,
  );
  let cards = (body?.data ?? []).filter((c) => c.tcgplayer?.prices);
  if (card.set) {
    const inSet = cards.filter((c) => fits(c.set?.name, card.set));
    if (inSet.length) cards = inSet;
  }
  if (cards.length === 1) {
    const c = cards[0]!;
    const prices = c.tcgplayer!.prices!;
    const variant = variantFor(Object.keys(prices), itemName);
    const value = variant ? money(prices[variant]?.market ?? prices[variant]?.mid) : null;
    const name = `${c.name} · ${c.set?.name ?? ''} #${c.number}`;
    if (value) return { source: 'pokemontcg', kind: 'market', value, name, detail: `${variant} market`, link: c.tcgplayer?.url ?? null };
    const all = Object.values(prices).map((p) => money(p.market ?? p.mid)).filter((n): n is number => n !== null);
    return all.length ? { source: 'pokemontcg', kind: 'range', value: Math.min(...all), high: Math.max(...all), name, detail: 'variant unclear (normal, holo, reverse)', link: c.tcgplayer?.url ?? null } : null;
  }
  const all = cards.flatMap((c) => Object.values(c.tcgplayer!.prices!).map((p) => money(p.market ?? p.mid))).filter((n): n is number => n !== null);
  return spread('pokemontcg', card.name, all, null, 'market');
};

// --- Yu-Gi-Oh!: YGOPRODeck (free), per-set prices ---

interface YgoCard {
  name: string;
  ygoprodeck_url?: string;
  card_sets?: { set_name: string; set_code: string; set_rarity?: string; set_price?: string }[];
}

const yugioh = async (card: CardId): Promise<RefPrice | null> => {
  const body = await getJson<{ data?: YgoCard[] }>(`https://db.ygoprodeck.com/api/v7/cardinfo.php?name=${encodeURIComponent(card.name)}`);
  const c = body?.data?.[0];
  if (!c) return null;
  const sets = (c.card_sets ?? []).filter((s) => money(s.set_price) !== null);
  const code = norm(card.number);
  const exact = sets.filter((s) => (code && norm(s.set_code) === code) || (!code && card.set && fits(s.set_name, card.set)));
  const pool = exact.length ? exact : sets;
  const first = pool[0];
  if (!first) return null;
  const name = exact.length === 1 ? `${c.name} · ${first.set_code}${first.set_rarity ? ` ${first.set_rarity}` : ''}` : c.name;
  return spread('ygoprodeck', name, pool.map((s) => money(s.set_price)!), c.ygoprodeck_url ?? null, 'set price');
};

// --- PSA cert (free token): confirms the card and grade; no price ---

interface PsaCert {
  CertNumber?: string;
  Year?: string;
  Brand?: string;
  Subject?: string;
  CardNumber?: string;
  Variety?: string;
  CardGrade?: string;
  GradeDescription?: string;
}

const psa = async (cert: string, item: Partial<AppraisalItem>, token: string): Promise<RefPrice | null> => {
  const body = await getJson<{ PSACert?: PsaCert }>(`https://api.psacard.com/publicapi/cert/GetByCertNumber/${cert}`, { Authorization: `bearer ${token}` });
  const c = body?.PSACert;
  if (!c?.Subject) return null;
  const name = [c.Year, c.Brand, c.Subject, c.CardNumber ? `#${c.CardNumber}` : '', c.Variety].filter(Boolean).join(' ').replace(/\s+/g, ' ');
  // A misread cert number finds some other card. The year or the subject has to agree with what
  // was read off the slab, or the cert is shown as a mismatch instead of trusted.
  const read = titleTokens(item.item_name ?? '');
  const year = parseInt(c.Year ?? '', 10);
  const yearOk = Boolean(item.year && year && Number(item.year) === year);
  const subjectOk = [...titleTokens(c.Subject)].some((t) => t.length > 2 && read.has(t));
  return {
    source: 'psa',
    kind: 'verified',
    value: null,
    name,
    detail: [`PSA ${c.CardGrade ?? ''}`.trim(), c.GradeDescription].filter(Boolean).join(' · '),
    link: `https://www.psacard.com/cert/${cert}`,
    mismatch: !(yearOk || subjectOk),
  };
};

// --- Records: Discogs (free token), cheapest asking price for the closest release ---

const discogs = async (item: Partial<AppraisalItem>, token: string): Promise<RefPrice | null> => {
  const q = String(item.item_name ?? '').replace(/\b(lp|vinyl|record|album|12"|7"|45|33)\b/gi, ' ').replace(/\s+/g, ' ').trim();
  if (!q) return null;
  const auth = { Authorization: `Discogs token=${token}` };
  const search = await getJson<{ results?: { id: number; title: string; year?: string; uri?: string }[] }>(
    `https://api.discogs.com/database/search?type=release&per_page=3&q=${encodeURIComponent(q)}`,
    auth,
  );
  const hit = search?.results?.[0];
  if (!hit) return null;
  const stats = await getJson<{ lowest_price?: { value?: number } | null; num_for_sale?: number }>(
    `https://api.discogs.com/marketplace/stats/${hit.id}?curr_abbr=USD`,
    auth,
  );
  const value = money(stats?.lowest_price?.value);
  return {
    source: 'discogs',
    kind: 'listed',
    value,
    name: [hit.title, hit.year].filter(Boolean).join(' · '),
    detail: value ? `lowest of ${stats?.num_for_sale ?? 0} listed; pressings vary, check it's this one` : 'none listed for sale',
    link: hit.uri ? `https://www.discogs.com${hit.uri}` : null,
  };
};

// --- Dispatch and cache ---

type Ask = { key: string; ttl: number; run: () => Promise<RefPrice | null> };

const asksFor = (item: Partial<AppraisalItem>, settings: AppraisalSettings) => {
  const asks: Ask[] = [];
  const notes: string[] = [];
  const card = item.card;
  const name = item.item_name ?? '';
  if (card?.name) {
    const id = `${card.game}|${norm(card.name)}|${norm(card.set)}|${norm(card.number)}`;
    if (card.game === 'magic') asks.push({ key: `magic|${id}|${/\bfoil\b/i.test(name)}`, ttl: PRICE_TTL_MS, run: () => magic(card, name) });
    if (card.game === 'pokemon') asks.push({ key: `pokemon|${id}|${norm(name)}`, ttl: PRICE_TTL_MS, run: () => pokemon(card, name) });
    if (card.game === 'yugioh') asks.push({ key: `yugioh|${id}`, ttl: PRICE_TTL_MS, run: () => yugioh(card) });
  }
  const rawCert = String(item.cert_number ?? '').trim();
  const cert = rawCert.replace(/\D/g, '');
  if (item.is_slabbed && /\bpsa\b/i.test(item.grading_service ?? '') && cert.length >= 7) {
    if (settings.psaToken) asks.push({ key: `psa|${cert}`, ttl: CERT_TTL_MS, run: () => psa(cert, item, settings.psaToken) });
    else notes.push('Add a free PSA token in Settings to check this cert.');
  }
  if (item.is_slabbed && /\bngc\b/i.test(item.grading_service ?? '') && cert.length >= 7) {
    const formatted = formatNgcCert(rawCert.includes('-') ? rawCert : cert);
    const link = ngcCertUrl(formatted, item.grade);
    const detail = ['NGC', item.grade].filter(Boolean).join(' ') || 'NGC cert';
    asks.push({
      key: `ngc|${formatted}|${item.grade ?? ''}`,
      ttl: CERT_TTL_MS,
      run: async () => ({
        source: 'ngc',
        kind: 'verified',
        value: null,
        name: [item.year, item.mint_mark, name].filter(Boolean).join(' ') || 'NGC Certified Coin',
        detail,
        link,
      }),
    });
  }
  if (item.item_type === 'vinyl_media' && name) {
    if (settings.discogsToken) asks.push({ key: `discogs|${norm(name)}`, ttl: PRICE_TTL_MS, run: () => discogs(item, settings.discogsToken) });
    else notes.push('Add a free Discogs token in Settings for record prices.');
  }
  // Greysheet (CDN) BYOK lookup for coins and currency
  const isCoin = !item.item_type || isPcgsPriceable(item.item_type) || item.item_type === 'banknote';
  if (isCoin && name) {
    if (settings.greysheetApiKey && settings.greysheetToken) {
      asks.push({
        key: `greysheet|${norm(name)}|${item.year ?? ''}|${item.grade ?? ''}`,
        ttl: PRICE_TTL_MS,
        run: () => greysheetLookup(item, settings),
      });
    }
    // NumisMedia FMV guide price for US coins
    const fmvHit = fmvLookup(item);
    if (fmvHit) {
      asks.push({
        key: `fmv|${norm(name)}|${item.year ?? ''}|${item.grade ?? ''}`,
        ttl: PRICE_TTL_MS,
        run: async () => fmvHit,
      });
    }
    // Recent auction and eBay completed/sold comps for coins and numismatics
    if (name.trim().length >= 3) {
      asks.push({
        key: `ebay|${norm(name)}|${item.year ?? ''}|${item.grade ?? ''}`,
        ttl: 30 * 60 * 1000,
        run: () => ebaySoldLookup(item),
      });
    }
  }
  return { asks, notes };
};

export const refLookup = async (item: Partial<AppraisalItem>): Promise<RefLookupResult> => {
  const { asks, notes } = asksFor(item, await getAppraisalSettings());
  if (!asks.length) return { ok: true, refs: [], notes };
  const cache = (await getItem('refCache')) ?? {};
  const now = Date.now();
  const fresh: Record<string, { at: number; refs: RefPrice[] }> = {};
  const results = await Promise.all(
    asks.map(async (ask) => {
      const hit = cache[ask.key];
      if (hit && now - hit.at < ask.ttl) return hit.refs;
      try {
        const ref = await ask.run();
        fresh[ask.key] = { at: now, refs: ref ? [ref] : [] };
        return ref ? [ref] : [];
      } catch (err) {
        notes.push(`${ask.key.split('|')[0]} lookup failed: ${(err as Error).message}`);
        return [];
      }
    }),
  );
  if (Object.keys(fresh).length) {
    const next = { ...cache, ...fresh };
    const keep = Object.keys(next)
      .sort((a, b) => next[b]!.at - next[a]!.at)
      .slice(0, MAX_CACHED);
    await setItem('refCache', Object.fromEntries(keep.map((k) => [k, next[k]!])));
  }
  return { ok: true, refs: results.flat(), notes };
};
