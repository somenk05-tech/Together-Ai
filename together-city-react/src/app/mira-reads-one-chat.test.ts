import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

/**
 * MIRA READS ONE CHAT — AND ONLY THAT ONE.
 *
 * Her mark sits in every conversation's header now. A press invites her into
 * THAT thread: she reads the window on screen, says where the other person
 * might be coming from, and helps draft a reply with some emotional depth.
 *
 * The owner's one hard rule — "the tab only gives access to that chat box,
 * not entire context" — is held structurally, and this file pins the
 * structure: the transcript is a prop cut from the screen's own render, the
 * panel persists nothing, and her drafts reach the composer only through the
 * citizen's own clipboard hand.
 */
describe('Mira reads one chat', () => {
  const chats = read('features/chat/pages/Chats.tsx');
  const panel = read('features/chat/mira/MiraConfidant.tsx');
  const api = read('features/chat/mira/api.ts');

  it('her mark sits in the conversation header, bare, and a press opens the panel', () => {
    expect(chats).toMatch(/aria-label="Ask Mira about this conversation"/);
    expect(chats).toMatch(/<MiraMark size=\{30\} showWord=\{false\}/);
    expect(chats).toMatch(/<MiraConfidant otherName=\{activeTitle\} transcript=\{confideTranscript\}/);
    // JUST the ring — the owner's call. No tool disc around her mark: the
    // button wears only her own class, and that class paints no ground.
    expect(chats).toMatch(/className="mira-door"/);
    expect(chats).not.toMatch(/cstool mira-door/);
    const mira = read('styles/mira.css');
    expect(mira).toMatch(/\.mira-door \{[^}]*background: none/);
    expect(mira).toMatch(/\.mira-door \{[^}]*min-width: 44px; min-height: 44px/);
  });

  it('the window is this screen’s own render — bounded, sides told apart', () => {
    // Deletions and tombstones already applied, attachment-only rows dropped,
    // the last forty turns — the same bound the server enforces.
    expect(chats).toMatch(/\.filter\(\(m\) => !m\.deleted && m\.body\)/);
    expect(chats).toMatch(/\.slice\(-40\)/);
    expect(chats).toMatch(/m\.senderId === user\?\.id \? \('me' as const\) : \('them' as const\)/);
    // Opening another conversation closes the panel: a reading of thread A
    // must never be left standing beside thread B.
    expect(chats).toMatch(/setConfide\(false\); \}, \[activeId\]\)/);
  });

  it('the panel keeps nothing — no store, no day file, no other lane', () => {
    expect(panel).not.toMatch(/localStorage|sessionStorage/);
    expect(panel).not.toMatch(/loadDay|saveDay/);
    expect(panel).not.toMatch(/useMiraAsk/);
    // And it says so to the person, where the promise is being kept.
    expect(panel).toMatch(/keep(?:s)? none of it/i);
  });

  it('her drafts land on the clipboard — the citizen still sends every word', () => {
    expect(panel).toMatch(/navigator\.clipboard\.writeText/);
    expect(panel).toMatch(/aria-label="Copy this reply"/);
  });

  it('the ask rides to its own route with the window, capped like the server caps it', () => {
    expect(api).toMatch(/apiPost\('\/mira\/confide'/);
    expect(api).toMatch(/transcript: input\.transcript\.slice\(-40\)/);
  });

  it('closes on the outside tap and on Escape, with a reachable dismissal', () => {
    expect(panel).toMatch(/mira-dock-scrim/);
    expect(panel).toMatch(/key === 'Escape'/);
    expect(panel).toMatch(/aria-label="Close Mira’s panel"/);
  });
});
