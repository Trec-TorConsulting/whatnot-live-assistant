import { describe, expect, it } from 'vitest';
import { estatePassOn, isTemplate } from './estate';
import {
  buildRunnerView,
  computeRunQuote,
  emptyIdleScanGate,
  formatPriceLadder,
  giveawayMatchesStem,
  giveawayShippingStems,
  isIdleScanResultCurrent,
  parsePriceLadder,
  runnerItemName,
  runnerNoteSupplement,
  runnerPassOn,
  runnerShippingCallout,
  runnerShippingPaid,
  stepIdleScanGate,
  vendorQuoteFromChat,
} from './runner';
import { detectShowType } from './showType';

const LEESPORT_NOTES = [
  'Welcome to Leesport Flea Market! Put in R for Run and P for Pass in the chat.',
  'Vendor price $1 will run for $6, $2 for $7, $3 for $8, $4 for $9, anything $5 and up will be doubled.',
  '+$5 for large glass or multiple items that need extra bubble wrap.',
  'No cancellations or returns. Everything sold as-is, untested, and not cleaned.',
].join('\n');

describe('runnerPassOn and parsePriceLadder (2.1)', () => {
  it('turns on for Leesport notes, keeps show type flea, and parses the four rungs, double from $5, and +$5 wrap add', () => {
    expect(runnerPassOn(LEESPORT_NOTES)).toBe(true);
    expect(detectShowType('Deal Hunting at Leesport', ['Estate Sales & Flea Markets'], LEESPORT_NOTES)).toBe('flea');
    const ladder = parsePriceLadder(LEESPORT_NOTES);
    expect(ladder).toEqual({
      rungs: [
        { vendor: 1, run: 6 },
        { vendor: 2, run: 7 },
        { vendor: 3, run: 8 },
        { vendor: 4, run: 9 },
      ],
      doubleFrom: 5,
      wrapAdd: 5,
    });
    expect(formatPriceLadder(ladder)).toBe('$1 → $6 · $2 → $7 · $3 → $8 · $4 → $9 · $5+ doubled · +$5 glass/multiple');
  });

  it('leaves the pass off and invents no rung when flea notes have no rung', () => {
    const plainFlea = 'Walking the flea market today! Call out anything you want to see.';
    expect(runnerPassOn(plainFlea)).toBe(false);
    expect(parsePriceLadder(plainFlea)).toBeNull();

    const rOrPWithoutRung = 'Put in R for Run and P for Pass when you see something!';
    expect(runnerPassOn(rOrPWithoutRung)).toBe(false);
    expect(parsePriceLadder(rOrPWithoutRung)).toBeNull();
  });

  it('does not duplicate the ladder when the same notes are read twice', () => {
    const doubledNotes = `${LEESPORT_NOTES}\n\n${LEESPORT_NOTES}`;
    const ladder = parsePriceLadder(doubledNotes);
    expect(ladder?.rungs).toHaveLength(4);
    expect(formatPriceLadder(ladder)).toBe(formatPriceLadder(parsePriceLadder(LEESPORT_NOTES)));
  });
});

describe('vendorQuoteFromChat and computeRunQuote (2.2)', () => {
  const ladder = parsePriceLadder(LEESPORT_NOTES)!;

  it('computes start $16 and sum $23.75 with no wrap for "vendor wants $8" and $7.75 shipping', () => {
    const q = vendorQuoteFromChat('vendor wants $8', true, false, 7.75);
    expect(q).toEqual({ vendor: 8, text: 'vendor wants $8' });
    const computed = computeRunQuote(q, ladder, 7.75);
    expect(computed).toEqual({
      vendor: 8,
      start: 16,
      wrap: 0,
      merchandiseTotal: 16,
      shipping: 7.75,
      allIn: 23.75,
    });
  });

  it('computes start $7 for "vendor price is $2" and adds $5 wrap for "large glass at $3"', () => {
    const q2 = vendorQuoteFromChat('vendor price is $2', false, true, 7.75);
    expect(computeRunQuote(q2, ladder, null)?.start).toBe(7);

    const q3 = vendorQuoteFromChat('large glass at $3', true, false, 7.75);
    const c3 = computeRunQuote(q3, ladder, null);
    expect(c3).toMatchObject({
      vendor: 3,
      start: 8,
      wrap: 5,
      merchandiseTotal: 13,
    });
  });

  it('ignores viewer lines, shipping lines, and two-amount lines, and replaces an older host quote', () => {
    let current = vendorQuoteFromChat('vendor price is $2', true, false, 7.75);
    expect(current?.vendor).toBe(2);

    const viewer = vendorQuoteFromChat('I would pay $50', false, false, 7.75);
    expect(viewer).toBeNull();

    const shipLine = vendorQuoteFromChat('shipping is $7.75', true, false, 7.75);
    expect(shipLine).toBeNull();

    const twoAmounts = vendorQuoteFromChat('vendor wants $8 or $10', true, false, 7.75);
    expect(twoAmounts).toBeNull();

    const newer = vendorQuoteFromChat('vendor wants $8', true, false, 7.75);
    if (newer) current = newer;
    expect(current?.vendor).toBe(8);
  });
});

describe('runnerShippingCallout, giveawayShippingStems, and runnerItemName (2.3)', () => {
  it('calls out $7.75 shipping against a $7 start, stays quiet against a $40 bid, and clears on a paid win or seller-paid giveaway', () => {
    expect(
      runnerShippingCallout({
        shipping: 7.75,
        runStart: 7,
        hasActiveLot: false,
        shippingPaid: false,
      }),
    ).toMatch(/at least half the \$7 start/);

    expect(
      runnerShippingCallout({
        shipping: 7.75,
        activeBid: 40,
        hasActiveLot: true,
        shippingPaid: false,
      }),
    ).toBeNull();

    expect(
      runnerShippingPaid({
        liveId: 'live-1',
        purchases: [{ liveId: 'live-1', price: 12, kind: 'auction' }],
      }),
    ).toBe(true);

    expect(
      runnerShippingPaid({
        liveId: 'live-1',
        purchases: [{ liveId: 'live-1', price: 0, kind: 'giveaway' }],
      }),
    ).toBe(false);
  });

  it('matches a giveaway stem whose shop description says the seller pays shipping and ignores one that does not', () => {
    const shopBody = {
      data: {
        liveShop: {
          edges: [
            {
              node: {
                title: 'Follower Giveaway #1',
                transactionType: 'GIVEAWAY',
                description: 'Seller pays shipping on giveaways! Appreciate you being here.',
              },
            },
            {
              node: {
                title: 'Sticker Giveaway #2',
                transactionType: 'GIVEAWAY',
                description: 'Free sticker for followers!',
              },
            },
          ],
        },
      },
    };
    const stems = giveawayShippingStems(shopBody);
    expect(stems).toEqual(['follower giveaway']);
    expect(giveawayMatchesStem('Follower Giveaway #4', stems)).toBe(true);
    expect(giveawayMatchesStem('Sticker Giveaway #5', stems)).toBe(false);
  });

  it('keeps "Cannons" on "Cannons As seen" when runner pass is on, keeps "Junk bag #3" a template, and leaves "Sewing Patterns Vintage As Shown" a template when pass is off', () => {
    expect(runnerItemName('Cannons As seen', true)).toBe('Cannons');
    expect(
      estatePassOn({
        lotTitle: 'Cannons As seen',
        notes: LEESPORT_NOTES,
        showType: 'flea',
      }),
    ).toBe(false);

    expect(runnerItemName('Junk bag #3', true)).toBeNull();
    expect(isTemplate('Junk bag #3')).toBe(true);
    expect(
      estatePassOn({
        lotTitle: 'Junk bag #3',
        notes: LEESPORT_NOTES,
        showType: 'flea',
      }),
    ).toBe(true);

    expect(runnerItemName('Sewing Patterns Vintage As Shown', false)).toBeNull();
    expect(isTemplate('Sewing Patterns Vintage As Shown')).toBe(true);
  });
});

describe('runnerNoteSupplement (2.4)', () => {
  it('returns ladder and buying-rules lines that sit past the 700-char cap without coupons, and returns empty when runner pass is off', () => {
    const filler = `${'Welcome to our weekly outdoor market walk! We have two dogs at home so pet hair may be present on fabrics. '.repeat(8)}\nPut in R for Run and P for Pass.`;
    expect(filler.length).toBeGreaterThan(720);
    const longNotes = [
      filler,
      'Vendor price $1 will run for $6, $2 for $7, $3 for $8, $4 for $9, anything $5 and up will be doubled.',
      '+$5 for large glass or multiple items.',
      'No cancellations, no refunds, no returns. Everything is sold as-is, untested, not cleaned. /coupon SAVE10',
    ].join('\n');

    const supp = runnerNoteSupplement(longNotes);
    expect(supp).toContain('anything $5 and up will be doubled');
    expect(supp).toContain('No cancellations, no refunds, no returns');
    expect(supp).not.toContain('SAVE10');
    expect(supp).not.toContain('pet hair');

    const nonRunnerLong = `${'Welcome to our antique show! '.repeat(35)}\nNo cancellations or returns.`;
    expect(runnerNoteSupplement(nonRunnerLong)).toBe('');
  });
});

describe('stepIdleScanGate and isIdleScanResultCurrent (5.1)', () => {
  it('requests one scan per gap when waiting, skips when scan off / hidden / share worker, and drops results from a previous gap', () => {
    let gate = emptyIdleScanGate();
    const first = stepIdleScanGate(gate, {
      runnerOn: true,
      scanOn: true,
      hasActiveLot: false,
      documentVisible: true,
      isShareWorker: false,
    });
    gate = first.state;
    expect(first.shouldScan).toBe(true);
    expect(first.gapId).toBe(0);

    const secondSameGap = stepIdleScanGate(gate, {
      runnerOn: true,
      scanOn: true,
      hasActiveLot: false,
      documentVisible: true,
      isShareWorker: false,
    });
    gate = secondSameGap.state;
    expect(secondSameGap.shouldScan).toBe(false);

    expect(
      stepIdleScanGate(emptyIdleScanGate(), {
        runnerOn: true,
        scanOn: false,
        hasActiveLot: false,
        documentVisible: true,
        isShareWorker: false,
      }).shouldScan,
    ).toBe(false);

    expect(
      stepIdleScanGate(emptyIdleScanGate(), {
        runnerOn: true,
        scanOn: true,
        hasActiveLot: false,
        documentVisible: false,
        isShareWorker: false,
      }).shouldScan,
    ).toBe(false);

    expect(
      stepIdleScanGate(emptyIdleScanGate(), {
        runnerOn: true,
        scanOn: true,
        hasActiveLot: false,
        documentVisible: true,
        isShareWorker: true,
      }).shouldScan,
    ).toBe(false);

    // Auction becomes active -> advances gapId to 1
    const lotActive = stepIdleScanGate(gate, {
      runnerOn: true,
      scanOn: true,
      hasActiveLot: true,
      documentVisible: true,
      isShareWorker: false,
    });
    gate = lotActive.state;
    expect(lotActive.shouldScan).toBe(false);
    expect(lotActive.gapId).toBe(1);
    expect(isIdleScanResultCurrent(gate, 0, true)).toBe(false);

    // Auction ends -> waiting in gap 1; gap 0 result is still stale, and gap 1 can scan once
    expect(isIdleScanResultCurrent(gate, 0, false)).toBe(false);
    const nextGapScan = stepIdleScanGate(gate, {
      runnerOn: true,
      scanOn: true,
      hasActiveLot: false,
      documentVisible: true,
      isShareWorker: false,
    });
    expect(nextGapScan.shouldScan).toBe(true);
    expect(nextGapScan.gapId).toBe(1);
    expect(isIdleScanResultCurrent(nextGapScan.state, 1, false)).toBe(true);
  });

  it('builds a RunnerView with ladder, quote, and shipping note', () => {
    const v = buildRunnerView({
      notes: LEESPORT_NOTES,
      quote: { vendor: 8, text: 'vendor wants $8' },
      shipping: 7.75,
      hasActiveLot: false,
      shippingPaid: false,
    });
    expect(v?.ladder).toContain('$1 → $6');
    expect(v?.quote).toContain('Vendor $8');
    expect(v?.quote).toContain('start $16');
    expect(v?.quote).toContain('$23.75');
  });
});
