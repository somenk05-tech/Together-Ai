import { readFileSync } from 'fs';
import { join } from 'path';

const api = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const web = (p: string) =>
  readFileSync(join(__dirname, '..', '..', '..', 'together-city-react', 'src', p), 'utf8');
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

/**
 * ── A SECOND DOOR INTO THE SAME ROOM, WITH NO LOCK ON IT ────────────────────
 *
 * `POST /dating/matches/:id/unlock-chat` and `POST /dating/matches/:id/connect`
 * ran the identical line — `this.dating.connect(user.sub, targetUserId, kind)`.
 * Chat unlocking became free on 26 Aug and `connect` became the path; the older
 * route was left behind as a duplicate.
 *
 * It was not merely dead. `connect` carries `@Throttle(DECISION_LIMIT)` — 60 a
 * minute. `unlock-chat` carried NO throttle, so the same action was reachable
 * at the global default of 120 a minute by anyone who knew the older path. A
 * rate limit that a second URL walks around is not a rate limit, and this is
 * the shape that survives review: nobody re-reads a route they believe nothing
 * calls.
 *
 * Three layers were dead and each hid the next:
 *   - `datingApi.unlockChat` in the web app — referenced by nothing, not even
 *     a hook in its own file.
 *   - the controller route — no frontend caller, no spec.
 *   - `DatingService.unlockChat` — a pure alias for `connect`, and not even
 *     the route called it; the route called `connect` directly.
 *
 * Found by asking a question the existing orphan-route guard cannot ask: not
 * "does this route have a caller" but "does this api-object member have one".
 * The curated-shelf defect on 26 Jul hid in that same blind spot, one link
 * further out than the guard looks.
 */
describe('every door into the dating hub has one key', () => {
  const controller = code(api('dating/dating.controller.ts'));
  const service = code(api('dating/dating.service.ts'));
  const webApi = web('features/dating/api.ts');

  it('has no second, unthrottled path to connect', () => {
    expect(controller).not.toMatch(/unlock-chat/);
    expect(service).not.toMatch(/unlockChat\s*\(/);
    expect(webApi).not.toMatch(/unlockChat/);
  });

  it('still throttles the door that remains', () => {
    // Deleting the duplicate is only a fix if the survivor is the guarded one.
    // Nest puts @Throttle AFTER @Post here, so read forwards to the handler
    // body — an assertion that looked backwards passed for the wrong reason
    // on the first run and was corrected rather than loosened.
    const at = controller.indexOf("@Post('matches/:targetUserId/connect')");
    expect(at).toBeGreaterThan(-1);
    const decl = controller.slice(at, controller.indexOf('{', controller.indexOf('connect(', at)));
    expect(decl).toMatch(/@Throttle\(DECISION_LIMIT\)/);
  });

  it('leaves no datingApi member that nothing calls', () => {
    // THE GENERAL CHECK. A member declared here and called by nothing — not
    // even a hook in this same file — is a chain whose far end is dead, and
    // that is where both of 28 August's findings were hiding.
    const start = webApi.indexOf('export const datingApi = {');
    expect(start).toBeGreaterThan(-1);
    const body = webApi.slice(start + 'export const datingApi = {'.length, webApi.indexOf('\n};', start));
    const members = [...body.matchAll(/^ {2}(\w+)\s*[:(]/gm)].map((m) => m[1]);
    expect(members.length).toBeGreaterThan(15);

    const orphans = members.filter((m) => {
      const uses = webApi.match(new RegExp(`\\bdatingApi\\.${m}\\b`, 'g')) ?? [];
      return uses.length === 0;
    });
    // Named, so the failure says which member rather than a bare count.
    expect(orphans).toEqual([]);
  });
});
