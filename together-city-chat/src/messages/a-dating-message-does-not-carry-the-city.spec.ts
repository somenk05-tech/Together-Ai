/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MessagesService } from './messages.service';

/**
 * ── A DATING MESSAGE DOES NOT CARRY THE CITY IDENTITY ──
 *
 * `cardIdentity` in the dating module strips the handle and the account photo
 * from every card, and says why: the handle is the city's primary key for a
 * person — their posts, their connections, their public face — and the profile
 * photo is the face the whole city already knows them by.
 * `nothing-links-the-card-to-the-city.spec.ts` enforces that INSIDE the dating
 * module. The message serializer lives here, outside its reach, and was
 * returning both on every message of every dating chat, on the REST read and
 * on the socket broadcast. The client happened not to render them, which is
 * why it was invisible in the product and complete on the wire.
 *
 * THE NAME IS THE DATING NAME (fifth audit, 31 Aug, H4). An earlier version of
 * this file held the serializer to the ACCOUNT name, on the ground that "the
 * Matches page always showed the profile's real name". That ground moved on
 * 27 Aug: cards, the dating chat list and every push name a person by
 * `shownName(extras.firstName, User.name)` — the name they chose for this hub.
 * The message row was the last surface still carrying the account name, from
 * the first bubble, before any reveal, on a hub whose profile page promises
 * "not your real name". So the rule is now the same one the cards use, and
 * the reason the old test gave — a name that differs between screens — is
 * exactly why: the chat and the card must agree, and the card was right.
 *
 * What is withheld is what the citizen has not chosen to give. anonymousTrust
 * 2 is that choice — both sides reveal, the conversation moves to 2, and the
 * sender block is whole again.
 *
 * Driven through the REAL serializer, not a copy of it: a copy that is kept
 * in step by hand is the duplication this codebase keeps paying for.
 */
const src = readFileSync(join(__dirname, 'messages.service.ts'), 'utf8');
const gateway = readFileSync(join(__dirname, '..', 'chat', 'chat.gateway.ts'), 'utf8');

const svc = new MessagesService({} as never, {} as never, {} as never, {} as never, {} as never, {} as never);

function senderOf(anonymousTrust: number | null, extras: string | null = JSON.stringify({ firstName: 'priya' })) {
  const row = {
    id: 'm1', conversationId: 'c1', senderId: 'u1', text: 'hi', messageType: 'text',
    deleted: false, createdAt: new Date('2026-08-31T00:00:00Z'),
    conversation: { anonymousTrust },
    sender: { id: 'u1', name: 'Angel Dsouza', handle: 'somen', profileImage: 'https://city/me.jpg', datingProfile: { extras } },
  };
  return (svc as any).serialize(row).sender as Record<string, unknown>;
}

describe('a dating message does not carry the city', () => {
  it('withholds the handle and the account photo while the chat is anonymous', () => {
    for (const trust of [0, 1]) {
      const s = senderOf(trust);
      expect(Object.keys(s).sort()).toEqual(['id', 'name']);
      expect(s.handle).toBeUndefined();
      expect(s.profileImage).toBeUndefined();
    }
  });

  it('names the sender by their chosen dating name, as the card does', () => {
    expect(senderOf(1).name).toBe('Priya');
    expect(senderOf(0).name).toBe('Priya');
  });

  it('falls back to the account name only when no dating name was chosen', () => {
    expect(senderOf(1, JSON.stringify({})).name).toBe('Angel Dsouza');
    expect(senderOf(1, null).name).toBe('Angel Dsouza');
    // An unparseable blob is not a reason to fail the read.
    expect(senderOf(1, '{not json').name).toBe('Angel Dsouza');
  });

  /**
   * WHAT "WHOLE" MEANS, AND WHAT IT NEVER MEANT (3 Sep).
   *
   * This assertion used to require `datingProfile: { extras: … }` and the
   * account photo on the revealed sender — it pinned the payload it happened
   * to find rather than the rule the file is named after. `extras` is the
   * WHOLE dating profile (`../dating/extras-shape.ts`): religion, deal
   * breakers, personality traits, wants-children, smoking and drinking and
   * diet, the age preferences, the search coordinates, the sensitive-consent
   * stamp, the private verification-selfie key and the photo list. It is
   * selected for ONE field — the dating first name — and was going out with
   * every message in the city, revealed or not, dating or not. Revealing means
   * "you may now know who I am in the city": a name and a handle. It has never
   * meant the profile blob, so the test now guards the blob's absence instead.
   *
   * The account photo goes with it for a different reason — size, not privacy:
   * no client reads a photo off a message, and `users.service` permits a 400 KB
   * `data:` URL, so a thirty-message page carried the same face thirty times.
   */
  it('hands over the city name and the handle once both sides have chosen to reveal, and nothing more', () => {
    expect(senderOf(2)).toEqual({ id: 'u1', name: 'Angel Dsouza', handle: 'somen' });
  });

  it('never lets the dating profile blob onto the wire, at any trust', () => {
    for (const trust of [null, 0, 1, 2]) {
      const s = senderOf(trust);
      expect(s.datingProfile).toBeUndefined();
      expect(JSON.stringify(s)).not.toContain('firstName');
      expect(JSON.stringify(s)).not.toContain('extras');
    }
  });

  it('leaves an ordinary city chat with its name and handle', () => {
    const s = senderOf(null);
    expect(s.name).toBe('Angel Dsouza');
    expect(s.handle).toBe('somen');
    // Not a privacy withholding — a message is simply not where an avatar belongs.
    expect(s.profileImage).toBeUndefined();
  });

  /**
   * The masking has to be in the serializer, not in its callers: there are
   * seven of them and a flag threaded through seven is a flag forgotten at the
   * eighth. The conversation rides along in messageInclude so the one place
   * that builds the payload is the one place that answers the question — and
   * the dating name rides along beside it for the same reason.
   */
  it('asks the question where the payload is built, once', () => {
    expect(src).toMatch(/conversation: \{ select: \{ anonymousTrust: true \} \}/);
    expect(src).toMatch(/datingProfile: \{ select: \{ extras: true \} \}/);
    expect(src).toMatch(/const anonymous = m\.conversation\?\.anonymousTrust != null/);
    expect(src).toMatch(/\n      sender,\n/);
    expect(src).not.toMatch(/\n      sender: m\.sender,\n/);
  });

  /**
   * The typing indicator carried the handle into the same room, which is
   * exactly when a match is at the keyboard. Nothing ever read it.
   */
  it('does not put the handle on the typing indicator', () => {
    expect(gateway).not.toMatch(/handle: client\.handle/);
    expect(gateway).not.toMatch(/client\.handle =/);
  });
});
