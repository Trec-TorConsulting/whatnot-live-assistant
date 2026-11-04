import { describe, expect, it } from 'vitest';
import { couponsIn, noteForPrompt, readShowNote } from './showNotes';

const LIVE = '0c823c7c-b18a-4826-8656-1cf7cfffa2b7';

describe('show notes', () => {
  it('reads a published note and the coupon written the way Whatnot does', () => {
    const note = readShowNote(
      {
        data: {
          showNotes: [
            {
              id: 'n1',
              isPublished: true,
              liveUuid: LIVE,
              updatedAt: '2026-11-03T15:00:00.000Z',
              content: { text: 'Sudden death. All raw 90% silver.\n/coupon SAVE10\nUse code EXTRA5 on shipping.' },
            },
          ],
        },
      },
      LIVE,
    );
    expect(note?.coupons).toEqual(['SAVE10', 'EXTRA5']);
    expect(note?.text).toContain('Sudden death');
    expect(note?.updatedAt).toBe(Date.parse('2026-11-03T15:00:00.000Z'));
    expect(noteForPrompt(note?.text)).not.toMatch(/SAVE10|EXTRA5/);
    expect(noteForPrompt(note?.text)).toContain('90% silver');
  });

  it('ignores an unpublished note and a note for another show', () => {
    expect(
      readShowNote({ data: { showNotes: [{ isPublished: false, content: { text: 'secret' } }] } }, LIVE),
    ).toBeNull();
    expect(
      readShowNote({ data: { showNotes: [{ isPublished: true, liveUuid: 'other', content: { text: 'nope' } }] } }, LIVE),
    ).toBeNull();
  });

  it('leaves a stored note alone when the response is not show notes', () => {
    expect(readShowNote({ data: { liveStream: { title: 'T' } } }, LIVE)).toBeUndefined();
    expect(readShowNote(null, LIVE)).toBeUndefined();
  });

  it('finds a promo code written out, once', () => {
    expect(couponsIn('promo code: SAVE10 and coupon code SAVE10')).toEqual(['SAVE10']);
  });

  it('drops password and passcode lines, referral codes, and URLs from noteForPrompt while keeping the rest', () => {
    const raw = [
      'No cancellations. All devices tested.',
      'Some devices may have a password — just use “revolt”',
      'Use my code 83QT8R at https://whatnot.com/invite/voltage',
      '1-Year Warranty included.',
    ].join('\n');
    const prompt = noteForPrompt(raw);
    expect(prompt).not.toContain('revolt');
    expect(prompt).not.toContain('password');
    expect(prompt).not.toContain('83QT8R');
    expect(prompt).not.toContain('https://whatnot.com/invite/voltage');
    expect(prompt).toContain('No cancellations. All devices tested.');
    expect(prompt).toContain('1-Year Warranty included.');
  });
});
