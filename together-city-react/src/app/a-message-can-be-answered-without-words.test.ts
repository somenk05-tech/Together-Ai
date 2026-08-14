import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p: string[]) => readFileSync(join(web, ...p), 'utf8');
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

const thread = strip(read('features', 'chat', 'components', 'MessageThread.tsx'));
const page = strip(read('features', 'chat', 'pages', 'Chats.tsx'));
const types = strip(read('types', 'index.ts'));
const schemas = strip(read('api', 'schemas.ts'));
const api = strip(read('api', 'chat.api.ts'));

/**
 * A MESSAGE CAN BE ANSWERED WITHOUT WORDS.
 *
 * The load-bearing distinction in this feature is that a reaction is SHARED and
 * a star is not, and almost every way of getting it wrong still renders
 * correctly for the person who did the reacting. So the wire shape is pinned
 * here: ids, not a count and a "mine". A per-viewer boolean in a frame that
 * goes to a whole room is wrong for everybody but one of them, and it is wrong
 * silently — the sender sees exactly what they expect.
 */
describe('the wire shape of a reaction', () => {
  it('carries the ids, so one broadcast frame is right for the whole room', () => {
    expect(schemas).toMatch(/reactions: z\.array\(z\.object\(\{ emoji: z\.string\(\), userIds: z\.array\(z\.string\(\)\) \}\)\)/);
    expect(types).toMatch(/reactions\?: Array<\{ emoji: string; userIds: string\[\] \}>/);
    // A `mine` or a bare `count` on the wire would be the defect this exists
    // to prevent.
    expect(schemas).not.toMatch(/reactions:[^;]*z\.object\(\{[^}]*mine/);
  });

  it('is declared in the schema as well as the type, or zod strips it', () => {
    // Quoted replies were lost exactly this way: sent by the server, declared
    // in the type, absent from the schema, gone before the component saw them.
    expect(schemas).toMatch(/reactions:/);
    expect(schemas).toMatch(/pinnedAt:/);
  });

  it('replaces the whole list on a socket frame rather than adding to a count', () => {
    expect(page).toMatch(/WS\.MESSAGE_REACTED/);
    expect(page).toMatch(/setReactionsMap\(\(s\) => \(\{ \.\.\.s, \[messageId\]: reactions \}\)\)/);
  });
});

describe('the six', () => {
  it('is a closed set of exactly six in the client', () => {
    const m = thread.match(/export const REACTIONS = \[([^\]]*)\]/);
    expect(m).toBeTruthy();
    expect((m![1].match(/'/g) ?? []).length / 2).toBe(6);
  });

  it('is one per person, so the picker can light the one you chose', () => {
    expect(thread).toMatch(/const myReaction =/);
    // find, not filter: at most one by construction on the server.
    expect(thread).toMatch(/\.find\(\(r\) => r\.userIds\.includes\(currentUserId\)\)/);
  });

  it('clears your reaction by tapping your own chip', () => {
    expect(thread).toMatch(/onReact\?\.\(m, isMine \? null : r\.emoji\)/);
  });

  it('opens in the action bar rather than a second floating row', () => {
    // The stage is a locked viewport; every extra floating element on it is
    // another thing that can land under a keyboard.
    expect(thread).toMatch(/reactFor === m\.id \?/);
    expect(thread).not.toMatch(/position: 'fixed'[^}]*REACTIONS/);
  });
});

describe('the pin', () => {
  it('is read on its own, because a pinned message is usually older than the page', () => {
    expect(api).toMatch(/pinnedMessage:/);
    expect(api).toMatch(/export function usePinnedMessage/);
    expect(api).toMatch(/queryKey: \['chat', 'pinned', conversationId\]/);
  });

  it('is not optimistic — it changes what the whole room sees', () => {
    expect(page).toMatch(/const pinMessage = useCallback/);
    expect(page).toMatch(/void pinned\.refetch\(\)/);
  });

  it('drops a tombstoned pin from the banner without waiting for a refetch', () => {
    expect(page).toMatch(/pinnedMsg && !tombstoned\.has\(pinnedMsg\.id\)/);
  });

  it('taps through to the message it pinned', () => {
    expect(page).toMatch(/aria-label="Go to the pinned message"/);
    expect(page).toMatch(/void jumpTo\(pinnedMsg\.id\)/);
  });
});

describe('a reaction, unlike a pin, is optimistic', () => {
  it('rolls back to what was there if the write fails', () => {
    expect(page).toMatch(/const reactToMessage = useCallback/);
    expect(page).toMatch(/setReactionsMap\(\(s\) => \(\{ \.\.\.s, \[m\.id\]: before \}\)\)/);
  });

  it('strips you from wherever you were before adding you', () => {
    expect(page).toMatch(/userIds\.filter\(\(id\) => id !== me\)/);
  });
});
