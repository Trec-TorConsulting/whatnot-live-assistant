import { isVisible, textOf } from './dom';
import { overrides } from './overridesState';
import { DIALOGS } from './selectors';

const WARNING_RE =
  /too many (requests|actions|attempts)|slow down|try again later|rate.?limit|temporarily (blocked|restricted|limited|unavailable)|unusual activity|suspicious activity|verify (that )?you.?re (a )?human|are you a robot|captcha|account (has been |is )?(suspended|restricted|limited|banned)|action blocked/i;

const SURFACES = [
  DIALOGS,
  '[role="alert"]',
  '[role="status"]',
  '[aria-live="assertive"]',
  '[aria-live="polite"]',
  '[class*="toast" i]',
  '[class*="snackbar" i]',
].join(', ');

const CHALLENGE_FRAMES = 'iframe[src*="captcha" i], iframe[src*="challenge" i], iframe[title*="captcha" i], iframe[title*="challenge" i]';

const LOGIN_RE = /\b(log ?in|sign ?in|sign ?up|create an account|continue with (google|apple|email|phone))\b/i;

export const findWarning = (): string | null => {
  // Invisible bot-check badges are small; a real challenge is a big visible frame.
  for (const frame of document.querySelectorAll<HTMLIFrameElement>(CHALLENGE_FRAMES)) {
    if (!isVisible(frame)) continue;
    const { width, height } = frame.getBoundingClientRect();
    if (width >= 200 && height >= 200) return 'Human verification challenge';
  }
  const custom = overrides().warningPattern;
  const patterns = custom ? [WARNING_RE, new RegExp(custom, 'i')] : [WARNING_RE];
  for (const el of document.querySelectorAll(SURFACES)) {
    if (!isVisible(el)) continue;
    const text = textOf(el);
    const match = patterns.map((re) => text.match(re)).find(Boolean);
    if (match) {
      const start = Math.max(0, (match.index ?? 0) - 40);
      return text.slice(start, start + 140).trim();
    }
  }
  return null;
};

export const findLoginPrompt = (): boolean => {
  for (const el of document.querySelectorAll(DIALOGS)) {
    if (isVisible(el) && LOGIN_RE.test(textOf(el))) return true;
  }
  return false;
};
