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
