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

  it('each tab keeps its own thread — the friend and the errands never merge', () => {
    const day = read('features/chat/mira/day.ts');
    // The friend's room has its own key; the assistant keeps the ORIGINAL
    // key, so every conversation from before the split is still where its
    // citizens left it.
    expect(day).toMatch(/mira\.day\.friend/);
    expect(day).toMatch(/room === 'friend' \? 'mira\.day\.friend' : KEY/);
    // Switching tabs swaps the thread, drops the other room's held question,
    // and saves into the room being looked at.
    expect(thread).toMatch(/setTurns\(loadDay\(undefined, m\)\)/);
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

  it('but not over her own room, and not for a stranger', () => {
    expect(dock).toMatch(/pathname\.startsWith\('\/chats'\)/);
    expect(dock).toMatch(/authed/);
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
