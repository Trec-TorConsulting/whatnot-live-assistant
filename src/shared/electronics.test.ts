import { describe, expect, it } from 'vitest';
import {
  buildElectronicsView,
  conditionLabel,
  electronicsPassOn,
  electronicsPinFrom,
  electronicsRules,
  electronicsRulesText,
  electronicsWantFrom,
  electronicsWantMatches,
  isGenericDeviceClass,
  isPullBucket,
  lotNumber,
  missingAccessory,
  pullTier,
  readCondition,
  readMsrp,
  retailMismatch,
  shippingCallout,
  stripMsrp,
  suddenDeathOn,
} from './electronics';

describe('electronics pass and pull buckets', () => {
  it('recognizes pull buckets, generic device classes, lot numbers, and tiers', () => {
    expect(isPullBucket('1. XS-XSMALL PULL')).toBe(true);
    expect(isPullBucket('Large')).toBe(true);
    expect(isPullBucket('Medium Pallet Pull (1-2LB)')).toBe(true);
    expect(pullTier('Medium Pallet Pull (1-2LB)')).toBe('1-2 lb');
    expect(isPullBucket('No Risk Pallet Pulls (ABC LARGE)')).toBe(true);
    expect(isPullBucket('ELECTRONIC AS SHOWN')).toBe(true);
    expect(isPullBucket('SMALL Random Item #202')).toBe(true);
    expect(lotNumber('SMALL Random Item #202')).toBe(202);
    expect(pullTier('SMALL Random Item #202')).toBe('small');
    expect(isPullBucket('APPLE IPAD')).toBe(true);
    expect(isGenericDeviceClass('APPLE IPAD')).toBe(true);
    expect(isPullBucket('Android Smartphone (not a Samsung)')).toBe(true);
    expect(isGenericDeviceClass('Android Smartphone (not a Samsung)')).toBe(true);
  });

  it('keeps specific models out of pull buckets', () => {
    expect(isPullBucket('2020 Apple MacBook Air Laptop Apple M1 Chip (USED)')).toBe(false);
    expect(isPullBucket('XGIMI MoGo Pro+')).toBe(false);
  });

  it('turns the pass off on a coin show that mentions a phone, and on for Everyday Electronics', () => {
    expect(
      electronicsPassOn({
        showTitle: 'Silver coins — put your phone down!',
        lotTitle: '1921 Morgan dollar',
        categories: ['Coins & Money'],
      }),
    ).toBe(false);
    expect(
      electronicsPassOn({
        showTitle: 'Late night tech',
        categories: ['Everyday Electronics'],
      }),
    ).toBe(true);
  });
});

describe('condition, MSRP, rules, sudden death, shipping, pins, and wants', () => {
  it('reads listing condition and lets a for-parts subtitle win over a Certified Refurbished tag', () => {
    expect(
      readCondition('For parts, not fully functioning, or untested', 'Mystery Box #8', ['Certified Refurbished']),
    ).toBe('for-parts');
    expect(
      conditionLabel('For parts, not fully functioning, or untested', 'Mystery Box #8', ['Certified Refurbished']),
    ).toBe('For parts or untested');
    expect(readCondition('Open-box', 'XGIMI MoGo Pro+')).toBe('open-box');
    expect(conditionLabel('Open-box', 'XGIMI MoGo Pro+')).toBe('Open-box');
  });

  it('extracts stated MSRP and strips the retail clause from the item name', () => {
    const viaim = readMsrp('($200 Retail) Viaim Black RecDot AI Voice Recorder Earbuds');
    expect(viaim).toEqual({
      msrp: 200,
      cleanTitle: 'Viaim Black RecDot AI Voice Recorder Earbuds',
    });
    const ecovacs = readMsrp('$349 • ECOVACS Winbot Window Cleaning Robot');
    expect(ecovacs).toEqual({
      msrp: 349,
      cleanTitle: 'ECOVACS Winbot Window Cleaning Robot',
    });
    expect(stripMsrp('MSRP $140 ARZOPA 17.3 portable monitor')).toBe('ARZOPA 17.3 portable monitor');
  });

  it('reads region, device-specific charger rules, bundle cap, and sudden death', () => {
    const notes = 'No shipping to Canada. Laptops come with chargers, phones and tablets do not. Bundle shipping up to 6 items.';
    const phoneRules = electronicsRules(notes, 'iPhone 13 128GB');
    expect(phoneRules).toContain('No Canada shipping');
    expect(phoneRules).toContain('No charger included');
    expect(phoneRules).toContain('Bundle cap: 6');

    const laptopRules = electronicsRules(notes, '2020 Apple MacBook Air Laptop');
    expect(laptopRules).toContain('No Canada shipping');
    expect(laptopRules).toContain('Charger included');
    expect(laptopRules).not.toContain('No charger included');
    expect(electronicsRulesText(notes, '2020 Apple MacBook Air Laptop')).toContain('Bundle cap: 6');

    expect(suddenDeathOn(['Everyday Electronics', 'Sudden Death'])).toBe(true);
    expect(suddenDeathOn(['Everyday Electronics'])).toBe(false);
  });

  it('calls out high shipping on a pull start and clears it after a paid win', () => {
    expect(shippingCallout(11.05, null, 1, false)).toMatch(/at least half/);
    expect(shippingCallout(11.05, null, 1, true)).toBeNull();
  });

  it('keeps electronics buyer wants, drops cellphone solicitations, and pins mod identifications', () => {
    expect(electronicsWantFrom('any optiplex?')).toBe('any optiplex?');
    expect(electronicsWantFrom('GoPro')).toBe('GoPro');
    expect(electronicsWantFrom('Text my cellphone number 555-234-5678')).toBeNull();
    expect(electronicsWantFrom('What is your phone number?')).toBeNull();
    expect(electronicsWantMatches('any optiplex?', 'Dell OptiPlex 7050 Micro')).toBe(true);

    expect(electronicsPinFrom('Apple AirPods Pro 1', false, true)).toBe('Apple AirPods Pro 1');
    expect(electronicsPinFrom('👑👑🔥', false, true)).toBeNull();
    expect(electronicsPinFrom('Apple AirPods Pro 1', false, false)).toBeNull();
  });

  it('reads extended MSRP forms, leading (X), notes retail mismatch, missing accessories, promises, and extra pull shapes', () => {
    const mil = readMsrp('(RETAIL26.00)Milwaukee Red Helix Drill Bit Set');
    expect(mil).toEqual({
      msrp: 26,
      cleanTitle: 'Milwaukee Red Helix Drill Bit Set',
    });
    expect(stripMsrp('(X) (Retail 39.99) Anker Charger')).toBe('Anker Charger');

    const boku = readMsrp('BOKU $1999 DRONE WITH SCREEN');
    expect(boku).toEqual({
      msrp: 1999,
      cleanTitle: 'BOKU DRONE WITH SCREEN',
    });

    const val58 = readMsrp('$58 value! Bluetooth Speaker');
    expect(val58?.msrp).toBe(58);

    const mismatch = retailMismatch(
      'Audien ION Rechargeable Hearing Aids MSRP $489',
      'ION — Retail $295\nAtom Pro 2 — Retail $289',
    );
    expect(mismatch).toEqual({
      titleRetail: 489,
      notesRetail: 295,
      model: 'ION',
    });
    const view = buildElectronicsView({
      lotTitle: 'Audien ION Rechargeable Hearing Aids MSRP $489',
      notes: 'ION — Retail $295',
      categories: ['Everyday Electronics'],
    });
    expect(view?.msrp).toContain('$489');
    expect(view?.msrp).toContain('$295');
    expect(view?.msrp).toMatch(/stated retail/i);

    expect(missingAccessory('*NO CHARGER* Samsung 500C Chromebook 4GB 16GB Black')).toBe('No charger');

    const rules = electronicsRules(
      'No cancellations. 1-Year Warranty. 45-Day Return Policy. Everything is fully unlocked and chargers are listed separately in Buy It Now.',
      'iPhone 13 128GB',
    );
    expect(rules).toContain('No returns or cancellations');
    expect(rules).toContain('1-year warranty');
    expect(rules).toContain('45-day return window');
    expect(rules).toContain('Fully unlocked');
    expect(rules).toContain('Charger sold separately');

    expect(isPullBucket('10-14')).toBe(true);
    expect(pullTier('10-14')).toBe('10-14');
    expect(
      electronicsPassOn({
        lotTitle: '10-14',
        categories: ['Pallet Pulls'],
      }),
    ).toBe(true);

    expect(isPullBucket('HD TOOLS & MORE (NO CANCELLATIONS) #44', 'HD TOOLS & MORE')).toBe(true);
    expect(isPullBucket('Batteries (2)')).toBe(true);
    expect(isPullBucket('Chargers')).toBe(true);
    expect(isPullBucket('Small item')).toBe(true);
  });
});
