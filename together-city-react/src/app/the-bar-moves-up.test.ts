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

  /**
   * THREE ROWS ON ONE AXIS, in the order a masthead is read: the name of the
   * city, the citizen's own doors, the districts. The bar left the tab row
   * first (it was chrome on the districts' shelf) and then left the signature
   * row too (it was chrome in the corner of the name). It is a line of the
   * masthead now, so it is in flow and centred like the two rows it sits
   * between — nothing in this header is pinned to a corner but the burger.
   */
  it('carries the doors on their own row, between the name and the districts', () => {
    const top = header.indexOf('tc-header-top');
    const bar = header.indexOf('tc-actionrow');
    const tabs = header.indexOf('tc-navrow');
    expect(top).toBeGreaterThan(-1);
    expect(bar).toBeGreaterThan(top);
    expect(tabs).toBeGreaterThan(bar);
  });

  it('and each row carries one thing', () => {
    const signature = header.slice(header.indexOf('tc-header-top'), header.indexOf('tc-actionrow'));
    const doors = header.slice(header.indexOf('tc-actionrow'), header.indexOf('tc-navrow'));
    const districts = header.slice(header.indexOf('tc-navrow'));
    expect(signature).toContain('tc-logo');
    expect(signature).not.toContain('tc-actionbar');
    expect(doors).toContain('tc-actionbar');
    expect(districts).toContain('tc-nav');
    expect(districts).not.toContain('tc-actionbar');
  });

  it('every row is centred on the same axis', () => {
    const layout = read('styles/layout.css');
    for (const sel of ['\\.tc-header-top', '\\.tc-actionrow', '\\.tc-navrow']) {
      const rule = layout.match(new RegExp(`${sel} \\{[^}]*\\}`))?.[0] ?? '';
      expect(rule, `${sel} rule not found`).toBeTruthy();
      expect(rule, `${sel} is not centred`).toMatch(/justify-content:\s*center/);
    }
    // The bar's `margin-left: auto` is what pushed it right when it lived on
    // the end of a row. Left in place it would defeat the centring silently.
    expect(layout).toMatch(/\.tc-actionrow \.tc-actionbar \{[^}]*margin:\s*0/);
  });

  it('and the name of the city is said once, in full', () => {
    // The hand-lettered TC monogram sat pinned in the corner beside the
    // hand-lettered name — the same name twice, in two files. On a masthead of
    // three centred rows the corner mark is the only thing off the axis.
    expect(header).toContain('tc-word.svg');
    expect(header).not.toContain('tc-mark.svg');
    const relief = read('styles/relief.css');
    // Its rules go with it, or the class-usage guard has a selector pointing at
    // markup nobody renders.
    expect(relief).not.toMatch(/\.tc-logo \.mark \{/);
  });

  /**
   * A BLACK BUTTON ON A WHITE PAGE (owner, 15 Aug, on a reference of a dark
   * glass lozenge: "background remains white, the button becomes black").
   *
   * These five were the palest objects in the header and are now the firmest,
   * which is what they should always have been: they are the only CONTROLS up
   * there, and the twelve district tabs beneath them are text.
   */
  it('the doors are solid ink with paper letters', () => {
    const relief = read('styles/relief.css');
    const pill = relief.match(/\.tc-actionbar a, \.tc-actionbar button[^{]*\{([^}]*)\}/)?.[1] ?? '';
    expect(pill, 'the action-bar pill rule not found').toBeTruthy();
    expect(pill).toMatch(/background:\s*var\(--ink\)/);
    expect(pill).toMatch(/color:\s*var\(--card\)/);
    expect(pill).not.toMatch(/--ink-soft/);
    // The icons inherit currentColor, so the group carries the same reversal —
    // otherwise five dark glyphs sit on five dark faces.
    const groups = [...relief.matchAll(/\.tc-actionbar, \.tc-actions \{([^}]*)\}/g)].map((m) => m[1]);
    expect(groups.some((r) => /color:\s*var\(--card\)/.test(r))).toBe(true);
    expect(groups.some((r) => /--ink-soft/.test(r))).toBe(false);
  });

  it('and does not turn solid white in the two night hubs', () => {
    // `--ink` and `--card` swap meaning on a night surface, so the rule above
    // would make five SOLID WHITE lozenges there. tokens.css allows exactly
    // two of those in that room — the primary button and the rail lamp — and
    // five across the top would beat both. The night keeps its raised face.
    const relief = read('styles/relief.css');
    const night = relief.match(/\[data-hub="astrology"\] \.tc-actionbar a[^{]*\{([^}]*)\}/)?.[1] ?? '';
    expect(night, 'the night-hub action-bar rule not found').toBeTruthy();
    expect(night).toMatch(/background:\s*var\(--face\)/);
    expect(night).toMatch(/color:\s*var\(--ink\)/);
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
