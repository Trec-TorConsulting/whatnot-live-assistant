// Real-time barcode & QR decoding from live video stream frames.
// Uses native Chrome BarcodeDetector on macOS when available.

export interface ScannedBarcode {
  raw: string;
  cert: string;
  gradingService: 'NGC' | 'PCGS' | null;
  grade?: string | null;
}

export const parseBarcodeValue = (rawValue: string): ScannedBarcode | null => {
  const val = rawValue.trim();
  if (!val) return null;

  // Case 1: Direct NGC verification URL
  // e.g. https://www.ngccoin.com/certlookup/6066357-002/68/ or https://www.ngccoin.com/certlookup/6066357-002/
  const ngcUrlMatch = val.match(/ngccoin\.com\/certlookup\/([a-zA-Z0-9-]+)(?:\/(\d{1,2}))?/i);
  if (ngcUrlMatch) {
    return {
      raw: val,
      cert: ngcUrlMatch[1]!,
      gradingService: 'NGC',
      grade: ngcUrlMatch[2] ?? null,
    };
  }

  // Case 2: Direct PCGS verification URL
  // e.g. https://www.pcgs.com/cert/12345678
  const pcgsUrlMatch = val.match(/pcgs\.com\/cert\/(\d{7,9})/i);
  if (pcgsUrlMatch) {
    return {
      raw: val,
      cert: pcgsUrlMatch[1]!,
      gradingService: 'PCGS',
    };
  }

  // Case 3: NGC hyphenated cert string: 1234567-001 (7 digits, hyphen, 3 digits)
  const ngcHyphenMatch = val.match(/^(\d{7})-(\d{3})$/);
  if (ngcHyphenMatch) {
    return {
      raw: val,
      cert: `${ngcHyphenMatch[1]}-${ngcHyphenMatch[2]}`,
      gradingService: 'NGC',
    };
  }

  // Case 4: 10 digits (NGC numeric serial without hyphen)
  if (/^\d{10}$/.test(val)) {
    return {
      raw: val,
      cert: `${val.slice(0, 7)}-${val.slice(7)}`,
      gradingService: 'NGC',
    };
  }

  // Case 5: 7-9 digits (standard coin slab cert number - older NGC or PCGS)
  if (/^\d{7,9}$/.test(val)) {
    return {
      raw: val,
      cert: val,
      gradingService: null,
    };
  }

  return null;
};

interface BarcodeDetectionResult {
  rawValue?: string;
}

interface NativeBarcodeDetector {
  detect: (source: ImageBitmapSource) => Promise<BarcodeDetectionResult[]>;
}

interface WindowWithBarcodeDetector {
  BarcodeDetector: new (opts?: { formats: string[] }) => NativeBarcodeDetector;
}

export const scanVideoBarcode = async (video: HTMLVideoElement | null): Promise<ScannedBarcode | null> => {
  if (!video || typeof window === 'undefined') return null;
  const BarcodeDetectorClass = (window as unknown as WindowWithBarcodeDetector).BarcodeDetector;
  if (!BarcodeDetectorClass) return null;
  try {
    const detector = new BarcodeDetectorClass({ formats: ['code_128', 'code_39', 'qr_code'] });
    const barcodes = await detector.detect(video);
    if (!barcodes || !barcodes.length) return null;
    for (const barcode of barcodes) {
      if (barcode.rawValue) {
        const parsed = parseBarcodeValue(barcode.rawValue);
        if (parsed) return parsed;
      }
    }
  } catch {
    // Unsupported format, video not ready, or platform restriction
  }
  return null;
};
