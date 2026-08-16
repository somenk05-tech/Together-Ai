import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

/**
 * ONE MIRA, TWO TABS, AND A DOOR ON EVERY PAGE.
 *
 * Friend is the companion — chart, numbers, the listening ear. City
 * assistant is the operator she has always been. The tab changes her
 * REGISTER on the wire (`mode`) — and, by the owner's call, her THREAD: a
 * heart-to-heart and "take me to budgets" do not belong in the same scroll,
 * so each tab keeps its own day. The seed, the mood and the meter stay
 * shared — one person, two rooms.
 *
 * And her mark now floats on every page: a press pops the chat up over
 * whatever the citizen is doing, with the page sent along so "what is
 * this?" means THIS page.
 */
describe('Mira is two tabs', () => {
  const thread = read('features/chat/mira/MiraThread.tsx');
  const api = read('features/chat/mira/api.ts');

  it('the thread follows the account — one conversation on every device', () => {
    // The server record (her memory) is now also the screen's source. The
    // device day-store remains the offline fallback, never the truth.
    expect(api).toMatch(/apiGet\('\/mira\/thread'/);
    expect(thread).toMatch(/useMiraThread\(mode\)/);
    // Hydrate once per room, and never over a conversation in progress.
    expect(thread).toMatch(/hydrated\.current\[mode\]/);
    expect(thread).toMatch(/spoke\.current = true/);
    // Clearing marks the moment on THIS device; hydration shows only what
    // came after, so a cleared screen does not resurrect on the next open.
    expect(thread).toMatch(/mira\.cleared\.\$\{mode\}/);
    expect(thread).toMatch(/clearedAt\(mode\)/);
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

  it('offers Friend and City assistant, and remembers the choice', () => {
    expect(thread).toMatch(/>\s*Friend\s*</);
    expect(thread).toMatch(/>\s*City assistant\s*</);
    expect(thread).toMatch(/aria-pressed=\{mode === 'friend'\}/);
    expect(thread).toMatch(/localStorage\.setItem\(MODE_KEY/);
  });

  it('the tab rides the wire as mode, and the page rides as page', () => {
    expect(thread).toMatch(/mode, page: about/);
    expect(api).toMatch(/mode: input\.mode/);
    expect(api).toMatch(/page: input\.page/);
  });

  it('opened over a page, she arrives as the assistant', () => {
    expect(thread).toMatch(/about \? 'city' : storedMode\(\) \?\? 'friend'/);
  });

  it('the friend introduces herself once, and the assistant keeps the rundown', () => {
    // The owner's welcome, verbatim, as her first message in the friend tab
    // — once per device. The capability opening ("tell me what you want
    // done") is the CITY tab's empty state now, not the friend's.
    expect(thread).toMatch(/Your buddy\. ❤️/);
    expect(thread).toMatch(/mira\.welcomed/);
    expect(thread).toMatch(/room !== 'friend' \|\| turns\.length > 0/);
    expect(thread).toMatch(/mode === 'city' && <p className="miraopentext">/);
    // The welcome arrives with real line breaks, and the bubble keeps them.
    const css = read('styles/mira.css');
    expect(css).toMatch(/\.mirabub \{[^}]*white-space: pre-wrap/);
  });

  it('each tab keeps its own thread — the friend and the errands never merge', () => {
    const day = read('features/chat/mira/day.ts');
    // The friend's room has its own key; the assistant keeps the ORIGINAL
    // key, so every conversation from before the split is still where its
    // citizens left it.
    expect(day).toMatch(/mira\.day\.friend/);
    expect(day).toMatch(/room === 'friend' \? 'mira\.day\.friend' : KEY/);
    // Switching tabs swaps the thread, drops the other room's held question,
    // and saves into the room being looked at.
    expect(thread).toMatch(/setTurns\(seedWelcome\(loadDay\(undefined, m\), m\)\)/);
    expect(thread).toMatch(/saveDay\(turns, undefined, mode\)/);
    // Forget today forgets the tab you are standing in, not both.
    expect(thread).toMatch(/clearDay\(mode\)/);
  });
});

describe('and a door on every page', () => {
  const dock = read('layouts/MiraDock.tsx');
  const shell = read('layouts/AppShell.tsx');
  const css = read('styles/mira.css');

  it('her mark floats on every page, and a press pops the chat up', () => {
    expect(shell).toMatch(/<MiraDock \/>/);
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
    expect(css).toMatch(/\.mira-dock-panel \.mirathread \{ flex: 1; min-height: 0; \}/);
    // Depth from the city's tokens, never a bespoke shadow.
    expect(css).toMatch(/\.mira-dock-panel \{[^}]*box-shadow: var\(--e3\)/);
  });
});
