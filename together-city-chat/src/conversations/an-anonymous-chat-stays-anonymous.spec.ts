import { ConversationsService } from './conversations.service';
import { nickname } from '../shared/nickname';

/**
 * Blocker 03, second dating audit: `members()` handed a dating match the other
 * person's real handle, name and city photo with only a membership check — so
 * one GET unmasked somebody who had deliberately not revealed. This calls the
 * method and asserts the wire, not the source.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
function build(convo: any, members: Array<{ userId: string; role?: string; user: any }>) {
  const s: any = Object.create(ConversationsService.prototype);
  s.assertParticipant = async () => undefined;
  s.prisma = {
    conversation: { findUnique: async () => convo },
    conversationMember: { findMany: async () => members.map((m) => ({ userId: m.userId, role: m.role ?? 'member', user: m.user })) },
  };
  return s;
}
const A = { id: 'A', name: 'Aditi Rao', handle: 'aditi', profileImage: 'https://cdn/a.jpg' };
const B = { id: 'B', name: 'Ben Cole', handle: 'ben', profileImage: 'https://cdn/b.jpg' };

describe('an anonymous dating chat stays anonymous in the member list', () => {
  it('masks the OTHER person when the chat is anonymous (trust < 2)', async () => {
    const s = build({ type: 'DIRECT', anonymousTrust: 1 }, [{ userId: 'A', user: A }, { userId: 'B', user: B }]);
    const out = await s.members('A', 'c1');
    const them = out.find((m: any) => m.userId === 'B');
    expect(them.handle).toBeNull();
    expect(them.profileImage).toBeNull();
    expect(them.name).toBe(nickname('B'));
    expect(them.name).not.toBe('Ben Cole');
    // The caller still sees themselves normally.
    const me = out.find((m: any) => m.userId === 'A');
    expect(me.name).toBe('Aditi Rao');
  });

  it('shows real identities once the chat is revealed (trust >= 2)', async () => {
    const s = build({ type: 'DIRECT', anonymousTrust: 2 }, [{ userId: 'A', user: A }, { userId: 'B', user: B }]);
    const them = (await s.members('A', 'c1')).find((m: any) => m.userId === 'B');
    expect(them.handle).toBe('ben');
    expect(them.name).toBe('Ben Cole');
  });

  it('leaves ordinary (non-anonymous) direct chats and groups untouched', async () => {
    const direct = build({ type: 'DIRECT', anonymousTrust: null }, [{ userId: 'A', user: A }, { userId: 'B', user: B }]);
    expect((await direct.members('A', 'c1')).find((m: any) => m.userId === 'B').handle).toBe('ben');
    const group = build({ type: 'GROUP', anonymousTrust: null }, [{ userId: 'A', user: A }, { userId: 'B', user: B }]);
    expect((await group.members('A', 'c1')).find((m: any) => m.userId === 'B').handle).toBe('ben');
  });
});
