import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NAV } from '@/config/hubs';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

/** Anything that bans or locates a STRING reads the code, not the prose about
 *  the code — a rule that fails when you write the rule down gets deleted. */
const stripComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/**
 * THE CITIZEN'S OWN DOORS MOVED UP TO THE SIGNATURE ROW.
 *
 * The owner, 15 Aug: "Make personal a button tab like mail and chat and
 * profile and place it next to these buttons, also move these button on top
 * layer where the logo is."
 *
 * Two changes with one idea behind them. The header's two rows were carrying a
 * mixed message: Row 1 the wordmark alone, Row 2 twelve DISTRICTS and, on the
 * same line, five doors that are not districts at all — your mail, your chats,
 * your drawer, your alerts, you. Row 1 is who you are now; Row 2 is where the
 * city is. Personal leaves the alphabetical tab strip (it was filed between
 * Nutrition and Property, which reads as one more place to visit) and joins
 * Mail and Chat as a pill.
 *
 * What must NOT happen is the reason this file exists:
 *
 *  1. THE WORDMARK KEEPS THE MIDDLE. Row 1 centres its contents, so a bar in
 *     flow beside the name pushes the name off centre by half the bar — and it
 *     would drift again every time a pill is added. Pinned, like the monogram.
 *  2. PERSONAL STAYS IN `NAV`. The header lifts it out of the tab row the way
 *     it has always lifted Mail; it does not delete the entry. NAV is the one
 *     list the burger drawer and the Hubs page walk, and a pill with its own
 *     hardcoded path is a second source of truth waiting to disagree.
 *  3. IT SURVIVES ON A PHONE. Chats, Alerts and Profile are hidden below 900px
 *     because the bottom bar carries them. Personal and Mail are not in the
 *     bottom bar, so hiding them would leave two rooms with no glanceable door.
 */
describe('the bar sits with the logo', () => {
  const header = stripComments(read('layouts/Header.tsx'));

  it('the action bar is on Row 1, with the signature', () => {
    const rowOne = header.slice(header.indexOf('tc-header-top'), header.indexOf('tc-navrow'));
    expect(rowOne).toContain('tc-actionbar');
  });

  it('and Row 2 carries the hub tabs and nothing else', () => {
    const rowTwo = header.slice(header.indexOf('tc-navrow'));
    expect(rowTwo).not.toContain('tc-actionbar');
    expect(rowTwo).toContain('tc-nav');
  });

  it('the wordmark still holds the true centre of the row', () => {
    // Both halves are needed: the row centres, and the bar is out of the
    // centring. Lose either and the name of the city sits off-middle.
    const layout = read('styles/layout.css');
    const row = layout.match(/\.tc-header-top \{[^}]*\}/)?.[0] ?? '';
    expect(row, '.tc-header-top rule not found').toBeTruthy();
    expect(row).toMatch(/justify-content:\s*center/);
    const bar = layout.match(/\.tc-header-top \.tc-actionbar \{[^}]*\}/)?.[0] ?? '';
    expect(bar, '.tc-header-top .tc-actionbar rule not found').toBeTruthy();
    expect(bar).toMatch(/position:\s*absolute/);
    expect(bar).toMatch(/right:\s*0/);
  });

  /**
   * AND THE DISTRICTS SIT ON THE SAME MIDDLE (owner, 15 Aug: "center align the
   * hubs make it aesthetics"). One axis for the whole header — monogram left,
   * name centred, doors right, tabs centred underneath.
   *
   * The trap this guards is the obvious implementation. `.tc-nav` is a SCROLL
   * container: twelve tabs do not fit a small window. Centring a flex scroller
   * puts its first item at a negative scroll offset that no browser will let
   * you reach, so ASTROLOGY would become permanently unreachable at exactly
   * the width where scrolling begins — and only there, which is why it would
   * ship. The row centres a nav sized to its tabs instead.
   */
  it('centres the tab row without making its first tab unreachable', () => {
    const layout = read('styles/layout.css');
    const row = layout.match(/\.tc-navrow \{[^}]*\}/)?.[0] ?? '';
    const nav = layout.match(/\.tc-nav \{[^}]*\}/)?.[0] ?? '';
    expect(row, '.tc-navrow rule not found').toBeTruthy();
    expect(nav, '.tc-nav rule not found').toBeTruthy();
    // The parent centres…
    expect(row).toMatch(/justify-content:\s*center/);
    // …the scroller does not, and still scrolls.
    expect(nav).not.toMatch(/justify-content:\s*center/);
    expect(nav).toMatch(/overflow-x:\s*auto/);
    // …and the nav is only as wide as its tabs, or centring it centres nothing.
    // Two classes on purpose: relief.css says `flex: 1 1 auto` and loads last.
    expect(layout).toMatch(/\.tc-navrow \.tc-nav \{[^}]*flex:\s*0 1 auto/);
    // No left indent survives — an indent is a side, and a centred row has none.
    expect(nav).not.toMatch(/padding-left/);
  });
});

describe('Personal is one of those doors now', () => {
  const header = stripComments(read('layouts/Header.tsx'));
  const actions = stripComments(read('layouts/QuickActions.tsx'));

  it('it is a pill beside Mail and Chat, in that order', () => {
    const at = (path: string) => actions.indexOf(`to="${path}"`);
    expect(at('/mail')).toBeGreaterThan(-1);
    expect(at('/personal')).toBeGreaterThan(at('/chats'));
    expect(at('/chats')).toBeGreaterThan(at('/mail'));
  });

  it('and it is out of the district tab row', () => {
    const lifted = header.match(/const IN_THE_BAR[^\n]*\n/)?.[0] ?? '';
    expect(lifted, 'the tab row no longer says which keys it lifts out').toBeTruthy();
    expect(lifted).toMatch(/'mail'/);
    expect(lifted).toMatch(/'personal'/);
  });

  it('without leaving NAV, which is where its path and label live', () => {
    expect(NAV.find((n) => n.key === 'personal')).toEqual({ key: 'personal', label: 'Personal', path: '/personal' });
  });
});

describe('and the phone keeps the doors it has nowhere else', () => {
  const phone = read('styles/layout.css').match(/@media \(max-width: 899px\) \{[\s\S]*?\n\}/)?.[0] ?? '';

  it('hides the now-empty second row rather than leaving it in the header', () => {
    expect(phone, 'no 899px block in layout.css').toBeTruthy();
    expect(phone).toMatch(/\.tc-navrow \{ display: none/);
  });

  it('but never hides Mail or Personal — the bottom bar carries neither', () => {
    expect(phone).not.toContain('a[href="/mail"]');
    expect(phone).not.toContain('a[href="/personal"]');
  });
});
