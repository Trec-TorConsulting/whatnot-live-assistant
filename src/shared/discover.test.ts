import { describe, expect, it } from 'vitest';
import { parseWatchlist } from './buyer';
import { bestTimeLine, bestTimes, matchShows, mergeShowMatches } from './discover';
import type { SoldItem } from './soldHistory';

describe('show search', () => {
  it('matches show titles and hosts against your words', () => {
    const shows = [
      { liveId: 'a', title: "Nick's $1 Start Coin Auctions", host: 'bidkdc', startsAt: null },
      { liveId: 'b', title: 'MORGAN NIGHT', host: 'x', startsAt: 5 },
      { liveId: 'c', title: 'Pokemon packs', host: 'y', startsAt: 6 },
    ];
    const hits = matchShows(shows, ['morgan', 'bidkdc'], 1);
    expect(hits.map((h) => [h.liveId, h.keyword])).toEqual([
      ['a', 'bidkdc'],
      ['b', 'morgan'],
    ]);
    const now = 10 * 60 * 60 * 1000;
    expect(mergeShowMatches([{ ...hits[1]!, startsAt: 1 }], hits, now).map((m) => m.liveId)).toEqual([]);
    const upcoming = hits.map((h) => ({ ...h, seenAt: now, startsAt: h.startsAt === null ? null : now + 1000 }));
    expect(mergeShowMatches([], upcoming, now).map((m) => m.liveId)).toEqual(['a', 'b']);
  });
});

describe('best time to buy', () => {
  it('finds the weekday or time of day a watchlist item sells cheapest, with enough sales', () => {
    const at = (day: number, hour: number) => new Date(2026, 9, 25 + day, hour).getTime();
    const sold: SoldItem[] = [
      ...[0, 1, 2].map((i) => ({ key: `n${i}`, at: at(i, 23), liveId: 's', showTitle: null, title: '1921 Morgan Dollar', price: 25 })),
      ...[0, 1, 2, 3, 4, 5].map((i) => ({ key: `d${i}`, at: at(i, 19), liveId: 's', showTitle: null, title: '1921 Morgan Dollar', price: 40 })),
    ];
    const [b] = bestTimes(sold, parseWatchlist('1921 morgan $45'));
    expect(b).toMatchObject({ bucket: 'late night', bucketMedian: 25, overall: 40, sales: 9 });
    expect(bestTimeLine(b!)).toBe('1921 morgan $45: cheapest in the late night, median $25 vs $40 overall (3 of 9 sales)');
    expect(bestTimes(sold.slice(0, 5), parseWatchlist('1921 morgan'))).toEqual([]);
  });
});
