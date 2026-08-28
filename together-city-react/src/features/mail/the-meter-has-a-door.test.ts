import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf8');
const api = read('api.ts');
const folders = read('pages/Folders.tsx');

/**
 * ── THE METER HAD A WAY DOWN AND NO DOOR TO IT ──────────────────────────────
 *
 * Mail has a quota. Everything in the hub moves mail TO Trash, and Trash still
 * counts against it — so emptying the Trash is the only way a citizen gets
 * bytes back.
 *
 * `MailService.emptyTrash` shipped with eight passing tests in a file named
 * `the-meter-has-a-way-down.spec.ts`. Its route was parked in a comment that
 * wrote out the four lines and said they belonged "in the commit that lands
 * MailService.emptyTrash — not before it". That method landed. Nobody came
 * back. The API route was restored on 28 Aug; this is the other half.
 *
 * The failure this guards against is not a missing button. It is the shape the
 * whole day kept finding: each layer looks finished on its own, and the chain
 * is broken one link along. A tested service, a live route, an api member and
 * a hook are all worth nothing if no screen calls them — and every one of those
 * layers passes its own review.
 */
describe('the meter has a door', () => {
  it('has an api member pointed at the route that exists', () => {
    expect(api).toMatch(/emptyTrash:\s*\(\)\s*=>/);
    expect(api).toMatch(/api\.delete<[^>]*>\('\/mail\/trash'\)/);
  });

  it('has a hook that invalidates the quota, not just the list', () => {
    // The account bar shows bytes used. Emptying changes it, so a hook that
    // refreshed only the message list would leave the number it just moved
    // sitting there stale — which reads as "nothing happened".
    const hook = api.slice(api.indexOf('export function useEmptyTrash'));
    expect(hook).toMatch(/mailApi\.emptyTrash\(\)/);
    expect(hook.slice(0, 400)).toMatch(/invalidateQueries\(\{ queryKey: \['mail'\] \}\)/);
  });

  it('renders a control that calls it', () => {
    // THE LINK THAT WAS MISSING. Everything above can be perfect and unused.
    expect(folders).toMatch(/useEmptyTrash\(\)/);
    expect(folders).toMatch(/<EmptyTrashButton/);
  });

  it('shows it in the Trash and nowhere else', () => {
    // An Empty Trash button on the Inbox is a different, worse bug.
    expect(folders).toMatch(/folder === 'trash' && !project && rows\.length > 0 && <EmptyTrashButton/);
  });

  it('asks before deleting for good, and says how much', () => {
    // Deleting outright is what emptying a trash means, so there is no undo to
    // offer. What can be offered is an honest count before and freed bytes
    // after — which is why the server returns both.
    const btn = folders.slice(folders.indexOf('function EmptyTrashButton'));
    expect(btn).toMatch(/armed/);
    expect(btn).toMatch(/for good\?/);
    expect(btn).toMatch(/humanBytes\(empty\.data\.freedBytes\)/);
    expect(btn).toMatch(/empty\.data\.deleted/);
  });

  it('does not reach for a native confirm dialog', () => {
    // This hub renders its own surfaces everywhere else; a browser confirm is
    // a different application appearing on top of yours.
    const btn = folders.slice(folders.indexOf('function EmptyTrashButton'), folders.indexOf('export function Inbox'));
    expect(btn).not.toMatch(/window\.confirm|[^.\w]confirm\(/);
  });
});
