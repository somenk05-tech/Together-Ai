import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, '..', '..');
const read = (p: string) => readFileSync(join(APP, p), 'utf8');
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, ' ');

/**
 * A SCOPED RULE DOES NOT SCOPE THE MATERIAL IT INHERITED.
 *
 * This has now cost two visible bugs, both shipped, both found by the owner
 * looking at a render rather than by any gate:
 *
 *   `.tag`  — index.css and relief.css BOTH define it as a pill. A listing
 *             name written `<span className="tag">` on the Real Estate arc
 *             arrived wearing a white capsule, on a page whose entire
 *             argument is that nothing is decorated.
 *   `.row`  — index.css defines it as a list row with a lit face, a rim, a
 *             radius, a shadow and a hover lift. `.pobs .row` overrode the
 *             layout and inherited all the material, so twelve read-only
 *             observations on the passport rendered as twelve pressable pills
 *             and the alignment went with them.
 *
 * Neither failed a typecheck, a test, or a lint. A class name is a contract
 * between two files that never import each other — the same hole
 * relief.spec's "only styles shell classes the shell actually renders" exists
 * to plug, pointed the other way: there, a rule for a class nobody wears;
 * here, a class that wears somebody else's rule.
 *
 * The rule this asserts is narrow on purpose. It does not ban reuse across
 * the whole application — `.card` and `.btn` are meant to be worn everywhere.
 * It bans it inside the three namespaced component families that were written
 * to be self-contained: the passport (`p`-prefixed), the editorial plate
 * (`e`-prefixed) and the chat stage (`cs`-prefixed). Those say "this block
 * owns its own names"; a bare global name inside them is a promise being
 * broken — and the chat stage is the one where it would hurt most, because
 * every global class it could borrow is drawn for a WHITE ground.
 */
describe('The namespaced blocks do not borrow a global class name', () => {
  /** Every class defined by a TOP-LEVEL rule in index.css — the global
   *  vocabulary. A rule that is itself scoped (`.console .f input`) is not
   *  part of it, so only the FIRST class of each selector counts. */
  const globalClasses = () => {
    const out = new Set<string>();
    for (const m of strip(read('src/index.css')).matchAll(/(^|\})\s*([^{}@]+)\{/g)) {
      for (const sel of m[2].split(',')) {
        const first = sel.trim().match(/^\.([a-z][a-z0-9-]*)/i);
        if (first) out.add(first[1]);
      }
    }
    return out;
  };

  /** Every descendant class used inside a `.p…`, `.e…` or `.cs…` scoped
   *  selector in relief.css — the names those blocks claim as their own. */
  const scopedDescendants = () => {
    const found: { block: string; child: string }[] = [];
    for (const m of strip(read('src/styles/relief.css')).matchAll(/(^|\})\s*([^{}@]+)\{/g)) {
      for (const sel of m[2].split(',')) {
        const parts = sel.trim().match(/^\.((?:cs|p|e)[a-z0-9-]{2,})\b(.*)$/i);
        if (!parts) continue;
        for (const c of parts[2].matchAll(/\s[>+~]?\s*\.([a-z][a-z0-9-]*)/gi)) {
          found.push({ block: parts[1], child: c[1] });
        }
      }
    }
    return found;
  };

  it('finds the three namespaces it is guarding', () => {
    const blocks = new Set(scopedDescendants().map((d) => d.block));
    expect(blocks.size).toBeGreaterThan(3);
    expect([...blocks].some((b) => b.startsWith('p'))).toBe(true);
    expect([...blocks].some((b) => b.startsWith('e'))).toBe(true);
    expect([...blocks].some((b) => b.startsWith('cs'))).toBe(true);
  });

  it('never scopes a rule onto a name index.css already owns', () => {
    const globals = globalClasses();
    /**
     * DELIBERATE REUSE, each with its reason. A component that wants the
     * global thing should say so rather than being exempted quietly.
     *
     *   muted  — the app-wide text tone, read by everything, not a material.
     *   blank  — defined nowhere globally; listed so a future index.css rule
     *            called .blank fails HERE rather than in a screenshot.
     *   card   — the ONE case where scoping onto a global name is the point.
     *            `.cstage .card` exists BECAUSE `.card` is the global white
     *            sheet: the rule restores the city's ink on any card sitting
     *            on the dark stage, which is a fix for inheritance rather
     *            than a borrowed material. See
     *            `a-stage-does-not-export-its-ink.test.ts`, which fails if
     *            that rule disappears — so the two guards hold each other up
     *            and neither can be quietly deleted.
     */
    const ALLOWED = new Set(['muted', 'blank', 'card']);
    const borrowed = scopedDescendants()
      .filter((d) => globals.has(d.child) && !ALLOWED.has(d.child))
      .map((d) => `.${d.block} .${d.child}`);
    expect([...new Set(borrowed)]).toEqual([]);
  });

  /**
   * AND THE MARKUP MATCHES. The stylesheet could be clean while a component
   * still writes `className="row"` inside a passport block and gets the pill
   * with no scoped rule involved at all — which is exactly how `.tag`
   * happened, since nothing in relief.css mentioned `.elot .tag`.
   */
  it('never writes a global class name inside a passport or arc component', () => {
    const globals = globalClasses();
    const RISKY = ['row', 'tag', 'chip', 'pill', 'stat', 'thumb', 'grow'].filter((c) => globals.has(c));
    expect(RISKY.length).toBeGreaterThan(3);
    /**
     * Whole files where every element belongs to a namespaced block, plus one
     * BOUNDED region.
     *
     * Profile.tsx is mixed on purpose: the document and its visa pages are
     * passport material, and the Notifications tab below them is ordinary
     * chrome where a global pill is the right answer — an unread count SHOULD
     * be the same badge it is everywhere else in the city. The boundary is the
     * file's own section comment, so the region cannot drift without somebody
     * moving a heading and noticing.
     */
    const FILES: [string, [string, string]?][] = [
      ['src/features/profile/pages/Profile.tsx', ['className="pdoc"', '── THE BACK PAGES']],
      ['src/features/profile/components/Passport.tsx'],
      ['src/features/realestate/pages/Explore.tsx'],
      ['src/features/realestate/components/Masthead.tsx'],
      ['src/features/chat/components/ConversationList.tsx'],
      ['src/features/chat/components/Composer.tsx'],
      ['src/features/chat/components/ChatStarter.tsx'],
    ];
    const offenders: string[] = [];
    for (const [f, bounds] of FILES) {
      let src = read(f);
      if (bounds) {
        const from = src.indexOf(bounds[0]);
        const to = src.indexOf(bounds[1]);
        expect({ file: f, bounded: from >= 0 && to > from }).toEqual({ file: f, bounded: true });
        src = src.slice(from, to);
      }
      src = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');
      for (const m of src.matchAll(/className=["']([^"'{}]+)["']/g)) {
        for (const c of m[1].split(/\s+/)) {
          if (RISKY.includes(c)) offenders.push(`${f} → .${c}`);
        }
      }
    }
    expect([...new Set(offenders)]).toEqual([]);
  });
});
