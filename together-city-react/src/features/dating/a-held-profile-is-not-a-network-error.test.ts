import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { moderationHold, serverMessage } from './server-sentence';

/**
 * ── THREE SCREENS THAT SAID "TRY AGAIN IN A MOMENT" TO SOMEBODY WHO COULD NOT ──
 *
 * `myApprovedProfile` throws a 403 carrying a precise sentence: "still being
 * reviewed", or "has not been approved… you can appeal in the Safety Centre".
 * Browse and Curated Matches threw both away and printed "This didn't reach us
 * — try again in a moment", which is false in every clause and invites a loop
 * with no end: retry, same 403, same apology, and never a word about the
 * sentence in their own bio that they could change.
 *
 * The same omission, one screen along: `upsert.mutate` on the profile form was
 * given an `onSuccess` and nothing else, and this app has no global mutation
 * error handler — so a save that failed looked exactly like a save nobody made.
 * The button went "Saving…", then back to "Create profile", and not one other
 * pixel moved.
 *
 * `MatchCards` was already reading `data.message` off a refused like, so the
 * pattern existed in this feature the whole time.
 */
const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const browse = read('./pages/DatingBrowse.tsx');
const matches = read('./pages/DatingMatches.tsx');
const profile = read('./pages/DatingProfile.tsx');
const chats = read('./pages/DatingChats.tsx');

const held = (status: number, message: unknown) => ({ response: { status, data: { message } } });

describe('what counts as a held profile', () => {
  it('is a 403 with a sentence in it', () => {
    expect(moderationHold(held(403, 'Your dating profile is still being reviewed.')))
      .toBe('Your dating profile is still being reviewed.');
  });

  it('is not a 500, a timeout, or an offline browser', () => {
    expect(moderationHold(held(500, 'Internal server error'))).toBeNull();
    expect(moderationHold(new Error('Network Error'))).toBeNull();
    expect(moderationHold(null)).toBeNull();
    expect(moderationHold(undefined)).toBeNull();
  });

  it('is not a 403 that arrived with nothing to say', () => {
    expect(moderationHold(held(403, ''))).toBeNull();
    expect(moderationHold(held(403, '   '))).toBeNull();
    expect(moderationHold({ response: { status: 403 } })).toBeNull();
  });

  /** Nest serialises a validation failure's message as an array. */
  it('reads the array form as one sentence', () => {
    expect(serverMessage(held(400, ['bio must be shorter', 'gender is required'])))
      .toBe('bio must be shorter gender is required');
  });
});

describe('the two list screens', () => {
  it('hand the error to the branch that can read it', () => {
    expect(browse).toMatch(/<ReadFailure\s+error=\{discover\.error\}/);
    expect(matches).toMatch(/<ReadFailure\s+error=\{stack\.error\}/);
  });

  /**
   * The generic sentence is still right for a read that genuinely failed. The
   * finding was never that it existed — it was that it was the only one.
   */
  it('keep the generic sentence for a read that genuinely failed', () => {
    expect(browse).toMatch(/This didn’t reach us/);
    expect(matches).toMatch(/This didn’t reach us/);
  });

  it('send a held citizen where the reasons and the fix are', () => {
    const rf = read('./components/ReadFailure.tsx');
    expect(rf).toMatch(/Your profile isn’t live yet/);
    expect(rf).toMatch(/to="\/matchmaking\/profile"/);
  });
});

describe('the profile form', () => {
  it('says so when a save does not land', () => {
    expect(profile).toMatch(/\{upsert\.isError && \(/);
    expect(profile).toMatch(/role="alert"/);
  });

  it('prefers the server’s sentence and keeps a true fallback', () => {
    expect(profile).toMatch(/serverMessage\(upsert\.error\) \?\?/);
    expect(profile).toMatch(/Nothing you’ve entered has been lost/);
  });

  /**
   * The delete button had the same shape and a worse consequence: a delete
   * that silently failed leaves somebody believing their photographs are gone.
   */
  it('says so when a delete does not land either', () => {
    expect(profile).toMatch(/del\.isError \? serverMessage\(del\.error\)/);
    expect(profile).toMatch(/Nothing has been removed/);
  });
});

/**
 * ── AND TWO SENTENCES THAT WERE SIMPLY NOT TRUE ──
 *
 * The chat cap was removed on 27 Aug, so "unmatch frees you to connect with
 * someone new" argued for an irreversible act with a benefit that no longer
 * existed. Curated Matches promised "newest match first" in a comment while
 * the server sorted by score; that half is fixed where the order is decided.
 */
describe('what unmatch is told to be', () => {
  it('no longer sells a freedom nothing was limiting', () => {
    expect(chats).not.toMatch(/window\.confirm\([^)]*frees you/);
  });

  it('says what actually happens, to both people', () => {
    expect(chats).toMatch(/the conversation is archived for both of you/);
    expect(chats).toMatch(/This cannot be undone/);
  });
});
