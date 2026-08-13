import { describe, it, expect } from 'vitest';
import { expandedByDefault, newestId, previewOf, type TrailEntry } from './collapse';

/**
 * A TRAIL OPENS ON WHAT HAS NOT BEEN READ, AND FOLDS WHAT HAS.
 *
 * The rule is small and the failure modes are not: fold the message somebody
 * just clicked and the app hides the thing they asked for; fold an unread one
 * and a thread can swallow words nobody ever saw.
 */
const at = (id: string, over: Partial<TrailEntry> = {}): TrailEntry => ({
  id, read: true, createdAt: `2026-08-04T1${id}:00:00Z`, ...over,
});

describe('what opens itself', () => {
  it('a lone message is not a trail — it opens', () => {
    expect([...expandedByDefault([at('0', { read: true })])]).toEqual(['0']);
  });

  it('the newest opens, the read ones behind it fold', () => {
    const open = expandedByDefault([at('0'), at('1'), at('2')]);
    expect(open.has('2')).toBe(true);
    expect(open.has('1')).toBe(false);
    expect(open.has('0')).toBe(false);
  });

  it('the message the citizen clicked stays open, however old', () => {
    const open = expandedByDefault([at('0'), at('1'), at('2')], '0');
    expect(open.has('0')).toBe(true);
    expect(open.has('2')).toBe(true); // …and the newest still does too
    expect(open.has('1')).toBe(false);
  });

  it('an unread message is never folded away', () => {
    const open = expandedByDefault([at('0', { read: false }), at('1'), at('2')]);
    expect(open.has('0')).toBe(true);
  });

  it('an id that is not in this trail opens nothing extra', () => {
    const open = expandedByDefault([at('0'), at('1')], 'from-another-thread');
    expect([...open]).toEqual(['1']);
  });

  it('newest is by TIME, not by array position', () => {
    const trail = [
      { id: 'late', read: true, createdAt: '2026-08-04T18:00:00Z' },
      { id: 'early', read: true, createdAt: '2026-08-04T09:00:00Z' },
    ];
    expect(newestId(trail)).toBe('late');
    expect(expandedByDefault(trail).has('late')).toBe(true);
  });

  it('equal timestamps keep the order the server sent', () => {
    const same = '2026-08-04T10:00:00Z';
    expect(newestId([{ id: 'a', read: true, createdAt: same }, { id: 'b', read: true, createdAt: same }])).toBe('b');
  });

  it('an unreadable timestamp does not lose the message', () => {
    expect(newestId([{ id: 'a', read: true, createdAt: 'not-a-date' }])).toBe('a');
    expect(newestId([])).toBeNull();
  });
});

describe('the folded line', () => {
  it('is the first thing actually written', () => {
    expect(previewOf('\n\n  hello how are you ?  \n\nRegards\nSomen')).toBe('hello how are you ?');
  });

  it('truncates with an ellipsis rather than running under the date', () => {
    const long = 'x'.repeat(200);
    const out = previewOf(long, 20);
    expect(out).toHaveLength(20);
    expect(out.endsWith('…')).toBe(true);
  });

  it('an empty body says it is empty, rather than drawing a void', () => {
    // This asserted '' until 14 Aug, and '' is what put eight rows in one
    // mailbox that were a name, a date and nothing — indistinguishable from a
    // row still loading, and from a bug. Empty messages are refused at the
    // composer now; the ones already sent still have to render as something
    // honest.
    expect(previewOf('')).toBe('(no text)');
    expect(previewOf('   \n  \n')).toBe('(no text)');
  });
});
