import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = join(SRC, '..', '..', 'together-city-chat', 'src');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const api = (p: string) => readFileSync(join(API, p), 'utf8');
const rendered = (p: string) =>
  read(p).replace(/(^[ \t]*|\{)\/\*[\s\S]*?\*\//gm, '$1 ').replace(/^\s*\/\/.*$/gm, ' ');

/**
 * ── A NAME OF YOUR OWN (owner, 27 Aug) ──────────────────────────────────────
 *
 * "The dating name can be different from the city user name — let the user
 * decide what they want to keep."
 *
 * The field already existed and two things stopped it being a real choice:
 *
 *   1. IT WAS SILENTLY PREFILLED with the citizen's city name. They opened the
 *      form with their real name already in the box, having decided nothing —
 *      and a default nobody chose is not a decision.
 *   2. `matchDetail` SHIPPED THE REAL NAME ANYWAY. It spread the raw User row,
 *      so `user.name` was the account name, sitting in the payload next to the
 *      chosen one. The page rendered only the chosen name, which made the leak
 *      invisible rather than harmless: a display name picked so strangers would
 *      not learn a real one was defeated at the surface that matters most.
 */
describe('a name of your own', () => {
  const form = rendered('features/dating/pages/DatingProfile.tsx');
  const svc = api('dating/dating.service.ts').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

  it('asks the question instead of answering it for them', () => {
    expect(form).toMatch(/My city name/);
    expect(form).toMatch(/A different name/);
    // And the old silent prefill is gone.
    expect(form).not.toMatch(/firstName: prev\.firstName \|\| d\.name/);
  });

  it('keeps "unset" and "empty" apart, so clearing the box is not a switch', () => {
    // undefined = use my city name. '' = they chose their own and have not
    // typed it yet. Collapsing the two would flip somebody back to their real
    // name the moment they cleared the field to retype it.
    expect(form).toMatch(/const usingAlias = typeof dx\.firstName === 'string'/);
    expect(form).toMatch(/onChange=\{\(\) => setD\(\{ firstName: undefined \}\)\}/);
    expect(form).toMatch(/onChange=\{\(\) => setD\(\{ firstName: '' \}\)\}/);
  });

  it('shows what will actually be shown, not what was typed', () => {
    // An empty "different name" falls back to the city name on the server, so
    // a form that did not preview it would let somebody believe they were
    // anonymous while their real name went out.
    expect(form).toMatch(/Matches will see <strong>\{shownAs\}<\/strong>/);
  });

  it('and the preview agrees with the server, character for character', () => {
    const server = api('dating/matching.ts');
    const shownName = server.slice(server.indexOf('export function shownName'), server.indexOf('export function shownName') + 700);
    // Same trim, same collapse, same 40-char cap, same fallback, same capital.
    for (const step of [/replace\(\/\\s\+\/g, ' '\)/, /\.trim\(\)\.slice\(0, 40\)\.trim\(\)/, /charAt\(0\)\.toUpperCase\(\) \+ /]) {
      expect(shownName).toMatch(step);
      expect(form).toMatch(step);
    }
  });

  it('promises only what the server now delivers', () => {
    // The copy says the handle, the city photo and the real name do not travel.
    // Each of those is a server fact, asserted where it lives.
    // Whitespace-tolerant: the sentence wraps across JSX lines, and a regex
    // that only matches one particular line break is a test about formatting.
    expect(form.replace(/\s+/g, ' ')).toMatch(/not your @handle, not your city photo, not your real name/);
    expect(svc).not.toMatch(/handle: true/);
    expect(svc).not.toMatch(/cand\.user\.profileImage/);
    // THE ONE THIS TEST EXISTS FOR: matchDetail shapes its user like every
    // other card, rather than spreading the row.
    expect(svc).not.toMatch(/user: cand\.user,/);
    expect(svc).toMatch(/user: this\.cardIdentity\(userId, cand\.user, candD\)/);
  });

  /**
   * AND THE ID ON THE CARD IS SEALED TO ONE VIEWER (H3's other half, 31 Aug).
   *
   * `cardIdentity` grew a first argument: the viewer. The id it ships is
   * `sealCardId(viewer, target)` — a different opaque string per viewer, so
   * `@handle → /users/lookup → id` no longer joins a person's public city
   * life to their dating profile.
   *
   * That makes the viewer argument load-bearing in a way an argument usually
   * is not: pass the wrong id and the seal still succeeds, still returns a
   * plausible opaque string, and the card still renders — it is simply
   * unopenable by the person holding it, or openable by the wrong one. There
   * is no type that catches it; both are strings. So every call site is
   * checked here rather than only the one this test was written for.
   */
  it('seals every card id to the viewer, at every call site', () => {
    const calls = svc.match(/this\.cardIdentity\([^)]*\)/g) ?? [];
    // Three cards ship a person: the discover list, the stack, the detail page.
    expect(calls.length).toBeGreaterThanOrEqual(3);
    for (const call of calls) expect(call).toMatch(/^this\.cardIdentity\(userId, /);
    // And the seal is the viewer's, not a constant somebody wired in once.
    expect(svc).toMatch(/sealCardId\(this\.cardSecret\(\), viewerId, user\.id\)/);
  });
});
