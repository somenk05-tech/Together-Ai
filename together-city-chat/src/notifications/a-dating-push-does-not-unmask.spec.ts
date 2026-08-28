import { NotificationsService } from './notifications.service';
import { shownName } from '../dating/matching';

/**
 * Blocker 06, second dating audit: a message notification carried the SENDER's
 * account name and city profile photo to the match's lock screen — the exact
 * reveal the dating card refuses. This calls identityIn and asserts a dating
 * push carries the chosen dating name and NO photo.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
function build(opts: { dating: boolean; firstName?: string }) {
  const s: any = Object.create(NotificationsService.prototype);
  s.prisma = {
    user: { findUnique: async () => ({ name: 'Real Cityname', profileImage: 'https://cdn/city.jpg' }) },
    datingMatch: { findFirst: async () => opts.dating
      ? { revealByOne: false, revealByTwo: false, conversationId: 'c1', userOneId: 'S', userTwoId: 'R' }
      : null },
    datingProfile: { findUnique: async () => ({ extras: JSON.stringify({ firstName: opts.firstName }) }) },
  };
  return s;
}

describe('a dating push does not unmask the sender (blocker 06)', () => {
  it('uses the chosen dating name and no photo, not the account identity', async () => {
    const s = build({ dating: true, firstName: 'Sky' });
    const id = await (s.identityIn as any).call(s, 'c1', 'S');
    expect(id.dating).toBe(true);
    expect(id.displayName).toBe(shownName({ firstName: 'Sky' }, 'Real Cityname'));
    expect(id.displayName).not.toBe('Real Cityname');
    expect(id.displayPhoto).toBeUndefined();          // never the city photo
  });

  it('a non-dating chat is unchanged — real name and photo', async () => {
    const s = build({ dating: false });
    const id = await (s.identityIn as any).call(s, 'c1', 'S');
    expect(id.dating).toBe(false);
    expect(id.displayName).toBe('Real Cityname');
    expect(id.displayPhoto).toBe('https://cdn/city.jpg');
  });
});

/**
 * ── AND NOW EVERY NOTIFICATION PUSHES (28 Aug) ──
 *
 * Push was opt-in and three callers opted in. Since it became the default, a
 * notification's TITLE AND BODY are what a stranger's lock screen shows —
 * including the dating ones that were only ever read inside the app, behind a
 * login, next to a card that had already decided what to reveal.
 *
 * The pseudonym rule was enforced where the pushes were. This walks the dating
 * hub's notification sites in source and requires that none of them puts a
 * person's name into a title or body — the one that does, the message push,
 * has its own two tests above and titles with the DATING name, which is the
 * decided identity rather than the account's.
 */
import * as fs from 'fs';
import * as path from 'path';

describe('what a dating notification may say on a lock screen', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'dating', 'dating.service.ts'), 'utf8');

  /** Every `notifications.create({...})` call in the dating hub. */
  const calls = (() => {
    const out: string[] = [];
    const re = /notifications\.create\(\{/g;
    for (let m = re.exec(src); m; m = re.exec(src)) {
      // To the matching close: far enough to hold title, body and href.
      out.push(src.slice(m.index, m.index + 600).split('}), ')[0].split('});')[0]);
    }
    return out;
  })();

  it('finds the notification sites at all — a check over nothing passes vacuously', () => {
    expect(calls.length).toBeGreaterThanOrEqual(6);
  });

  it.each(calls.map((c, i) => [`site #${i}`, c]))('%s names nobody', (_label, call) => {
    // The interpolations a name would arrive through. Scores, counts and
    // reasons are fine; `shownName`, `firstName` and `.name` are not.
    const namesSomebody = /shownName|firstName|\.name\b|displayName/.test(call);
    expect({ namesSomebody }).toEqual({ namesSomebody: false });
  });
});
