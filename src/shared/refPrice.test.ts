import { describe, expect, it } from 'vitest';
import { certLookupUrl, cgcCertUrl, extractNumericGrade, formatNgcCert, ngcCertUrl, pmgCertUrl } from './refPrice';

describe('refPrice NGC utilities', () => {
  describe('extractNumericGrade', () => {
    it('extracts numeric Sheldon grade from grade strings', () => {
      expect(extractNumericGrade('MS 65')).toBe('65');
      expect(extractNumericGrade('MS65+')).toBe('65');
      expect(extractNumericGrade('PF 70 Ultra Cameo')).toBe('70');
      expect(extractNumericGrade('AU 58')).toBe('58');
      expect(extractNumericGrade('VF-30')).toBe('30');
      expect(extractNumericGrade('XF 45')).toBe('45');
      expect(extractNumericGrade('G 4')).toBe('4');
    });

    it('returns null for non-numeric or details grades', () => {
      expect(extractNumericGrade('UNC Details')).toBeNull();
      expect(extractNumericGrade('Authentic')).toBeNull();
      expect(extractNumericGrade(null)).toBeNull();
      expect(extractNumericGrade('')).toBeNull();
    });
  });

  describe('formatNgcCert', () => {
    it('preserves existing hyphenated certs', () => {
      expect(formatNgcCert('6066357-002')).toBe('6066357-002');
      expect(formatNgcCert(' 1234567-001 ')).toBe('1234567-001');
    });

    it('formats 10-digit serials with a hyphen', () => {
      expect(formatNgcCert('6066357002')).toBe('6066357-002');
    });

    it('handles 7-9 digit certs without alteration', () => {
      expect(formatNgcCert('1234567')).toBe('1234567');
      expect(formatNgcCert('12345678')).toBe('12345678');
    });

    it('returns empty string for null or empty input', () => {
      expect(formatNgcCert(null)).toBe('');
      expect(formatNgcCert('')).toBe('');
    });
  });

  describe('ngcCertUrl', () => {
    it('constructs direct certlookup URL with cert and numeric grade', () => {
      expect(ngcCertUrl('6066357-002', 'MS 65')).toBe('https://www.ngccoin.com/certlookup/6066357-002/65/');
      expect(ngcCertUrl('6066357002', 'PF 70 Ultra Cameo')).toBe('https://www.ngccoin.com/certlookup/6066357-002/70/');
    });

    it('constructs cert URL without grade when grade is non-numeric', () => {
      expect(ngcCertUrl('6066357-002', 'UNC Details')).toBe('https://www.ngccoin.com/certlookup/6066357-002/');
      expect(ngcCertUrl('6066357-002', null)).toBe('https://www.ngccoin.com/certlookup/6066357-002/');
    });

    it('falls back to base certlookup URL when cert is missing', () => {
      expect(ngcCertUrl(null, 'MS 65')).toBe('https://www.ngccoin.com/certlookup/');
      expect(ngcCertUrl('', null)).toBe('https://www.ngccoin.com/certlookup/');
    });
  });

  describe('pmgCertUrl', () => {
    it('constructs PMG lookup URL with cert and numeric grade', () => {
      expect(pmgCertUrl('2517345-003', '64 EPQ')).toBe('https://www.pmgnotes.com/certlookup/2517345-003/64/');
      expect(pmgCertUrl('2517345003', 'Gem Unc 66')).toBe('https://www.pmgnotes.com/certlookup/2517345-003/66/');
    });

    it('constructs PMG lookup URL without grade when grade is non-numeric', () => {
      expect(pmgCertUrl('2517345-003', 'Choice About Unc')).toBe('https://www.pmgnotes.com/certlookup/2517345-003/');
    });
  });

  describe('cgcCertUrl', () => {
    it('constructs CGC Cards URL by default', () => {
      expect(cgcCertUrl('1401022941001')).toBe('https://www.cgccards.com/certlookup/1401022941001/');
    });

    it('constructs CGC Comics URL when isComic is true', () => {
      expect(cgcCertUrl('4057358001', true)).toBe('https://www.cgccomics.com/certlookup/4057358001/');
    });
  });

  describe('certLookupUrl', () => {
    it('resolves direct deep-links for PMG', () => {
      expect(certLookupUrl('PMG', '2517345-003', '64 EPQ')).toEqual({
        source: 'pmg',
        label: 'PMG cert',
        url: 'https://www.pmgnotes.com/certlookup/2517345-003/64/',
        direct: true,
      });
    });

    it('resolves direct deep-links for PCGS Banknote and PCGS Coins', () => {
      expect(certLookupUrl('PCGS Banknote', '80123456')).toEqual({
        source: 'pcgs',
        label: 'PCGS cert',
        url: 'https://www.pcgs.com/banknote/cert/80123456',
        direct: true,
      });

      expect(certLookupUrl('PCGS', '12345678')).toEqual({
        source: 'pcgs',
        label: 'PCGS cert',
        url: 'https://www.pcgs.com/cert/12345678',
        direct: true,
      });
    });

    it('resolves direct deep-links for NGC', () => {
      expect(certLookupUrl('NGC', '6066357-002', 'MS 65')).toEqual({
        source: 'ngc',
        label: 'NGC cert',
        url: 'https://www.ngccoin.com/certlookup/6066357-002/65/',
        direct: true,
      });
    });

    it('resolves direct deep-links for CGC Cards and Comics', () => {
      expect(certLookupUrl('CGC', '1401022941001', '10', 'trading_card')).toEqual({
        source: 'cgc',
        label: 'CGC cert',
        url: 'https://www.cgccards.com/certlookup/1401022941001/',
        direct: true,
      });

      expect(certLookupUrl('CGC', '4057358001', '9.8', 'comic_book')).toEqual({
        source: 'cgc',
        label: 'CGC cert',
        url: 'https://www.cgccomics.com/certlookup/4057358001/',
        direct: true,
      });
    });

    it('resolves direct deep-links for PSA', () => {
      expect(certLookupUrl('PSA', '12345678')).toEqual({
        source: 'psa',
        label: 'PSA cert',
        url: 'https://www.psacard.com/cert/12345678',
        direct: true,
      });
    });

    it('resolves portal search links for CACG, ANACS, BGS, and SGC', () => {
      expect(certLookupUrl('CACG', '10012345')).toEqual({
        source: 'cacg',
        label: 'CACG cert',
        url: 'https://www.cacgrading.com/certlookup',
        direct: false,
      });

      expect(certLookupUrl('ANACS', '5432109')).toEqual({
        source: 'anacs',
        label: 'ANACS cert',
        url: 'https://portal.anacs.com/Verify/CertVerification.aspx',
        direct: false,
      });

      expect(certLookupUrl('BGS', '0012345678')).toEqual({
        source: 'bgs',
        label: 'BGS cert',
        url: 'https://www.beckett.com/grading/card-lookup',
        direct: false,
      });

      expect(certLookupUrl('SGC', '1234567')).toEqual({
        source: 'sgc',
        label: 'SGC cert',
        url: 'https://gosgc.com/cert-code-lookup',
        direct: false,
      });
    });

    it('returns null for empty service or cert', () => {
      expect(certLookupUrl(null, '12345')).toBeNull();
      expect(certLookupUrl('PCGS', null)).toBeNull();
      expect(certLookupUrl('Unknown', '12345')).toBeNull();
    });
  });
});

