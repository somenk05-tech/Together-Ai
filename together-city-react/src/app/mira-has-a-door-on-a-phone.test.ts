import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

/**
 * MIRA HAS A DOOR ON A PHONE.
 *
 * ── WHAT WAS WRONG ────────────────────────────────────────────────────────
 *
 * The home screen's primary button was `phone ? null : <Link…>` for a signed-in
 * citizen. That guard was written for a DIFFERENT button: it used to say "Enter
 * your city", and on a phone the citizen has already entered — the hub wall is
 * under the fold, the bottom bar is under their thumb, and a second door to the
 * same room is clutter. Correct reasoning, correctly written down.
 *
 * When the copy changed to "Talk to Mira", the guard stayed. It was no longer
 * hiding a redundant door; it was hiding the ONLY route to her from the home
 * screen, on the device most people use. A signed-out visitor kept the button —
 * theirs points at sign-up and never had the guard — while a signed-in citizen,
 * the one who actually has an assistant to talk to, lost it.
 *
 * ── WHY IT IS A TEST ──────────────────────────────────────────────────────
 *
 * Because it was invisible from a desk. Every screenshot taken while building
 * this had the button in it, because every one of them was a browser window
 * wider than 899px. Nothing failed, nothing looked wrong, and the guard read as
 * deliberate — it had a comment explaining it, which is exactly what made it
 * survive being read.
 */
describe('Mira has a door on a phone', () => {
  const home = strip(read('pages/Home.tsx'));

  it('shows the signed-in citizen the way to her at every width', () => {
    // …behind the operator's switch and nothing else (5 Sep): `miraShown` is
    // the one hand on her six doors; a width check is not allowed back in.
    expect(home).toMatch(/\{authed \? \(\s*miraShown \? \(\s*<Link className="btn btn-gold" to="\/chats\?c=__mira__">/);
  });

  /** The specific shape of the defect, named so it cannot come back wearing the
   *  same clothes. */
  it('does not hide the primary button behind a width check', () => {
    expect(home).not.toMatch(/phone\s*\?\s*null/);
  });

  /** …and the width check itself is still doing its real jobs, so this did not
   *  fix one thing by deleting another. The resume shelf moves to the foot on a
   *  phone; that is a layout decision and it stays. */
  it('leaves the rest of the phone layout alone', () => {
    expect(home).toMatch(/!phone && <RecentPanel/);
    expect(home).toMatch(/\{phone && <div className="wrap"/);
  });

  /**
   * AND BOTH DOORS SAY THE SAME THING.
   *
   * Signed-out and signed-in get the same words for what is, to a visitor, the
   * same promise — the only difference is that one has to make an account
   * first. If those two ever drift apart, the landing page is advertising
   * something the app then calls by another name.
   */
  it('says the same thing signed in or out', () => {
    // Two doors, one name — and with the switch off, neither says her name:
    // the signed-in door is not drawn and the signed-out one becomes a plain
    // "Join the city", so the landing page never advertises a room the
    // operator has closed.
    expect((home.match(/Talk to Mira/g) ?? []).length).toBe(2);
    expect(home).toMatch(/\{miraShown \? 'Talk to Mira' : 'Join the city'\}/);
  });
});
