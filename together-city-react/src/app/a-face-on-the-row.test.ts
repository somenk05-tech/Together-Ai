import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
/** Comments stripped, so the absence checks read code and not the essay above it. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

/**
 * ── A FACE ON THE ROW ───────────────────────────────────────────────────────
 *
 * The owner, 16 Aug: real pictures in the chats list, not initials — and a way
 * to change the picture there that does not touch the platform profile photo.
 *
 * The three things worth pinning are the three that would quietly undo it:
 *
 *   1. THE FACES RIDING IN THE POLLED PAYLOAD. /chat/conversations refetches
 *      every fifteen seconds; `profileImage` is a data: URL. Somebody adding
 *      `photo` to ConversationSchema to "save a request" would re-download
 *      every face four times a minute, and nothing would look wrong.
 *   2. THE PICKER MOVING INSIDE THE ROW'S OPEN BUTTON. A button inside a button
 *      is invalid and browsers resolve it by guessing — remove-chat-not-delete
 *      already guards that shape for the bin, and the picker joins it.
 *   3. THE PROMISE GOING UNSAID. A control that might be editing somebody
 *      else's profile photo is one nobody presses. The panel says whose picture
 *      it is and what it does not touch, in the citizen's own words.
 */
describe('a face on the row', () => {
  const list = code('features/chat/components/ConversationList.tsx');
  const chats = code('features/chat/pages/Chats.tsx');
  const api = code('api/chat.api.ts');
  const schemas = code('api/schemas.ts');
  const relief = read('styles/relief.css');

  it('draws the photo when there is one, and keeps initials as the fallback', () => {
    expect(list).toMatch(/\{photo\s*\n?\s*\?\s*<img className="no-case" src=\{photo\}/);
    expect(list).toMatch(/: c\.anonymous \? '🎭' : initials\(title\)\}/);
    // The disc clips a square JPEG into a circle; without this the photo is a
    // square sitting where a round avatar was.
    expect(relief).toMatch(/\.csav \{ overflow: hidden; \}/);
    expect(relief).toMatch(/\.csav img \{[^}]*object-fit: cover/);
  });

  it('keeps the faces out of the fifteen-second poll', () => {
    // A separate, cached call. The conversation list stays ids and counts.
    expect(api).toMatch(/queryKey: \['chat', 'roster'\]/);
    expect(api).toMatch(/staleTime: 5 \* 60_000/);
    expect(api).not.toMatch(/queryKey: \['chat', 'roster'\][\s\S]{0,200}refetchInterval/);
    // …and nothing put a picture into the polled schema.
    const conv = schemas.match(/ConversationSchema = z\.object\(\{[\s\S]*?\}\)/)?.[0] ?? '';
    expect(conv).not.toMatch(/photo|profileImage|avatar/);
  });

  it('never nests the picker inside the row’s open button', () => {
    const open = list.indexOf('className="csopen"');
    const closeOpen = list.indexOf('</button>', open);
    expect(open).toBeGreaterThan(-1);
    expect(list.slice(open, closeOpen)).not.toMatch(/<button/);
    // The picker is a sibling, after the open button closes — the same shape
    // the remove control has for the same reason.
    expect(list.indexOf('cspic')).toBeGreaterThan(closeOpen);
  });

  it('says whose picture it is, and what it does not touch', () => {
    expect(list).toMatch(/Only you see it, and it\s*\n?\s*changes nothing about their own profile/);
    expect(list).toMatch(/title="Change the picture — only you see it"/);
    // Taking it off is offered only when there is something to take off.
    expect(list).toMatch(/\{face\?\.mine && \(/);
    expect(list).toMatch(/Use their own photo/);
  });

  it('does not draw an anonymous match’s face, whatever arrives', () => {
    // The server already withholds it; this is the second lock, on the surface
    // that would do the drawing.
    expect(list).toMatch(/c\.anonymous && !face\?\.mine \? null : face\?\.photo \?\? null/);
  });

  it('crops through the one shared resizer rather than a second copy', () => {
    expect(list).toMatch(/import \{ resizeAvatar \} from '@\/lib\/resizeAvatar'/);
    expect(code('features/profile/pages/Profile.tsx')).toMatch(/import \{ resizeAvatar \} from '@\/lib\/resizeAvatar'/);
    // The profile page's own copy is gone — two crops are two crops that drift.
    expect(code('features/profile/pages/Profile.tsx')).not.toMatch(/function resizeAvatar\(/);
  });

  it('writes the change straight into the cache instead of invalidating it', () => {
    // A face that blinks back to initials while a refetch lands reads as the
    // change having failed.
    expect(api).toMatch(/qc\.setQueryData<ChatRosterRow\[\]>\(\['chat', 'roster'\]/);
    expect(chats).toMatch(/useChatRoster\(\)/);
    expect(chats).toMatch(/setPhoto\.mutate\(\{ conversationId: id, photo \}\)/);
  });
});
