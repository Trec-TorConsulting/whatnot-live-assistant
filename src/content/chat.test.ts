import { afterEach, describe, expect, it, vi } from 'vitest';
import { messageView } from './appraisalView';
import { CHAT_MAX, chatLine, pasteToChat } from './chat';
import type { AppraisalView } from './overlay';

const view = (title: string, extra: Partial<AppraisalView> = {}): AppraisalView => ({
  ...messageView('done', title),
  highlight: 'Max bid $42',
  facts: [
    { label: 'Market', value: '$55', detail: 'PCGS price guide' },
    { label: 'Melt', value: '$30.12', detail: '0.773 oz silver each' },
    { label: 'PCGS sales', value: '3 sold $50–$60', detail: null },
  ],
  ...extra,
});

describe('chatLine', () => {
  it('leads with the item, then the max bid and the numbers behind it', () => {
    expect(chatLine(view('1921 Morgan Dollar'))).toBe('1921 Morgan Dollar · Max bid $42 · Market $55 · Melt $30.12');
  });

  it('says when the market value is an AI guess', () => {
    const v = view('Mystery card', { facts: [{ label: 'Market', value: '$20', detail: 'AI guess $15–$25 each' }] });
    expect(chatLine(v)).toBe('Mystery card · Max bid $42 · Market $20 (AI guess)');
  });

  it('stays within the chat limit by shortening the name, counting emoji as Whatnot does', () => {
    const long = `🔥 ${'Huge silver lot with Morgans, Peace dollars and bars '.repeat(4)}`;
    const line = chatLine(view(long));
    expect(line.length).toBeLessThanOrEqual(CHAT_MAX);
    expect(line).toMatch(/… · Max bid \$42 · Market \$55 · Melt \$30\.12$/);
    expect(line.startsWith('🔥')).toBe(true);
  });

  it('drops the least important numbers before cutting the name to nothing', () => {
    const line = chatLine(view('1921 Morgan Dollar MS63 PCGS'), 50);
    expect(line).toBe('1921 Morgan Dollar MS63 PCGS · Max bid $42');
  });

  it("doesn't leave half an emoji at the cut", () => {
    const line = chatLine(messageView('done', `${'a'.repeat(148)}😀😀`));
    expect(line).toBe(`${'a'.repeat(148)}…`);
  });
});

describe('pasteToChat', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('fills the chat box without sending, and copies it too', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 300, height: 40 } as DOMRect);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    document.body.innerHTML = '<form><input data-testid="chat-input" placeholder="Say something..." type="text"></form>';
    const input = document.querySelector('input')!;
    const typed: string[] = [];
    input.addEventListener('input', () => typed.push(input.value));
    const submitted = vi.fn((e: Event) => e.preventDefault());
    input.form!.addEventListener('submit', submitted);

    expect(await pasteToChat('Max bid $42')).toBe('filled');
    expect(typed).toEqual(['Max bid $42']);
    expect(document.activeElement).toBe(input);
    expect(writeText).toHaveBeenCalledWith('Max bid $42');
    expect(submitted).not.toHaveBeenCalled();
  });

  it('falls back to the clipboard when there is no chat box', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true });
    expect(await pasteToChat('Max bid $42')).toBe('copied');
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) }, configurable: true });
    expect(await pasteToChat('Max bid $42')).toBe('failed');
  });
});
