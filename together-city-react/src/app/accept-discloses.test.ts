import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(web, p), 'utf8');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(p) && !/\.(test|spec)\.tsx$/.test(p)) out.push(p);
  }
  return out;
}

/**
 * Nobody accepts a connection without being told what it opens.
 *
 * Owner decision: the REQUESTER picks the relationship and the hubs, and the
 * accepter cannot edit either before accepting. That is a defensible rule. What
 * it makes non-negotiable is the disclosure — "Accept" grants hub access that
 * somebody else chose, so the button cannot be the only thing on the screen.
 *
 * The People page always showed the hubs. Two other surfaces did not:
 * MemberFinder and AddHubMemberDialog both offered "Accept request" off a
 * lookup payload whose only relationship information was the string
 * `pending_in`. Same decision, same grant, no disclosure — and those are the
 * surfaces you reach by looking a person up rather than by going to People,
 * which is to say the ones used in a hurry.
 *
 * This guard is a reach check, in the shape of `allergen-reach`: it does not
 * care where an Accept button lives, only that wherever one lives it has a
 * disclosure beside it. A third surface added later is caught by the same rule.
 */
const ACCEPT = /accept: true|>Accept(?: request)?</;

/**
 * A household invitation, which is not a connection request.
 *
 * It grants a role in somebody's household, not hub access on a connection, and
 * it discloses its own thing — "Role: Adult" sits directly above the button.
 * Named here rather than excluded by a looser pattern, because the next surface
 * somebody adds should have to argue its way onto this list.
 */
const NOT_A_CONNECTION_REQUEST = new Set(['features/family/pages/Connect.tsx']);

describe('every surface that can accept a request', () => {
  const surfaces = walk(join(web, 'features'))
    .map((p) => ({ path: relative(web, p).split('\\').join('/'), src: readFileSync(p, 'utf8') }))
    .filter(({ src }) => ACCEPT.test(src))
    .filter(({ path }) => !NOT_A_CONNECTION_REQUEST.has(path));

  it('is found at all — the pattern still matches real code', () => {
    // Five when this landed: People, MemberFinder, AddHubMemberDialog, your own
    // profile, and somebody else's. The first guard run found the last two,
    // which is the whole argument for writing this as a reach check rather than
    // a test of the three surfaces I already knew about.
    expect(surfaces.length).toBeGreaterThanOrEqual(5);
  });

  it('names the excluded surface, and it still exists', () => {
    // An exclusion list that quietly stops matching anything is how a real
    // surface slips back in under an old excuse.
    for (const path of NOT_A_CONNECTION_REQUEST) {
      const src = read(path);
      expect(ACCEPT.test(src)).toBe(true);
      expect(src).toMatch(/Role:/);
    }
  });

  it('shows what the request would open', () => {
    // Either it renders the shared notice, or it renders the chips itself with
    // a caption of its own (the People page does the latter).
    const silent = surfaces
      .filter(({ src }) => !/PendingRequestNotice/.test(src) && !/chipCaption=/.test(src) && !/<ModuleChips/.test(src))
      .map(({ path }) => `  ${path}`);
    expect(silent.join('\n') || 'none').toBe('none');
  });
});

describe('the pending disclosure', () => {
  const notice = read('features/connections/components/PendingRequestNotice.tsx');
  const people = read('features/connections/pages/Connections.tsx');
  const chips = read('features/connections/components/ModuleToggles.tsx');

  it('does not describe a request as a connection that already exists', () => {
    // "Connected hubs: Medical" on a request nobody has accepted is the screen
    // stating a state that does not exist. Both pending rows override it.
    expect(people).toMatch(/chipCaption="Hubs they want to open:"/);
    expect(people).toMatch(/chipCaption="Hubs you asked to open:"/);
    expect(notice).toMatch(/caption="Hubs they want to open:"/);
    // The default is still there for the rows where it is true.
    expect(chips).toMatch(/caption = 'Connected hubs:'/);
  });

  it('says the choice was theirs, and when it stops being theirs', () => {
    // Without the second half, accepting reads as irreversible.
    for (const src of [notice, people]) {
      expect(src).toMatch(/[Tt]hey chose/);
      expect(src).toMatch(/any time afterwards/);
    }
  });

  it('only fires on a request aimed at you', () => {
    expect(notice).toMatch(/result\.relationship !== 'pending_in'/);
  });

  it('stays quiet rather than claiming a request opens nothing it might open', () => {
    // No optional hubs is not the same fact as "no access": chat and mail come
    // with connecting. The empty branch says which one it means.
    expect(notice).toMatch(/No hubs beyond chat and mail/);
  });
});
