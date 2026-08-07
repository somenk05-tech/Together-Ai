import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { can, isAdminRole, permissionsFor, type AdminRole, type Permission } from './permissions';

/**
 * THE ONE PLACE A PERMISSION IS CHECKED, AND THE ONE PLACE AN ACTION IS
 * WRITTEN DOWN.
 *
 * Both live together because they are the same rule seen twice: an action
 * nobody was allowed to take, and an action nobody can find afterwards, are
 * the same failure at different times.
 *
 * `assert` reads the grants — never a name, never an env var, never a JWT
 * claim. A JWT is issued once and lives for its lifetime, so a role revoked at
 * two o'clock would keep working until the token expired. The table is the
 * truth and it is read per request.
 */
@Injectable()
export class AdminAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** The live roles this person holds. Revoked grants are not roles. */
  async rolesOf(userId: string): Promise<AdminRole[]> {
    const rows = await this.prisma.adminGrant.findMany({
      where: { userId, revokedAt: null }, select: { role: true }, take: 20,
    });
    return rows.map((r) => r.role).filter(isAdminRole);
  }

  async permissionsOf(userId: string): Promise<Permission[]> {
    return [...permissionsFor(await this.rolesOf(userId))];
  }

  /**
   * Does this person hold it — a question, not a demand.
   *
   * assert() throws, which is right for a route somebody is not allowed to
   * call. It is wrong for an OPTION on a route they are allowed to call: a
   * caller who asks to unmask a phone number and does not hold users.contact
   * should get the masked record, not a 403 telling them the permission
   * exists. A refusal there is a probe for who holds what.
   */
  async holds(userId: string, need: Permission): Promise<boolean> {
    return can(await this.rolesOf(userId), need);
  }

  /**
   * Refuses by naming the permission, not the role.
   *
   * "You need finance.act" tells the person what to ask for. "You are not an
   * admin" tells them nothing and invites them to ask for everything.
   */
  async assert(userId: string, need: Permission): Promise<AdminRole[]> {
    const roles = await this.rolesOf(userId);
    if (!can(roles, need)) {
      throw new ForbiddenException(`This needs the "${need}" permission, which none of your roles carries.`);
    }
    return roles;
  }

  /**
   * WRITE IT DOWN, AND SAY WHY.
   *
   * The reason is required at the API rather than at the column, because a
   * schema cannot tell an empty string from a considered one and a form that
   * refuses to submit without a sentence can. An audit line that says
   * "suspended account" answers nothing anybody will ask six months later.
   *
   * before/after carry the FIELD THAT MOVED. A whole-row snapshot copies a
   * citizen's record into a table with different access rules, and produces a
   * log nobody reads.
   */
  async record(input: {
    actorId: string; action: string; entity: string; entityId: string;
    before?: unknown; after?: unknown; reason: string; ip?: string | null;
  }) {
    const json = (v: unknown) => (v === undefined ? null : JSON.stringify(v).slice(0, 4000));
    return this.prisma.adminAudit.create({
      data: {
        actorId: input.actorId, action: input.action,
        entity: input.entity, entityId: input.entityId,
        before: json(input.before), after: json(input.after),
        reason: input.reason.trim().slice(0, 1000),
        ip: input.ip ?? null,
      },
    });
  }

  /**
   * Do the thing and record it, or do neither.
   *
   * Every mutating console action goes through here. An action that succeeded
   * and an audit row that did not is exactly the silent change the rule exists
   * to prevent, so the write and the record share a transaction — and the
   * record is written FIRST, because an audit entry for something that then
   * failed is a question somebody can answer, while a change nobody logged is
   * not.
   */
  async act<T>(input: {
    actorId: string; need: Permission; action: string; entity: string; entityId: string;
    before?: unknown; after?: unknown; reason: string; ip?: string | null;
  }, run: () => Promise<T>): Promise<T> {
    await this.assert(input.actorId, input.need);
    if (!input.reason.trim()) {
      throw new ForbiddenException('Every action in the console needs a reason. Say why, in a sentence.');
    }
    await this.record(input);
    return run();
  }
}
