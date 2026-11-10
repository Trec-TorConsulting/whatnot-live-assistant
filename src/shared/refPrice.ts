// Prices and checks from outside databases, looked up once the model has named the item. They
// arrive after the answer is on screen, so a slow database never delays the max bid.

export type RefSource = 'scryfall' | 'pokemontcg' | 'ygoprodeck' | 'psa' | 'ngc' | 'discogs' | 'greysheet' | 'fmv' | 'ebay';

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
  ngc: 'NGC cert',
  discogs: 'Discogs',
  greysheet: 'Greysheet CPG',
  fmv: 'NumisMedia FMV',
  ebay: 'eBay Sold Comps',
};

export type RefLookupResult = { ok: true; refs: RefPrice[]; notes: string[] };

// A raw card's own market price can set its value; a slabbed card's grade changes the price too
// much for a raw card price to stand in. Graded numismatic sources (Greysheet, FMV, eBay sold)
// can value a slabbed coin when they reflect the slab's grade. For slabs with premium attributes
// (signatures, special finishes, pedigrees, CAC, EPQ), realized eBay comps or Greysheet take
// precedence over common-date baseline FMV guides.
export const marketOf = (refs: RefPrice[] | undefined, slabbed: boolean, isPremiumSlab = false) => {
  if (!refs?.length) return null;
  if (!slabbed) {
    return refs.find((r) => r.kind === 'market' && r.value && r.value > 0)?.value ?? null;
  }
  if (isPremiumSlab) {
    const comp = refs.find(
      (r) => (r.source === 'ebay' || r.source === 'greysheet') && r.kind === 'market' && r.value && r.value > 0,
    );
    if (comp?.value) return comp.value;
    return null;
  }
  return (
    refs.find(
      (r) =>
        (r.source === 'greysheet' || r.source === 'fmv' || r.source === 'ebay') &&
        r.kind === 'market' &&
        r.value &&
        r.value > 0,
    )?.value ?? null
  );
};

// The cert's own description, for Whatnot sold matching, when it agrees with what was read.
export const verifiedName = (refs: RefPrice[] | undefined) => refs?.find((r) => r.kind === 'verified' && !r.mismatch)?.name ?? null;

export const extractNumericGrade = (grade: string | null | undefined): string | null => {
  if (!grade) return null;
  const m = grade.match(/(?:^|[^0-9])(1|2|3|4|6|8|10|12|15|20|25|30|35|40|45|50|53|55|58|60|61|62|63|64|65|66|67|68|69|70)(?:[^0-9]|$)/);
  return m ? m[1]! : null;
};

export const formatNgcCert = (cert: string | null | undefined): string => {
  const s = String(cert ?? '').trim();
  if (!s) return '';
  const hyphenMatch = s.match(/(\d{7})-(\d{3})/);
  if (hyphenMatch) return `${hyphenMatch[1]}-${hyphenMatch[2]}`;
  const digits = s.replace(/\D/g, '');
  if (digits.length === 10) {
    return `${digits.slice(0, 7)}-${digits.slice(7)}`;
  }
  return digits;
};

export const ngcCertUrl = (cert: string | null | undefined, grade?: string | null): string => {
  const formatted = formatNgcCert(cert);
  const numGrade = extractNumericGrade(grade);
  if (formatted && numGrade) {
    return `https://www.ngccoin.com/certlookup/${formatted}/${numGrade}/`;
  }
  if (formatted) {
    return `https://www.ngccoin.com/certlookup/${formatted}/`;
  }
  return 'https://www.ngccoin.com/certlookup/';
};
