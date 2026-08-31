import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * ── THE CHAT SAYS WHAT IT SHARES (fifth audit, 31 Aug, web mediums) ─────────
 *
 * Source ratchets for the fixes whose behaviour is one line each:
 *
 *  · The reveal asks first, names what crosses, renders its state, and
 *    surfaces its error — it was a bare menu item above Unmatch.
 *  · The detail page renders the server's held-profile sentence instead of
 *    blaming the other person for the caller's own 403.
 *  · Blocking invalidates the detail cache, so the page cannot keep a live
 *    Connect under a person just blocked.
 *  · Profile thumbnails resolve their picture BY KEY, not by position, so a
 *    local remove shows the removal rather than shifting every face.
 *  · The Safety Centre stopped telling people they chat under their own name.
 */
const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const chats = read('./pages/DatingChats.tsx');
const detail = read('./pages/DatingMatchDetail.tsx');
const profile = read('./pages/DatingProfile.tsx');
const safety = read('./pages/DatingSafety.tsx');
const api = read('./api.ts');
const pieces = read('./components/ChatPieces.tsx');

describe('the chat says what it shares', () => {
  it('sharing the city profile asks first, and taking it back does not', () => {
    expect(chats).toMatch(/chat\.myReveal \|\| window\.confirm\('Share your city profile/);
    expect(chats).toContain('they cannot un-see them');
  });
  it('the share state is rendered where the chat is read', () => {
    expect(chats).toContain('You are both sharing your city profiles.');
    expect(chats).toContain('You are sharing your city profile — they are not.');
  });
  it('a failed reveal or unmatch is said, not swallowed', () => {
    expect(chats).toMatch(/reveal\.isError \|\| unmatch\.isError/);
  });
  it('a rejected caller’s chats refusal reaches them with the appeal sentence', () => {
    expect(chats).toMatch(/<ReadFailure\s*\n?\s*error=\{chats\.error\}/);
  });
});

describe('the detail page stops blaming the other person', () => {
  it('renders the held-profile sentence for the caller’s own 403', () => {
    expect(detail).toMatch(/const held = moderationHold\(detail\.error\);/);
    expect(detail).toContain('Your profile isn’t live yet');
  });
  it('an already-liked person reads as chosen, not as a live Connect', () => {
    expect(detail).toMatch(/useState\(d\.likedByMe\)/);
    expect(detail).toMatch(/chosen \? '♡ Chosen' : '♡ Connect'/);
  });
});

describe('a block empties every screen that showed them', () => {
  it('the detail cache is invalidated with the lists', () => {
    expect(api).toMatch(/\['dating', 'match'\]/);
  });
});

describe('a thumbnail shows the photo it removes', () => {
  it('display URLs are resolved by stored key, not by local position', () => {
    expect(profile).toMatch(/urlByKey\.get\(key\)/);
    expect(profile).not.toMatch(/photoSrcs\[i\] \|\| \(photos\[i\]/);
  });
});

describe('a dialog the keyboard can leave and enter (31 Aug)', () => {
  const menu = read('./components/SafetyMenu.tsx');
  it('the safety menu takes focus, closes on Escape, and hands focus back', () => {
    expect(menu).toMatch(/panelRef\.current\?\.focus\(\)/);
    expect(menu).toMatch(/e\.key === 'Escape'/);
    expect(menu).toMatch(/trigger\?\.focus\(\)/);
    expect(menu).toMatch(/ref=\{panelRef\} tabIndex=\{-1\}/);
  });
  it('the compatibility sheet does the same', () => {
    expect(pieces).toMatch(/sheetRef\.current\?\.focus\(\)/);
    expect(pieces).toMatch(/e\.key === 'Escape'/);
  });
});

describe('the safety page keeps the hub’s promise', () => {
  it('says the chosen dating identity, not "your own name and photos"', () => {
    expect(safety).not.toContain('you appear under your own name and photos');
    expect(safety).toContain('the name and photos you chose for this hub');
  });
  it('the intro preview owns up to whose eyes the "You" face is for', () => {
    expect(pieces).toContain('the face here is just for you');
  });
});
