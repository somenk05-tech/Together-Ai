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

const svc = new MessagesService({} as never, {} as never, {} as never, {} as never, {} as never);

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

  it('hands the whole sender over once both sides have chosen to reveal', () => {
    expect(senderOf(2)).toEqual({
      id: 'u1', name: 'Angel Dsouza', handle: 'somen', profileImage: 'https://city/me.jpg',
      datingProfile: { extras: JSON.stringify({ firstName: 'priya' }) },
    });
  });

  it('leaves an ordinary city chat untouched', () => {
    const s = senderOf(null);
    expect(s.name).toBe('Angel Dsouza');
    expect(s.handle).toBe('somen');
    expect(s.profileImage).toBe('https://city/me.jpg');
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
