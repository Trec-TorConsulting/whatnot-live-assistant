import { describe, expect, it } from 'vitest';
import { resetDomainRates, scheduleDomain } from './rateGate';

describe('scheduleDomain', () => {
  it('spaces out calls to the same domain by the configured minimum gap', async () => {
    resetDomainRates();
    const times: number[] = [];
    const url = 'https://api.scryfall.com/cards/search?q=lightning+bolt';

    const p1 = scheduleDomain(url, async () => {
      times.push(Date.now());
      return 1;
    });
    const p2 = scheduleDomain(url, async () => {
      times.push(Date.now());
      return 2;
    });

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe(1);
    expect(r2).toBe(2);
    expect(times.length).toBe(2);
    expect(times[1]! - times[0]!).toBeGreaterThanOrEqual(90); // ~100ms min gap
  });

  it('runs calls to different domains without waiting on each other', async () => {
    resetDomainRates();
    const times: Record<string, number> = {};

    const pScryfall = scheduleDomain('https://api.scryfall.com/cards/1', async () => {
      times.scryfall = Date.now();
      return 'scryfall';
    });
    const pPokemon = scheduleDomain('https://api.pokemontcg.io/v2/cards/1', async () => {
      times.pokemon = Date.now();
      return 'pokemon';
    });

    await Promise.all([pScryfall, pPokemon]);
    expect(Math.abs(times.scryfall! - times.pokemon!)).toBeLessThan(50);
  });

  it('continues queue processing even when a previous call fails', async () => {
    resetDomainRates();
    const url = 'https://api.scryfall.com/cards/failing';

    const pFail = scheduleDomain(url, async () => {
      throw new Error('network down');
    });
    const pSucceed = scheduleDomain(url, async () => 'recovered');

    await expect(pFail).rejects.toThrow('network down');
    await expect(pSucceed).resolves.toBe('recovered');
  });
});

