import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const plan = readFileSync(join(web, 'features', 'nutrition', 'pages', 'MealPlan.tsx'), 'utf8');
const card = readFileSync(join(web, 'features', 'nutrition', 'components', 'ComposedMealCard.tsx'), 'utf8');
/**
 * ABOUT-THIS-MENU MOVED, AND THIS FOLLOWED IT RATHER THAN RELAXING.
 *
 * The panel used to be declared inside MealPlan.tsx. It now lives beside the
 * printed sheet in components/PressDay.tsx, because the FAMILY planner prints
 * the same plate and neither page should own the other's copy of it. The three
 * assertions below are unchanged in substance — they still check the same
 * sentences on the same panel — they just read the file it is in now.
 *
 * The alternative was widening each regex until it matched either file, which
 * is how a guard stops being able to say where anything is.
 */
const sheet = readFileSync(join(web, 'features', 'nutrition', 'components', 'PressDay.tsx'), 'utf8');

/**
 * The planner rail answers the two questions a menu raises.
 *
 * From the owner's mockup: the day's shopping, and what the menu actually is,
 * beside the menu rather than on another screen.
 *
 * Both panels are built from data already on the page — every component carries
 * its own ingredient list and its own totals — which is the property worth
 * guarding. Nothing here fetches, so nothing here can disagree with what the
 * citizen is looking at.
 *
 * THE TWO LINES THAT ARE EASY TO DELETE AND EXPENSIVE TO LOSE:
 *
 * "Not on your grocery list yet." The grocery list is built from LOCKED days.
 * Showing an unlocked day's ingredients under a shopping heading, with no such
 * line, is the screen reporting a decision the citizen has not made — and they
 * would find out at the shop.
 *
 * "…come from 9 of these 12 dishes." The nutrition panel prints sodium and
 * potassium computed only from ingredients we recognise. Without the count, a
 * partial figure reads as a total, and a hypertensive citizen reads a sodium
 * number for two thirds of their day as a number for their day.
 */
describe("the day's shopping panel", () => {
  it('is in the rail', () => {
    expect(plan).toMatch(/<DayShoppingPanel\b/);
    expect(plan).toMatch(/function DayShoppingPanel\(/);
  });

  it('never claims an unlocked day is already on the list', () => {
    expect(plan).toMatch(/locked=\{\(wk\.locks \?\? \[\]\)\.includes\(dayIndex\)\}/);
    expect(plan).toMatch(/Not on your grocery list yet/);
    expect(plan).toMatch(/lock the day to add them/);
  });

  it('leaves out what a kitchen already has, and says how much it left out', () => {
    expect(plan).toMatch(/if \(ing\.pantry \|\| ing\.toTaste\) \{ pantry \+= 1; continue; \}/);
    expect(plan).toMatch(/pantry item\{pantry === 1/);
  });

  it('does not shop for a dish that was skipped', () => {
    // A skipped component stays in meal.components — the card dims it rather
    // than removing it — so a naive sum would buy ingredients for a dish the
    // citizen has taken off their plate.
    expect(plan).toMatch(/const off = skippedRolesFor\(skips, dayIndex, meal\.slot\);/);
    expect(plan).toMatch(/if \(off\.has\(c\.role\)\) continue;/);
  });
});

describe('about this menu', () => {
  it('is in the rail', () => {
    // Still rendered BY the planner, now declared beside the sheet.
    expect(plan).toMatch(/<AboutThisMenu\b/);
    expect(sheet).toMatch(/export function AboutThisMenu\(/);
  });

  it('says how much of the micronutrient picture it could actually compute', () => {
    expect(sheet).toMatch(/nutrientComplete/);
    expect(sheet).toMatch(/a floor, not a total/);
  });

  it('states the eating window only on a day that has one', () => {
    // A day with no fasting protocol has no window to state, and printing one
    // anyway would invent a restriction nobody set.
    expect(sheet).toMatch(/if \(d\.fasting\) facts\.push\(/);
  });
});

describe('per-section totals', () => {
  it('print the macros, not just the calories', () => {
    for (const m of ['protein', 'carbs', 'fat', 'fiber']) {
      expect(card).toMatch(new RegExp(`Math\\.round\\(meal\\.totals\\.${m}\\)`));
    }
  });

  it('read the meal totals the server already sends, rather than re-adding the components', () => {
    // Summing the components here would drift from the day total the rail
    // prints the moment a portion is scaled or a dish is skipped.
    expect(card).not.toMatch(/components\.reduce\(\([^)]*\)\s*=>\s*[^)]*protein/);
  });
});

/**
 * The skip-key readers moved out of the component file.
 *
 * A file exporting both components and plain functions breaks Fast Refresh, and
 * eslint says so. It was tolerable while ComposedMealCard was the only reader;
 * the shopping panel made it a second one, which is the point at which "shared
 * helper living in a component file" stopped being a warning and started being
 * the wrong shape.
 */
describe('skip keys are read in one place', () => {
  const skips = readFileSync(join(web, 'features', 'nutrition', 'skips.ts'), 'utf8');

  it('has both readers', () => {
    expect(skips).toMatch(/export function skippedRolesFor\(/);
    expect(skips).toMatch(/export function skippedSlotsFor\(/);
    expect(card).not.toMatch(/export function skippedRolesFor\(/);
    expect(card).not.toMatch(/export function skippedSlotsFor\(/);
  });

  it('still refuses to read a dish key as a whole skipped meal', () => {
    // `d3:l` is a skipped lunch; `d3:l:dal` is one dish inside it. Drop the
    // colon check and skipping a dal replaces the whole plate with a
    // placeholder.
    expect(skips).toMatch(/!k\.slice\(prefix\.length\)\.includes\(':'\)/);
  });
});
