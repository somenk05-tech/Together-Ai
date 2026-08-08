import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitPlace } from '@/features/profile/placeParts';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, '..', '..');
const read = (p: string) => readFileSync(join(APP, p), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

describe('Where you were born is typed; where you live may be asked for', () => {
  /**
   * BIRTH PLACE IS OWNED BY THE MASTER PROFILE.
   *
   * It used to be owned by nothing. The passport composed PLACE OF BIRTH out
   * of `birthCity` / `birthCountry`, and the only screen that wrote those was
   * the Astrology profile's birth-details form. So a citizen who had never
   * opened Astrology had a blank line on their document and no box anywhere in
   * the app to fill it, and one who had was shown a birth place they had
   * entered to get a horoscope.
   */
  it('gives the master profile a box for each birth-place field', () => {
    const src = strip(read('src/features/profile/pages/MasterProfile.tsx'));
    for (const k of ['birthCity', 'birthState', 'birthCountry']) {
      expect({ field: k, edited: src.includes(`'${k}'`) }).toEqual({ field: k, edited: true });
    }
  });

  /**
   * AND IT IS NEVER FILLED FROM WHERE YOU LIVE.
   *
   * They are different facts about a person and the overlap is a coincidence.
   * The device lookup writes city / state / country and must not touch the
   * three birth columns.
   */
  it('never writes a birth field from the location lookup', () => {
    const src = strip(read('src/features/profile/pages/MasterProfile.tsx'));
    const lookup = src.slice(src.indexOf('useMyLocation'), src.indexOf('saveAndClose'));
    expect(lookup).not.toMatch(/birthCity|birthState|birthCountry/);
    const parser = strip(read('src/features/profile/placeParts.ts'));
    expect(parser).not.toMatch(/birthCity|birthState|birthCountry/);
  });

  /**
   * THE BROWSER IS ASKED ONCE, BY A BUTTON.
   *
   * A profile form that requests coordinates the moment it renders is a
   * profile form nobody should trust. There is exactly one call and it hangs
   * off a press.
   */
  it('asks for a location only when somebody presses the button', () => {
    const src = strip(read('src/features/profile/pages/MasterProfile.tsx'));
    const calls = src.match(/getCurrentPosition/g) ?? [];
    expect(calls).toHaveLength(1);
    expect(src).toContain('onClick={useMyLocation}');
    /* And nothing stores the coordinates themselves — only the three words
       the lookup resolves them to. */
    expect(src).not.toMatch(/set\(\s*'(lat|lng|latitude|longitude)'/);
  });

  /**
   * THE ADDRESS IS READ FROM THE BACK, because the front is not a fixed shape.
   * Nominatim's display_name runs local → global at wildly varying length.
   */
  it('splits a real address of any length', () => {
    expect(splitPlace('Hiranandani Gardens, Powai, Mumbai, Mumbai Suburban, Maharashtra, 400076, India', 'Powai'))
      .toEqual({ city: 'Powai', state: 'Maharashtra', country: 'India' });

    expect(splitPlace('Jamshedpur, East Singhbhum, Jharkhand, 831001, India', 'Jamshedpur'))
      .toEqual({ city: 'Jamshedpur', state: 'Jharkhand', country: 'India' });

    /* No postcode at all, and only three segments. */
    expect(splitPlace('Reykjavík, Höfuðborgarsvæðið, Iceland', 'Reykjavík'))
      .toEqual({ city: 'Reykjavík', state: 'Höfuðborgarsvæðið', country: 'Iceland' });

    /* A UK postcode is letters and digits, so it is dropped by its own shape
       rather than by sitting in a particular position. */
    expect(splitPlace('Chelmsford, Essex, CM1 1AA, England', 'Chelmsford'))
      .toEqual({ city: 'Chelmsford', state: 'Essex', country: 'England' });
  });

  /** A one-word answer is a country. Writing it into all three boxes would be
   *  the page inventing two facts out of one. */
  it('leaves a box empty rather than repeating a name into it', () => {
    expect(splitPlace('India')).toEqual({ city: null, state: null, country: 'India' });
    expect(splitPlace('Singapore, Singapore', 'Singapore'))
      .toEqual({ city: null, state: null, country: 'Singapore' });
    expect(splitPlace('')).toEqual({ city: null, state: null, country: null });
  });

  /**
   * THERE IS A WAY OUT THAT SAVES.
   *
   * Every field autosaves on blur, which is right for a long form and wrong as
   * the only exit: edit the last box, press the browser's back button, and the
   * change is gone because blur never fired.
   */
  it('flushes the draft and returns to the passport', () => {
    const src = strip(read('src/features/profile/pages/MasterProfile.tsx'));
    expect(src).toContain('saveAndClose');
    expect(src).toMatch(/save\.mutate\(draft,[\s\S]{0,120}navigate\('\/profile'\)/);
  });
});
