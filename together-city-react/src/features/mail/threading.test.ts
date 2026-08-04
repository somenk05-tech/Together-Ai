import { describe, it, expect } from 'vitest';
import { groupByThread } from './threading';
import type { MailItem } from './api';

/**
 * THE INBOX IS A LIST OF CONVERSATIONS.
 *
 * Four replies on one trail rendered as four rows, all reading "Re: test 3"
 * from the same person, one under the other. The threadId needed to group them
 * has been on every message since threads existed; the list simply never used
 * it.
 */
const msg = (over: Partial<MailItem> & { id: string }): MailItem => ({
  threadId: null, subject: 's', snippet: '', fromName: 'A', fromAddr: 'a@x.com',
  toName: 'B', toAddr: 'b@x.com', read: true, starred: false, system: false, folder: 'inbox',
  sizeBytes: 10, createdAt: '2026-08-04T10:00:00Z', ...over,
} as MailItem);

describe('groupByThread', () => {
  it('collapses a trail into one row and counts it', () => {
    const g = groupByThread([
      msg({ id: '4', threadId: 't1' }), msg({ id: '3', threadId: 't1' }),
      msg({ id: '2', threadId: 't1' }), msg({ id: '1', threadId: 't1' }),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].count).toBe(4);
  });

  it('keeps the NEWEST message as the row — the list arrives newest first', () => {
    const g = groupByThread([msg({ id: 'new', threadId: 't1' }), msg({ id: 'old', threadId: 't1' })]);
    expect(g[0].head.id).toBe('new');
  });

  it('preserves the order the mailbox came in', () => {
    const g = groupByThread([
      msg({ id: 'b', threadId: 't2' }), msg({ id: 'a', threadId: 't1' }), msg({ id: 'a2', threadId: 't1' }),
    ]);
    expect(g.map((x) => x.head.id)).toEqual(['b', 'a']);
  });

  it('marks a conversation unread when ANY message in it is', () => {
    // One thing you have not read makes a conversation you have not read.
    const g = groupByThread([
      msg({ id: '2', threadId: 't1', read: true }), msg({ id: '1', threadId: 't1', read: false }),
    ]);
    expect(g[0].unread).toBe(true);
  });

  it('never lumps unthreaded messages together', () => {
    // Keying on a null threadId would collect every unthreaded message in the
    // mailbox into one row — a far worse bug than the one being fixed.
    const g = groupByThread([msg({ id: '1' }), msg({ id: '2' }), msg({ id: '3' })]);
    expect(g).toHaveLength(3);
    expect(g.every((x) => x.count === 1)).toBe(true);
  });

  it('handles an empty mailbox', () => {
    expect(groupByThread([])).toEqual([]);
  });
});
