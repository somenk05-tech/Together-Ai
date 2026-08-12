import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

/**
 * A SECTION SOMEBODY HAS ALREADY READ DOES NOT GET TO KEEP THE SCREEN.
 *
 * The Skin & Hair profile is an INPUT surface whose whole output lives
 * elsewhere — the routine tab, the market, the budget. But once it had been
 * filled in it kept printing itself back: three photo tiles and a privacy
 * paragraph, seven skin readings with a recommended routine, five hair readings
 * with another, nine ingredients with a sentence each. Four full screens of
 * answers the citizen had already given or already read, every single visit,
 * in front of the two things on the page that actually change.
 *
 * So each of them folds. Nothing is deleted, nothing is re-asked, and one tap
 * opens any of them again.
 *
 * ── WHY THIS IS A TEST AND NOT A COMMIT MESSAGE ─────────────────────────────
 *
 * Every one of these sections is the obvious place to add the next thing, and a
 * `<div className="card">` with an `<h3>` in it is the obvious way to add it —
 * the file is full of them, correctly, for surfaces that are not this. The fold
 * is one wrapper deep and reverts by accident, silently, and the failure is
 * invisible in review because the section looks completely normal. It only
 * shows up on the eleventh visit, to somebody who is not us.
 *
 * THE HEADER HAS TO SAY SOMETHING. A closed section reading only "SKIN" gives
 * nobody a reason to open it, which is the same as deleting it. Every fold on
 * this page carries a meta line — the counts, and how much of it is not good.
 */
describe('the beauty profile folds what it has already answered', () => {
  const profile = read('features/beauty/pages/Profile.tsx');

  /**
   * The section bodies, by a string that only appears inside each one. Two
   * shapes, and the difference is deliberate: the four sections the owner drew
   * as posters are `BeautyPlate`s, and the parts of the assessment are plain
   * `Collapsible`s. Both fold; only the chapters wear the masthead. Seven
   * posters in a column is the wallpaper failure, and it is the one thing that
   * would make the reference stop reading as a reference.
   */
  const SECTIONS: [name: string, marker: RegExp][] = [
    ['Photos & details', /<BeautyPlate[\s\S]{0,200}Your Photos/],
    ['Create your budget', /<BeautyPlate[\s\S]{0,120}Create<br \/>Your Budget/],
    ['Your timeline', /<BeautyPlate title="Your Timeline"/],
    ['Skin / Hair & scalp', /<BeautyLeaf title=\{title\} meta=\{readingSummary\(part\)\}/],
    ['Ingredients for you', /<BeautyLeaf\s+title="Ingredients for you"/],
    ['Good to know', /<BeautyLeaf title="Good to know"/],
  ];

  it.each(SECTIONS)('folds %s', (_name, marker) => {
    expect(profile).toMatch(marker);
  });

  it('gives every fold a meta line, so a closed one still tells you something', () => {
    // The timeline plate is the one without: its blurb says what it holds and
    // its own card carries the dates directly under it.
    const opens = (profile.match(/<BeautyLeaf\b/g)?.length ?? 0)
      + (profile.match(/<BeautyPlate\b/g)?.length ?? 0);
    const metas = profile.match(/\bmeta=/g)?.length ?? 0;
    expect(opens).toBeGreaterThanOrEqual(6);
    expect(metas).toBeGreaterThanOrEqual(opens - 2);
  });

  it('summarises a reading list by what is NOT good, not just by how many', () => {
    // "7 readings" is a size. "3 to work on" is a reason to open it.
    expect(profile).toMatch(/r\.level !== 'good'/);
    expect(profile).toMatch(/to work on/);
    expect(profile).toMatch(/all good/);
  });

  it('does not print the assessment blocks as bare cards as well', () => {
    // The old shape, and the shape somebody will reach for again: a headed card
    // per part. If either comes back the section stops folding.
    expect(profile).not.toMatch(/<h[1-6][^>]*>\{icon\} \{title\}/);
    expect(profile).not.toMatch(/<h[1-6][^>]*>🧪 Ingredients for you/);
  });

  it('keeps the emoji out of the plates and the index', () => {
    // The reference is a set of printed plates. A 🧴 in a tracked capital
    // heading is the single fastest way to undo one, and every one of these
    // was a heading, or an avatar, before the redesign.
    //
    // Comments stripped: the file records which emoji it removed and why, and
    // a rule that reads comments forbids writing that down.
    const code = profile.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');
    for (const e of ['🧴', '💇', '🧪', '👩', '👨', '🧑']) expect(code).not.toContain(e);
  });

  it('folds on having an assessment, not on the form being finished', () => {
    // The gate used to be `analysis && isBeautyComplete(...)`, so ADDING a
    // question to the form re-opened the whole page for everybody who had
    // already finished it. A section is done when IT has produced something.
    expect(profile).toMatch(/const analysed = Boolean\(analysis\)/);
    expect(profile).not.toMatch(/const done = /);
  });

  it('keeps the photo section open while photos are staged', () => {
    // Switching tabs unmounts this section. Folding it with somebody's photos
    // still inside, one click from the Analyse button, is worse than not
    // folding at all.
    expect(profile).toMatch(/defaultOpen=\{!analysed \|\| picsCount > 0\}/);
  });

  it('folds nothing behind two taps', () => {
    // A Collapsible around the assessment, whose parts are themselves
    // Collapsibles, means two headers between somebody and one reading — and
    // the outer one cannot say anything more useful than the name of the thing
    // inside it.
    expect(profile).not.toMatch(/<Collapsible title="Your assessment"/);
  });
});

/**
 * The component itself. Every one of these was decided once, with a reason, and
 * every one is the kind of thing a later pass "tidies".
 */
describe('the fold itself', () => {
  const c = read('features/beauty/components/Plates.tsx');

  it('gives both faces the same keyboard contract', () => {
    // A plate and a leaf are one behaviour wearing two papers. A poster that
    // opens on click and says nothing to a screen reader is a poster with the
    // interface hidden behind it — and a second implementation of a keyboard
    // contract is how one of them quietly stops announcing itself.
    expect([...c.matchAll(/aria-expanded=\{open\}/g)]).toHaveLength(2);
    expect([...c.matchAll(/aria-controls=\{id\}/g)]).toHaveLength(2);
    expect([...c.matchAll(/ id=\{id\}/g)]).toHaveLength(2);
  });

  it('has no rounded chevron card left to drift back to', () => {
    // The plain Collapsible went with the redesign rather than staying as an
    // unused third option. An unused component is a suggestion.
    expect(c).not.toMatch(/export function Collapsible/);
    expect(c).not.toMatch(/'▾'|'▸'/);
  });

  it('never wraps the panel in the button', () => {
    // What opens out of a plate is a photo grid, a budget slider and a form
    // full of chips. A <button> containing a <button> is markup the browser
    // repairs by pulling one out of the other, silently and differently per
    // engine — and a heading is not allowed in there at all. So: the plate is
    // the section, the face is the button, the panel is the face's sibling.
    const plate = c.slice(c.indexOf('export function BeautyPlate'));
    const faceEnd = plate.indexOf('</button>');
    expect(faceEnd).toBeGreaterThan(0);
    expect(plate.slice(0, faceEnd)).not.toMatch(/\{children\}/);
    expect(plate).toMatch(/<section className="beauty-plate">/);
  });

  it('prints the reference rule on every plate', () => {
    // SKIN · BEAUTY · CARE at the head and the labs line at the foot are what
    // make four separate sections read as one set of prints.
    expect(c).toMatch(/Skin<\/span><span>Beauty<\/span><span>Care/);
    expect(c).toMatch(/foot = 'Together Beauty Labs'/);
    expect(c).toMatch(/beauty-star/);
  });
});

/**
 * THE DISPLAY SERIF IS LENT TO A HUB, NOT TO A PAGE.
 *
 * `.beauty-display` was `.routine-display` — named after the first page that
 * happened to need it. When the owner's poster reference arrived for the skin &
 * hair page, the obvious move was a second class and a sixth entry in
 * relief.spec's grant list, which would have been asking permission to do the
 * thing the existing grant already permits. One hub, one display class.
 *
 * It carries the FACE and nothing else. A class that is both a typeface grant
 * and a size is a class that resizes a masthead on a page nobody was editing.
 */
describe('the beauty display face', () => {
  // A file is allowed to explain itself — the old name is in a comment above
  // the grant, saying why it changed, and a rule that reads comments would
  // forbid recording that.
  const layout = read('styles/layout.css').replace(/\/\*[\s\S]*?\*\//g, ' ');
  const routine = read('features/beauty/pages/Routine.tsx');

  it('is one class, worn by the routine masthead and the profile plates', () => {
    expect(routine).toMatch(/className="beauty-display"/);
    expect(layout).not.toMatch(/routine-display/);
  });

  it('sets no size of its own — only the plate does', () => {
    const grant = layout.slice(layout.indexOf('.letter-title,'), layout.indexOf('.beauty-plate {'));
    expect(grant).toMatch(/font-family: var\(--press-serif\)/);
    expect(grant).not.toMatch(/font-size/);
    expect(layout).toMatch(/\.beauty-plate \.beauty-display \{[^}]*font-size/);
  });
});

/**
 * THREE SURFACES IN THIS HUB AND NO FOURTH.
 *
 * A plate for the four chapters the owner drew, a leaf for the contents of one,
 * and a sheet for everything that is simply content — the progress strip, the
 * dated history, the biomarker panel, the bag's running total. The city's
 * ordinary rounded `.card` is the thing they replace: next to a set of prints
 * it is the one object on the page that came from another design, and it comes
 * back the moment somebody adds a section, because `<div className="card">` is
 * what every other page in this application correctly uses.
 *
 * THE BAG BAR IS HERE FOR A DIFFERENT REASON. It was `position: sticky` and
 * rode up the routine sheet covering the steps somebody was reading — a summary
 * of what is in the bag parked across the products they were deciding whether
 * to put in it. It is the last block of the page now: you reach it by getting
 * to the end, which is also when you have finished deciding.
 */
describe('the beauty hub prints on its own paper', () => {
  const profile = read('features/beauty/pages/Profile.tsx');
  const bar = read('features/beauty/components/BeautyBagBar.tsx');

  it('gives the progress, history and biomarker panels the sheet', () => {
    expect([...profile.matchAll(/className="beauty-sheet"/g)].length).toBeGreaterThanOrEqual(4);
  });

  it('leaves no emoji heading on a beauty surface', () => {
    // 📈 🗓️ 🩸 headed the three panels above. The 🩸 that stays is a MARKER
    // inside a chip — it means "your labs support this one" and is doing work
    // no word does in that width.
    const code = profile.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');
    for (const e of ['📈', '🗓️']) expect(code).not.toContain(e);
    expect(code).not.toMatch(/eyebrow[^>]*>🩸/);
  });

  it('does not stick the bag to the viewport', () => {
    expect(bar).not.toMatch(/position: 'sticky'/);
    expect(bar).toMatch(/className="beauty-sheet"/);
  });

  it('registers every lit surface with the wall ink-restore list', () => {
    // The wall re-points --ink to near-white by inheritance; every class that
    // paints cream must put the paper's ink back in relief.css. The step cards
    // and the sheets both shipped without doing so, and both went out with
    // near-white product names on cream — invisible in review because every
    // local harness restored the ink by hand. A surface class missing from
    // this list is that bug again.
    const relief = read('styles/relief.css');
    const list = relief.slice(relief.indexOf('[data-hub="beauty"] .card,'));
    // Controls joined the list after the live Market page was measured: the
    // sort select's face was cream and its label near-white. A form control is
    // a lit surface exactly like a card, and it is the kind of thing nobody
    // thinks of as a "surface" until it is invisible.
    for (const cls of ['.beauty-plate', '.beauty-sheet', '.beauty-leaf-open', '.routine-card',
                       '.btn-line', 'select', 'input', 'textarea']) {
      expect(list.slice(0, list.indexOf('{'))).toContain(`[data-hub="beauty"] ${cls}`);
    }
    // …and the loud button must stay OUT of it: it is a black face with its own
    // foreground, and the paper's ink would erase its label instead of saving it.
    for (const cls of ['.btn-loud', '.btn-accent']) {
      expect(list.slice(0, list.indexOf('{'))).not.toContain(`[data-hub="beauty"] ${cls}`);
    }
  });

  it('never inflates or crops a product photograph', () => {
    // Three constraints, and all three were learned the hard way. `auto` +
    // max stops a small retailer JPEG being upscaled into a blur. `contain`
    // stops a landscape shot losing its top and bottom — max-height alone
    // letterboxes a portrait correctly and crops a landscape, which is why the
    // live cards had bottles with their caps cut off. `no-case` because an
    // outline drawn round a cut-out is an outline round nothing.
    const shot = read('features/beauty/components/ProductShot.tsx');
    // scale-down, not max-width/max-height + auto: a percentage max-height
    // against an auto-sized track is circular and the browser drops it, which
    // is how a 500x1200 shot came to render 578px tall in a 210px well.
    expect(shot).toMatch(/width: '100%', height: '100%', objectFit: 'scale-down'/);
    expect(shot).not.toMatch(/maxHeight: '100%'/);
    expect(shot).toMatch(/className=\{fill \? 'no-case' : undefined\}/);
    // And no blend left behind: it was melting a white studio ground into
    // cream, and an OFF-white ground melted into a grey-green box instead.
    expect(shot).not.toMatch(/mixBlendMode/);
  });

  it('stands a product shot on the ground it was photographed on', () => {
    // Every one of these is hotlinked from a retailer and lit on white. The
    // well is white for that reason and for no other — nothing is read on it.
    const layout = read('styles/layout.css');
    expect(layout).toMatch(/\.routine-well \{[^}]*background: var\(--shot-ground\)/);
    const tokens = read('styles/tokens.css');
    expect(tokens).toMatch(/--shot-ground: var\(--paper\)/);   // inert at the root
    expect(tokens).toMatch(/--shot-ground: #ffffff/);            // white in this hub
  });

  it('does not send somebody to a retailer from anywhere in the hub', () => {
    // The card carries the photograph, the brand, the size, the life and the
    // price — it IS the product page — and the next thing it wants is the bag.
    // Both pages, because the Market kept its link for a day after the Routine
    // lost one and the inconsistency is what made it easy to miss.
    for (const f of ['features/beauty/pages/Routine.tsx', 'features/beauty/pages/Market.tsx']) {
      expect(read(f)).not.toMatch(/target="_blank"/);
    }
  });

  it('gives the shop and the shelf a sheet to stand on', () => {
    // Without one, a grid of white product tiles sits straight on the black
    // wall and the page reads as a different application from the rest of the
    // hub. The owner chose: wall stays, every page gets a sheet.
    for (const f of ['features/beauty/pages/Market.tsx', 'features/beauty/pages/Orders.tsx']) {
      expect(read(f)).toMatch(/<div className="beauty-sheet">/);
    }
  });

  it('gives the rail the hub own paper', () => {
    const relief = read('styles/relief.css');
    expect(relief).toMatch(/\[data-hub="beauty"\] \.tc-side \{ background: var\(--card\); \}/);
  });
});
