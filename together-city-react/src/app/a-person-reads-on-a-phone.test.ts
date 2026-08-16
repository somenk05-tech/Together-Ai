import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

/**
 * A PERSON'S ROW, ON A PHONE.
 *
 * The connections row was one flex line: avatar, identity, then Manage /
 * Remove / Message. Those three buttons want about 290px and they cannot
 * shrink — text inside a button does not wrap — so at 390px there was nothing
 * left for the person. The name broke mid-word ("somen / k", "priya /
 * mandal"), the handle and the relationship were covered by the buttons, and
 * "3 connected hubs" wrapped onto three lines.
 *
 * THE BUG IS THE MISSING `flex-shrink: 0`, NOT THE WIDTH. A flex item with no
 * shrink rule shrinks; a button's text does not, so the button overflows its
 * own box and paints over the column beside it. Everything else here follows
 * from fixing that: the name truncates to one line with an ellipsis instead of
 * wrapping, and below 560 the action group takes a line of its own where the
 * three buttons share the width equally.
 *
 * The two things worth guarding are the two that would be silently undone by
 * anyone tidying this file:
 *
 *   - the truncation. Delete `text-overflow` and nothing looks wrong at a
 *     desk; the name only breaks on a phone, and only for a long name.
 *   - the wrap. `.person-acts` must keep BOTH `flex-shrink: 0` at full width
 *     and `flex: 1 0 100%` under 560, or the buttons go back to crushing the
 *     identity column at exactly the width nobody develops at.
 */
describe('a person reads on a phone', () => {
  const css = read('index.css');
  const page = read('features/connections/pages/Connections.tsx');

  /** The 560px block that carries the person rules, not the first in the file. */
  const phone = () => {
    const blocks = [...css.matchAll(/@media \(max-width: 560px\) \{[\s\S]*?\n\}/g)].map((m) => m[0]);
    return blocks.find((b) => b.includes('.person-acts')) ?? '';
  };

  it('never lets the buttons eat the name', () => {
    expect(css).toMatch(/\.person-acts \{[^}]*flex-shrink: 0/);
    expect(css).toMatch(/\.person-id \{[^}]*min-width: 0/);
  });

  it('truncates the name and the handle to one line each', () => {
    for (const cls of ['person-name', 'person-sub']) {
      const rule = css.match(new RegExp(`\\.${cls} \\{[^}]*\\}`))?.[0] ?? '';
      expect({ cls, rule }).toEqual({ cls, rule: expect.stringContaining('text-overflow: ellipsis') });
      expect({ cls, rule }).toEqual({ cls, rule: expect.stringContaining('white-space: nowrap') });
    }
  });

  it('gives the actions a line of their own below 560, shared equally', () => {
    expect(phone()).toMatch(/\.person-row \{[^}]*flex-wrap: wrap/);
    expect(phone()).toMatch(/\.person-acts \{[^}]*flex: 1 0 100%/);
    expect(phone()).toMatch(/\.person-acts > \.btn \{[^}]*flex: 1 1 0/);
    // …and the fold that Manage and Remove open drops its 56px indent, or a
    // seventh of a phone screen is spent aligning with a column.
    expect(phone()).toMatch(/\.person-fold \{[^}]*padding-left: 0/);
  });

  it('the page wears the classes rather than re-inventing the row', () => {
    // Every caller used to hand-roll `display: flex, gap: 8` around its own
    // buttons, which is why the row could not move them: the wrapper it needed
    // to restyle belonged to three different call sites.
    expect(page).toMatch(/className="person-row"/);
    expect(page).toMatch(/\{actions && <div className="person-acts">\{actions\}<\/div>\}/);
    // Both action slots hand the row a fragment; the row owns the wrapper.
    expect(page.match(/actions=\{\s*<>/g)?.length).toBe(2);
    expect(page).not.toMatch(/actions=\{\s*<div/);
    // The fold's indent is a class too, or it cannot be dropped on a phone.
    expect(page).not.toMatch(/paddingLeft: 56/);
  });
});
