import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

/**
 * THE BEAUTY HUB ANSWERS "WHAT DO I DO" IN ONE PLACE.
 *
 * It answered it in two. Tab 01, Skin & Hair Profile, printed a card headed
 * "Your routine" listing plain steps — Gentle cleanser, Vitamin-C serum,
 * Moisturiser. Tab 02, Your Routine, holds the real one: the same steps as
 * actual products, with brands, prices, order, instructions, frequency and
 * per-step warnings. Same question, two answers, and the weaker of them was on
 * the page about photographs.
 *
 * WHY A TEST AND NOT JUST A DELETE. The assessment object still carries
 * `routine` — the product engine is pure and cannot work out a seasonal note,
 * so the assessment is where that comes from — and a field that exists and is
 * not rendered is an invitation. Somebody adding to the assessment view will
 * find `a.routine.am` sitting there unused and put it back, reasonably, in
 * about a minute.
 *
 * The seasonal sentence is the one part that moved rather than went, so it is
 * asserted at its new address too. Deleting a card and quietly losing a line
 * of content out of the bottom of it is the failure mode of every tidy-up.
 */
describe('the routine lives on the routine tab', () => {
  const profile = read('features/beauty/pages/Profile.tsx');
  const routine = read('features/beauty/pages/Routine.tsx');

  it('is not rendered on the skin & hair profile page', () => {
    // The three step lists, by the fields they read. Named individually so the
    // failure says which one came back.
    expect({
      am: /a\.routine\.am/.test(profile),
      pm: /a\.routine\.pm/.test(profile),
      weekly: /a\.routine\.weekly/.test(profile),
    }).toEqual({ am: false, pm: false, weekly: false });
  });

  it('has no second heading calling itself a routine', () => {
    // `>🗓️ Your routine<` was the card's title. A heading is what made two
    // lists read as two different routines rather than one repeated.
    expect(profile).not.toMatch(/<h[1-6][^>]*>[^<]*Your routine/i);
  });

  it('still points somebody at where the routine is', () => {
    // A block that disappears with nothing in its place reads as a routine
    // that was never generated.
    expect(profile).toMatch(/to="\/beauty\/routine"/);
  });

  it('keeps the seasonal note, at the address the routine now has', () => {
    expect(profile).not.toMatch(/routine\.seasonal/);
    expect(routine).toMatch(/routine\?\.seasonal/);
  });
});
