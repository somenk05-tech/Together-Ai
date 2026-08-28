import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const NUTRITION = join(dirname(fileURLToPath(import.meta.url)), '..', 'features', 'nutrition');

/**
 * The Nutrition hub looks like one place.
 *
 * `[data-hub="nutrition"]` tints --paper / --card / --line green, and every
 * screen that reads those tokens follows for free — in light AND dark, which is
 * the whole reason the tint is written as token overrides rather than a second
 * palette. A screen that hardcodes its own background opts out of that silently:
 * it does not break, it just sits there looking like it belongs to a different
 * application, and nobody notices until somebody switches theme.
 *
 * So SURFACES must come from tokens. This guard is about backgrounds and
 * borders only — the things the theme owns.
 *
 * IT IS NOT A BAN ON COLOUR. Meaning stays hardcoded, deliberately:
 *  · VegMark's green/amber/red are the Indian veg / egg / non-veg marks. That
 *    is a regulated symbol, not a style choice, and theming it would be wrong
 *    in a way no dark mode justifies.
 *  · (MedicalAdvisories' severity ramp was the third entry here — a scale
 *    where the hue IS the datum. The component was deleted on 28 Aug: nothing
 *    imported it, and the api members that fetched what it rendered had gone
 *    the same day. PlanGuidanceBanner went with it, for the same reason. The
 *    exemption is recorded rather than dropped, so a future advisories screen
 *    knows the argument was already had.)
 *  · CookMode is a full-screen cooking overlay with its own dark surface on
 *    purpose — a phone propped against a chopping board, not a page in the hub.
 * Status washes are NOT in that list: --warn-soft / --danger-soft / --ok-soft
 * exist so a banner can mean "careful" and still belong to the page it is on.
 */
const ALLOWED = new Set([
  'components/CookMode.tsx',
  'components/VegMark.tsx',
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(p) && !/\.(test|spec)\.tsx$/.test(p)) out.push(p);
  }
  return out;
}

/** `background: '#fff'`, `borderColor: "#eee"`, `border: '1px solid #ddd'`. */
const HARDCODED_SURFACE = /(background|backgroundColor|borderColor)\s*:\s*[^,;}\n]*#[0-9a-fA-F]{3,8}|border\s*:\s*['"`][^'"`]*#[0-9a-fA-F]{3,8}/;

describe('the nutrition hub looks like one place', () => {
  it('takes its surfaces from tokens, so the green (and dark mode) reach every screen', () => {
    const offenders = walk(NUTRITION)
      .map((p) => ({ path: relative(NUTRITION, p).split('\\').join('/'), src: readFileSync(p, 'utf8') }))
      .filter(({ path }) => !ALLOWED.has(path))
      // Comments explain past hexes; a guard that reads its own history never goes green.
      .filter(({ src }) => HARDCODED_SURFACE.test(
        src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n'),
      ))
      .map(({ path }) => `  ${path}`);

    expect(offenders.join('\n') || 'none').toBe('none');
  });

  it('is reading real files, and would catch a planted one', () => {
    const files = walk(NUTRITION);
    expect(files.length).toBeGreaterThan(15);
    expect(HARDCODED_SURFACE.test("background: '#faf3e0'")).toBe(true);
    expect(HARDCODED_SURFACE.test("border: '1px solid #cfe3cf'")).toBe(true);
    // And must not fire on the tokens it is pushing people towards.
    expect(HARDCODED_SURFACE.test("background: 'var(--warn-soft)'")).toBe(false);
    expect(HARDCODED_SURFACE.test("color: '#fff'")).toBe(false);
  });
});
