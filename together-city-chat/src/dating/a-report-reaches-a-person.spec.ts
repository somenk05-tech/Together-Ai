import { readFileSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const code = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

/**
 * ── A REPORT HAS TO REACH A PERSON ─────────────────────────────────────────
 *
 * The launch audit, on the two halves of the same failure:
 *
 *   · NOBODY WAS TOLD. A report wrote a database row and fired an analytics
 *     event. No email, no push, no cron, no escalation — the queue was read
 *     only if a moderator happened to open Settings and click through. The
 *     published Grievance policy promises acknowledgement within 24 hours and
 *     nothing measured it or started a clock.
 *   · AND THE MODERATOR COULD NOT SEE THE SUBJECT. A reported citizen arrived
 *     as a handle and a name. For a dating report the allegation is usually
 *     about what is ON the profile, so they were being asked to act on
 *     somebody they could not look at.
 *
 * Plus the number that made all of this invisible: `pending` photos were
 * counted nowhere, and pending is exactly what a broken Rekognition produces.
 */
describe('a report reaches a person', () => {
  const dating = code('dating/dating.service.ts');
  const social = code('social/social.service.ts');

  it('tells the moderators, and only the moderators', () => {
    expect(dating).toMatch(/void swallow\(this\.tellModerators\(targetUserId\)/);
    // Derived from the permission, never a hand-written list of roles: a role
    // that gains moderation.act gains the notification with it.
    expect(dating).toMatch(/\.filter\(\(\[, perms\]\) => \(perms as readonly string\[\]\)\.includes\('moderation\.act'\)\)/);
    expect(dating).toMatch(/where: \{ revokedAt: null, role: \{ in: roles \} \}/);
  });

  it('does not put the allegation in fifty inboxes', () => {
    // A notification is a doorbell. Carrying who-said-what to every moderator
    // is a way of publishing an accusation before anyone has judged it.
    const fn = dating.slice(dating.indexOf('private async tellModerators'), dating.indexOf('private async tellModerators') + 1600);
    expect(fn).toMatch(/Open the moderation queue to read the report and decide/);
    expect(fn).not.toMatch(/reason/);
    expect(fn).not.toMatch(/reporterId/);
    // But it does say how many, because one report is a disagreement and five
    // is a pattern, and that changes what a moderator opens first.
    expect(fn).toMatch(/has been reported \$\{total\} times/);
  });

  it('cannot fail the report by failing to announce it', () => {
    // The row is already written. A notification that could not be sent must
    // not become an error the reporter sees and retries.
    expect(dating).toMatch(/void swallow\(this\.tellModerators/);
  });

  it('shows the moderator the profile, and never the conversation', () => {
    expect(social).toMatch(/datingProfile\?\.findUnique/);
    expect(social).toMatch(/dating: dp \? datingSummary\(dp\) : null/);
    // Only what a match can already see. The raw extras blob carries their
    // preferences, their religion and their storage keys — none of it a
    // moderator's business, and none of it visible to any other citizen.
    expect(social).not.toMatch(/dating: \{[^}]*extras/);
    const sum = social.slice(social.indexOf('function datingSummary'), social.indexOf('function datingSummary') + 1200);
    expect(sum).toMatch(/photos = Array\.isArray\(dx\.photos\) \? dx\.photos\.length : 0/);
    // Reading two people's private messages is a bigger power than anything
    // else on that screen and is deliberately not taken here.
    expect(social).not.toMatch(/message\.findMany|transcript/i);
  });

  it('counts the photos nothing was counting', () => {
    // `pending` is what an unconfigured or failing Rekognition produces, and a
    // pending photo is invisible to everyone but its owner — so review being
    // dead looked exactly like nobody having uploaded lately.
    expect(dating).toMatch(/datingPhotoReview\.count\(\{ where: \{ status: 'pending' \} \}\)/);
    expect(dating).toMatch(/photosPending/);
    // And the open-report BACKLOG, not the event count over the window.
    expect(dating).toMatch(/report\.count\(\{ where: \{ targetType: 'user', status: 'open' \} \}\)/);
  });

  it('alarms upward on a queue, where the funnel only alarms downward', () => {
    // The digest skipped any step under twenty weekly users — i.e. all of
    // launch week — and only ever fired on a DROP. A backlog needs neither a
    // week to compare against nor a minimum to mean something.
    const digest = dating.slice(dating.indexOf('async funnelDigest'), dating.indexOf('async funnelDigest') + 3000);
    expect(digest).toMatch(/if \(queues\.photosPending > 0\)/);
    expect(digest).toMatch(/if \(queues\.reportsOpen > 0\)/);
    expect(digest).toMatch(/photo review is not running/);
  });
});
