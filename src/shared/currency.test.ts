import { describe, expect, it } from 'vitest';
import { parseShipping, parseShippingInfo } from './costs';
import { formatForeignWithUsd, rateFrom, readAmountText, toUsd } from './currency';

describe('currency and cross-border shipping', () => {
  it('reads CA$ shipping with est. $ and tariffs, while USD shipping still returns its dollar amount', () => {
    const line = 'Shipping is CA$18.50 (est. $13.26) + Taxes + Tariffs';
    const parsed = readAmountText(line);
    expect(parsed).toEqual({
      amount: 18.5,
      code: 'CAD',
      usd: 13.26,
      tariffs: true,
    });
    expect(parseShipping(line)).toBe(13.26);
    expect(parseShippingInfo(line)).toEqual({
      shipping: 13.26,
      tariffs: true,
      code: 'CAD',
      rawAmount: 18.5,
      usd: 13.26,
    });
    expect(parseShipping('Shipping is $5.25 + Taxes')).toBe(5.25);
    expect(parseShippingInfo('Shipping is $5.25 + Taxes')).toEqual({
      shipping: 5.25,
      tariffs: false,
      code: 'USD',
      rawAmount: 5.25,
      usd: 5.25,
    });
  });

  it('derives the rate 0.7168 from the CA$18.50 / $13.26 pair and converts CA$40 to $28.67', () => {
    const pair = readAmountText('Shipping is CA$18.50 (est. $13.26) + Taxes + Tariffs')!;
    const rate = rateFrom([pair]);
    expect(rate).toBe(0.7168);
    expect(toUsd(40, 'CAD', rate)).toBe(28.67);
    expect(formatForeignWithUsd(5, 'CAD', rate)).toBe('CA$5 (≈ $3.58)');
  });

  it('uses the largest amount pair when multiple estimates are seen, and returns null with no pair', () => {
    expect(
      rateFrom([
        { amount: 3, usd: 2.15, code: 'CAD' },
        { amount: 18.5, usd: 13.26, code: 'CAD' },
      ]),
    ).toBe(0.7168);
    expect(rateFrom([])).toBeNull();
    expect(rateFrom([{ amount: 40, usd: null, code: 'CAD' }])).toBeNull();
    expect(toUsd(40, 'CAD', null)).toBeNull();
    expect(formatForeignWithUsd(40, 'CAD', null)).toBe('CA$40 (not converted)');
  });
});
