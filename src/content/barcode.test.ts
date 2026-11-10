import { describe, expect, it, vi } from 'vitest';
import { parseBarcodeValue, scanVideoBarcode } from './barcode';

describe('parseBarcodeValue', () => {
  it('parses NGC direct cert URLs with grade', () => {
    const res = parseBarcodeValue('https://www.ngccoin.com/certlookup/6066357-002/68/');
    expect(res).toEqual({
      raw: 'https://www.ngccoin.com/certlookup/6066357-002/68/',
      cert: '6066357-002',
      gradingService: 'NGC',
      grade: '68',
    });
  });

  it('parses NGC direct cert URLs without grade', () => {
    const res = parseBarcodeValue('https://www.ngccoin.com/certlookup/6066357-002/');
    expect(res).toEqual({
      raw: 'https://www.ngccoin.com/certlookup/6066357-002/',
      cert: '6066357-002',
      gradingService: 'NGC',
      grade: null,
    });
  });

  it('parses PMG direct cert URLs with grade', () => {
    const res = parseBarcodeValue('https://www.pmgnotes.com/certlookup/2517345-003/64/');
    expect(res).toEqual({
      raw: 'https://www.pmgnotes.com/certlookup/2517345-003/64/',
      cert: '2517345-003',
      gradingService: 'PMG',
      grade: '64',
    });
  });

  it('parses CGC Cards and CGC Comics direct cert URLs', () => {
    const cards = parseBarcodeValue('https://www.cgccards.com/certlookup/1401022941001/');
    expect(cards).toEqual({
      raw: 'https://www.cgccards.com/certlookup/1401022941001/',
      cert: '1401022941001',
      gradingService: 'CGC',
    });

    const comics = parseBarcodeValue('https://www.cgccomics.com/certlookup/4057358001/');
    expect(comics).toEqual({
      raw: 'https://www.cgccomics.com/certlookup/4057358001/',
      cert: '4057358001',
      gradingService: 'CGC',
    });
  });

  it('parses PCGS Banknote and PSA direct cert URLs', () => {
    const pcgsNote = parseBarcodeValue('https://www.pcgs.com/banknote/cert/80123456');
    expect(pcgsNote).toEqual({
      raw: 'https://www.pcgs.com/banknote/cert/80123456',
      cert: '80123456',
      gradingService: 'PCGS',
    });

    const psa = parseBarcodeValue('https://www.psacard.com/cert/98765432');
    expect(psa).toEqual({
      raw: 'https://www.psacard.com/cert/98765432',
      cert: '98765432',
      gradingService: 'PSA',
    });
  });

  it('parses 11-13 digit CGC barcode strings', () => {
    const res = parseBarcodeValue('1401022941001');
    expect(res).toEqual({
      raw: '1401022941001',
      cert: '1401022941001',
      gradingService: 'CGC',
    });
  });

  it('parses PCGS direct cert URLs', () => {
    const res = parseBarcodeValue('https://www.pcgs.com/cert/12345678');
    expect(res).toEqual({
      raw: 'https://www.pcgs.com/cert/12345678',
      cert: '12345678',
      gradingService: 'PCGS',
    });
  });

  it('parses NGC hyphenated barcode strings', () => {
    const res = parseBarcodeValue('6066357-002');
    expect(res).toEqual({
      raw: '6066357-002',
      cert: '6066357-002',
      gradingService: 'NGC',
    });
  });

  it('parses 10-digit NGC barcodes and formats with hyphen', () => {
    const res = parseBarcodeValue('6066357002');
    expect(res).toEqual({
      raw: '6066357002',
      cert: '6066357-002',
      gradingService: 'NGC',
    });
  });

  it('parses 7-9 digit cert barcodes', () => {
    const res = parseBarcodeValue('12345678');
    expect(res).toEqual({
      raw: '12345678',
      cert: '12345678',
      gradingService: null,
    });
  });

  it('returns null for non-cert strings', () => {
    expect(parseBarcodeValue('')).toBeNull();
    expect(parseBarcodeValue('hello world')).toBeNull();
    expect(parseBarcodeValue('1234')).toBeNull();
  });
});

describe('scanVideoBarcode', () => {
  it('returns null if video element is null', async () => {
    expect(await scanVideoBarcode(null)).toBeNull();
  });

  it('returns null when BarcodeDetector is not in window', async () => {
    const video = document.createElement('video');
    expect(await scanVideoBarcode(video)).toBeNull();
  });

  it('detects and parses barcode when BarcodeDetector is available', async () => {
    const video = document.createElement('video');
    const mockDetect = vi.fn().mockResolvedValue([{ rawValue: '6066357-002' }]);
    class MockBarcodeDetector {
      detect = mockDetect;
    }

    (window as unknown as { BarcodeDetector: unknown }).BarcodeDetector = MockBarcodeDetector;

    const result = await scanVideoBarcode(video);
    expect(result).toEqual({
      raw: '6066357-002',
      cert: '6066357-002',
      gradingService: 'NGC',
    });

    delete (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector;
  });

  it('handles detector exceptions gracefully', async () => {
    const video = document.createElement('video');
    const mockDetect = vi.fn().mockRejectedValue(new Error('detection error'));
    class MockBarcodeDetector {
      detect = mockDetect;
    }
    (window as unknown as { BarcodeDetector: unknown }).BarcodeDetector = MockBarcodeDetector;

    expect(await scanVideoBarcode(video)).toBeNull();

    delete (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector;
  });
});
