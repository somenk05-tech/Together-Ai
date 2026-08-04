import type { MailItem } from './api';

/**
 * ONE ROW PER CONVERSATION, NOT PER MESSAGE.
 *
 * Four replies on one trail were four rows, all reading "Re: test 3" from the
 * same person, and the inbox stopped being a list of conversations and became a
 * transcript of events. Every mail client groups; this one has carried the
 * threadId needed to do it since the day threads existed.
 *
 * The newest message represents the group — its time, its snippet, its id for
 * the link (which opens the trail anyway). Unread is ANY unread in the group:
 * a conversation with one thing you have not read is a conversation you have
 * not read. Trash and Failed group too; a failure that happened three times is
 * still one conversation, and the retry acts on the newest attempt.
 */
export interface Convo { head: MailItem; count: number; unread: boolean }

export function groupByThread(rows: MailItem[]): Convo[] {
  const out: Convo[] = [];
  const at = new Map<string, number>();
  for (const m of rows) {
    // A message with no threadId is its own conversation — never a bucket that
    // silently collects every other unthreaded message in the mailbox.
    const key = m.threadId || `id:${m.id}`;
    const seen = at.get(key);
    if (seen === undefined) {
      at.set(key, out.length);
      out.push({ head: m, count: 1, unread: !m.read });
    } else {
      const g = out[seen];
      g.count += 1;
      g.unread = g.unread || !m.read;
    }
  }
  return out;
}

