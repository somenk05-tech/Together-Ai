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


/**
 * ── AND WHAT IT MAY SAY, WHICH IS NOTHING UNLESS YOU ASKED ──
 *
 * The name was decided in August; the WORDS were not. A dating push carried
 * `params.preview` — the message text — to a lock screen, which is the one
 * surface in this hub that a person who is not the recipient can read, and the
 * one notification with no control over it anywhere in the product.
 *
 * So: the sender's chosen dating name, and "New message". The recipient can
 * turn the words back on in Privacy & Permissions, and it is the RECIPIENT's
 * setting because it is the recipient's phone.
 *
 * These call `notifyNewMessage` and read what reached the transports, rather
 * than reading the source for the string — a preview that stops travelling in
 * one of the two push paths and not the other is exactly the shape of bug this
 * file exists for.
 */
function pushBuild(opts: { dating: boolean; optIn?: boolean }) {
  const pushes: Array<{ via: string; payload: { title: string; body: string } }> = [];
  const belled: Array<{ title: string; body: string }> = [];
  const s: any = Object.create(NotificationsService.prototype);
  s.log = { warn: () => undefined };
  s.prisma = {
    user: { findUnique: async () => ({ name: 'Real Cityname', profileImage: null }) },
    datingMatch: { findFirst: async () => opts.dating
      ? { revealByOne: false, revealByTwo: false, conversationId: 'c1', userOneId: 'S', userTwoId: 'R' }
      : null },
    datingProfile: { findUnique: async () => ({ extras: JSON.stringify({ firstName: 'Sky' }) }) },
    conversationMember: { findUnique: async () => ({ muted: false }) },
    deviceToken: { findMany: async () => [{ token: 't-fcm', platform: 'android' }, { token: 't-web', platform: 'webpush' }] },
    privacySetting: { findUnique: async () => (opts.optIn ? { value: 'true' } : null) },
    notification: {
      findFirst: async () => null,
      create: async (a: any) => { belled.push({ title: a.data.title, body: a.data.body }); return { id: 'n1', ...a.data }; },
      count: async () => 1,
    },
  };
  s.presence = { isOnline: async () => false };
  s.redis = { openConversationsOf: async () => [] };
  s.gateway = { emitNew: () => undefined, emitCount: () => undefined };
  s.fcm = { send: async (t: string[], payload: any) => { if (t.length) pushes.push({ via: 'fcm', payload }); } };
  s.webpush = { send: async (t: string[], payload: any) => { if (t.length) pushes.push({ via: 'webpush', payload }); } };
  return { s, pushes, belled };
}

const send = async (b: ReturnType<typeof pushBuild>) =>
  b.s.notifyNewMessage({ conversationId: 'c1', senderId: 'S', recipientIds: ['R'], preview: 'meet me at the pier at nine' });

describe('what a dating push may QUOTE', () => {
  it('says who, and does not say what — on both transports', async () => {
    const b = pushBuild({ dating: true });
    await send(b);
    expect(b.pushes).toHaveLength(2);
    for (const p of b.pushes) {
      expect(p.payload.body).toBe('New message');
      expect(p.payload.body).not.toContain('pier');
      expect(p.payload.title).toBe(shownName({ firstName: 'Sky' }, 'Real Cityname'));
    }
  });

  it('quotes the message when the RECIPIENT has asked for it', async () => {
    const b = pushBuild({ dating: true, optIn: true });
    await send(b);
    expect(b.pushes.map((p) => p.payload.body)).toEqual(['meet me at the pier at nine', 'meet me at the pier at nine']);
  });

  it('leaves city chats exactly as they were', async () => {
    // The setting asks nothing of an ordinary conversation. A city push that
    // stopped quoting would be a regression dressed as a privacy improvement.
    const b = pushBuild({ dating: false });
    await send(b);
    for (const p of b.pushes) expect(p.payload.body).toBe('meet me at the pier at nine');
  });

  it('keeps the preview in the BELL, which is inside the app', async () => {
    // A notification list that says "New message" four times is not a
    // notification list, and the bell is behind a session. The line drawn is
    // the lock screen, not the whole product.
    const b = pushBuild({ dating: true });
    await send(b);
    expect(b.belled[0].body).toBe('meet me at the pier at nine');
  });
});
