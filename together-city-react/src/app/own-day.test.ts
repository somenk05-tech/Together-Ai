import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p: string) => readFileSync(join(APP, p), 'utf8');
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

/**
 * THE PAGE CALLED "CREATE YOUR OWN MEAL PLAN" DID NOT CREATE A MEAL PLAN.
 *
 * Adding recipes by hand filled a sticky bar that counted picks and offered one
 * button: turn them into a grocery list. So the page named for building a plan
 * produced a shopping trip, and the plan itself — which day these dishes are
 * for, what the day adds up to, whether it is settled — existed nowhere.
 *
 * It builds a day now: dishes land in their courses, the day is read on the
 * same press as the engine's, and locking it fixes it, writes its ingredients
 * to the grocery list, and moves the next dish added to tomorrow.
 */
describe('a citizen builds a day, not a basket', () => {
  const view = strip(read('src/features/nutrition/components/OwnDayView.tsx'));
  const page = strip(read('src/features/nutrition/pages/RecipeLibrary.tsx'));
  const api = strip(read('src/features/nutrition/composed.api.ts'));
  const css = read('src/styles/relief.css');

  it('reads the day on the Weekly Meal Planner\'s own press', () => {
    // Not a lookalike assembled from inline styles — the same classes, so the
    // two days cannot drift apart the next time the press is retouched. The
    // dish TABLE is the one piece this page does not share: a day you are
    // choosing is set as a menu (see below), where the engine's day is read
    // down as a ledger.
    for (const cls of ['press-sheet', 'press-hero', 'press-stats', 'press-aside']) {
      expect(view).toContain(`"${cls}"`);
    }
    // The course carries a state class now, so it is written as a template.
    expect(view).toMatch(/className=\{`press-course\$\{/);
    expect(view).toMatch(/data-press/);
    // The sheet used to be handed a weekday through `data-paper`, because the
    // week had a photograph per day. It has one sky since 20 Aug, so there is
    // nothing to hand it — and a page that starts handing it one again is
    // rebuilding the thirteen papers.
    expect(view).not.toMatch(/data-paper|paperFor/);
  });

  it('sets each course as a menu, and invents no photograph', () => {
    // The picture is the thing that answers "do I want to eat that", and the
    // corpus already holds it. A dish the corpus has no image for gets a tinted
    // panel with its own name on it — never a stock photograph of something
    // similar, which would be a picture of food nobody is going to cook.
    expect(view).toContain('"press-menu"');
    expect(view).toContain('"press-plate"');
    expect(view).toMatch(/c\.imageUrl\s*\n?\s*\?\s*<img/);
    expect(view).toMatch(/<figcaption>\{c\.name\}<\/figcaption>/);
    expect(view).not.toMatch(/placeholder\.|unsplash|picsum|\/stock\//i);
    // The calories sit where a menu puts a price: on the rule, with the name.
    expect(view).toContain('"press-plate-kcal"');
    for (const cls of ['.press-menu', '.press-plate-fig', '.press-plate-line']) {
      expect(css).toContain(cls);
    }
  });

  it('knows what time it is, without inventing how long a course lasts', () => {
    // A course carries the hour it is eaten at and nothing carries an end time.
    // So the course you are in is the LAST one whose hour has come — anything
    // else would be a duration this page made up.
    expect(view).toMatch(/const currentIdx = live/);
    expect(view).toMatch(/at !== null && at <= nowMin \? i : found/);
    expect(view).toMatch(/is-past/);
    expect(view).toMatch(/is-now/);
    // Only the day the clock is actually on may say "Now".
    expect(view).toMatch(/live=\{day\.dayIndex === plan\.todayIndex\}/);
    // And it ticks, so the marker moves and midnight rolls over unaided.
    expect(view).toMatch(/setInterval\(\(\) => setNow\(new Date\(\)\), 60_000\)/);
  });

  it('shows the plan the server holds, never a second list beside it', () => {
    // A tile reading "Added" while the day does not contain the dish is the
    // failure this rules out: there is one copy of the truth and it is remote.
    expect(page).toMatch(/const picked[^=]*=\s*Object\.fromEntries\(/);
    expect(page).not.toMatch(/useState<[^>]*>\(\[\]\)[^\n]*pick/i);
    expect(page).toMatch(/own\.data\?\.days\.find\(/);
  });

  it('lets the server decide which day a dish lands on', () => {
    // The rule is "today until you lock it, then tomorrow". If the page sent a
    // day index, two tabs open at once would each send their own idea of it.
    expect(api).toMatch(/useAddToOwnPlan = \(\) => useOwnMutation<\{ recipeId: string \}>/);
  });

  it('never tops the day up to a target', () => {
    // The totals are the honest sum of what they put on it. A hand-built day
    // that quietly gets corrected is not hand-built.
    // It is handed no way to put anything on the day: the only callbacks it
    // has take things off it or settle it. Every figure it prints is the day's
    // own sum, and the target is only ever a denominator.
    expect(view).toMatch(/onRemove:.*=> void/);
    expect(view).toMatch(/onLock:.*=> void/);
    expect(view).toMatch(/onUnlock:.*=> void/);
    expect(view).not.toMatch(/onAdd\b|composeDay|topUp|autoAdd/);
    expect(view).toMatch(/const t = day\.totals/);
  });

  it('offers no way to change a locked day from inside it', () => {
    // Its ingredients are already on the grocery list. A dish that can leave
    // the day but not the basket is a lie whichever one you believe.
    expect(view).toMatch(/\{!locked && \(/);
    expect(view).toMatch(/onUnlock\(day\.dayIndex\)/);
  });

  it('distinguishes an empty day from a day it could not read', () => {
    expect(view).toMatch(/failed \|\| !plan/);
    expect(view).toMatch(/We couldn’t open your plan/);
    expect(view).toMatch(/Nothing on it yet/);
  });

  it('puts the plan first on the page, on both of its views', () => {
    // It sat under a paginated grid of two hundred recipes — the one place
    // somebody looking for the plan they are building will not scroll to. After
    // locking a day, the confirmation that anything happened was three screens
    // down.
    const first = page.indexOf('{buildBar}');
    expect(first).toBeGreaterThan(-1);
    // Twice: once on the cuisine landing, once inside a cuisine.
    expect((page.match(/\{buildBar\}/g) ?? []).length).toBe(2);
    // …and before the tile grid in both places.
    const grid = page.indexOf('lib.data?.items.map');
    expect(page.lastIndexOf('{buildBar}')).toBeLessThan(grid);
  });

  it('opens one day and files every other one as a row', () => {
    // Every day with dishes used to print in full, under two headings, so a
    // citizen who had settled a week scrolled past seven complete newspapers to
    // reach the day they were building. One sheet is open — the one being built
    // — and the rest are rows that open on request.
    expect(view).toMatch(/const \[openRow, setOpenRow\] = useState<number \| null>\(null\)/);
    expect(view).toContain('"own-day-row"');
    expect(view).toMatch(/aria-expanded=\{expanded\}/);
    expect(view).toMatch(/\{openRow === d\.dayIndex && sheet\(d\)\}/);
  });

  it('strands no day it has food for, locked or not', () => {
    // Two filtered lists meant anything matching neither was dropped on the
    // floor: three dishes added on Thursday and not locked were invisible on
    // Friday, because Thursday was neither the open day nor a locked one. ONE
    // filter cannot strand anything, and the row says which kind of day it is.
    expect(view).toMatch(/plan\.days\s*\n?\s*\.filter\(\(d\) => d\.dayIndex !== plan\.targetDay && d\.meals\.length > 0\)/);
    expect(view).toMatch(/day\.locked \? 'Locked' : 'Not locked'/);
    // Filed under the calendar date, not "day 3" — the only label that still
    // means something a week later.
    expect(view).toMatch(/`Locked · \$\{longDate\(day\.dayISO\)\}`/);
    expect(view).toMatch(/day: 'numeric', month: 'long', year: 'numeric'/);
  });

  it('draws the whole month, and lets it navigate but not edit', () => {
    // The plan was always a calendar month — the server anchors day 0 to the
    // 1st — and the page showed one day of it with no way to tell whether that
    // was the 2nd or the 30th. Tapping a day OPENS it; which day a dish lands
    // on stays the server's call, so two tabs cannot disagree about "today".
    expect(view).toContain('"own-month-strip"');
    expect(view).toMatch(/Array\.from\(\{ length: total \}/);
    expect(view).toMatch(/Number\.isFinite\(plan\.planDays\)/);
    // A day with nothing on it is not a control: a button that does nothing
    // when pressed teaches people the strip is broken.
    expect(view).toMatch(/const has = locks\.has\(i\) \|\| filled\.has\(i\)/);
    expect(view).toMatch(/has \? \(/);
    // …and it sends no day index anywhere. Locking is what moves the day.
    expect(view).not.toMatch(/onAddTo|targetDay:\s*i|setTargetDay/);
    expect(view).toMatch(/Lock it and the next dish you add starts the day after/);
  });

  it('says how far over or under, not what percentage', () => {
    // "68% of target" is a number you have to do arithmetic on before it tells
    // you anything. "480 under" is the same fact, already answered. It prints
    // nothing where there is no prescription — a gap from a target we do not
    // have is invented, which is why 0% and 100% were both wrong here.
    expect(view).toMatch(/d > 0 \? 'over' : 'under'/);
    expect(view).toMatch(/d === 0 \? 'on target'/);
    expect(view).not.toMatch(/of target/);
    // Measured against the prescription's own five keys, not against energy share.
    for (const k of ['kcal', 'protein', 'carb', 'fat', 'fiber']) {
      expect(view).toContain(`gap(t.${k === 'carb' ? 'carbs' : k}, target?.${k})`);
    }
  });

  it('scales the shopping by the household and the nutrition by nobody', () => {
    // The count lived on the Grocery page, so the citizen chose dishes here and
    // found out a page later that the quantities were for one. It moves what is
    // BOUGHT: the figures above it are one person's intake, and multiplying a
    // citizen's own target by their household would turn it into a number about
    // the kitchen.
    expect(view).toContain('"own-people"');
    expect(view).toMatch(/onPeople\(Math\.max\(1, people - 1\)\)/);
    expect(view).toMatch(/onPeople\(Math\.min\(12, people \+ 1\)\)/);
    expect(view).toMatch(/stay one person's/);
    // No totals are multiplied by it anywhere.
    expect(view).not.toMatch(/totals[^\n]*\*\s*people|people\s*\*[^\n]*totals|kcal \* people/);
    // It is set once, on the day being built — not on every day it applies to.
    expect(view).toMatch(/people=\{lead \? \(plan\.people \?\? 1\) : undefined\}/);
    // And it is written through the one endpoint that has ever stored it.
    expect(api).toMatch(/useSetOwnPeople/);
    expect(api).toMatch(/'\/nutrition\/grocery\/plan', \{ params: \{ mode: 'individual', people \} \}/);
  });

  it('states one sum once', () => {
    // The five figures printed three times on one card — hero, aside bars,
    // footer — and the sticky column sat over the footer on the way past. The
    // hero states them; nothing restates them.
    expect(view).not.toContain('press-foot');
    expect(view).not.toMatch(/Nutrition summary/);
    expect((view.match(/press-stats/g) ?? []).length).toBe(1);
  });

  it('states no percentage it has no target for', () => {
    // 0% and 100% are both claims about a prescription that is not on file.
    expect(view).toMatch(/typeof of === 'number' && of > 0/);
  });
});

/**
 * THE CART LEFT THE SIDEBAR, AND CHECKOUT DID NOT LEAVE WITH IT.
 *
 * The Cart was a hub key in Nutrition and in Family. Removing it is what was
 * asked for — but a key is also the only way most people reach a screen, and
 * an orphaned checkout is worse than a cluttered sidebar. Grocery carries the
 * link now, which is where somebody with a list in front of them looks.
 */
describe('the cart is off the sidebar and still reachable', () => {
  const hubs = strip(read('src/config/hubs.ts'));

  it('is not a key in Nutrition or in Family', () => {
    expect(hubs.match(/label: 'Cart'/g) ?? []).toEqual([]);
    expect(hubs).not.toMatch(/'\/nutrition\/cart'/);
    expect(hubs).not.toMatch(/'\/family\/cart'/);
  });

  it('is linked from both grocery lists instead', () => {
    for (const p of ['src/features/nutrition/pages/Grocery.tsx', 'src/features/family/pages/Grocery.tsx']) {
      expect(strip(read(p))).toMatch(/\/cart/);
    }
  });
});
