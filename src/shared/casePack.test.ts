import { describe, expect, it } from 'vitest';
import {
  breakEven,
  buildCasePackView,
  contentsLine,
  isGenericCaseLot,
  landedPerPiece,
  notesRatio,
  packCount,
  perPiece,
  perPieceShopRows,
  priceClaims,
  sizeRun,
} from './casePack';

describe('casePack: packCount, notesRatio, sizeRun, and isGenericCaseLot', () => {
  it('reads explicit piece counts from casepack titles and subtitles', () => {
    expect(packCount('CASEPACK 6PCS CT-3377 BLACK Oversize Top').count).toBe(6);
    expect(packCount('12 pairs Christmas socks 31079 size 9-11').count).toBe(12);
    expect(packCount('Hasbro 3 per Transformers Cyberworld Grimlock').count).toBe(3);
    expect(packCount('Joggers Casepack size LARGE (12 pairs)').count).toBe(12);
    expect(packCount('$24 HANES SMALL T-SHIRTS SIZE SMALL (6 pack)').count).toBe(6);
  });

  it('rejects heights, product pod counts, scale ratios, lot numbers, and ounces', () => {
    expect(packCount('4-Foot Candy Cane Lane Inflatable Santa').count).toBeNull();
    expect(packCount('goldkey laundry pods 42 count').count).toBeNull();
    expect(packCount('AMA Supercross 1:10 Scale #12').count).toBeNull();
    expect(packCount('A Grinch 40 ounce').count).toBeNull();
  });

  it('treats a multi-piece set as 1 item rather than a pack of that many', () => {
    expect(packCount('Holiday Beauty Set', '9 piece set. Will bundle').count).toBe(1);
    expect(packCount('Toddler 4pc Pajama Set').count).toBe(1);
  });

  it('returns both counts and uses the lower one when the title and description disagree', () => {
    const res = packCount("CHILDREN'S CLOTHING • 20 PIECES", 'Get 25 brand-new pieces');
    expect(res.counts).toEqual([20, 25]);
    expect(res.count).toBe(20);
    expect(res.conflict).toContain('20');
    expect(res.conflict).toContain('25');
  });

  it('reads size runs from titles and descriptions', () => {
    expect(sizeRun('Includes 2S, 2M, 2L')).toMatchObject({
      label: '2 S · 2 M · 2 L',
      total: 6,
    });
    expect(sizeRun('3S/M and 3L/XL')).toMatchObject({
      label: '3 S/M · 3 L/XL',
      total: 6,
    });
  });

  it('reads default ratios from show notes and Sold per piece from subtitles', () => {
    expect(notesRatio('Everything is 12/$12 SB UNLESS stated otherwise!')).toBe(12);
    expect(notesRatio('Sold by the dozen unless otherwise stated')).toBe(12);
    expect(packCount('Wholesale Show', 'Sold per piece').count).toBe(1);
  });

  it('distinguishes generic case-pack lot titles from named product case packs', () => {
    expect(isGenericCaseLot('Clothing Case Pack - Pink Tag #66')).toBe(true);
    expect(isGenericCaseLot('$3.99 Shipping Cap #308')).toBe(true);
    expect(isGenericCaseLot('12/$12 Dozens')).toBe(true);
    expect(isGenericCaseLot('Quality Item #54')).toBe(true);
    expect(isGenericCaseLot('Pallet #4')).toBe(true);
    expect(isGenericCaseLot('Rewards Bundle')).toBe(true);
    expect(isGenericCaseLot('CASEPACK 6PCS TW-2340 Mock Neck Short Sleeve Sweater')).toBe(false);
  });
});

describe('casePack: contentsLine, perPiece, landedPerPiece, breakEven, priceClaims, perPieceShopRows, and buildCasePackView', () => {
  it('parses host and mod contents lines', () => {
    expect(contentsLine('Hats- 10')).toMatchObject({
      name: 'Hats',
      count: 10,
      label: 'Hats ×10',
    });
    expect(contentsLine('SQUISHY CHUBBY BANANA X2')).toMatchObject({
      name: 'Squishy Chubby Banana',
      count: 2,
      label: 'Squishy Chubby Banana ×2',
    });
    expect(contentsLine('6/$12')).toMatchObject({
      name: null,
      count: 6,
      label: '×6',
    });
  });

  it('computes per-piece, landed per-piece, break-even, and weight-tier per-lb figures', () => {
    // "12/$12 SB" at $12 with $5.25 shipping is $1.00 each and $1.44 landed
    const view12 = buildCasePackView({
      showType: 'wholesale',
      lotTitle: '12/$12 SB',
      start: 12,
      shipping: 5.25,
    })!;
    expect(view12.line).toContain('12 pieces');
    expect(view12.line).toContain('$1.00 each');
    expect(view12.line).toContain('$1.44 each landed');

    // Hats ×10 at $21 with $7.75 is $2.10 each and $2.88 landed
    expect(perPiece(21, 10)).toBe(2.1);
    expect(landedPerPiece(21, 7.75, 0, 10)).toBe(2.88);

    // Break even at 10.9% + $0.30 on $2.88 is $3.57
    expect(breakEven(2.88, 10.9, 0.3)).toBe(3.57);

    // "3 lb" at $30 is $10.00 per lb
    const viewLb = buildCasePackView({
      showType: 'wholesale',
      lotTitle: '3 lb',
      start: 30,
    })!;
    expect(viewLb.line).toContain('$10.00 per lb');
    expect(viewLb.line).not.toContain('each');

    // With no count, there is no per-piece figure
    const noCount = buildCasePackView({
      showType: 'wholesale',
      lotTitle: 'A Grinch 40 ounce',
      start: 15,
      shipping: 5,
    })!;
    expect(noCount.line).not.toContain('each');
  });

  it('labels MSRP and flash strike prices as seller claims with no market value', () => {
    const msrp = priceClaims('$79 msrp 10-Pack Solid Color T-Shirt Bundle');
    expect(msrp.msrp).toBe(79);
    expect(msrp.marketValue).toBeNull();
    expect(msrp.claims[0]).toContain('$79');

    const flash = priceClaims('12 pairs Christmas socks', null, { struckPrice: 50 });
    expect(flash.wasPrice).toBe(50);
    expect(flash.marketValue).toBeNull();
    expect(flash.claims).toContain("seller's was-price $50");
  });

  it('sorts buy-it-now case packs by per-piece price without calling them steals', () => {
    const rows = perPieceShopRows([
      { id: '1', title: 'CASEPACK 6PCS TW-2736 BLACK Sweater', price: 104, quantity: 16, mode: 'bin' },
      { id: '2', title: 'CASEPACK 6PCS NT-6068 H GREY Jumpsuit', price: 48, quantity: 50, mode: 'bin' },
      { id: '3', title: 'CASEPACK 4PCS IP-10019D4 BLACK Pants', price: 52, quantity: 24, mode: 'bin' },
    ]);
    expect(rows.map((r) => r.unitPrice)).toEqual([8, 13, 17.33]);
    expect(rows.every((r) => r.kind === 'per-piece')).toBe(true);
  });
});
