import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { FOUNDER_HANDLES } from '../auth/admin';
import { swallow } from '../shared/swallow';

/**
 * THE FIRST ADMIN.
 *
 * The console reads its authorisation from the AdminGrant table, and the table
 * is empty. Nothing in the application can write to it except a route that
 * requires `admin.grant`, which nobody holds — so the console it took two
 * commits to build cannot be opened by anybody, including the person who
 * commissioned it. That is not a bug in the design; every system that grants
 * roles from a table has this moment, and the only question is what unlocks it.
 *
 * This does, at boot, from the environment, following the pattern already in
 * this codebase: MODERATION_ADMINS grants the moderator role the same way, for
 * the same reason, and this is deliberately its twin rather than a second
 * philosophy sitting beside it.
 *
 * ── WHY AN ENV VAR IS NOT A BACK DOOR ──
 *
 * Whoever can set CONSOLE_FOUNDERS on the deployment can also deploy code to
 * it. They are not escalating to founder; they already had strictly more than
 * founder and this only makes it visible. The alternative — a "first user to
 * click this becomes founder" screen — grants root to whoever finds a URL, and
 * that IS a back door.
 *
 * ── THE THREE THINGS THAT MAKE IT SURVIVABLE ──
 *
 * 1. IT WRITES AN AUDIT ROW. A founder who appears in the grants table with no
 *    trace of where they came from is the one grant nobody can account for
 *    afterwards. The console's own audit log shows this happening, attributed
 *    to "bootstrap", with the environment named as the reason.
 *
 * 2. IT IS IDEMPOTENT AND SILENT. A live grant for that handle means nothing
 *    happens and nothing is logged. Rebooting twenty times does not produce
 *    twenty grants or twenty audit rows.
 *
 * 3. IT NEVER REVOKES. Removing a handle from the variable does not take the
 *    role away — same rule as MODERATION_ADMINS, same reason, written out
 *    there: silently dropping founder from a live account during an unrelated
 *    deploy is worse than leaving it until a person decides. Revoking is done
 *    in the console, by somebody holding `admin.grant`, with a reason attached.
 *
 * A HANDLE THAT DOES NOT EXIST IS A LOUD WARNING, NOT A SILENT NO-OP. Getting
 * the handle wrong is the single most likely mistake here, and its symptom
 * without this line is "the console still says forbidden" with nothing in the
 * logs to explain it.
 */
/* Read in auth/admin.ts since 2 Sep, beside MODERATION_ADMINS, so the same
   reservation covers both lists — see the note on FOUNDER_HANDLES there. */
export { FOUNDER_HANDLES };

/** The role the environment may grant. One, and the narrowest that can grant
 *  the others — a founder's first real job is handing out smaller roles. */
const BOOTSTRAP_ROLE = 'founder';

@Injectable()
export class ConsoleBootstrapService implements OnModuleInit {
  private readonly logger = new Logger('ConsoleBootstrap');

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    if (!FOUNDER_HANDLES.length) return;

    // unbounded: FOUNDER_HANDLES is a hand-written env var of a few names, and a
    // take: here would silently skip a founder somebody deliberately listed.
    const users = await swallow(this.prisma.user.findMany({
      where: { handle: { in: [...FOUNDER_HANDLES] } },
      select: { id: true, handle: true },
    }), 'console bootstrap lookup');
    if (!users) {
      this.logger.warn('Could not read accounts for CONSOLE_FOUNDERS.');
      return;
    }

    const found = new Set(users.map((u) => u.handle.toLowerCase()));
    for (const h of FOUNDER_HANDLES) {
      if (!found.has(h)) {
        this.logger.warn(
          `CONSOLE_FOUNDERS names "@${h}", and no account has that handle. `
          + 'Nothing was granted. Check the spelling — this is what "the console '
          + 'says forbidden and the logs say nothing" looks like.',
        );
      }
    }

    for (const u of users) {
      const existing = await swallow(this.prisma.adminGrant.findFirst({
        where: { userId: u.id, role: BOOTSTRAP_ROLE, revokedAt: null },
        select: { id: true },
      }), 'console bootstrap grant check', { userId: u.id });
      // A read that failed is not a "no". Granting on an error would mint a
      // duplicate founder on every boot the database was briefly unreachable.
      if (existing === undefined || existing) continue;

      const reason = 'Bootstrapped from CONSOLE_FOUNDERS at boot.';
      const ok = await swallow(this.prisma.$transaction([
        this.prisma.adminGrant.create({
          data: { userId: u.id, role: BOOTSTRAP_ROLE, grantedBy: 'bootstrap', reason },
        }),
        // actorId is the GRANTEE, not the granter, and that needs saying: the
        // column has a foreign key to User and "bootstrap" is not an account.
        // The row would read as somebody granting themselves founder, which is
        // why grantedBy above says bootstrap and the reason says it again in
        // words — the audit screen renders the reason, so nobody has to infer
        // it from an actor that could not have been anything else.
        this.prisma.adminAudit.create({
          data: {
            actorId: u.id,
            action: 'admin.grant',
            entity: 'user',
            entityId: u.id,
            before: null,
            after: JSON.stringify({ role: BOOTSTRAP_ROLE }),
            reason,
            ip: null,
          },
        }),
      ]), 'console bootstrap grant', { userId: u.id });

      if (ok) this.logger.log(`Granted the ${BOOTSTRAP_ROLE} role to @${u.handle} from CONSOLE_FOUNDERS.`);
      else this.logger.warn(`Could not grant the ${BOOTSTRAP_ROLE} role to @${u.handle}.`);
    }
  }
}
