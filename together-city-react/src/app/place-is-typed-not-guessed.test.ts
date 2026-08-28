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
    const lookup = src.slice(src.indexOf('useMyLocation'), src.indexOf('saveAll'));
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
   * THERE IS A BUTTON THAT SAVES WHAT BLUR HAS NOT SEEN.
   *
   * Every field autosaves on blur, which is right for a long form and wrong as
   * the only way: edit the last box, close the tab, and the change is gone
   * because blur never fired.
   *
   * It used to be "Save and close" and it navigated to /profile afterwards,
   * because these fields were a page of their own. They are a block on
   * /profile now (28 Aug), so there is nowhere to go — the flush is the whole
   * of the job, and it is what this pins.
   */
  it('flushes the draft in one request', () => {
    const src = strip(read('src/features/profile/pages/MasterProfile.tsx'));
    expect(src).toContain('saveAll');
    expect(src).toMatch(/const saveAll = \(\) => \{[\s\S]{0,220}save\.mutate\(draft,/);
    expect(src).toContain('onClick={saveAll}');
    // And it does not navigate anywhere: the citizen stays on the document
    // their answer just changed.
    expect(src).not.toMatch(/navigate\(/);
  });

  /**
   * ONE PAGE, AND THE DEEP LINKS STILL LAND. (28 Aug.)
   *
   * The fields moved under the passport and /profile/master became a redirect.
   * Every link a hub had already written points at the old path with a section
   * hash on it, so the redirect must carry the hash and the block must scroll
   * to what it names — otherwise "Add it" from the medical record drops
   * somebody at the top of a long page with six sections and no clue which.
   */
  it('keeps the section anchors reachable from another page', () => {
    const src = strip(read('src/features/profile/pages/MasterProfile.tsx'));
    expect(src).toMatch(/window\.location\.hash/);
    expect(src).toMatch(/scrollIntoView/);
    const router = strip(read('src/app/router.tsx'));
    expect(router).toMatch(/path: '\/profile\/master', element: <MasterProfileMoved \/>/);
    expect(router).toMatch(/to=\{`\/profile\$\{hash \|\| '#your-details'\}`\}/);
    // The hubs link straight at the merged page rather than through the hop.
    expect(strip(read('src/features/medical/pages/Records.tsx'))).not.toMatch(/\/profile\/master/);
  });

  /**
   * AND THE PAGE IS CALLED WHAT THE RECORD IS CALLED.
   *
   * "Your passport" was the name of the drawing. The city has one record and
   * the hubs all name it in their locked-field notes; the page a citizen lands
   * on says the same word now.
   */
  it('names the profile page after the record, not the document', () => {
    const page = strip(read('src/features/profile/pages/Profile.tsx'));
    expect(page).toMatch(/<h1[^>]*>Master Profile<\/h1>/);
    expect(page).not.toMatch(/>Your passport</);
    expect(page).toMatch(/<MasterProfileSections \/>/);
    // Two editors for one column on one screen is the defect the record
    // exists to undo — the Identity section owns sex and gender now.
    expect(page).not.toMatch(/<SexAndGenderCard \/>/);
    // The locked-field note points at the record, not at the horoscope form.
    expect(strip(read('src/features/profile/MasterLockedField.tsx'))).toMatch(/to="\/profile#identity"/);
  });
});
