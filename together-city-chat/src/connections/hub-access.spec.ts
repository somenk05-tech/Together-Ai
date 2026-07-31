import { ConnectionsService } from './connections.service';
import { BlockingService } from './blocking.service';

/**
 * The gate that wasn't.
 *
 * canAccessHub() and assertHubAccess() were written, exported and then never
 * called from outside this file, so every per-hub checkbox on the People page
 * controlled nothing. These tests pin the two behaviours that matter: what a
 * grant means, and — more importantly — what a revocation means, since that is
 * the direction nobody was enforcing.
 *
 * The service is exercised directly against a stubbed Prisma rather than
 * through Nest, because the rule under test is pure logic over one row.
 */
const ACCEPTED = 'ACCEPTED';

function serviceWith(conn: Record<string, unknown> | null, follow: { id: string } | null = null) {
  const prisma = {
    connection: {
      findFirst: jest.fn().mockResolvedValue(conn),
      findUnique: jest.fn().mockResolvedValue(conn),
    },
    follow: { findUnique: jest.fn().mockResolvedValue(follow) },
  };
  return new ConnectionsService(prisma as never, { permissionsChanged: jest.fn() } as never, {} as never,
    new BlockingService(prisma as never));
}

const connWith = (modules: string[], relationship: string | null = null) => ({
  id: 'c1', userOneId: 'a', userTwoId: 'b', status: ACCEPTED, relationship,
  modulesJson: JSON.stringify(modules),
});

describe('hub access', () => {
  describe('canAccessHub', () => {
    it('grants a hub the connection actually carries', async () => {
      const svc = serviceWith(connWith(['social', 'nutrition']));
      await expect(svc.canAccessHub('a', 'b', 'nutrition')).resolves.toBe(true);
    });

    it('REFUSES a hub the connection does not carry', async () => {
      const svc = serviceWith(connWith(['social']));
      await expect(svc.canAccessHub('a', 'b', 'nutrition')).resolves.toBe(false);
      await expect(svc.canAccessHub('a', 'b', 'medical')).resolves.toBe(false);
    });

    it('refuses everything when there is no accepted connection', async () => {
      const svc = serviceWith(null);
      await expect(svc.canAccessHub('a', 'b', 'nutrition')).resolves.toBe(false);
      await expect(svc.canAccessHub('a', 'b', 'chat')).resolves.toBe(false);
    });

    it('grants universal hubs on any accepted connection, whatever the modules say', async () => {
      // Chat and Mail cannot be switched off, so an empty module list must not
      // silently take them away.
      const svc = serviceWith(connWith([]));
      await expect(svc.canAccessHub('a', 'b', 'chat')).resolves.toBe(true);
      await expect(svc.canAccessHub('a', 'b', 'mail')).resolves.toBe(true);
    });

    it('always grants a citizen access to their own data', async () => {
      const svc = serviceWith(null);
      await expect(svc.canAccessHub('a', 'a', 'medical')).resolves.toBe(true);
    });

    it('assertHubAccess throws rather than returning false', async () => {
      const svc = serviceWith(connWith(['social']));
      await expect(svc.assertHubAccess('a', 'b', 'medical')).rejects.toThrow(/medical/);
      await expect(svc.assertHubAccess('a', 'b', 'social')).resolves.toBeUndefined();
    });
  });

  describe('visibleAudiences', () => {
    it('shows a citizen everything of their own', async () => {
      const svc = serviceWith(null);
      await expect(svc.visibleAudiences('a', 'a')).resolves.toEqual(['public', 'friends', 'family', 'private']);
    });

    it('shows a stranger only public posts', async () => {
      const svc = serviceWith(null);
      await expect(svc.visibleAudiences('a', 'b')).resolves.toEqual(['public']);
    });

    it('opens the friends circle to a connection with Social granted', async () => {
      const svc = serviceWith(connWith(['social']));
      await expect(svc.visibleAudiences('a', 'b')).resolves.toEqual(['public', 'friends']);
    });

    it('CLOSES the friends circle when Social is switched off', async () => {
      // The whole point. Before this, revoking Social left the other person
      // inside the friends circle and the checkbox was decorative.
      const svc = serviceWith(connWith(['travel', 'fitness']));
      await expect(svc.visibleAudiences('a', 'b')).resolves.toEqual(['public']);
    });

    it('keeps a follower in the friends circle regardless of hub toggles', async () => {
      // Following is its own consent and is not revoked by a hub checkbox.
      const svc = serviceWith(connWith([]), { id: 'f1' });
      await expect(svc.visibleAudiences('a', 'b')).resolves.toEqual(['public', 'friends']);
    });

    it('needs BOTH a family relationship and Social for family posts', async () => {
      await expect(serviceWith(connWith(['social'], 'family')).visibleAudiences('a', 'b'))
        .resolves.toEqual(['public', 'friends', 'family']);
      // Family relationship, Social off → no family posts.
      await expect(serviceWith(connWith(['travel'], 'family')).visibleAudiences('a', 'b'))
        .resolves.toEqual(['public']);
      // Social on, not family → friends only.
      await expect(serviceWith(connWith(['social'], 'friend')).visibleAudiences('a', 'b'))
        .resolves.toEqual(['public', 'friends']);
    });
  });

  describe('the family-only rule, at the gate', () => {
    // The registry has always carried `familyOnly: true` on Nutrition, Medical
    // and Financial. Until hub-grants.ts, nothing read it — the only thing
    // stopping a "friend" holding a Medical grant was which checkboxes the
    // browser chose to draw. These pin the gate itself.

    it('REFUSES a family-only hub on a connection stated as friend', async () => {
      const svc = serviceWith(connWith(['social', 'medical', 'nutrition'], 'friend'));
      await expect(svc.canAccessHub('a', 'b', 'medical')).resolves.toBe(false);
      await expect(svc.canAccessHub('a', 'b', 'nutrition')).resolves.toBe(false);
      // …while everything a friend may hold is untouched.
      await expect(svc.canAccessHub('a', 'b', 'social')).resolves.toBe(true);
    });

    it('refuses them for every other stated relationship too', async () => {
      for (const rel of ['colleague', 'partner', 'other']) {
        const svc = serviceWith(connWith(['financial'], rel));
        await expect(svc.canAccessHub('a', 'b', 'financial')).resolves.toBe(false);
      }
    });

    it('allows them for family', async () => {
      const svc = serviceWith(connWith(['medical', 'nutrition', 'financial'], 'family'));
      await expect(svc.canAccessHub('a', 'b', 'medical')).resolves.toBe(true);
      await expect(svc.canAccessHub('a', 'b', 'nutrition')).resolves.toBe(true);
      await expect(svc.canAccessHub('a', 'b', 'financial')).resolves.toBe(true);
    });

    it('leaves rows that never stated a relationship alone', async () => {
      // These predate the question being asked. A family sharing their nutrition
      // hub today should not lose it because an older screen never asked them to
      // name the relationship — the next write settles the row.
      const svc = serviceWith(connWith(['nutrition', 'medical'], null));
      await expect(svc.canAccessHub('a', 'b', 'nutrition')).resolves.toBe(true);
      await expect(svc.canAccessHub('a', 'b', 'medical')).resolves.toBe(true);
    });

    it('still grants universal hubs to a friend — they are not family-only', async () => {
      const svc = serviceWith(connWith(['medical'], 'friend'));
      await expect(svc.canAccessHub('a', 'b', 'chat')).resolves.toBe(true);
      await expect(svc.canAccessHub('a', 'b', 'mail')).resolves.toBe(true);
    });

    it('assertHubAccess refuses in the same shape', async () => {
      const svc = serviceWith(connWith(['medical'], 'friend'));
      await expect(svc.assertHubAccess('a', 'b', 'medical')).rejects.toThrow(/medical/);
    });
  });
});
