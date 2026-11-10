// Prices and checks from outside databases, looked up once the model has named the item. They
// arrive after the answer is on screen, so a slow database never delays the max bid.

export type RefSource =
  | 'scryfall'
  | 'pokemontcg'
  | 'ygoprodeck'
  | 'psa'
  | 'pcgs'
  | 'ngc'
  | 'pmg'
  | 'cgc'
  | 'cacg'
  | 'anacs'
  | 'bgs'
  | 'sgc'
  | 'discogs'
  | 'greysheet'
  | 'fmv'
  | 'ebay';

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
  pcgs: 'PCGS cert',
  ngc: 'NGC cert',
  pmg: 'PMG cert',
  cgc: 'CGC cert',
  cacg: 'CACG cert',
  anacs: 'ANACS cert',
  bgs: 'BGS cert',
  sgc: 'SGC cert',
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

export const pmgCertUrl = (cert: string | null | undefined, grade?: string | null): string => {
  const formatted = formatNgcCert(cert);
  const numGrade = extractNumericGrade(grade);
  if (formatted && numGrade) {
    return `https://www.pmgnotes.com/certlookup/${formatted}/${numGrade}/`;
  }
  if (formatted) {
    return `https://www.pmgnotes.com/certlookup/${formatted}/`;
  }
  return 'https://www.pmgnotes.com/certlookup/';
};

export const cgcCertUrl = (cert: string | null | undefined, isComic = false): string => {
  const digits = String(cert ?? '').replace(/\D/g, '') || String(cert ?? '').trim();
  const base = isComic ? 'https://www.cgccomics.com/certlookup/' : 'https://www.cgccards.com/certlookup/';
  return digits ? `${base}${digits}/` : base;
};

export interface ResolvedCertLookup {
  source: RefSource;
  label: string;
  url: string;
  direct: boolean;
}

export const certLookupUrl = (
  service: string | null | undefined,
  cert: string | null | undefined,
  grade?: string | null,
  itemType?: string | null,
): ResolvedCertLookup | null => {
  const svc = String(service ?? '').trim().toLowerCase();
  const cleanCert = String(cert ?? '').trim();
  if (!svc || !cleanCert) return null;

  // 1. PMG
  if (/\bpmg\b/.test(svc)) {
    return { source: 'pmg', label: 'PMG cert', url: pmgCertUrl(cleanCert, grade), direct: true };
  }

  // 2. PCGS (Coins and PCGS Banknote)
  if (/\bpcgs\b/.test(svc)) {
    const digits = cleanCert.replace(/\D/g, '');
    const isBanknote = /\bbanknote\b/.test(svc) || itemType === 'banknote';
    const url = isBanknote
      ? (digits ? `https://www.pcgs.com/banknote/cert/${digits}` : 'https://www.pcgs.com/banknote/cert')
      : (digits ? `https://www.pcgs.com/cert/${digits}` : 'https://www.pcgs.com/cert');
    return { source: 'pcgs', label: 'PCGS cert', url, direct: true };
  }

  // 3. NGC
  if (/\bngc\b/.test(svc)) {
    return { source: 'ngc', label: 'NGC cert', url: ngcCertUrl(cleanCert, grade), direct: true };
  }

  // 4. CGC (Cards & Comics)
  if (/\bcgc\b/.test(svc)) {
    const isComic = /\bcomic/.test(svc) || itemType === 'comic_book' || itemType === 'magazine';
    return { source: 'cgc', label: 'CGC cert', url: cgcCertUrl(cleanCert, isComic), direct: true };
  }

  // 5. PSA
  if (/\bpsa\b/.test(svc)) {
    const digits = cleanCert.replace(/\D/g, '');
    const url = digits ? `https://www.psacard.com/cert/${digits}` : 'https://www.psacard.com/cert/';
    return { source: 'psa', label: 'PSA cert', url, direct: true };
  }

  // 6. CACG (CAC Grading)
  if (/\bcacg?\b/.test(svc)) {
    return { source: 'cacg', label: 'CACG cert', url: 'https://www.cacgrading.com/certlookup', direct: false };
  }

  // 7. ANACS
  if (/\banacs\b/.test(svc)) {
    return { source: 'anacs', label: 'ANACS cert', url: 'https://portal.anacs.com/Verify/CertVerification.aspx', direct: false };
  }

  // 8. Beckett (BGS / BVG / BCCG)
  if (/\b(?:bgs|beckett|bvg|bccg)\b/.test(svc)) {
    return { source: 'bgs', label: 'BGS cert', url: 'https://www.beckett.com/grading/card-lookup', direct: false };
  }

  // 9. SGC
  if (/\bsgc\b/.test(svc)) {
    return { source: 'sgc', label: 'SGC cert', url: 'https://gosgc.com/cert-code-lookup', direct: false };
  }

  return null;
};
