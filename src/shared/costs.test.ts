import { describe, expect, it } from 'vitest';
import { buildCasePackView } from './casePack';
import {
  allInLine,
  allInPrice,
  flipLine,
  flipProfit,
  parseShipping,
  portfolioValue,
  shippingOwed,
  shippingRules,
  shippingRulesLine,
} from './costs';
import type { Purchase } from './purchases';

const buy = (p: Partial<Purchase>): Purchase => ({
  key: Math.random().toString(),
  at: 0,
  liveId: null,
  showTitle: null,
  host: null,
  title: 'x',
  price: 10,
  kind: 'auction',
  appraisedValue: null,
  meltValue: null,
  appraisalId: null,
  source: 'auto',
  ...p,
});

describe('all-in price', () => {
  it("reads Whatnot's shipping line", () => {
    expect(parseShipping('Shipping is $4.85 + Taxes')).toBe(4.85);
    expect(parseShipping('Free Shipping')).toBe(0);
    expect(parseShipping('Taxes apply')).toBeNull();
    expect(parseShipping(null)).toBeNull();
  });

  it('adds shipping once per show and your tax on the bid', () => {
    const a = allInPrice(40, 4.85, 6, false);
    expect(a.total).toBe(47.25);
    expect(allInLine(a, 6)).toBe('All-in $47.25 (ship $4.85 + tax $2.40)');
    expect(allInLine(allInPrice(40, 4.85, 0, true), 0)).toBe('All-in $40 (shipping already paid this show)');
    expect(allInLine(allInPrice(40, null, 0, false), 0)).toBe('All-in $40 (shipping unknown)');
  });

  it('applies shipping rules: caps, mod cap overrides, separate tiers, weight limits, and pallet freight by time zone', () => {
    // 1. Second win with no rules adds nothing
    const noRules = shippingRules('');
    const secondWin = shippingOwed({ rules: noRules, pageShipping: 5.25, hasWinThisShow: true });
    expect(secondWin.amount).toBe(0);
    expect(allInLine(allInPrice(20, secondWin, 0), 0)).toContain('shipping already paid this show');

    // 2. "Max bundled shipping $9.99" plus a prior win adds nothing and names the cap
    const capRules = shippingRules('Max bundled shipping $9.99 no matter how much you buy. Shop and live purchases will be combined.');
    expect(capRules.cap).toBe(9.99);
    expect(capRules.combinesShop).toBe(true);
    const capWin = shippingOwed({ rules: capRules, pageShipping: 6.5, hasWinThisShow: true });
    expect(capWin.amount).toBe(0);
    expect(allInLine(allInPrice(20, capWin, 0), 0)).toContain('$9.99');

    // 3. Mod line "$12.99 max shipping" sets the cap
    const modCap = shippingRules({ notes: '', hostLines: ['$12.99 max shipping'] });
    expect(modCap.cap).toBe(12.99);
    expect(shippingRulesLine(modCap)).toContain('$12.99');

    // 4. "Small, medium, and large do not bundle" plus a prior win plus a Large lot adds the page shipping
    const tierRules = shippingRules('Small, medium, and large do not bundle shipping');
    expect(tierRules.separateTiers).toEqual(['small', 'medium', 'large']);
    const largeOwed = shippingOwed({
      rules: tierRules,
      lotTitle: 'Large Case Pack #12',
      pageShipping: 14.5,
      hasWinThisShow: true,
    });
    expect(largeOwed.amount).toBe(14.5);
    expect(allInPrice(30, largeOwed, 0).total).toBe(44.5);
    expect(allInLine(allInPrice(30, largeOwed, 0), 0)).toContain('this tier ships on its own');

    // 5. "bundles … up to 5 lbs" plus "Case 6-10 pounds" adds $12.99
    const weightRules = shippingRules('Whatnot bundles your shipping up to 5 lbs');
    expect(weightRules.bundleLimitLb).toBe(5);
    const heavyOwed = shippingOwed({
      rules: weightRules,
      lotTitle: 'Case 6-10 pounds',
      pageShipping: 12.99,
      hasWinThisShow: true,
    });
    expect(heavyOwed.amount).toBe(12.99);
    expect(allInLine(allInPrice(25, heavyOwed, 0), 0)).toContain('5 lb');

    // 6. Pallet freight in America/New_York: "Pallet #4" at $540 with $4.47 comes to $790.47, with Eastern $246 and $200 liftgate optional
    const freightRules = shippingRules({
      notes: 'Pallets require freight shipping. Coffin boxes pay shipping by what is on screen.',
      shopListings: [
        { title: 'Eastern Time Zone Shipping', price: 246 },
        { title: 'Central Time Zone Shipping', price: 257 },
        { title: 'Mountain Time Zone Shipping', price: 376 },
        { title: 'Pacific Time Zone Shipping', price: 460 },
        { title: 'Residential / Liftgate Fee', price: 200 },
      ],
    });
    const nyPallet = shippingOwed({
      rules: freightRules,
      lotTitle: 'Pallet #4',
      pageShipping: 4.47,
      hasWinThisShow: false,
      browserZone: 'America/New_York',
    });
    const nyAllIn = allInPrice(540, nyPallet, 0);
    expect(nyAllIn.total).toBe(790.47);
    const nyLine = allInLine(nyAllIn, 0);
    expect(nyLine).toContain('Eastern');
    expect(nyLine).toContain('$246');
    expect(nyLine).toContain('$200');
    expect(nyLine).toContain('optional');

    // 7. Non-US zone shows $246 to $460 and adds none
    const ukPallet = shippingOwed({
      rules: freightRules,
      lotTitle: 'Pallet #4',
      pageShipping: 4.47,
      hasWinThisShow: false,
      browserZone: 'Europe/London',
    });
    const ukAllIn = allInPrice(540, ukPallet, 0);
    expect(ukAllIn.total).toBe(544.47);
    expect(allInLine(ukAllIn, 0)).toContain('$246 to $460');

    // 8. "Coffin" adds no freight
    const coffinOwed = shippingOwed({
      rules: freightRules,
      lotTitle: 'Coffin #2',
      pageShipping: 4.47,
      hasWinThisShow: false,
      browserZone: 'America/New_York',
    });
    expect(allInPrice(100, coffinOwed, 0).total).toBe(104.47);
    expect(coffinOwed.freightNote).toBeNull();

    // 9. Guard all-in for a Large lot on that show matches the case-pack line's landed math
    const guardAllIn = allInPrice(30, largeOwed, 0);
    const cpView = buildCasePackView({
      showType: 'wholesale',
      lotTitle: 'Large Case Pack 10 pcs #12',
      bid: 30,
      shippingOwed: largeOwed,
      shippingRules: tierRules,
    });
    expect(guardAllIn.total).toBe(44.5);
    expect(cpView?.line).toContain('$4.45 each landed');
  });
});

describe('flip', () => {
  it("takes Whatnot's fees off the resale", () => {
    const f = flipProfit(100, 70);
    expect(f).toMatchObject({ fees: 11.2, net: 88.8, profit: 18.8, margin: 27 });
    expect(flipLine(f)).toBe('Resell ~$100, keep $88.80 after fees: +$18.80 (27%) on $70');
    expect(flipProfit(50, 60).profit).toBe(-15.75);
  });
});

describe('portfolio', () => {
  it('values items at the higher of appraisal and metal at today’s spot, and skips unvalued ones', () => {
    const list = [
      buy({ price: 30, appraisedValue: 35, metal: 'silver', oz: 0.7734 }),
      buy({ price: 20, appraisedValue: 25 }),
      buy({ price: 5 }),
    ];
    const p = portfolioValue(list, { silver: 50 });
    expect(p).toMatchObject({ count: 3, valued: 2, cost: 55, valuedCost: 50, value: 63.67, gain: 13.67 });
  });
});
