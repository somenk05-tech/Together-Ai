import { DatingService } from './dating.service';

/**
 * The pause control promises "temporarily hidden from matching — nothing is
 * deleted". Both invisibilities used to be one boolean at the write gate, so
 * pausing also froze the matches a citizen already had. Now: a paused profile
 * stays writable to somebody it has ALREADY matched with; hidden does not;
 * and neither can be liked fresh.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
function build(mode: 'paused' | 'hidden', matched: boolean) {
  const s: any = Object.create(DatingService.prototype);
  s.prisma = {
    datingProfile: { findUnique: async () => ({ visible: false, moderation: 'approved', extras: JSON.stringify({ visibility: mode }) }) },
    datingMatch: { findFirst: async () => (matched ? { id: 'm1' } : null) },
    connection: { findMany: async () => [] },
  };
  s.blocking = { blockedWith: async () => [] };
  /* NOT `DatingService & {...}`: assertWritable is private on the class, and
     intersecting a private member with a public redeclaration collapses the
     property to `never` — which is exactly what the Mac's tsc said the first
     time this script ran against a fully generated Prisma client. The spec
     only needs the one door it knocks on. */
  return s as { assertWritable(a: string, b: string): Promise<void> };
}

describe('paused is not hidden', () => {
  it('lets an existing match keep acting on a paused profile', async () => {
    await expect(build('paused', true).assertWritable('me', 'them')).resolves.toBeUndefined();
  });

  it('still refuses a fresh stranger while paused — out of matching means out', async () => {
    await expect(build('paused', false).assertWritable('me', 'them')).rejects.toThrow('This profile is not available.');
  });

  it('hidden is unwritable even to an existing match', async () => {
    await expect(build('hidden', true).assertWritable('me', 'them')).rejects.toThrow('This profile is not available.');
  });

  it('a visible approved profile is unchanged by any of this', async () => {
    const s: any = build('paused', false);
    s.prisma.datingProfile.findUnique = async () => ({ visible: true, moderation: 'approved', extras: null });
    await expect(s.assertWritable('me', 'them')).resolves.toBeUndefined();
  });
});
