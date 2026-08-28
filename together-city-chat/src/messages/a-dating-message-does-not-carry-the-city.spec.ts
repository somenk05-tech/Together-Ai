import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
 * The NAME is not masked and must not start being masked here: retiring the
 * dating pseudonym was a deliberate decision recorded in
 * conversations.service.ts, and a name that differs between the chat and the
 * Matches page reads as somebody changing names between screens.
 *
 * What is withheld is what the citizen has not chosen to give. anonymousTrust
 * 2 is that choice — both sides reveal, the conversation moves to 2, and the
 * sender block is whole again.
 */
const src = readFileSync(join(__dirname, 'messages.service.ts'), 'utf8');
const gateway = readFileSync(join(__dirname, '..', 'chat', 'chat.gateway.ts'), 'utf8');

/** The masking helper, verbatim from the serializer, applied to a row. */
function maskedSenderOf(anonymousTrust: number | null) {
  const m = {
    conversation: { anonymousTrust },
    sender: { id: 'u1', name: 'Angel', handle: 'somen', profileImage: 'https://city/me.jpg' },
  };
  const anonymous = m.conversation?.anonymousTrust != null && m.conversation.anonymousTrust < 2;
  return anonymous ? (({ id, name }) => ({ id, name }))(m.sender) : m.sender;
}

describe('a dating message does not carry the city', () => {
  it('withholds the handle and the account photo while the chat is anonymous', () => {
    for (const trust of [0, 1]) {
      const s = maskedSenderOf(trust) as Record<string, unknown>;
      expect(s).toEqual({ id: 'u1', name: 'Angel' });
      expect(s.handle).toBeUndefined();
      expect(s.profileImage).toBeUndefined();
    }
  });

  it('keeps the name, because the pseudonym was retired on purpose', () => {
    expect((maskedSenderOf(1) as { name: string }).name).toBe('Angel');
  });

  it('hands the whole sender over once both sides have chosen to reveal', () => {
    expect(maskedSenderOf(2)).toEqual({ id: 'u1', name: 'Angel', handle: 'somen', profileImage: 'https://city/me.jpg' });
  });

  it('leaves an ordinary city chat untouched', () => {
    expect(maskedSenderOf(null)).toEqual({ id: 'u1', name: 'Angel', handle: 'somen', profileImage: 'https://city/me.jpg' });
  });

  /**
   * The masking has to be in the serializer, not in its callers: there are
   * seven of them and a flag threaded through seven is a flag forgotten at the
   * eighth. The conversation rides along in messageInclude so the one place
   * that builds the payload is the one place that answers the question.
   */
  it('asks the question where the payload is built, once', () => {
    expect(src).toMatch(/conversation: \{ select: \{ anonymousTrust: true \} \}/);
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
