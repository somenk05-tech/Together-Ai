import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(web, p), 'utf8');
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').map((l) => l.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/, '$1')).join('\n');

const tokens = read('styles/tokens.css');
const layout = read('styles/layout.css');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(web, dir))) {
    const rel = join(dir, name);
    if (statSync(join(web, rel)).isDirectory()) walk(rel, out);
    else if (rel.endsWith('.tsx')) out.push(rel);
  }
  return out;
}

/**
 * ONE LAYOUT SYSTEM.
 *
 * The audit that produced this file: 102 page shells declaring 21 DIFFERENT
 * maximum widths between 560px and 1240px, each with its own padding, inside a
 * hub layout that already applied a 36px gutter of its own — and a breadcrumb
 * rendered in a separate 1180px container above all of them.
 *
 * The consequence was the complaint: the left edge of the content moved by up
 * to 340px between two pages of the same hub, the breadcrumb lined up with the
 * title beneath it on none of them, and content jumped sideways on every
 * navigation. Nothing was wrong with any individual page. The problem was that
 * a page COULD decide, so ninety of them each decided differently.
 *
 * So the rule is not "use 1180". The rule is that a page does not get to have
 * an opinion: `.page` in the layout is the only thing that sets a measure, and
 * these checks fail the moment a screen starts having one again.
 */
describe('a page does not choose its own width', () => {
  it('has exactly one measure, declared once', () => {
    expect(strip(tokens)).toMatch(/--page-max:\s*1180px/);
    expect(strip(layout)).toMatch(/minmax\(0, var\(--page-max\)\)/);
    // And exactly one place that reads it.
    const uses = [...strip(layout).matchAll(/var\(--page-max\)/g)];
    expect(uses).toHaveLength(1);
  });

  it('has one gutter, fluid rather than stepped', () => {
    // A stepped gutter means a breakpoint where the whole page jumps sideways
    // by 20px, which is the same complaint at a different scale.
    expect(strip(tokens)).toMatch(/--page-gutter:\s*clamp\(16px, 4vw, 36px\)/);
  });

  it('has one spacing scale, and it is the one that was asked for', () => {
    for (const [n, px] of [[1, 8], [2, 16], [3, 24], [4, 32], [5, 48], [6, 64], [7, 80]] as const) {
      expect(strip(tokens)).toMatch(new RegExp(`--s-${n}:\\s*${px}px`));
    }
  });

  it('lets a hero reach the window without negative margins', () => {
    // `.page` is a three-column grid — gutter, measure, gutter — so a full-bleed
    // child spans 1/-1 and gets the window. The alternative everybody reaches
    // for is `margin-inline: calc(50% - 50vw)`, which overshoots by the width
    // of the scrollbar and puts a hero 16px past the right edge on a phone.
    expect(strip(layout)).toMatch(/\.page > \.bleed \{ grid-column: 1 \/ -1; \}/);
  });

  it('is applied by the layout, not by each page', () => {
    const hub = strip(read('layouts/HubLayout.tsx'));
    // The breadcrumb and the routed page are two children of the SAME grid.
    // That is the fix for the breadcrumb never lining up with the title: they
    // cannot disagree if they are in the same column.
    expect(hub).toMatch(/<div className="page">[\s\S]*<Breadcrumbs \/>/);
    expect(hub).toMatch(/<Outlet \/>[\s\S]*?<\/div>\s*<\/main>/);
  });

  it('no longer lets the hub shell contribute a second gutter', () => {
    // `.tc-shell .tc-main > *` used to apply `28px 36px 52px` AND `display:
    // block` — the second of which outranked `.page`'s `display: grid` by
    // specificity, so the grid silently did nothing. That is a bug you find by
    // measuring a rendered page, not by reading the stylesheet.
    expect(strip(layout)).toMatch(/\.tc-shell \.tc-main > \* \{ padding: 0; \}/);
    expect(strip(layout)).not.toMatch(/\.tc-shell \.tc-main > \* \{[^}]*display: block/);
  });

  /**
   * THE ONE THAT ACTUALLY HOLDS THE LINE.
   *
   * Everything above describes the system. This says no page may opt out of
   * it — and it is written against the exact shape the ninety pages used, so a
   * new page that copies an old one fails immediately rather than in six
   * months when somebody notices thecity wobbling again.
   */
  it('has no page left that sets a width on the element it returns', () => {
    // The first version of this was too blunt and the failure taught the
    // system something: not every centred thing is a page. An empty state, a
    // consent gate, a profile prompt and a password card are one short column
    // of text, and stretching them to the full measure would be a worse design
    // rather than a more consistent one. The audit had found them at 380, 520,
    // 560, 620 and 640 — five widths for the same idea — so they became
    // `.page-note` at one width instead of being abolished or left alone.
    // IT MATCHES CENTRED CONTAINERS, AND THAT IS THE WHOLE DISTINCTION.
    //
    // The second failure this test had was a helper inside social/Profile
    // whose root is a 560px list column — a maximum width with no auto margin.
    // That is a CONTENT MEASURE: it stops a list of names running to 1180px,
    // which is correct and has nothing to do with where the page starts.
    //
    // Scoping to files in a `pages/` directory does not separate them, because
    // that helper lives in one. Centring does: a page shell is always centred
    // in its parent and a constrained column never is. So the rule is "no
    // element a page returns sets a width AND centres itself", which is
    // exactly the shape all ninety of them had.
    const ROOT = /return \(\s*\n\s*<div[^>]*style=\{\{[^}]*maxWidth:\s*\d{3,4}[^}]*margin:\s*'[^']*auto/;
    const offenders = walk('features')
      .concat(walk('pages'))
      .filter((f) => ROOT.test(strip(read(f))))
      .map((f) => relative('.', f));
    expect(offenders).toEqual([]);
  });


  it('gives the narrow centred block one width too', () => {
    expect(strip(layout)).toMatch(/\.page-note \{ max-width: 560px; margin-inline: auto; \}/);
    // And nothing may set its own: five authors picked five numbers for the
    // same idea, which is the page-width problem one scale down.
    const WIDTHS = /style=\{\{[^}]*maxWidth:\s*(3[0-9]{2}|[45][0-9]{2}|6[0-4][0-9])\b[^}]*margin:\s*'[^']*auto/;
    // Cook mode is a full-screen theatre, not a page: it takes over the
    // viewport, has no breadcrumb, no sidebar and no page shell, and its
    // 620px column is the reading measure for one step of a recipe at arm's
    // length from a hob. Named rather than covered by a wider rule, because
    // the wider rule is how the five widths happened.
    const EXEMPT = ['features/nutrition/components/CookMode.tsx'];
    const offenders = walk('features').concat(walk('pages'))
      .filter((f) => !EXEMPT.includes(f) && WIDTHS.test(strip(read(f))))
      .map((f) => relative('.', f));
    expect(offenders).toEqual([]);
  });

  it('has no shared page frame that sets one either', () => {
    // EntPage was the subtle one: six entertainment screens inherited a 1080px
    // measure from a helper, so they were consistent with each other and 100px
    // narrower than the rest of the application.
    const parts = strip(read('features/entertainment/pages/parts.tsx'));
    expect(parts).not.toMatch(/maxWidth/);
  });
});

/**
 * The pieces a page is built from, so that "the same spacing between the
 * breadcrumb and the title" is a fact about the stylesheet rather than a thing
 * ninety authors each got right.
 */
describe('the rhythm is declared, not repeated', () => {
  it('gives the header block one set of gaps', () => {
    const l = strip(layout);
    expect(l).toMatch(/\.page-head \{ margin-bottom: var\(--s-4\); \}/);
    expect(l).toMatch(/\.page-head > h1 \{ margin: 0 0 var\(--s-1\); \}/);
    expect(l).toMatch(/\.page-head > \.page-tabs \{ margin-top: var\(--s-3\); \}/);
  });

  it('gives tabs one height, one padding and one active state', () => {
    const l = strip(layout);
    expect(l).toMatch(/\.page-tabs > button, \.page-tabs > a \{[\s\S]*?min-height: 44px/);
    expect(l).toMatch(/\.page-tabs > \[aria-current\], \.page-tabs > \.on \{/);
  });

  it('gives sections one gap between them', () => {
    expect(strip(layout)).toMatch(/\.page-section \+ \.page-section \{ margin-top: var\(--s-5\); \}/);
  });

  it('is a 12 / 8 / 4 grid whose spans fold with it', () => {
    const l = strip(layout);
    expect(l).toMatch(/\.grid \{ display: grid; grid-template-columns: repeat\(12, minmax\(0, 1fr\)\)/);
    expect(l).toMatch(/@media \(max-width: 1024px\) \{\s*\.grid \{ grid-template-columns: repeat\(8/);
    expect(l).toMatch(/@media \(max-width: 640px\) \{\s*\.grid \{ grid-template-columns: repeat\(4/);
    // A span that did not fold would be a quarter-width card on a phone.
    expect(l).toMatch(/\.col-2, \.col-3, \.col-4, \.col-6, \.col-8, \.col-9 \{ grid-column: 1 \/ -1; \}/);
  });

  it('dissolves a nested page rather than doubling the gutter', () => {
    // Three screens can be rendered under either layout, so they wear `.page`
    // themselves. Inside the hub shell that is a grid inside a grid — two
    // gutters and half the measure — unless the inner one steps aside.
    expect(strip(layout)).toMatch(/\.page \.page \{ display: contents; \}/);
  });
});
