import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

/**
 * THE MAIN COLUMN CLAIMS THE ROW, AND THE PHONE HEADER STOPS DUPLICATING THE
 * BOTTOM BAR.
 *
 * Two geometry bugs, both invisible in code review because neither is wrong on
 * its own line.
 *
 * The first: `.tc-shell` is a flex row and `.tc-main` had no flex property, so
 * it fell to `flex: 0 1 auto` and sized itself to its CONTENT. Measured live at
 * 1720px — a 1425px opening, a 647px column, and 778px of white beside it. Every
 * hub interior in the application was drawing itself into 45% of its room, and
 * the `maxWidth: 1180` most pages ask for could not be reached. `min-width: 0`
 * is the second half: without it a flex item's floor is its min-content width,
 * so one long string overflows the page sideways rather than wrapping. Both
 * halves are one declaration, and one declaration is exactly the kind of thing
 * a later refactor deletes on the way past.
 *
 * The second: the bottom bar arrived on 4 Aug and the header was never told.
 * Below 900px it still rendered fourteen hub tabs as a scrolling strip of 9.5px
 * capitals, above a burger opening the same list, above a bottom bar carrying
 * three of the same destinations again. The tab row is hidden on a phone now,
 * and so are the action-bar entries the bottom bar already owns.
 *
 * The chips rail's breakpoint is checked against the drawer's, because they are
 * the same fact stated twice: whenever the sidebar is not on screen, the hub's
 * sections need somewhere else to be.
 */
describe('the layout uses the space it has', () => {
  const layout = read('styles/layout.css');
  const index = read('index.css');

  it('lets the main column grow into the row beside the sidebar', () => {
    const rule = layout.match(/\.tc-shell \.tc-main \{[^}]*\}/)?.[0] ?? '';
    expect(rule, '.tc-shell .tc-main rule not found').toBeTruthy();
    expect(rule).toMatch(/flex:\s*1/);
  });

  it('and lets it shrink below its content, or a long word scrolls the page', () => {
    const rule = layout.match(/\.tc-shell \.tc-main \{[^}]*\}/)?.[0] ?? '';
    expect(rule).toMatch(/min-width:\s*0/);
  });

  it('shrinks the header on a phone rather than keeping two desktop rows', () => {
    const phone = layout.match(/@media \(max-width: 899px\) \{[\s\S]*?\n\}/)?.[0] ?? '';
    expect(phone, 'no 899px block in layout.css').toBeTruthy();
    expect(phone).toMatch(/--header-h:\s*\d+px/);
    // Everything that clears the header reads the token, so the token is the
    // only place this may be said.
    expect(layout).toMatch(/\.tc-main \{ padding-top: calc\(var\(--header-h\)/);
  });

  it('hides the hub tab row where the bottom bar and the burger both reach it', () => {
    const phone = layout.match(/@media \(max-width: 899px\) \{[\s\S]*?\n\}/)?.[0] ?? '';
    expect(phone).toMatch(/\.tc-nav \{ display: none/);
  });

  it('hides the header actions the bottom bar already carries', () => {
    const phone = layout.match(/@media \(max-width: 899px\) \{[\s\S]*?\n\}/)?.[0] ?? '';
    for (const sel of ['a[href="/chats"]', 'a[href="/profile"]', 'button[aria-label="Notifications"]']) {
      expect(phone, `${sel} still shows on a phone`).toContain(sel);
    }
    // Mail is NOT in the bottom bar, so it must survive — hiding it would leave
    // the mailbox with no door on a phone at all.
    expect(phone).not.toContain('/mail/inbox');
  });

  it('shows the chips rail wherever the sidebar is a drawer, not 200px later', () => {
    const drawerBp = layout.match(/@media \(max-width: (\d+)px\) \{[^@]*\.tc-side \{ position: fixed/)?.[1];
    const chipsBp = index.match(/@media \(max-width: (\d+)px\) \{\s*\.hub-chips \{\s*display: flex/)?.[1];
    expect(drawerBp, 'drawer breakpoint not found').toBeTruthy();
    expect(chipsBp, 'chips breakpoint not found').toBeTruthy();
    expect(chipsBp).toBe(drawerBp);
  });
});
