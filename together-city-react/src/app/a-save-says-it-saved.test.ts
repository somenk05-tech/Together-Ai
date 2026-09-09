import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const stripTs = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    return /\.tsx$/.test(e.name) && !/\.(test|spec)\./.test(e.name) ? [relative(SRC, full)] : [];
  });
const PAGES = walk(SRC);

/**
 * ── THE SAVE/EDIT AND COLLAPSE/EXPAND AUDIT, 8 SEP ─────────────────────────
 *
 * The owner asked for one Save behaviour and one Collapse behaviour across the
 * whole site. Reading it turned up four disclosure languages and sixty-odd
 * save controls that each re-implemented the same three states.
 *
 * Every assertion below is a thing that was TRUE of this app that morning, and
 * every one of them comes back the same way: somebody adds a section, or a
 * save, by copying the nearest one — which is the correct instinct and is
 * exactly how eleven of something happens.
 */

/* ── ONE WORD FOR OPEN, ONE FOR CLOSED ──────────────────────────────────── */
describe('the city has one collapse control', () => {
  const layout = read('styles/layout.css');
  const relief = read('styles/relief.css');

  it('paints the state word in exactly one place', () => {
    // `.fold .s` for the Fold component, `.fold-state` for a native <details>.
    // Both say the same two words; neither is a chevron.
    expect(layout).toMatch(/\.fold-state::after \{ content: 'Open \+'; \}/);
    expect(layout).toMatch(/details\[open\] > summary \.fold-state::after \{ content: 'Close −'; \}/);
    expect(read('components/ui/Fold.tsx')).toMatch(/\{open \? 'Close −' : 'Open \+'\}/);
  });

  it('has no rotating chevron left to drift back to', () => {
    // The Master Profile's `.cchev` and the store order-day's `.sf-day-chev`
    // were the second and third languages. A chevron that rotates is also the
    // one treatment that says nothing when the CSS fails to load.
    for (const css of [layout, relief]) {
      expect(css).not.toMatch(/\.cchev\b/);
      expect(css).not.toMatch(/\.sf-day-chev\b/);
    }
    for (const f of PAGES) {
      expect(stripTs(read(f))).not.toMatch(/className="(cchev|sf-day-chev)"/);
    }
  });

  it('gives every native <details> face the word', () => {
    // A <details> needs no aria — the browser announces it — but it does need
    // to LOOK like the rest of the city, and these four were the only sections
    // in the app whose closed state was drawn differently.
    const withDetails = PAGES.filter((f) => /<details\b/.test(stripTs(read(f))));
    expect(withDetails.length).toBeGreaterThan(0);
    for (const f of withDetails) {
      expect(read(f), f).toMatch(/className="fold-state"/);
    }
  });

  it('keeps the disclosure contract in one file, for the things that are not sections', () => {
    // A menu key, an edit-mode toggle and a combobox are not Folds. They are
    // the same four lines, and eighteen of them were typed out by hand while
    // nineteen more announced nothing at all. `useDisclosure` owns both
    // spellings — `faceProps` (it carries the click too) and `announces` (for
    // a control that already has its own handler).
    const fold = read('components/ui/Fold.tsx');
    expect(fold).toMatch(/faceProps: \{ onClick: toggle, 'aria-expanded': open, 'aria-controls': id \}/);
    expect(fold).toMatch(/announces: \{ 'aria-expanded': open, 'aria-controls': id \}/);
    // And nobody writes `aria-controls` beside a hand-written `aria-expanded`:
    // the pair that gets split is always this one, and the half that goes
    // missing is always aria-controls.
    const handRolled = PAGES.filter((f) => {
      const src = stripTs(read(f));
      return /aria-expanded=\{/.test(src) && !/useDisclosure/.test(src);
    }).sort();
    expect(handRolled).toEqual([
      'components/SearchSelect.tsx',
      // Chip takes `expanded` as a PROP and passes it through — the Local
      // Market rail's "More · 7" grows its own row, and the chip is the
      // caller's control rather than a second implementation of the state.
      'components/ui/Chip.tsx',
      'features/astrology/components/Letter.tsx',
      'features/astrology/pages/AstroAsk.tsx',
      'features/beauty/components/Plates.tsx',
      'features/chat/components/Composer.tsx',
      'features/chat/components/GroupPanel.tsx',
      'features/chat/components/MessageSpotlight.tsx',
      'features/chat/pages/Chats.tsx',
      'features/connections/pages/Connections.tsx',
      'features/dating/pages/DatingChats.tsx',
      'features/dev/Citizens.tsx',
      'features/mail/MoveToProject.tsx',
      'features/mail/pages/Compose.tsx',
      'features/mail/pages/Folders.tsx',
      'features/mail/pages/MessageView.tsx',
      'features/mail/pages/Projects.tsx',
      'features/nutrition/components/OwnDayView.tsx',
      // The saved food profile's "Edit Food Preference Profile" key. It exists
      // ONLY while the form is shut, so its state is the literal `false` and
      // there is no `open` to hold — the form it points at is hidden by the
      // page, not by a disclosure.
      'features/nutrition/pages/Preferences.tsx',
      'features/pets/pages/Monthly.tsx',
      'features/social/CityTV.tsx',
      'features/social/PostCard.tsx',
      'features/social/pages/CreatePost.tsx',
      'features/social/report.tsx',
      // THE LIST ONLY SHRINKS. Every name on it is a control that already
      // carried BOTH attributes before the audit — menus with aria-haspopup,
      // comboboxes, the beauty plate, and the chat and mail expanders. They
      // are correct; they are simply not going through the one hook yet, and
      // moving twenty-odd working files in a UI pass is how a UI pass becomes
      // a regression somewhere nobody was looking. A NEW entry here is a new
      // copy of the four lines and has to argue for itself.
    ]);
  });
});

/* ── ONE SAVE, WITH ALL FOUR OF ITS STATES ──────────────────────────────── */
describe('a save says what it is doing', () => {
  it('uses the Button’s own loading state, not a label ternary', () => {
    // `{m.isPending ? 'Saving…' : 'Save'}` was written at twenty-eight call
    // sites. It looks complete and is not: the button keeps its ordinary
    // paint, no spinner appears, and `aria-busy` is never set — so a screen
    // reader is told nothing at all between the press and the answer. The
    // Button has carried `state="loading"` since it was written and had ZERO
    // callers.
    for (const f of PAGES) {
      const src = stripTs(read(f));
      // Inside a <Button …>…</Button>, and only there: the shared button owns
      // this state, so a ternary in its label is a second implementation of
      // it. `loadingLabel={editId ? 'Saving…' : 'Posting…'}` is the SAME
      // mechanism choosing its word and is not a finding.
      for (const m of src.matchAll(/<Button\b[\s\S]*?<\/Button>/g)) {
        const el = m[0].replace(/loadingLabel=\{[^}]*\}/g, ' ');
        expect(el, f).not.toMatch(/\?\s*'Saving…'\s*:/);
      }
    }
    // The two raw buttons left with a busy word of their own are a store-front
    // key and a pet card's Done — both wearing a class the shared Button does
    // not have. They are not exempt from SAYING they are busy.
    for (const f of ['features/ecommerce/store/StoreFront.tsx', 'features/pets/pages/Wellness.tsx']) {
      expect(read(f), f).toMatch(/aria-busy=\{/);
    }
    expect(read('components/ui/Button.tsx')).toMatch(/aria-busy=\{loading \|\| undefined\}/);
  });

  it('says "saved" out loud, from one component', () => {
    // Four of sixty-odd save controls confirmed anything. `role="status"` is
    // the whole point: a span with a tick in it is silent, and silence after a
    // save is indistinguishable from a save that never happened.
    const mark = read('components/ui/SavedMark.tsx');
    expect(mark).toMatch(/role="status"/);
    expect(read('styles/layout.css')).toMatch(/\.saved-mark \{/);
    // and it is used, in more than the one page it was written for
    const users = PAGES.filter((f) => /<SavedMark/.test(read(f)));
    expect(users.length).toBeGreaterThanOrEqual(12);
  });

  it('never leaves a save key clickable while it is saving', () => {
    // A loading button that is still clickable is a wallet charged twice.
    expect(read('components/ui/Button.tsx')).toMatch(/disabled=\{disabled \|\| loading\}/);
  });
});

/* ── NOTHING TYPED IS LOST WITHOUT BEING ASKED ──────────────────────────── */
describe('the unsaved guard', () => {
  const hook = read('hooks/useUnsavedGuard.ts');

  it('covers all three ways out of a form', () => {
    expect(hook).toMatch(/beforeunload/);          // the tab
    expect(hook).toMatch(/useBlocker/);            // in-app navigation
    expect(hook).toMatch(/tryDiscard/);            // the form's own Cancel
  });

  it('asks in the city’s own dialog, never the browser’s', () => {
    // window.confirm is refused here by name (features/social/Confirm.tsx).
    expect(stripTs(hook)).not.toMatch(/window\.confirm/);
    expect(read('components/ui/UnsavedGuard.tsx')).toMatch(/<Confirm/);
  });

  it('is silent on a form nobody has touched', () => {
    // A guard that asks anyway is a guard people learn to click through.
    expect(hook).toMatch(/if \(!dirty\) \{ next\(\); return; \}/);
    expect(hook).toMatch(/dirty && currentLocation\.pathname !== nextLocation\.pathname/);
  });

  it('is wired to the two longest forms in the city', () => {
    for (const f of ['features/profile/pages/MasterProfile.tsx', 'features/dating/pages/DatingProfile.tsx']) {
      expect(read(f), f).toMatch(/useUnsavedGuard\(/);
      expect(read(f), f).toMatch(/<UnsavedGuard guard=\{guard\}/);
    }
  });
});
