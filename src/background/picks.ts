import type { Result } from '../shared/messages';
import type { ShareTarget } from '../shared/types';
import { getItem, setItem } from '../shared/storage';
import { refreshOverrides } from './overrides';

// Picked buttons are stored as pasted overrides, so they flow through the same validation and
// merging as hand-written ones. Other keys already in the pasted JSON are kept.
const editInline = async (edit: (o: Record<string, unknown>) => void): Promise<Result> => {
  const config = (await getItem('overridesConfig')) ?? { url: '', inline: '' };
  let data: Record<string, unknown> = {};
  try {
    const parsed: unknown = config.inline.trim() ? JSON.parse(config.inline) : {};
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed as Record<string, unknown>;
  } catch {
    return { ok: false, error: 'The pasted overrides in Settings are not valid JSON. Fix or clear them, then pick again.' };
  }
  edit(data);
  await setItem('overridesConfig', { ...config, inline: Object.keys(data).length ? JSON.stringify(data, null, 2) : '' });
  await refreshOverrides();
  return { ok: true };
};

export const savePickedShare = (p: { target: ShareTarget; shareButton: string; targetSelector: string | null }) =>
  editInline((o) => {
    o.shareButton = p.shareButton;
    const targets = { ...((o.shareTargets as Record<string, string> | undefined) ?? {}) };
    if (p.targetSelector) targets[p.target] = p.targetSelector;
    else delete targets[p.target];
    if (Object.keys(targets).length) o.shareTargets = targets;
    else delete o.shareTargets;
  });

export const clearPickedShare = () =>
  editInline((o) => {
    delete o.shareButton;
    delete o.shareTargets;
  });
