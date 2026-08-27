import { readFileSync } from 'fs';
import { join } from 'path';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

/**
 * ── NOTHING LINKS THE CARD TO THE CITY (audit finding 11) ───────────────────
 *
 * A dating profile is a deliberate, separate presentation of yourself. Every
 * candidate query used to select `handle` and `profileImage` off the User row
 * and every card shape spread them through — `shownName()` anonymised the NAME
 * and nothing else. So a card shown to strangers carried the city's primary
 * key for the person (their posts, their connections, one lookup away) and,
 * whenever the gallery was empty, the photo the whole city knows them by.
 *
 * TWO PLACES KEEP `profileImage`, BY DESIGN, AND ONLY TWO:
 *   · `anonParty`, at trust level ≥ 2 — the REVEAL. Both people chose, in two
 *     separate taps, to show each other who they are. That is the feature.
 *   · Nothing else. The matched-chats list is NOT one of them: a match is
 *     mutual but a reveal is a separate mutual step, and the row is drawn
 *     before it.
 */
describe('nothing links the card to the city', () => {
  const svc = code(read('dating/dating.service.ts'));

  it('no candidate query selects the CITY handle, and no shape sends one', () => {
    // `jobs.handle(...)` is the queue API; the WORD is fine, the COLUMN is not.
    //
    // AND THE COLUMN IS NO LONGER ONE COLUMN. DatingProfile carries a `handle`
    // of its own since 27 Aug — the name a citizen dates under — which is on
    // every card on purpose and can never be a city @handle, because
    // dating-handle.ts refuses any name an account already holds. So the rule
    // this test always meant is stated directly: the USER row is never asked
    // for a handle, and no shape reads one off it.
    for (const q of svc.match(/user: \{ select: \{[^}]*\}/g) ?? []) expect(q).not.toMatch(/handle/);
    for (const q of svc.match(/prisma\.user\.find\w+\(\{[\s\S]*?select: \{[^}]*\}/g) ?? []) {
      expect(q).not.toMatch(/handle:\s*true/);
    }
    expect(svc).not.toMatch(/user\.handle/);
  });

  it('one function owns the identity a card carries: id, chosen name, dating handle', () => {
    expect(svc).toMatch(/private cardIdentity\(/);
    expect(svc).toMatch(/name: shownName\(dx, user\.name\),/);
    // The handle a card carries comes from the DATING profile, through the
    // helper that falls back to a generated name — never off the User row.
    expect(svc).toMatch(/handle: datingHandleOf\(\{ userId: user\.id, handle \}\),/);
    // and every card shape goes through it rather than spreading cand.user
    expect(svc).not.toMatch(/user: \{ \.\.\.cand\.user/);
  });

  it('the account photo is never a stranger-facing fallback', () => {
    // Gallery or nothing, on every list, the stack, detail, and the chats tab.
    expect(svc).not.toMatch(/cand\.user\.profileImage/);
    expect(svc).not.toMatch(/userOf\.get\(row\.otherUserId\)\?\.profileImage/);
  });

});

/**
 * ── AND NOTHING NARRATES A PRIVATE ANSWER (audit finding 17) ────────────────
 *
 * Reasons and frictions may quote what a profile DISPLAYS — the goal, the
 * diet, the city — because the viewer can see those anyway one tap deeper.
 * `wantsChildren` is the one factor that appears nowhere on any profile
 * surface, and the frictions line quoted both people's answers verbatim on
 * every card, to every viewer, at every score.
 */
describe('nothing narrates a private answer', () => {
  it('the children friction gives the viewer their own answer only', () => {
    const m = code(read('dating/matching.ts'));
    expect(m).toMatch(/you said \$\{aD\.wantsChildren\}/);
    expect(m).not.toMatch(/\$\{bD\.wantsChildren\}/);
  });

  it('wantsChildren is still not displayed anywhere', () => {
    // The friction rule above is only sound while this stays true. If a
    // product decision ever puts the answer ON the profile, quoting it in a
    // friction becomes fine — and this assertion is the reminder to make
    // those two changes together.
    expect(code(read('dating/dating.service.ts'))).not.toMatch(/wantsChildren/);
  });
});
