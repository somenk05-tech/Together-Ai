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

  it('her whole lockup sits in the conversation header, and a press opens the panel', () => {
    expect(chats).toMatch(/aria-label="Ask Mira about this conversation"/);
    // The FULL mark — ring and wordmark — at 48, where the word is legible.
    expect(chats).toMatch(/<MiraMark size=\{48\} state="waiting" \/>/);
    expect(chats).not.toMatch(/mira-door[\s\S]{0,200}showWord=\{false\}/);
    expect(chats).toMatch(/<MiraConfidant otherName=\{activeTitle\} transcript=\{confideTranscript\}/);
    // No tool disc around her mark: the button wears only her own class,
    // and that class paints no ground.
    expect(chats).toMatch(/className="mira-door"/);
    expect(chats).not.toMatch(/cstool mira-door/);
    const mira = read('styles/mira.css');
    expect(mira).toMatch(/\.mira-door \{[^}]*background: none/);
    expect(mira).toMatch(/\.mira-door \{[^}]*min-width: 44px; min-height: 44px/);
    // Drawn in THE STAGE'S ink, never her on-white red: --mira-mark is
    // measured on white and vanished on the dark themes.
    expect(mira).toMatch(/\.mira-door \{[^}]*color: var\(--on-stage\)/);
    expect(mira).not.toMatch(/\.mira-door \{[^}]*var\(--mira-mark\)/);
  });

  it('and she is in the dating thread too, on the same terms', () => {
    // The owner, 15 Aug: "add mira to dating chats too". A dating thread is
    // the conversation people most want a second read on — and the one where
    // a stranger's words are least anybody's to keep, so the panel it opens
    // is the SAME one, with the same window-only scope, rather than a second
    // implementation that could quietly grow a memory.
    const dating = read('features/dating/pages/DatingChats.tsx');
    expect(dating).toMatch(/import \{ MiraConfidant \} from '@\/features\/chat\/mira\/MiraConfidant'/);
    expect(dating).toMatch(/<MiraConfidant otherName=\{chat\.name\} transcript=\{confideTranscript\}/);
    expect(dating).toMatch(/aria-label="Ask Mira about this conversation"/);
    expect(dating).toMatch(/title="Mira can analyse this chat for you"/);
    // The same window rule as the city chats: rendered messages, words only,
    // last forty, sides told apart the way the bubbles are.
    expect(dating).toMatch(/\.filter\(\(m\) => !m\.deleted && m\.body\)/);
    expect(dating).toMatch(/\.slice\(-40\)/);
    expect(dating).toMatch(/m\.senderId === meId \? \('me' as const\) : \('them' as const\)/);
  });

  it('hovering says what she is for, and a keyboard learns the same thing', () => {
    const mira = read('styles/mira.css');
    expect(mira).toMatch(/\.mira-door::after \{[^}]*content: 'Mira can analyse this chat for you'/);
    expect(mira).toMatch(/\.mira-door:focus-visible::after \{ display: block; \}/);
    expect(mira).toMatch(/\.mira-door:hover::after \{ display: block; \}/);
    // The cursor's line and the tap's title agree, word for word.
    expect(chats).toMatch(/title="Mira can analyse this chat for you"/);
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
