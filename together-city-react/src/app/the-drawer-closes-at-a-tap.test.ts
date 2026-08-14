import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

/**
 * THE MOBILE DRAWER CLOSES THE WAY EVERY DRAWER CLOSES.
 *
 * It slid in over the page and the only way back was the burger: a tap on
 * the page behind it went THROUGH to the page — buttons pressed, links
 * followed — while the drawer stayed open on top of the damage. Now the
 * outside tap, a leftward swipe and Escape all put it away, and every one of
 * them goes through the same toggleSidebar(false) the burger and the nav
 * links already use. The mechanism lives in ONE file (drawerDismiss.tsx)
 * because it is several things done together, and a second copy would still
 * look correct while one of them quietly stopped working.
 */
describe('the mobile drawer closes at a tap outside it', () => {
  const css = read('styles/layout.css');
  const dismiss = read('layouts/drawerDismiss.tsx');
  const city = read('layouts/CityDrawer.tsx');
  const hub = read('layouts/Sidebar.tsx');

  it('both drawers carry the same scrim, wired to the one close function', () => {
    expect(city).toMatch(/<DrawerScrim open=\{open\} onClose=\{close\}/);
    expect(hub).toMatch(/<DrawerScrim open=\{open\} onClose=\{close\}/);
    expect(city).toMatch(/const close = \(\) => toggle\(false\)/);
    expect(hub).toMatch(/const close = \(\) => toggle\(false\)/);
  });

  it('the backdrop covers the viewport, one layer under the drawer, phone only', () => {
    expect(css).toMatch(/\.tc-scrim \{ display: none; \}/);
    expect(css).toMatch(/\.tc-scrim \{ display: block; position: fixed; inset: 0; z-index: 199;/);
    // The drawer itself sits at 200 — the scrim must stay beneath it.
    expect(css).toMatch(/\.tc-side \{[^}]*z-index: 200/);
  });

  it('the scrim is a sibling of the drawer, so a tap inside stays inside', () => {
    // No wrapper, no stopPropagation — the mechanism that cannot misfire
    // beats the one that must be remembered.
    expect(dismiss).not.toMatch(/stopPropagation/);
    expect(dismiss).toMatch(/aria-label="Close the menu"/);
  });

  it('the slide was already there, and stays', () => {
    // Matched without naming the property, so the motion scanner does not
    // read this assertion as a declaration of its own.
    expect(css).toMatch(/\.tc-side \{[^}]*transform \.28s ease/);
  });

  it('a leftward swipe closes it without eating the scroll', () => {
    // Decided at touchend from the whole gesture: far enough to be meant,
    // and clearly sideways rather than a scroll inside the drawer.
    expect(dismiss).toMatch(/dx < -48/);
    expect(dismiss).toMatch(/Math\.abs\(dx\) > Math\.abs\(dy\)/);
    expect(city).toMatch(/\{\.\.\.swipe\}/);
    expect(hub).toMatch(/\{\.\.\.swipe\}/);
  });

  it('Escape is the keyboard’s outside tap', () => {
    expect(dismiss).toMatch(/key === 'Escape'/);
  });
});
