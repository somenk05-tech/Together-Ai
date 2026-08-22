import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
/** Anything that bans a STRING is run against the code with the comments taken
 *  out — `the-day-is-kept` earned this rule: a file that explains why a thing
 *  was removed must not fail the guard that removed it. */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

/**
 * ONE MIRA, ONE ROOM, AND A DOOR ON EVERY PAGE.
 *
 * The two chips are gone. They asked the citizen to classify their own
 * sentence before typing it — companion or operator — and then split their
 * history down the middle on the strength of that guess. On 22 Aug both rooms
 * were asked "tell me a meal i can eat today" and both failed, differently in
 * tone and identically in substance, which is what settled it.
 *
 * The register is now inferred per turn on the server and it fails toward
 * listening. Nothing on this screen chooses it.
 *
 * And her mark floats on every page: a press pops the chat up over whatever
 * the citizen is doing, with the page sent along so "what is this?" means
 * THIS page.
 */
describe('Mira is one room', () => {
  const thread = read('features/chat/mira/MiraThread.tsx');
  const api = read('features/chat/mira/api.ts');

  it('the thread follows the account — one conversation on every device', () => {
    // The server record (her memory) is now also the screen's source. The
    // device day-store remains the offline fallback, never the truth.
    expect(api).toMatch(/apiGet\('\/mira\/thread'/);
    expect(thread).toMatch(/useMiraThread\(mode\)/);
    // Hydrate once per room, and never over a conversation in progress.
    expect(thread).toMatch(/hydrated\.current\[mode\]/);
    // PER ROOM, both of them. `spoke` was one flag for two rooms, so one
    // sentence to the friend stopped the city assistant ever hydrating again
    // in that session — the exact opposite of what this block is guarding.
    expect(thread).toMatch(/spoke\.current\[mode\] = true/);
    // And the record ARRIVES rather than replacing: hydration used to drop
    // every `goto` and wipe the welcome bubble it could never restore.
    expect(thread).toMatch(/merge\(mine, kept\)/);
    // Clearing marks the moment on THIS device; hydration shows only what
    // came after, so a cleared screen does not resurrect on the next open.
    // The marker is still WRITTEN under the register's name, and it is now
    // READ as the later of the two — see the merge case further down.
    expect(thread).toMatch(/mira\.cleared\.\$\{mode\}/);
    expect(thread).toMatch(/clearedAt\(\)/);
  });

  it('her room carries its own way back when it is the whole screen', () => {
    // On a phone the chat page shows one room at a time, and her room
    // replaces the thread header — the one place the back arrow lived. So
    // she carries her own, and only where somebody can actually be stuck:
    // the phone's chat page. The dock keeps its own close instead.
    expect(thread).toMatch(/onBack\?: \(\) => void/);
    expect(thread).toMatch(/aria-label="Back to chats"/);
    const chats = read('features/chat/pages/Chats.tsx');
    expect(chats).toMatch(/<MiraThread onBack=\{phone \? \(\) => setActiveId\(undefined\) : undefined\} \/>/);
    const dockSrc = read('layouts/MiraDock.tsx');
    expect(dockSrc).not.toMatch(/onBack/);
  });

  it('offers no choice at all, because there is nothing to choose between', () => {
    const code = strip(thread);
    expect(code).not.toMatch(/>\s*City assistant\s*</);
    expect(code).not.toMatch(/role="tab(list)?"/);
    expect(code).not.toMatch(/aria-selected/);
    // The preference is not written any more. `MODE_KEY` and `storedMode` stay
    // readable — `mira.mode` is still in people's browsers and this is where
    // somebody will come looking for it — but nothing sets it.
    expect(code).not.toMatch(/localStorage\.setItem\(MODE_KEY/);
    expect(code).not.toMatch(/setMode\(/);
    // And one composer prompt, not one per room: two placeholders asked the
    // citizen the same sorting question the chips did.
    expect(thread).toMatch(/placeholder="Talk to me…"/);
    expect(code).not.toMatch(/placeholder=\{mode ===/);
  });

  it('the back arrow survives — it is the only way out of a full-screen room', () => {
    expect(thread).toMatch(/aria-label="Back to chats"/);
  });

  it('mode still rides the wire, and the server ignores it', () => {
    // KEPT ON PURPOSE. A field removed from the DTO is a 400 for every client
    // that has not shipped yet, so it is still sent and still accepted — see
    // the schema comment in mira.controller.ts. It is a constant here.
    expect(thread).toMatch(/mode, page: about/);
    expect(thread).toMatch(/const mode = ROOM;/);
    expect(api).toMatch(/mode: input\.mode/);
    expect(api).toMatch(/page: input\.page/);
  });

  it('the friend introduces herself once, and the assistant keeps the rundown', () => {
    // HER HELLO IS A HELLO. It was the owner's twenty-three-line welcome, and
    // what was in it is why this assertion changed: the message quota in the
    // second sentence, a privacy-framework paragraph in her mouth, and a
    // promise ("you don't have to figure out which version of me you need")
    // rendered directly under two chips that force exactly that choice. The
    // quota is a fact about the meter and is stated with the meter; the
    // privacy sentence belongs to the product, not to her.
    expect(thread).toMatch(/Hey\. I’m Mira\./);
    expect(strip(thread)).not.toMatch(/200 free messages/);
    expect(strip(thread)).not.toMatch(/privacy framework/i);
    // AND THIS SENTENCE CAME BACK. It was cut because two chips four
    // centimetres above it made it false. There are no chips, so it is true.
    expect(thread).toMatch(/which version of me you need/);
    // The capability rundown was the CITY tab's empty state and the friend
    // never got it. Everybody gets it now: it is the honest version of what
    // the chips were doing — telling you what happens to what you say.
    expect(thread).toMatch(/mira\.welcomed/);
    expect(thread).toMatch(/if \(turns\.length > 0\) return turns;/);
    expect(strip(thread)).not.toMatch(/mode === 'city' &&/);
    expect(thread).toMatch(/<p className="miraopentext">/);
    // The welcome arrives with real line breaks, and the bubble keeps them.
    const css = read('styles/mira.css');
    expect(css).toMatch(/\.mirabub \{[^}]*white-space: pre-wrap/);
  });

  it('one thread, and the split day is folded back into it once', () => {
    const day = read('features/chat/mira/day.ts');
    // Every day is under the ORIGINAL key again — where the conversations
    // that predate the split have been the whole time.
    expect(day).toMatch(/s\.getItem\(KEY\)/);
    // THE PARAMETER IS GONE, NOT IGNORED. `_room` kept "for the call sites" is
    // a signature that lies about what the function does — and eslint said so
    // before a reader had to.
    expect(day).not.toMatch(/_room/);
    expect(strip(thread)).not.toMatch(/_room/);
    // The friend's key is not written any more; it is READ once, folded in,
    // and removed. Throwing half a conversation away on the morning of the
    // merge was the alternative.
    expect(day).toMatch(/function foldFriendIn/);
    expect(day).toMatch(/removeItem\(FRIEND_KEY\)/);
    expect(day).toMatch(/foldFriendIn\(s, at\)/);
    // There is nothing to switch to, so nothing swaps the thread.
    expect(strip(thread)).not.toMatch(/pickMode/);
    expect(thread).toMatch(/saveDay\(turns\)/);
    expect(thread).toMatch(/clearDay\(\); setTurns\(\[\]\)/);
    // Forget today forgets today. With one thread on screen, leaving the other
    // room's turns standing would leave visible turns after the press.
    expect(day).toMatch(/s\.removeItem\(KEY\);/);
  });

  it('a clear pressed in either old room still holds after the merge', () => {
    // `mira.cleared.friend` and `mira.cleared.city` were per room. Hydration
    // now takes the later of the two, or the merge resurrects a conversation
    // somebody deliberately cleared.
    expect(thread).toMatch(/mira\.cleared\.friend/);
    expect(thread).toMatch(/mira\.cleared\.city/);
    expect(thread).toMatch(/Math\.max\(f, c\)/);
  });
});

describe('and a door on every page', () => {
  const dock = read('layouts/MiraDock.tsx');
  // Her one mounting point is RootChrome — the pathless root route — not
  // AppShell, which is one of nineteen sibling blocks. RootChrome's own
  // comment carries the full argument; this pins both halves of it: the dock
  // is above every block, and no block grows a second copy.
  const chrome = read('layouts/RootChrome.tsx');
  const shell = read('layouts/AppShell.tsx');
  const css = read('styles/mira.css');

  it('her mark floats on every page, and a press pops the chat up', () => {
    expect(chrome).toMatch(/<MiraDock \/>/);
    expect(shell).not.toMatch(/<MiraDock \/>/);
    expect(dock).toMatch(/<MiraMark/);
    expect(dock).toMatch(/<MiraThread about=\{pathname\}/);
  });

  /**
   * NOT OVER A ROOM THAT IS ALREADY A CONVERSATION — and that used to be one
   * hard-coded path.
   *
   * The reason was written next to it — "she already has the room to herself"
   * — and it was applied to /chats alone, so every conversation surface built
   * afterwards kept the floating mark. Dating chats grew its own `.mira-door`
   * in the header and the dock went on floating over it: two ways into the
   * same assistant, six inches apart. The Local Services threads got it too,
   * over a room whose whole promise is that nobody knows who you are.
   *
   * `>` would not have been the fix either — the bell-style wrapper means the
   * mark is a grandchild of nothing in particular; the fix is that the rule is
   * a LIST, in the place the decision is taken.
   */
  it('but not over her own room, and not for a stranger', () => {
    for (const room of ['/chats', '/dating/chats', '/services/messages']) {
      expect(dock).toContain(`'${room}'`);
    }
    expect(dock).toMatch(/HER_OWN_ROOMS\.some\(/);
    // The single-path guard is what drifted. It may not come back.
    expect(dock).not.toMatch(/pathname\.startsWith\('\/chats'\)/);
    expect(dock).toMatch(/authed/);
  });

  /**
   * The other half of the invariant, and the one that stops this drifting
   * again: if a page carries her mark in its OWN header, the dock has to know
   * about that page. A third conversation surface with a `.mira-door` now
   * fails here instead of quietly shipping two doors.
   */
  it('accounts for every page that carries her mark in its own header', () => {
    const WITH_OWN_DOOR: Array<[string, string]> = [
      ['features/chat/pages/Chats.tsx', '/chats'],
      ['features/dating/pages/DatingChats.tsx', '/dating/chats'],
    ];
    for (const [file, room] of WITH_OWN_DOOR) {
      expect({ file, hasDoor: read(file).includes('className="mira-door"') })
        .toEqual({ file, hasDoor: true });
      expect({ file, dockKnows: dock.includes(`'${room}'`) })
        .toEqual({ file, dockKnows: true });
    }
  });

  it('closes on the outside tap, on Escape, and on navigation', () => {
    expect(dock).toMatch(/mira-dock-scrim/);
    expect(dock).toMatch(/key === 'Escape'/);
    expect(dock).toMatch(/useEffect\(\(\) => \{ setOpen\(false\); \}, \[pathname\]\)/);
  });

  it('the panel is the same thread, bounded, in her own room’s material', () => {
    expect(css).toMatch(/\.mira-dock-panel \{/);
    // Depth from the city's tokens, never a bespoke shadow.
    expect(css).toMatch(/\.mira-dock-panel \{[^}]*box-shadow: var\(--e3\)/);
  });

  /**
   * AND THE THREAD FILLS WHATEVER IS HOLDING IT — ALL THREE OF THEM.
   *
   * This line used to read `.mira-dock-panel .mirathread { flex: 1; min-height:
   * 0; }` — the literal rule, in the panel's scope, and that scope was the bug.
   * She lives in three column-flex containers (.csthread on the chats page,
   * .mira-dock-panel, .mira-confide) and only one of them had the rule, so on
   * the other two the thread was content-sized: the composer sat halfway up the
   * panel with a screenful of empty ground beneath it.
   *
   * `height: 100%` reads as though it should cover this and does not. In a
   * column container the height is the MAIN axis, decided by flex layout, and a
   * percentage resolves there only if the parent's height is definite —
   * .csthread's is not, being itself a flex item.
   *
   * SO WHAT IS ASSERTED IS THE PROPERTY, ON THE COMPONENT, rather than a string
   * in one scope. A test that pins the exact text of a rule is a test that
   * passes for the two homes it never looked at, which is what happened here.
   */
  /**
   * AND THE PANEL IS BOUND TO WHAT IS STILL ON SCREEN.
   *
   * Owner, 22 Aug, in Safari: tap the composer and the conversation slides up
   * out of the panel, leaving the box halfway down a card of empty ground. Two
   * iOS behaviours with one cause — the window does not shrink for a keyboard,
   * so `78vh` keeps a half that is now behind one; and to show the caret iOS
   * scrolls the layout viewport, which every `position: fixed` thing is pinned
   * to, and the panel's own box, which it will scroll even at `overflow:
   * hidden`.
   *
   * `--tc-vvh` / `--tc-vvt` are the pair the chat rooms have used since they
   * were built. What this asserts is that the panel READS them and that the
   * rooms did not lose them in the split: `useChatRoom` was three jobs in one
   * hook and the measuring half is its own file now, so the failure to guard
   * against is a refactor that quietly stops setting the variables for the
   * callers that already depended on them.
   */
  it('sizes and places itself against the visible viewport, not the window', () => {
    const panel = css.slice(css.indexOf('.mira-dock-panel {'));
    const rule = panel.slice(0, panel.indexOf('\n}'));
    expect(rule).toMatch(/--tc-vvh/);
    expect(rule).toMatch(/--tc-vvt/);
    // The fallbacks ARE the old behaviour: no variables, same edge as before.
    expect(rule).toMatch(/var\(--tc-vvh, 100dvh\)/);
    expect(rule).toMatch(/var\(--tc-vvt, 0px\)/);
    expect(read('layouts/MiraDock.tsx')).toMatch(/useVisualViewport\(open\)/);
  });

  it('and the rooms that already depended on those variables still get them', () => {
    const hook = read('hooks/useVisualViewport.ts');
    expect(hook).toMatch(/setProperty\('--tc-vvh'/);
    expect(hook).toMatch(/setProperty\('--tc-vvt'/);
    expect(hook).toMatch(/visualViewport/);
    // useChatRoom keeps the immersion and delegates the measuring.
    const room = read('hooks/useChatRoom.ts');
    expect(room).toMatch(/useVisualViewport\(open\)/);
    expect(room).toMatch(/tc-immersive/);
    // and it does not measure a second time — one writer for one variable.
    expect(room).not.toMatch(/setProperty\('--tc-vv/);
  });

  it('fills its container wherever it is mounted', () => {
    const thread = css.slice(css.indexOf('.mirathread {'));
    const block = thread.slice(0, thread.indexOf('\n}'));
    expect(block).toMatch(/flex:\s*1/);
    expect(block).toMatch(/min-height:\s*0/);
    // And no scoped copy has grown back to disagree with it.
    expect(css).not.toMatch(/\.mira-(dock-panel|confide)[^{]*\.mirathread\s*\{/);
  });
});
