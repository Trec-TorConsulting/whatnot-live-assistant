import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppraisalItem } from '../shared/appraisal';
import { refLookup } from './refPrices';

const fakeArea = (initial: Record<string, unknown> = {}) => {
  const data: Record<string, unknown> = { ...initial };
  return {
    get: async (key: string) => (key in data ? { [key]: data[key] } : {}),
    set: async (items: Record<string, unknown>) => void Object.assign(data, items),
  };
};

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

const stubFetch = (routes: [RegExp, unknown][]) => {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push(url);
      const hit = routes.find(([re]) => re.test(url));
      return hit ? json(200, hit[1]) : json(404, {});
    }),
  );
  return calls;
};

const card = (over: Partial<AppraisalItem>): Partial<AppraisalItem> => ({ item_type: 'trading_card', is_collectible: true, is_slabbed: false, ...over });

beforeEach(() => {
  vi.stubGlobal('chrome', {
    storage: { local: fakeArea({ wn2_appraisalSettings: { psaToken: 'psa-key', discogsToken: '' } }), session: fakeArea() },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('refLookup', () => {
  it('prices one exact Magic print and caches it', async () => {
    const calls = stubFetch([
      [
        /scryfall/,
        {
          data: [
            { name: 'Lightning Bolt', set_name: 'Magic 2010', collector_number: '146', prices: { usd: '1.25' }, scryfall_uri: 'https://scryfall.com/x' },
            { name: 'Lightning Bolt', set_name: 'Masters 25', collector_number: '141', prices: { usd: '2.10' } },
          ],
        },
      ],
    ]);
    const item = card({ item_name: '2009 Magic 2010 Lightning Bolt', card: { game: 'magic', name: 'Lightning Bolt', set: 'Magic 2010', number: null } });
    const res = await refLookup(item);
    expect(res.refs).toEqual([
      { source: 'scryfall', kind: 'market', value: 1.25, name: 'Lightning Bolt · Magic 2010 #146', detail: 'market', link: 'https://scryfall.com/x' },
    ]);
    await refLookup(item);
    expect(calls).toHaveLength(1);
  });

  it('shows a spread, not a value, when the print is unclear', async () => {
    stubFetch([[/ygoprodeck/, { data: [{ name: 'Dark Magician', card_sets: [{ set_name: 'LOB', set_code: 'LOB-005', set_price: '30' }, { set_name: 'SDY', set_code: 'SDY-006', set_price: '4' }] }] }]]);
    const res = await refLookup(card({ item_name: 'Dark Magician', card: { game: 'yugioh', name: 'Dark Magician', set: null, number: null } }));
    expect(res.refs[0]).toMatchObject({ kind: 'range', value: 4, high: 30 });
    const exact = await refLookup(card({ item_name: 'Dark Magician LOB', card: { game: 'yugioh', name: 'Dark Magician', set: null, number: 'LOB-005' } }));
    expect(exact.refs[0]).toMatchObject({ kind: 'market', value: 30 });
  });

  it('picks the Pokémon variant the name says', async () => {
    stubFetch([
      [
        /pokemontcg/,
        { data: [{ name: 'Charizard', number: '4', set: { name: 'Base' }, tcgplayer: { prices: { holofoil: { market: 400 }, '1stEditionHolofoil': { market: 9000 } } } }] },
      ],
    ]);
    const res = await refLookup(card({ item_name: '1999 Base Set Charizard Holo', card: { game: 'pokemon', name: 'Charizard', set: 'Base', number: '4/102' } }));
    expect(res.refs[0]).toMatchObject({ kind: 'market', value: 400, detail: 'holofoil market' });
  });

  it('flags a PSA cert that names a different card', async () => {
    stubFetch([[/psacard/, { PSACert: { Year: '1989', Brand: 'Upper Deck', Subject: 'Ken Griffey Jr', CardNumber: '1', CardGrade: '9' } }]]);
    const read = card({ item_name: '1986 Fleer Michael Jordan #57', year: 1986, is_slabbed: true, grading_service: 'PSA', cert_number: '12345678' });
    expect((await refLookup(read)).refs[0]).toMatchObject({ kind: 'verified', mismatch: true, name: '1989 Upper Deck Ken Griffey Jr #1' });
  });

  it('asks for a token instead of calling Discogs without one', async () => {
    const calls = stubFetch([]);
    const res = await refLookup({ item_type: 'vinyl_media', item_name: 'Fleetwood Mac Rumours LP' });
    expect(res.refs).toEqual([]);
    expect(res.notes[0]).toMatch(/Discogs token/);
    expect(calls).toEqual([]);
  });
});
