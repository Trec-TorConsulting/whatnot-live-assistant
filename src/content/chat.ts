// Puts the appraisal into Whatnot's chat box for you to send. It never presses send itself.
import { normalize, setReactValue } from './dom';
import type { AppraisalView } from './overlay';
import { findChatInput } from './selectors';

// Whatnot's counter turns red past 150 and counts UTF-16 units, so an emoji uses 2.
export const CHAT_MAX = 150;
const SEP = ' · ';
const MIN_TITLE = 24;
const CHAT_FACTS = ['Total', 'Market', 'Melt', 'Whatnot sold'];

const clip = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1).replace(/[\uD800-\uDBFF]$/, '')}…`);

// The max bid and the numbers behind it matter more than the full name, so the name is what gets
// shortened. An AI-guessed market value says so.
export const chatLine = (v: AppraisalView, max = CHAT_MAX) => {
  const title = normalize(v.title);
  const facts = CHAT_FACTS.flatMap((label) => {
    const f = v.facts.find((x) => x.label === label);
    if (!f) return [];
    return [`${label} ${normalize(f.value)}${label === 'Market' && f.detail?.startsWith('AI guess') ? ' (AI guess)' : ''}`];
  });
  const tail = [v.highlight ? normalize(v.highlight) : null, ...facts].filter((p): p is string => Boolean(p));
  while (tail.length) {
    const rest = tail.join(SEP);
    const room = max - rest.length - SEP.length;
    if (room >= Math.min(MIN_TITLE, title.length)) return `${clip(title, room)}${SEP}${rest}`;
    tail.pop();
  }
  return clip(title, max);
};

export type ChatResult = 'filled' | 'copied' | 'failed';

export const pasteToChat = async (text: string): Promise<ChatResult> => {
  const input = findChatInput();
  if (input) setReactValue(input, text);
  const copied = await navigator.clipboard?.writeText(text).then(
    () => true,
    () => false,
  );
  return input ? 'filled' : copied ? 'copied' : 'failed';
};
