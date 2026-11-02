// Prices and checks from outside databases, looked up once the model has named the item. They
// arrive after the answer is on screen, so a slow database never delays the max bid.

export type RefSource = 'scryfall' | 'pokemontcg' | 'ygoprodeck' | 'psa' | 'discogs';

export interface RefPrice {
  source: RefSource;
  // market: what raw copies of this exact print sell for, so it can set the value of a raw card.
  // range: market prices across every print the name could be; too loose to set the value.
  // listed: the cheapest asking price, an upper bound that never sets the value.
  // verified: a grading-company cert check; no price, but it says what the item really is.
  kind: 'market' | 'range' | 'listed' | 'verified';
  value: number | null;
  high?: number | null;
  name: string;
  detail: string | null;
  link: string | null;
  // The cert names a different item than the model read off the video.
  mismatch?: boolean;
}

export const REF_LABEL: Record<RefSource, string> = {
  scryfall: 'TCGplayer',
  pokemontcg: 'TCGplayer',
  ygoprodeck: 'TCGplayer',
  psa: 'PSA cert',
  discogs: 'Discogs',
};

export type RefLookupResult = { ok: true; refs: RefPrice[]; notes: string[] };

// A raw card's own market price can set its value; a slabbed card's grade changes the price too
// much for a raw price to stand in.
export const marketOf = (refs: RefPrice[] | undefined, slabbed: boolean) =>
  slabbed ? null : (refs?.find((r) => r.kind === 'market' && r.value && r.value > 0)?.value ?? null);

// The cert's own description, for Whatnot sold matching, when it agrees with what was read.
export const verifiedName = (refs: RefPrice[] | undefined) => refs?.find((r) => r.kind === 'verified' && !r.mismatch)?.name ?? null;
