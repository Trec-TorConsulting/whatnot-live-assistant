import { describe, expect, it } from 'vitest';
import {
  hasIncludedCharger,
  kitStatusLabel,
  readAmpHours,
  readKitStatus,
  readPartNumber,
  readPlatform,
  toolsLine,
  toolsPassOn,
  toolWantFrom,
  toolWantMatches,
} from './tools';

describe('toolsPassOn', () => {
  it('turns on when categories are Tools and Milwaukee Tools', () => {
    expect(
      toolsPassOn({
        categories: ['Tools', 'Milwaukee Tools'],
      }),
    ).toBe(true);
  });

  it('stays off on an electronics show even if one row is a cordless drill kit', () => {
    expect(
      toolsPassOn({
        showType: 'electronics',
        lotTitle: 'DeWalt 20V MAX Cordless Drill Kit',
      }),
    ).toBe(false);
    expect(
      toolsPassOn({
        categories: ['Everyday Electronics'],
        lotTitle: 'DeWalt 20V MAX Cordless Drill Kit',
      }),
    ).toBe(false);
  });
});

describe('readPlatform, readKitStatus, readAmpHours, and readPartNumber', () => {
  it('reads M18 FUEL and tool-only from "$299 MSRP! M18 FUEL 18V 16 in. Brushless String Trimmer (Tool-Only)"', () => {
    const title = '$299 MSRP! M18 FUEL 18V 16 in. Brushless String Trimmer (Tool-Only)';
    expect(readPlatform(title)).toBe('M18 FUEL');
    expect(readKitStatus(title)).toBe('tool-only');
  });

  it('reads tool-only when part number ends in -20', () => {
    const title = '$329 M18 FUEL 5 in. Flathead Braking Grinder 2886-20';
    expect(readPlatform(title)).toBe('M18 FUEL');
    expect(readKitStatus(title)).toBe('tool-only');
    expect(readPartNumber(title)).toBe('2886-20');
    const line = toolsLine(title, null, 1, 9.21);
    expect(line).toContain('M18 FUEL');
    expect(line).toContain('tool-only');
    expect(line).toContain('2886-20');
  });

  it('reads kit from "2457-21 3/8-in Cordless M12 Lithium-Ion Ratchet Kit"', () => {
    const title = '2457-21 3/8-in Cordless M12 Lithium-Ion Ratchet Kit';
    expect(readPlatform(title)).toBe('M12');
    expect(readKitStatus(title)).toBe('kit');
    expect(readPartNumber(title)).toBe('2457-21');
  });

  it('says not stated for "Milwaukee M12 Fuel Hammer Drill #3" with no part number or kit wording', () => {
    const title = 'Milwaukee M12 Fuel Hammer Drill #3';
    expect(readPlatform(title)).toBe('M12 FUEL');
    expect(readKitStatus(title)).toBe('not-stated');
    expect(kitStatusLabel(readKitStatus(title))).toBe('tool-only or kit not stated');
    expect(toolsLine(title)).toContain('tool-only or kit not stated');
  });

  it('does not infer a platform from brand alone on "Milwaukee 7 inch straight jaw pliers"', () => {
    const title = 'Milwaukee 7 inch straight jaw pliers';
    expect(readPlatform(title)).toBeNull();
    expect(readKitStatus(title)).toBeNull();
  });

  it('reads M12, 3.0 Ah, and a charger from "MSRP $148 Milwaukee M12 3.0 battery And M12 Charger"', () => {
    const title = 'MSRP $148 Milwaukee M12 3.0 battery And M12 Charger';
    expect(readPlatform(title)).toBe('M12');
    expect(readAmpHours(title)).toBe('3.0 Ah');
    expect(hasIncludedCharger(title)).toBe(true);
    const line = toolsLine(title);
    expect(line).toContain('M12');
    expect(line).toContain('3.0 Ah');
    expect(line).toContain('charger');
  });

  it('reads part number from description when title is a string trimmer and description is "3046-20"', () => {
    expect(readPartNumber('Brushless String Trimmer', '3046-20')).toBe('3046-20');
    expect(readPartNumber('Brushless String Trimmer', 'K135')).toBeNull();
  });
});

describe('toolWantFrom and toolWantMatches', () => {
  it('captures a part number ask "3049-20?" and matches a later 3049-20 shop row', () => {
    const want = toolWantFrom('3049-20?');
    expect(want).toBe('3049-20?');
    expect(toolWantMatches(want!, 'M18 FUEL Polisher', '3049-20')).toBe(true);
    expect(toolWantMatches(want!, 'M18 FUEL Grinder 2886-20')).toBe(false);
  });

  it('captures a platform + tool ask "M18 sawzall?" and matches an M18 SAWZALL lot', () => {
    const want = toolWantFrom('M18 sawzall?');
    expect(want).toBe('M18 sawzall?');
    expect(toolWantMatches(want!, 'Milwaukee M18 SAWZALL Reciprocating Saw')).toBe(true);
    expect(toolWantMatches(want!, 'Milwaukee M12 HACKZALL Reciprocating Saw')).toBe(false);
  });
});
