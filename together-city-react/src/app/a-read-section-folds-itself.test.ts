import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const stripTs = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

/** Every source file under src/, so a rule about "anywhere in the app" can
 *  actually say anywhere rather than "in the two files I thought of". */
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    return /\.tsx?$/.test(e.name) ? [relative(SRC, full)] : [];
  });
const PAGES = walk(SRC);

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
    // The longest read-once block on the page: a marker, a chip, a mechanism
    // and an advice line each, from a panel drawn weeks ago. Its no-panel
    // branch is deliberately NOT folded — that one is an invitation to add a
    // blood test, and a fold is a good way to make an invitation invisible.
    ['Biomarker correlation', /<BeautyLeaf title="Biomarker correlation" meta=/],
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

  it('gives every face the same keyboard contract, from one place', () => {
    // A plate and a leaf are one behaviour wearing two papers, and a section
    // that opens on click while saying nothing to a screen reader is an
    // interface hidden behind a heading.
    //
    // THIS USED TO COUNT TWO PAIRS IN Plates.tsx ALONE, and the count was the
    // whole guard: a second implementation is how one of them quietly stops
    // announcing itself. When the Financial hub needed folds, the choice was a
    // third copy of those four lines or one component wearing three skins —
    // so the contract moved to components/ui/Fold.tsx and the leaf delegates.
    //
    // The guard did not weaken, it moved: the plate keeps its own pair because
    // it is a different element with its own markup, the shared Fold has
    // exactly one, and — the part that matters — NOWHERE ELSE has any. That
    // last assertion is the one that would have caught the copy this change
    // exists to prevent, and it reads every page in the app.
    const fold = read('components/ui/Fold.tsx');
    expect([...c.matchAll(/aria-expanded=\{open\}/g)]).toHaveLength(1);      // the plate
    expect([...fold.matchAll(/aria-expanded=\{open\}/g)]).toHaveLength(1);   // everything else
    expect([...fold.matchAll(/aria-controls=\{id\}/g)]).toHaveLength(1);
    expect([...fold.matchAll(/ id=\{id\}/g)]).toHaveLength(1);
    // And the leaf is the Fold rather than a copy of it.
    expect(c).toMatch(/<Fold title=\{title\} meta=\{meta\} defaultOpen=\{defaultOpen\}/);
    expect(c).toMatch(/face="beauty-leaf" panel="beauty-leaf-open"/);
  });

  it('keeps the list of things that expand on their own short, and named', () => {
    // The assertion the old count could not make: it read one file, so a fold
    // written anywhere else was invisible to it. This reads every source file
    // in the app and names what it is allowed to find.
    //
    // AND `aria-expanded` IS NOT A SYNONYM FOR "FOLD" — the first draft of this
    // assumed it was and failed on three components that are all correct. A
    // combobox announces its listbox with the same attribute. So this is a list
    // with reasons rather than a count, and a NEW entry has to argue for itself
    // the way an entry in nav-audit's UNREACHABLE_ON_PURPOSE does:
    //
    //   ui/Fold.tsx        the one disclosure; everything below is why it is
    //                      worth having exactly one
    //   beauty/Plates.tsx  the PLATE — a poster that opens, its own markup and
    //                      its own paper. The leaf beside it delegates to Fold.
    //   SearchSelect       a combobox, `aria-haspopup="listbox"`. Not a section
    //                      that folds; a control that offers options.
    //   mail/MessageView   a thread: quoted text and a collapsed message stack,
    //                      three different expanders inside one reader.
    //   mail/Compose       the ... key over a reply's quoted trail. The one
    //                      genuine DISCLOSURE on this list that is not a Fold,
    //                      and deliberately not one: a Fold is a titled
    //                      section of a page, and this is a three-dot control
    //                      inside a form, which is the shape every mail client
    //                      has settled on for exactly this.
    //   mail/Projects      the ... key on a project folder: `aria-haspopup=
    //                      "menu"`. Open, Archive, Delete — a menu of actions
    //                      on an object, not a section of the page that folds.
    //   mail/MoveToProject the same shape: a key that offers the rooms a
    //                      conversation can move to. Both carry aria-haspopup
    //                      precisely so this list stays readable — a menu and
    //                      a fold both use aria-expanded, and the attribute
    //                      that tells them apart is the one they now have.
    //   social/report      the flag key on a post, a comment or a person, and
    //                      the reasons it offers. `aria-haspopup="menu"` like
    //                      the two mail keys above, and on this list for the
    //                      same reason they are: a menu and a fold both carry
    //                      aria-expanded, and the list is where the difference
    //                      gets said out loud. It replaced a `window.prompt`
    //                      (30 Aug audit) — which had no categories, no cancel
    //                      on some phones, and did not exist at all where
    //                      popups are blocked.
    //   TargetsDisclosure  A GENUINE FOURTH FOLD, and the one thing on this
    //                      list that should probably become a Fold. Left alone
    //                      deliberately — it is in another hub, it was not what
    //                      this change was asked to touch, and moving it blind
    //                      is how a UI change becomes a regression somewhere
    //                      nobody was looking. Recorded here rather than fixed
    //                      quietly or forgotten.
    const owners = PAGES.filter((f) => {
      const src = stripTs(read(f));
      return /aria-expanded=\{open\}/.test(src) && /useState\(/.test(src);
    }).sort();
    expect(owners).toEqual([
      'components/SearchSelect.tsx',
      'components/ui/Fold.tsx',
      'features/beauty/components/Plates.tsx',
      // MARKET LEFT THIS LIST ON 6 SEP, which is the direction it is supposed
      // to move in. Its Details drawer was a hand-rolled toggle — the entry
      // above used to argue that a per-tile disclosure inside a shop grid was
      // not a titled section of a page, the same argument as Compose's
      // three-dot key. Then the owner's shop reference asked for the card's
      // text behind rows you open, and a row with a name on it IS a titled
      // section. It is a Fold now, so there is one fewer implementation of the
      // four lines this whole guard exists to count.
      'features/mail/MoveToProject.tsx',
      'features/mail/pages/Compose.tsx',
      'features/mail/pages/MessageView.tsx',
      'features/mail/pages/Projects.tsx',
      'features/nutrition/components/TargetsDisclosure.tsx',
      'features/social/report.tsx',
    ]);
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
 * THE DISPLAY TITLE IS LENT TO A HUB, NOT TO A PAGE.
 *
 * `.beauty-display` was `.routine-display` — named after the first page that
 * happened to need it. When the owner's poster reference arrived for the skin &
 * hair page, the obvious move was a second class and a sixth entry in
 * relief.spec's grant list, which would have been asking permission to do the
 * thing the existing grant already permits. One hub, one display class.
 *
 * IT CARRIED THE FACE; IT CARRIES THE WEIGHT NOW. The display serif left on
 * 2 Sep with the rest of the second typefaces — one font system for the whole
 * site — and what makes these six read as titles in one typeface is what
 * always did half the work: being LIGHTER and larger than everything near
 * them. So the shared rule is `font-weight: 400` and the test below is
 * unchanged in its point — a class that is both a title grant and a SIZE is a
 * class that resizes a masthead on a page nobody was editing.
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
    expect(grant).toMatch(/font-weight: 400/);
    // and it must not have quietly regained a family: one font system means
    // the six titles are --sans like everything else, by inheritance.
    expect(grant).not.toMatch(/font-family/);
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

  it('gives the progress, history and biomarker panels a surface of the hub', () => {
    // THE COUNT WENT FROM 4 TO 3 AND NOTHING REGRESSED, which is why this is
    // not simply a smaller number. The biomarker panel is a `BeautyLeaf` now,
    // and a leaf's open body is `.beauty-leaf-open` — the same cream, the same
    // hairline, the same lift, the same entry in the ink-restore list. It did
    // not lose its surface, it changed shape.
    //
    // The bare-on-the-ground failure this was written against is still the one
    // being checked; it is now checked in two parts, because "at least four of
    // this string" could never say WHICH panel lost its paper. The leaf is
    // pinned by name in the fold list at the top of this file.
    expect([...profile.matchAll(/className="beauty-sheet"/g)].length).toBeGreaterThanOrEqual(3);
    expect(profile).toMatch(/<BeautyLeaf title="Biomarker correlation"/);
    // And it is not BOTH — a leaf wrapped in a sheet is two papers deep.
    expect(profile).not.toMatch(/className="beauty-sheet"[\s\S]{0,80}<BeautyLeaf title="Biomarker/);
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

  /* ── THE INK-RESTORE LIST WAS CHECKED HERE, AND THERE IS NO WALL (23 Aug)
     The invariant was: the gallery wall re-points --ink to near-white by
     inheritance, so every class that paints cream must put the paper's ink
     back — and a surface missing from that list shipped near-white product
     names on cream, invisible in review because every local harness restored
     the ink by hand.

     THE WALL IS GONE. Beauty handed its ground back with the other three when
     the owner asked for one colour rule in every hub, so nothing re-points
     --ink by inheritance and there is nothing to restore. The bug this
     guarded cannot happen without a wall to cast it.

     TO WANT IT BACK: a hub re-pointing --ink again. relief.spec's granted list
     is the gate on that, it is empty, and it is where the argument would have
     to be made first. */


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

  /* ── --shot-ground WENT WITH THE WALL. A product photographed on white was
     stood on its own white rather than on the gallery's cream, because a
     cut-out on the wrong ground reads as a badly masked cut-out. Every ground
     in this hub is the city's paper now and the shot is on the paper it was
     photographed on by default. */


  it('carries the studio white out of the well and across the product sections', () => {
    // THIS FILE USED TO SAY "nothing is read on it", and the token file said the
    // same. At the owner's word the product sections came off the cream, and
    // that white now dresses the routine's bands, the routine card and the
    // market's shop sheet — every one of which carries type. The claim is
    // retired in both places, because "no text on this surface" is exactly the
    // sort of note a later reader trusts instead of checking.
    //
    // ONE TOKEN, NOT THREE WHITES. A card whose well is white by one rule and
    // whose body is white by another is a card that grows a seam the first time
    // either is nudged.
    const layout = read('styles/layout.css');
    expect(layout).toMatch(/\.beauty-sheet\.is-shop,\s*\.routine-card \{\s*background: var\(--shot-ground\);/);
    expect(layout).not.toMatch(/\.routine-card \{[^}]*background: var\(--card\)/);
    // The sections that take it are the ones with merchandise in them and no
    // others — the profile's sheets and an opened leaf keep the hub's paper.
    const routine = read('features/beauty/pages/Routine.tsx');
    expect(routine).toMatch(/className="beauty-sheet is-shop routine-day"/);
    expect(routine).toMatch(/className="beauty-sheet is-shop"/);
    // The assurance strip is not a product section and keeps the cream.
    expect(routine).toMatch(/className="routine-assure beauty-sheet"/);
  });

  it('leaves the product sections flat — no edge, no lift, no seam', () => {
    // CASING SEPARATES THINGS OF DIFFERENT VALUE FROM THEIR GROUND — a
    // photograph from the paper it sits on. Between two whites it draws the
    // join rather than the thing, and white cards with a hairline and a lift,
    // on a white section with a hairline and a lift, on a white page, is three
    // edges and two shadows around surfaces that are all the same colour.
    //
    // What separates one product from the next is the gap and the block of type
    // in it, which is how a printed catalogue does it.
    const layout = read('styles/layout.css');
    const rule = (sel: string) => layout.slice(layout.indexOf(sel)).split('}')[0];

    // The section and the card, set once, together.
    expect(rule('.beauty-sheet.is-shop,')).toMatch(/border: 0; box-shadow: none;/);
    // And neither takes an edge or a lift back on its own afterwards. `border-`
    // catches width, style and colour, so `border-color: transparent` — which
    // still occupies its pixel and misaligns a row — fails this too.
    //
    // ANCHORED ON THE DECLARATION AFTER THE SELECTOR, because `.routine-card {`
    // also appears in the shared white rule above — where `box-shadow: none` is
    // the correct answer. Matching the first occurrence read that rule instead
    // and failed on the very declaration it was written to require.
    expect(rule('.routine-card {\n  display: flex')).not.toMatch(/border-(?!radius)|box-shadow/);
    // No seam under the photograph: it separated studio white from cream, and
    // there is one material now.
    expect(rule('.routine-well {')).not.toMatch(/border/);
    // The plate number keeps its cream — it has to be found against a white
    // photograph — and gives up its lift with everything else.
    expect(rule('.routine-num {')).toMatch(/background: var\(--card\)/);
    expect(rule('.routine-num {')).not.toMatch(/box-shadow/);
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
    // Without one, a grid of product tiles sits straight on the room's ground
    // and the page reads as a different application from the rest of the hub.
    // THE ORIGINAL REASON WAS THE BLACK WALL and that wall is white now, which
    // does not retire the rule: a sheet is a defined content area — an edge, a
    // lift and a measure — and a page without one is a page whose content runs
    // to the width of the window.
    //
    // THE MODIFIER IS ALLOWED, THE WRAPPER IS NOT OPTIONAL. Market's sheet took
    // `is-shop` when the product sections went white, so this matches a class
    // LIST beginning with beauty-sheet rather than the bare string it used to
    // pin. `[\w -]*` and not `.*`: a modifier may follow, an arbitrary
    // expression may not, and `className={cond ? "beauty-sheet" : ""}` — a
    // sheet that is sometimes there — still fails.
    for (const f of ['features/beauty/pages/Market.tsx', 'features/beauty/pages/Orders.tsx']) {
      expect(read(f)).toMatch(/<div className="beauty-sheet[\w -]*">/);
    }
  });

  /* ── AND THE RAIL FLOATED BECAUSE THERE WAS A SKY BEHIND IT. There is not;
     it is a panel on paper, the same as every other rail in the city, and the
     frost it floated in went with the picture it was floating on. */

});

/**
 * ONE SCROLL, NO TABS — owner, 6 Sep: "your details page needs to be below
 * the images."
 *
 * The photographs stood at the top and a tab row under them chose between the
 * assessment and the questions it is read against. The row is gone: the
 * details follow the photographs directly, folded to a summary once they are
 * saved, and the analysis follows the details — the order the assessment is
 * made in. The two places that used to switch a tab glide to the section.
 */
describe('the skin and hair page is one scroll', () => {
  const page = stripTs(read('features/beauty/pages/Profile.tsx'));
  const at = (needle: string) => page.indexOf(needle);

  it('draws the photographs, then the details, then the analysis', () => {
    const photos = at('Your photos');
    const details = at('<div id="beauty-details">');
    const analysis = at('<div id="beauty-analysis">');
    expect(photos).toBeGreaterThan(-1);
    expect(details).toBeGreaterThan(photos);
    expect(analysis).toBeGreaterThan(details);
    expect(page).not.toMatch(/beauty-tabs|setTab|tab === '/);
    expect(read('styles/layout.css')).not.toMatch(/\.beauty-tabs/);
  });

  it('keeps the before-and-after with the photographs', () => {
    // The progress a photograph makes belongs beside the photograph, not
    // under eighteen questions.
    expect(at('<ProgressView entries={progress} />')).toBeLessThan(at('<div id="beauty-details">'));
  });

  it('counts the steps once, above everything', () => {
    expect((page.match(/<OnboardingProgress \/>/g) ?? []).length).toBe(1);
    expect(at('<OnboardingProgress />')).toBeLessThan(at('Your photos'));
  });

  it('glides to a section where it used to switch a tab', () => {
    // The last required photo landing, and "Complete your profile", go down
    // to the details; a generated assessment goes down to the analysis.
    expect(page).toMatch(/glideTo\('beauty-details'\)/);
    expect(page).toMatch(/onSuccess: \(\) => \{ void runAnalysis\(\); glideTo\('beauty-analysis'\); \}/);
  });

  it('draws the assessment once', () => {
    // The details tab used to close with its own copy of the assessment, for
    // somebody who had just saved. On one page that would be the same reading
    // twice, one screen apart.
    expect((page.match(/<AssessmentView a=\{analysis\}/g) ?? []).length).toBe(1);
  });
});
