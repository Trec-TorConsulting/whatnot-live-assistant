import type { Result } from '../shared/messages';
import { mergeOverrides, parseOverrides, type SelectorOverrides } from '../shared/overrides';
import { getItem, setItem } from '../shared/storage';
import { SECOND } from '../shared/time';

export const ALARM_OVERRIDES = 'wn2-overrides';

// The service worker has no DOM, so selectors are syntax-checked by the side panel and again by
// the content script before use; here they're only parsed and merged.
export const refreshOverrides = async (): Promise<Result> => {
  const config = (await getItem('overridesConfig')) ?? { url: '', inline: '' };
  const inline = parseOverrides(config.inline);
  let remote: { value: SelectorOverrides; errors: string[] } = { value: {}, errors: [] };

  if (config.url.trim()) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10 * SECOND);
      const res = await fetch(config.url.trim(), { signal: controller.signal, cache: 'no-store' });
      clearTimeout(timer);
      remote = res.ok ? parseOverrides(await res.text()) : { value: {}, errors: [`Overrides URL returned HTTP ${res.status}`] };
    } catch (err) {
      remote = { value: {}, errors: [`Couldn't fetch overrides URL: ${(err as Error).message}`] };
    }
  }

  const value = mergeOverrides(inline.value, remote.value);
  await setItem('overrides', {
    value,
    source: config.url.trim() ? 'url' : config.inline.trim() ? 'inline' : 'none',
    fetchedAt: Date.now(),
    errors: [...inline.errors.map((e) => `Pasted: ${e}`), ...remote.errors.map((e) => `URL: ${e}`)],
  });
  return inline.errors.length || remote.errors.length ? { ok: false, error: 'Saved with problems; see the list below.' } : { ok: true };
};
