import type { SelectorOverrides } from '../shared/overrides';
import { getItem, onItemChanged } from '../shared/storage';

let current: SelectorOverrides = {};

const validSelector = (s: string | undefined) => {
  if (!s) return undefined;
  try {
    document.createDocumentFragment().querySelector(s);
    return s;
  } catch {
    return undefined;
  }
};

const keepValid = (o: SelectorOverrides): SelectorOverrides => ({
  followButton: validSelector(o.followButton),
  showCard: validSelector(o.showCard),
  bookmarkButton: validSelector(o.bookmarkButton),
  shareButton: validSelector(o.shareButton),
  bidButton: validSelector(o.bidButton),
  shareTargets: o.shareTargets && {
    copy: validSelector(o.shareTargets.copy),
    x: validSelector(o.shareTargets.x),
    facebook: validSelector(o.shareTargets.facebook),
  },
  warningPattern: o.warningPattern,
});

export const overrides = () => current;

export const setOverridesForTest = (o: SelectorOverrides) => {
  current = keepValid(o);
};

export const loadOverrides = async () => {
  current = keepValid((await getItem('overrides'))?.value ?? {});
  onItemChanged('overrides', (v) => {
    current = keepValid(v?.value ?? {});
  });
};
