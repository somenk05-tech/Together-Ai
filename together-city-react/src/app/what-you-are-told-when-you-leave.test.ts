import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = join(SRC, '..', '..', 'together-city-chat', 'src');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const api = (p: string) => readFileSync(join(API, p), 'utf8');
/** COMMENTS ARE NOT COPY. The card's docblock quotes the old sentence as the
 *  thing it exists to correct, so a naive read of the file finds the very
 *  string this file forbids — a test that fails on its own explanation. Only
 *  what renders is asserted. */
const rendered = (p: string) =>
  read(p).replace(/(^[ \t]*|\{)\/\*[\s\S]*?\*\//gm, '$1 ').replace(/^\s*\/\/.*$/gm, ' ');

/**
 * ── WHAT A CITIZEN IS TOLD AT THE DOOR OUT ─────────────────────────────────
 *
 * The delete-account card used to say: "Erases your posts, photos, listings
 * and connections, and signs out every device." Three things were wrong with
 * it and every one of them favoured us:
 *
 *   1. "Erases" is present tense. The photographs survive for THIRTY DAYS.
 *      Somebody leaving because they felt unsafe read a sentence saying their
 *      pictures were gone when they were not.
 *   2. It never said MESSAGES ARE KEPT FOREVER. purge-plan.ts argues that
 *      decision well — a group thread full of holes is worse for the people
 *      left in it — but a decision taken in somebody's name and never told to
 *      them is an assumption, not consent.
 *   3. And thirty days sounds like a grace period. It is not: the password is
 *      replaced with an unusable value and nothing reverses any of it.
 *
 * These assertions read the SERVER as well as the copy, because the failure
 * mode is not bad writing — it is the two drifting apart. If the purge window
 * changes, or messages stop being kept, the copy has to move with it.
 */
describe('what a citizen is told at the door out', () => {
  const card = rendered('features/settings/components/DeleteAccountCard.tsx');

  it('no longer claims the photographs are erased on the spot', () => {
    expect(card).not.toMatch(/Erases your posts, photos, listings and connections/);
  });

  it('separates what happens now from what happens later', () => {
    expect(card).toMatch(/Straight away:/);
    expect(card).toMatch(/After thirty days:/);
    // The immediate list is exactly what deleteAccount() does, and no more:
    // posts, follows, connections, sessions, and the name/handle swap.
    const svc = api('auth/auth.service.ts');
    const body = svc.slice(svc.indexOf('async deleteAccount'), svc.indexOf('async deleteAccount') + 2600);
    for (const call of ['post.deleteMany', 'follow.deleteMany', 'connection.deleteMany', 'revokeAll']) {
      expect(body).toContain(call);
    }
    // …and photos are NOT among them, which is why the copy cannot say so.
    expect(body).not.toMatch(/photo.*deleteMany|deleteHealthObject/);
  });

  it('names the window the server actually uses', () => {
    expect(api('privacy/purge-plan.ts')).toMatch(/PURGE_AFTER_DAYS = 30/);
    expect(card).toMatch(/thirty days/i);
  });

  it('refuses to let thirty days read as a way back', () => {
    // There is no restore path — the password is replaced with an unusable
    // value and no endpoint undoes it. Copy that says "kept for thirty days"
    // and stops there trades one comfortable misreading for another.
    expect(card).toMatch(/not a grace period/);
    expect(card).toMatch(/cannot sign in again/);
  });

  it('says out loud that messages are kept, because they are', () => {
    const plan = api('privacy/purge-plan.ts');
    // The server keeps them; the card must admit it.
    expect(plan).toMatch(/model: 'Message', by: 'senderId', action: 'keep'/);
    expect(plan).toMatch(/model: 'Comment', by: 'authorId', action: 'keep'/);
    expect(plan).toMatch(/model: 'Like', by: 'userId', action: 'keep'/);
    expect(card).toMatch(/Kept, deliberately:/);
    expect(card).toMatch(/messages you sent to other people/);
    expect(card).toMatch(/comments and likes/);
  });

  it('gives the reason, not just the fact', () => {
    // "We keep your messages" without why reads as a company protecting
    // itself. The reason is the other people in the thread, and it is true.
    expect(card).toMatch(/would edit somebody else/);
  });

  it('the last-second dialog does not promise more than the flow delivers', () => {
    expect(card).not.toMatch(/Permanently delete your Together City account/);
    expect(card).toMatch(/You cannot sign in again, and this cannot be undone/);
  });
});
