import { swallow } from '../shared/swallow';
import { ForbiddenException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';

/**
 * Handles listed in MODERATION_ADMINS. This is the deployment's statement of
 * WHO should be a moderator; it is not itself the authorisation check.
 */
export const ADMIN_HANDLES: readonly string[] = (process.env.MODERATION_ADMINS ?? '')
  .split(',')
  .map((s) => s.trim().toLowerCase().replace(/^@/, ''))
  .filter(Boolean);

/**
 * A handle nobody may claim or rename into.
 *
 * Admin used to be decided by comparing the JWT's handle against this list on
 * every request, while PATCH /profile let any citizen rename themselves freely
 * and registration didn't reserve anything. If a listed handle was ever
 * unclaimed, taking it granted moderation powers over the whole hub. Reserving
 * the names closes that door; checking the role column instead of the handle
 * (see AdminService.assertAdmin) means the door no longer leads anywhere.
 */
export function isReservedAdminHandle(handle: string, currentHandle?: string | null): boolean {
  const h = handle.trim().toLowerCase().replace(/^@/, '');
  if (currentHandle && h === currentHandle.trim().toLowerCase()) return false; // keeping your own name
  return ADMIN_HANDLES.includes(h);
}

/**
 * Authorisation for moderation surfaces, resolved from User.role rather than
 * from a name the user controls.
 *
 * The role is granted at boot to the accounts named in MODERATION_ADMINS, so
 * the environment stays the source of truth for who moderates — but a rename
 * can no longer confer it, and revoking someone means editing the env AND
 * clearing their row, which is deliberate: this never auto-revokes, because
 * silently dropping moderation from a live account on an unrelated deploy is
 * worse than leaving it until someone decides.
 */
@Injectable()
export class AdminService implements OnModuleInit {
  private readonly logger = new Logger('AdminService');

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    if (!ADMIN_HANDLES.length) return;
    const granted = await swallow(this.prisma.user
      .updateMany({
        where: { handle: { in: [...ADMIN_HANDLES] }, role: { not: 'admin' } },
        data: { role: 'admin' },
      }), 'moderator role sync');
    if (!granted) {
      this.logger.warn('Could not sync moderator roles from MODERATION_ADMINS.');
    } else if (granted.count) {
      this.logger.log(`Granted the moderator role to ${granted.count} account(s) from MODERATION_ADMINS.`);
    }
  }

  /** True when this account holds the moderator role. */
  async isAdmin(userId?: string): Promise<boolean> {
    if (!userId) return false;
    const row = await swallow(this.prisma.user
      .findUnique({ where: { id: userId }, select: { role: true } }),
      'admin role read', { userId });
    return (row as { role?: string } | null | undefined)?.role === 'admin';
  }

  async assertAdmin(userId?: string, message = 'Moderator access required.'): Promise<void> {
    if (!(await this.isAdmin(userId))) throw new ForbiddenException(message);
  }
}
