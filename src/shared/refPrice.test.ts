import { describe, expect, it } from 'vitest';
import { extractNumericGrade, formatNgcCert, ngcCertUrl } from './refPrice';

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
});

