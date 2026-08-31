import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isSavedProfile, type DatingProfile } from './api';

/**
 * ── THE FIRST TEN MINUTES OF A NEW CITIZEN ──────────────────────────────────
 *
 * Fifth audit, 31 Aug, the two blockers. Neither was a server fault and
 * neither was a security fault; both were what a brand-new account met on the
 * way in, and no suite had ever walked in as one.
 *
 * B2. `GET /dating/profile` hands a citizen with no dating row a PREFILL from
 * the Master Profile, marked `saved: false`. Registration collects a date of
 * birth, so every new account gets one, and it is truthy. Browse and Curated
 * Matches gated their list reads and their "Create your dating profile" state
 * on `Boolean(profile.data)` — so the reads fired, the server refused them
 * with a 404, and both rooms printed "This didn't reach us — try again in a
 * moment" to somebody the app had simply not asked yet.
 *
 * B1. The profile form posted `birthTime: ''` for a field labelled optional,
 * and the server's HH:MM rule refused the whole save with "Invalid".
 *
 * The rule for B2 has one name now — `isSavedProfile` — and this file holds
 * both pages to it, and holds the form to sending nothing for a blank time.
 */
const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const browse = read('./pages/DatingBrowse.tsx');
const matches = read('./pages/DatingMatches.tsx');
const profile = read('./pages/DatingProfile.tsx');

const saved = { userId: 'u1', gender: 'female', seeking: 'any', moderation: 'approved' } as unknown as DatingProfile;
const prefill = { prefilled: true, saved: false, name: 'Priya', gender: 'female', seeking: null } as unknown as DatingProfile;

describe('what counts as a saved dating profile', () => {
  it('is a row the server has stored', () => {
    expect(isSavedProfile(saved)).toBe(true);
  });

  it('is not the Master-Profile prefill, however full it looks', () => {
    expect(isSavedProfile(prefill)).toBe(false);
  });

  it('is not nothing', () => {
    expect(isSavedProfile(null)).toBe(false);
    expect(isSavedProfile(undefined)).toBe(false);
  });
});

describe('the two rooms gate on that rule and nothing weaker', () => {
  it.each([['Browse', browse], ['Curated Matches', matches]])('%s asks for matches only for a saved profile', (_, src) => {
    // A truthy prefill must not be enough to fire the list read.
    expect(src).not.toMatch(/Boolean\(profile\.data\)/);
    expect(src).toMatch(/useD(iscover|atingStack)\(kind, isSavedProfile\(profile\.data\)/);
  });

  it.each([['Browse', browse], ['Curated Matches', matches]])('%s invites a new citizen to create a profile', (_, src) => {
    expect(src).not.toMatch(/if \(!profile\.data\) \{/);
    expect(src).toMatch(/if \(!isSavedProfile\(profile\.data\)\) \{/);
    // The owner is renaming user-facing copy Dating → Matchmaking (31 Aug);
    // either spelling is the button this test exists to protect.
    expect(src).toMatch(/Create your (dating|matchmaking) profile/);
  });
});

describe('a blank optional is an absent one', () => {
  it('the form sends no birth time rather than an empty string', () => {
    expect(profile).toMatch(/birthTime: form\.birthTime \|\| undefined/);
  });
});
