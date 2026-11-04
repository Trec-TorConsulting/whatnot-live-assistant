import { describe, expect, it } from 'vitest';
import { extractDeviceSpecs, readPartNumber, specLine, specsConflict } from './deviceSpecs';

describe('extractDeviceSpecs', () => {
  it('reads year, chip, RAM, storage, and screen off a MacBook Pro title', () => {
    const s = extractDeviceSpecs('2021 Apple Macbook Pro M1 14-Core 16GB RAM 1TB SSD 14"');
    expect(s).toMatchObject({
      year: 2021,
      chip: 'M1',
      ramGb: 16,
      storageGb: 1024,
      screenIn: 14,
    });
    expect(specLine('2021 Apple Macbook Pro M1 14-Core 16GB RAM 1TB SSD 14"')).toBe(
      '2021 · M1 · 16GB RAM · 1TB · 14 inch',
    );
  });

  it('assigns smaller unmarked GB to RAM and larger to storage', () => {
    const s = extractDeviceSpecs('Samsung 500C Chromebook 4GB 16GB');
    expect(s.ramGb).toBe(4);
    expect(s.storageGb).toBe(16);
  });

  it('reads iPad generation and single unmarked GB as storage', () => {
    const s = extractDeviceSpecs('2021 Apple iPad (9th Gen) 64GB GRAY');
    expect(s.year).toBe(2021);
    expect(s.gen).toBe('9th gen');
    expect(s.ramGb).toBeNull();
    expect(s.storageGb).toBe(64);
    expect(specLine('2021 Apple iPad (9th Gen) 64GB GRAY')).toBe('2021 · 9th gen · 64GB');
  });

  it('distinguishes model variants with and without a trailing number', () => {
    const pro2 = extractDeviceSpecs('Audien Atom Pro 2');
    const pro1 = extractDeviceSpecs('Audien Atom Pro');
    expect(pro2.variant).toBe('pro 2');
    expect(pro1.variant).toBe('pro');
    expect(specsConflict('Audien Atom Pro 2', 'Audien Atom Pro')).toBe(true);
  });

  it('reads manufacturer part numbers and rejects stock codes and fractions', () => {
    expect(readPartNumber('2886-20')).toBe('2886-20');
    expect(readPartNumber('48-11-2425')).toBe('48-11-2425');
    expect(readPartNumber('DMAPL9910-S7')).toBe('DMAPL9910-S7');
    expect(readPartNumber('K135')).toBeNull();
    expect(readPartNumber('4-1/2')).toBeNull();
    expect(readPartNumber('7-1/4')).toBeNull();
  });

  it('returns null specLine when no device specs are stated', () => {
    expect(specLine('AI SMART GLASSES')).toBeNull();
  });
});
