import { describe, expect, it } from 'vitest';
import { dueShows, matchKeywords, mergeWatched, parseShowTime, sanitizeAlertSettings, type WatchedShow } from './alerts';
import { DAY, MINUTE } from './time';

// Monday Oct 26 2026, 3:00 PM local
const now = new Date(2026, 9, 26, 15, 0).getTime();
const at = (y: number, mo: number, d: number, h: number, mi: number) => new Date(y, mo, d, h, mi).getTime();

describe('parseShowTime', () => {
  it.each([
    ['Today 6:30 PM', at(2026, 9, 26, 18, 30)],
    ['Tomorrow 9:00 AM', at(2026, 9, 27, 9, 0)],
    ['Fri 6:30 AM', at(2026, 9, 30, 6, 30)],
    ['Mon 4:00 PM', at(2026, 9, 26, 16, 0)],
    ['Mon 8:00 AM', at(2026, 10, 2, 8, 0)],
    ['Oct 28 6:30 PM', at(2026, 9, 28, 18, 30)],
    ['Mon, Nov 2, 5:00 PM', at(2026, 10, 2, 17, 0)],
    ['Jan 3 1:15 PM', at(2027, 0, 3, 13, 15)],
  ])('%j', (text, expected) => {
    expect(parseShowTime(text, now)).toBe(expected);
  });

  it('returns null without a clock time', () => {
    expect(parseShowTime('Live', now)).toBeNull();
  });
});

describe('matchKeywords', () => {
  it('matches whole words case-insensitively', () => {
    expect(matchKeywords('Silver Eagle giveaway next!', ['silver eagle', 'giveaway', 'gold'])).toEqual(['silver eagle', 'giveaway']);
    expect(matchKeywords('goldfish', ['gold'])).toEqual([]);
  });
});

describe('watched shows', () => {
  const show = (id: string, startsAt: number, notifiedAt: number | null = null): WatchedShow => ({
    liveId: id,
    title: id,
    host: null,
    startsAt,
    notifiedAt,
    seenAt: now,
  });

  it('finds shows starting within the lead time that were not notified', () => {
    const list = [show('soon', now + 5 * MINUTE), show('later', now + 2 * 60 * MINUTE), show('done', now + 5 * MINUTE, now)];
    expect(dueShows(list, now, 10).map((s) => s.liveId)).toEqual(['soon']);
  });

  it('keeps notification state unless the start time moved, and drops old shows', () => {
    const merged = mergeWatched(
      [show('a', now + MINUTE, now), show('old', now - DAY)],
      [
        { liveId: 'a', title: 'a', host: null, startsAt: now + 2 * MINUTE, seenAt: now },
        { liveId: 'b', title: 'b', host: null, startsAt: now + DAY, seenAt: now },
      ],
      now,
    );
    expect(merged.map((s) => [s.liveId, s.notifiedAt])).toEqual([
      ['a', now],
      ['b', null],
    ]);
  });
});

describe('sanitizeAlertSettings', () => {
  it('normalizes keywords and clamps lead time', () => {
    expect(sanitizeAlertSettings({ chatKeywords: [' Gold ', 'gold', 'x'], leadMinutes: 999 })).toMatchObject({
      chatKeywords: ['gold'],
      leadMinutes: 120,
    });
  });
});
