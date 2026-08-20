import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p: string[]) => readFileSync(join(web, ...p), 'utf8');
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

const thread = strip(read('features', 'chat', 'components', 'MessageThread.tsx'));
const spotlight = strip(read('features', 'chat', 'components', 'MessageSpotlight.tsx'));
const rules = strip(read('features', 'chat', 'components', 'messageRules.ts'));
const bubble = strip(read('features', 'chat', 'components', 'MessageBody.tsx'));
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

describe('the quick rail and the tray', () => {
  /* IT WAS SIX AND THE ASSERTION SAID SO. Six was never the point — a CLOSED
     SET is, because this field is persisted and broadcast to a whole room, and
     an open one is a text field wearing a smaller name. The rail grew to seven
     when the other message actions left it for a menu; what this now pins is
     that both lists are literals and that neither has become a free field. */
  it('is a closed set of literals, quick rail and tray alike', () => {
    const quick = rules.match(/export const REACTIONS = \[([^\]]*)\]/);
    const tray = rules.match(/export const MORE_REACTIONS = \[([^\]]*)\]/);
    expect(quick).toBeTruthy();
    expect(tray).toBeTruthy();
    expect((quick![1].match(/'/g) ?? []).length / 2).toBe(7);
    expect((tray![1].match(/'/g) ?? []).length / 2).toBeGreaterThan(0);
    // Both end `as const`, so neither can be pushed to at runtime.
    expect(rules).toMatch(/export const REACTIONS = \[[^\]]*\] as const/);
    expect(rules).toMatch(/export const MORE_REACTIONS = \[[\s\S]*?\] as const/);
  });

  it('never offers a keyboard — the plus opens the tray, not a text field', () => {
    // The whole argument for enumerating these lives in the API's DTO. The
    // failure this catches is somebody "improving" the picker into an input.
    expect(spotlight).not.toMatch(/<input/);
    expect(thread).toMatch(/setTray\(\(t\) => !t\)/);
  });

  it('is one per person, so the picker can light the one you chose', () => {
    expect(thread).toMatch(/const myReaction =/);
    // find, not filter: at most one by construction on the server.
    expect(thread).toMatch(/\.find\(\(r\) => r\.userIds\.includes\(currentUserId\)\)/);
  });

  it('clears your reaction by tapping your own chip', () => {
    /* The chips moved to MessageBody when the overlay arrived — it draws an
       inert copy of the same bubble, and the alternative was a second
       hand-written version of one. The gesture is unchanged. */
    expect(bubble).toMatch(/onReact\?\.\(m, isMine \? null : r\.emoji\)/);
  });

  it('draws the overlay copy from the same bubble, with nothing to press', () => {
    // Two live sets of chips for one message is two places to tap for one fact.
    expect(bubble).toMatch(/inert\?: boolean/);
    expect(thread).toMatch(/<MessageBody[\s\S]*?inert/);
  });

  /* WHAT THIS ASSERTION USED TO SAY, AND WHY IT NO LONGER SAYS IT.
     It read "opens in the action bar rather than a second floating row", and
     the reasoning was that the stage is a locked viewport and every floating
     element on it is another thing that can land under a keyboard. The owner
     asked for the WhatsApp gesture — press and hold, the room dims, a rail of
     reactions floats over the message — so the floating row is now the design.

     THE ORIGINAL WORRY IS STILL REAL AND IS WHAT THESE ASSERT INSTEAD: the
     overlay is dismissed by anything that would move the message out from
     under it, so it can never be left stranded over a room that has scrolled
     or resized beneath it — which is the keyboard case, arriving as a resize. */
  it('floats over the message it was opened on, anchored to a measured rect', () => {
    expect(thread).toMatch(/getBoundingClientRect\(\)/);
    expect(spotlight).toMatch(/createPortal\(/);
    expect(spotlight).toMatch(/position: 'fixed'/);
  });

  it('closes on anything that would move the message underneath it', () => {
    expect(thread).toMatch(/addEventListener\('scroll', close/);
    expect(thread).toMatch(/addEventListener\('resize', close\)/);
    expect(thread).toMatch(/useEffect\(\(\) => \{ setSpot\(null\); \}, \[messages\.length\]\)/);
  });

  it('is reached by holding, not by a bar that scrolls with the thread', () => {
    // The pill this replaced lived inside the scroll container and was wider
    // than a phone. Its class name going missing is the point of this line.
    expect(thread).not.toMatch(/className="tc-msg-actions"/);
    expect(thread).toMatch(/onPointerDown=/);
    expect(thread).toMatch(/HOLD_MS/);
    // A scroll is not a press.
    expect(thread).toMatch(/SLOP/);
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
