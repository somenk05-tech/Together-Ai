import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { AdminAccessService } from './admin-access.service';
import { PERMISSIONS, ROLES, type Permission } from './permissions';
import { CITIZEN_FIELDS, toCitizenView, type CitizenRow } from './citizen-view';
import { VerificationService } from '../local-services/verification.service';

/**
 * THE FIRST CONSOLE SCREEN, AND THE ONE WITH SOMEBODY WAITING ON IT.
 *
 * Listings sit at moderation: 'pending' and nothing has ever surfaced them.
 * A citizen who filled in the whole form is looking at a page that says their
 * business is not live yet, and there is no queue anywhere that a person could
 * open to change that. That is the screen worth building first — not the
 * dashboard of counters, which mostly counts things that do not exist yet.
 *
 * Every decision goes through AdminAccessService.act(), so it is impossible to
 * approve a listing without the permission and without a written reason. That
 * is the whole point of having built the substrate before the screen.
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AdminAccessService,
    // The reading and writing of a verification lives in the hub that owns it.
    // What belongs here is the permission and the audit row — the two things a
    // decision cannot be taken without.
    private readonly verification: VerificationService,
  ) {}

  /**
   * Who the caller is, in console terms.
   *
   * Returns the permission KEYS and their sentences, so the screen can hide
   * what this person cannot do rather than showing them buttons that will
   * refuse. Hiding is a courtesy; the guard is the security.
   */
  async me(userId: string) {
    const roles = await this.access.rolesOf(userId);
    const perms = await this.access.permissionsOf(userId);
    return {
      roles,
      permissions: perms.map((key) => ({ key, label: PERMISSIONS[key] })),
      // The whole map, so a founder can see what a role would grant before
      // granting it. Reading the table is not an action.
      roleCatalogue: Object.fromEntries(Object.entries(ROLES).map(([r, ps]) => [r, [...ps]])),
    };
  }

  /**
   * Everything waiting on a decision.
   *
   * Oldest first, deliberately. A queue sorted newest-first starves its own
   * tail: the listing nobody got to on Monday is the listing nobody gets to
   * ever, and it belongs to the citizen who has been waiting longest.
   */
  async queue(userId: string) {
    await this.access.assert(userId, 'business.read');
    const rows = await this.prisma.serviceListing.findMany({
      where: { moderation: 'pending' },
      orderBy: { createdAt: 'asc' },
      take: 200,
    }) as unknown as Array<{
      id: string; ownerId: string; businessName: string; categoryKey: string; city: string;
      areas: string; about: string | null; photosJson: string; createdAt: Date; slug: string | null;
    }>;
    if (!rows.length) return { items: [], waiting: 0 };

    // One read for the owners rather than one per row — a queue of two hundred
    // listings is not two hundred queries.
    const owners = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.ownerId))] } },
      select: { id: true, name: true, handle: true, createdAt: true },
      take: 200,
    });
    const byId = new Map(owners.map((o) => [o.id, o]));

    const parse = (json: string): Array<{ url: string }> => {
      try { return JSON.parse(json) as Array<{ url: string }>; } catch { return []; }
    };
    const now = Date.now();
    return {
      waiting: rows.length,
      items: rows.map((r) => {
        const o = byId.get(r.ownerId);
        return {
          id: r.id, slug: r.slug,
          businessName: r.businessName, categoryKey: r.categoryKey,
          city: r.city, areas: r.areas.split(',').map((a) => a.trim()).filter(Boolean),
          about: r.about, photos: parse(r.photosJson).map((p) => p.url).slice(0, 5),
          createdAt: r.createdAt.toISOString(),
          // The number the queue is actually about.
          waitingHours: Math.floor((now - r.createdAt.getTime()) / 3_600_000),
          owner: o ? { name: o.name, handle: o.handle, joinedAt: o.createdAt.toISOString() } : null,
        };
      }),
    };
  }

  /**
   * Approve, reject or suspend — and say why, every time.
   *
   * The reason is not paperwork. A rejected business is a person who will ask
   * what was wrong with their listing, and an answer that exists only in the
   * moderator's memory is an answer nobody can give a week later.
   */
  async decide(userId: string, id: string, decision: 'approved' | 'rejected' | 'removed', reason: string, ip?: string | null) {
    const need: Permission = decision === 'removed' ? 'business.suspend' : 'business.approve';
    const row = await this.prisma.serviceListing.findUnique({ where: { id } }) as { moderation: string } | null;
    if (!row) throw new NotFoundException('listing not found');

    return this.access.act({
      actorId: userId, need,
      action: `listing.${decision}`, entity: 'listing', entityId: id,
      before: { moderation: row.moderation }, after: { moderation: decision },
      reason, ip,
    }, async () => {
      await this.prisma.serviceListing.update({ where: { id }, data: { moderation: decision } });
      return { id, moderation: decision };
    });
  }

  /**
   * BUSINESSES WAITING TO BE VERIFIED.
   *
   * A second queue beside the moderation one, and deliberately not merged with
   * it: they answer different questions. Moderation asks "should this page be
   * in the directory at all"; this asks "is this business who it says it is".
   * A single list would make one reviewer's yes stand for both.
   *
   * Reading it needs `business.verify` rather than `business.read`, because the
   * row carries a registration number and a certificate — documents the owner
   * sent to be checked, not to be browsed.
   */
  async verificationQueue(userId: string) {
    await this.access.assert(userId, 'business.verify');
    return this.verification.queue();
  }

  /**
   * Verified, or refused with a reason.
   *
   * Approving hands this listing an unlimited inbox and puts a badge on it that
   * a citizen will read as "checked by Together City". Both directions want a
   * name against them — which is what act() is for — and the refusal reason is
   * shown to the owner verbatim, so it is written to be read by them and not
   * about them.
   */
  async decideVerification(
    userId: string, listingId: string,
    decision: 'verified' | 'rejected', reason: string, ip?: string | null,
    kind: 'doc' | 'video' = 'doc',
  ) {
    return this.access.act({
      actorId: userId, need: 'business.verify',
      action: `verification.${kind === 'video' ? 'video.' : ''}${decision}`, entity: 'listing', entityId: listingId,
      after: kind === 'video' ? { videoStatus: decision } : { docStatus: decision },
      reason, ip,
    }, () => this.verification.decide(userId, listingId, decision, reason, kind));
  }

  /**
   * The log, newest first, because reading it is nearly always "what just
   * happened".
   */
  async audit(userId: string, q: { entity?: string; entityId?: string; actorId?: string }) {
    await this.access.assert(userId, 'audit.read');
    const rows = await this.prisma.adminAudit.findMany({
      where: {
        ...(q.entity ? { entity: q.entity } : {}),
        ...(q.entityId ? { entityId: q.entityId } : {}),
        ...(q.actorId ? { actorId: q.actorId } : {}),
      },
      orderBy: { at: 'desc' },
      take: 200,
    });
    const actors = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.actorId))] } },
      select: { id: true, name: true, handle: true }, take: 200,
    });
    const byId = new Map(actors.map((a) => [a.id, a]));
    return {
      items: rows.map((r) => ({
        id: r.id, action: r.action, entity: r.entity, entityId: r.entityId,
        before: r.before, after: r.after, reason: r.reason,
        at: r.at.toISOString(),
        // The IP is recorded and NOT returned. It exists so a compromised
        // account can be traced by somebody with database access, not so that
        // every reader of the log collects their colleagues' home addresses.
        actor: byId.get(r.actorId) ? { name: byId.get(r.actorId)!.name, handle: byId.get(r.actorId)!.handle } : null,
      })),
    };
  }

  /**
   * ── THE CITIZEN SCREENS ───────────────────────────────────────────────
   *
   * Every User read below selects CITIZEN_FIELDS and nothing else, and turns
   * the row into a CitizenView before it leaves this file. That is not style:
   * citizen-view.ts is where the line between "a console" and "surveillance"
   * is written down, and a query that selects its own columns is a query that
   * routed around it.
   */

  /** The projection, built from the allow-list rather than typed out beside
   *  it — two lists that must agree is one list somebody will edit alone. */
  private readonly citizenSelect =
    Object.fromEntries(CITIZEN_FIELDS.map((f) => [f, true])) as Record<string, true>;

  /**
   * Find a person.
   *
   * Handle, name and — deliberately — id, because half of what an admin has in
   * front of them is an id copied out of an audit row or an error report, and
   * a search that cannot take one sends them to the database.
   *
   * Deleted accounts are INCLUDED. A console that hides them cannot answer
   * "what happened to this account", which is the question somebody is asking
   * precisely when the account is gone.
   */
  async citizens(userId: string, q: { query?: string; status?: string }) {
    await this.access.assert(userId, 'users.read');
    const term = (q.query ?? '').trim();
    const where: Record<string, unknown> = {};
    if (term) {
      where.OR = [
        { handle: { contains: term, mode: 'insensitive' } },
        { name: { contains: term, mode: 'insensitive' } },
        { id: term },
      ];
    }
    if (q.status === 'suspended') where.suspendedAt = { not: null };
    if (q.status === 'deleted') where.deletedAt = { not: null };

    const rows = await this.prisma.user.findMany({
      where,
      select: this.citizenSelect,
      orderBy: { createdAt: 'desc' },
      // Bounded, and the bound is reported rather than hidden — a list that
      // silently stops at fifty reads as "there are fifty".
      take: 50,
    }) as unknown as CitizenRow[];
    // Not `rows.map(toCitizenView)`: map passes the INDEX as the second
    // argument, which lands in the options object. It happens to be harmless
    // — `(3).unmask` is undefined, so it masks — but the version of this that
    // is safe by accident is one refactor away from the version that is not.
    return { items: rows.map((r) => toCitizenView(r)), limit: 50, truncated: rows.length === 50 };
  }

  /**
   * One person, and what this console legitimately knows about them.
   *
   * Their listings, the reports they filed and the reports filed about them,
   * the admin roles they hold, and every console action ever taken on them.
   * That last one is the point of the screen: an admin about to suspend an
   * account should be looking at what the last three admins did to it.
   *
   * NOT their messages, their health hubs, their mail or their files. See
   * citizen-view.ts, where that is a decision with reasons rather than an
   * omission somebody can fill in.
   */
  async citizen(userId: string, targetId: string, opts: { unmask?: boolean; reason?: string } = {}) {
    await this.access.assert(userId, 'users.read');
    const row = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: this.citizenSelect,
    }) as unknown as CitizenRow | null;
    if (!row) throw new NotFoundException('no such account');

    /**
     * The one read in this system that is audited.
     *
     * Everywhere else, reads are not logged: a record of every page view is a
     * record nobody reads and a record of which colleague looked at which
     * citizen. Revealing somebody's actual email and phone number is not a page
     * view — it is a contact detail leaving the system in a form somebody can
     * use — so "who pulled this person's number" has an answer.
     *
     * The permission is checked BEFORE the reason, and the reason is required,
     * because act() enforces both and there is no cheaper version of this that
     * is still honest. A caller without users.contact gets the mask and no
     * error: asking for something you may not have is not a failure, and a 403
     * here would turn the checkbox into a probe for who holds what.
     */
    let unmask = false;
    if (opts.unmask) {
      const allowed = await this.access.holds(userId, 'users.contact');
      if (allowed) {
        await this.access.record({
          actorId: userId,
          action: 'user.contact.reveal',
          entity: 'user', entityId: targetId,
          after: { revealed: ['email', 'phone'] },
          reason: (opts.reason ?? '').trim() || 'No reason given.',
        });
        unmask = true;
      }
    }

    const [listings, reportsMade, reportsAbout, grants, actions] = await Promise.all([
      this.prisma.serviceListing.findMany({
        where: { ownerId: targetId },
        select: { id: true, businessName: true, categoryKey: true, city: true, moderation: true, createdAt: true, slug: true },
        orderBy: { createdAt: 'desc' }, take: 50,
      }),
      this.prisma.report.count({ where: { reporterId: targetId } }),
      this.prisma.report.findMany({
        where: { targetType: 'user', targetId },
        select: { id: true, reason: true, status: true, createdAt: true },
        orderBy: { createdAt: 'desc' }, take: 20,
      }),
      this.prisma.adminGrant.findMany({
        where: { userId: targetId, revokedAt: null },
        select: { role: true, grantedAt: true, grantedBy: true, reason: true },
        orderBy: { grantedAt: 'desc' }, take: 20,
      }),
      this.prisma.adminAudit.findMany({
        where: { entity: 'user', entityId: targetId },
        select: { id: true, action: true, reason: true, at: true, actorId: true },
        orderBy: { at: 'desc' }, take: 50,
      }),
    ]);

    const actors = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(actions.map((a) => a.actorId))] } },
      select: { id: true, name: true, handle: true }, take: 50,
    });
    const byId = new Map(actors.map((a) => [a.id, a]));

    return {
      citizen: toCitizenView(row, { unmask }),
      listings: listings.map((l) => ({
        id: l.id, slug: l.slug, businessName: l.businessName, categoryKey: l.categoryKey,
        city: l.city, moderation: l.moderation, createdAt: l.createdAt.toISOString(),
      })),
      // A count for what they filed; the substance for what was filed about
      // them. The asymmetry is on purpose — "this person reports a lot" is a
      // pattern worth seeing, and reading their complaints one by one is not
      // what this screen is for.
      reportsMade,
      reportsAbout: reportsAbout.map((r) => ({
        id: r.id, reason: r.reason, status: r.status, createdAt: r.createdAt.toISOString(),
      })),
      grants: grants.map((g) => ({
        role: g.role, grantedAt: g.grantedAt.toISOString(), grantedBy: g.grantedBy, reason: g.reason,
      })),
      history: actions.map((a) => ({
        id: a.id, action: a.action, reason: a.reason, at: a.at.toISOString(),
        actor: byId.get(a.actorId) ? { name: byId.get(a.actorId)!.name, handle: byId.get(a.actorId)!.handle } : null,
      })),
    };
  }

  /**
   * Suspend an account, or give it back.
   *
   * Two things this deliberately does NOT do.
   *
   * It does not delete anything. A suspension is a decision somebody may
   * reverse, and the evidence for it is the data — see the migration.
   *
   * It does not revoke the citizen's sessions. It looked like an obvious
   * companion and it is the wrong shape: sessionsRevokedAt is the citizen's
   * own control, used by password resets and "sign out everywhere", and an
   * admin writing to it would put a moderation action into a field the
   * citizen's own security features read. The suspension is enforced in
   * JwtStrategy, on the next request, from suspendedAt — which is at most one
   * request of tolerance and cannot be confused with anything else.
   */
  async setSuspended(userId: string, targetId: string, suspended: boolean, reason: string, ip?: string | null) {
    const row = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, suspendedAt: true, deletedAt: true },
    }) as { id: string; suspendedAt: Date | null; deletedAt: Date | null } | null;
    if (!row) throw new NotFoundException('no such account');
    if (row.deletedAt) {
      // Suspending a closed account is a no-op dressed as an action, and the
      // admin would walk away believing they had done something.
      throw new NotFoundException('that account is already closed');
    }

    return this.access.act({
      actorId: userId, need: 'users.suspend',
      action: suspended ? 'user.suspend' : 'user.restore',
      entity: 'user', entityId: targetId,
      before: { suspended: row.suspendedAt != null },
      after: { suspended },
      reason, ip,
    }, async () => {
      await this.prisma.user.update({
        where: { id: targetId },
        data: suspended
          ? { suspendedAt: new Date(), suspendedReason: reason.trim().slice(0, 1000) }
          : { suspendedAt: null, suspendedReason: null },
      });
      return { id: targetId, suspended };
    });
  }


  /**
   * WHICH HUBS THIS ACCOUNT ACTUALLY USES — AND NOT ONE WORD OF WHAT IS IN THEM.
   *
   * The question this answers is "is this a real, active account, and where
   * does it live in the app" — which is what you need before deciding whether
   * a report is worth acting on, or whether a support case is about somebody
   * who has used the thing they are complaining about.
   *
   * EVERY ENTRY IS A COUNT OR A BOOLEAN. `has a dating profile` is an
   * operational fact. What is IN the dating profile is not this console's
   * business, and neither is a blood marker, a food diary or a message. The
   * distance between "has a medical record" and "has hypertension" is the
   * entire distance between an admin tool and a health data breach, and the
   * only thing that keeps it is that nothing here selects a content column.
   *
   * The counts are deliberately shallow — `count`, never `findMany`. A findMany
   * would return rows, and rows are contents.
   */
  async activity(userId: string, targetId: string) {
    await this.access.assert(userId, 'users.read');
    const exists = await this.prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!exists) throw new NotFoundException('no such account');

    const c = this.prisma;
    const [
      posts, comments, connections, conversations, messages,
      recipes, journal, listings, enquiries, jobApplications, jobPostings,
      driveFiles, mailMessages, notifications,
      foodPref, dating, beauty, fitness, medical, astro, jobProfile, master,
      refreshTokens, devices,
    ] = await Promise.all([
      c.post.count({ where: { authorId: targetId } }),
      c.comment.count({ where: { authorId: targetId } }),
      c.connection.count({ where: { OR: [{ userOneId: targetId }, { userTwoId: targetId }] } }),
      c.conversationMember.count({ where: { userId: targetId } }),
      c.message.count({ where: { senderId: targetId } }),
      c.recipe.count({ where: { authorId: targetId } }),
      c.foodJournalEntry.count({ where: { userId: targetId } }),
      c.serviceListing.count({ where: { ownerId: targetId } }),
      c.serviceEnquiry.count({ where: { seekerId: targetId } }),
      c.jobApplication.count({ where: { userId: targetId } }),
      c.job.count({ where: { postedById: targetId } }),
      c.driveFile.count({ where: { ownerId: targetId } }),
      c.mailMessage.count({ where: { ownerId: targetId } }),
      c.notification.count({ where: { userId: targetId } }),
      c.foodPref.count({ where: { userId: targetId } }),
      c.datingProfile.count({ where: { userId: targetId } }),
      c.beautyProfile.count({ where: { userId: targetId } }),
      c.fitnessProfile.count({ where: { userId: targetId } }),
      c.medicalRecord.count({ where: { userId: targetId } }),
      c.astroProfile.count({ where: { userId: targetId } }),
      c.jobProfile.count({ where: { userId: targetId } }),
      c.masterProfile.count({ where: { userId: targetId } }),
      // Sessions. An active refresh token IS a signed-in device.
      c.refreshToken.count({ where: { userId: targetId, revoked: false, expiresAt: { gt: new Date() } } }),
      c.deviceToken.count({ where: { userId: targetId } }),
    ]);

    return {
      counts: {
        posts, comments, connections, conversations, messages,
        recipes, foodJournalEntries: journal,
        listings, serviceEnquiries: enquiries,
        jobApplications, jobPostings,
        driveFiles, mailMessages, notifications,
      },
      // Presence only. The name of each is the entire payload.
      profiles: {
        nutrition: foodPref > 0,
        dating: dating > 0,
        beauty: beauty > 0,
        fitness: fitness > 0,
        medical: medical > 0,
        astrology: astro > 0,
        jobs: jobProfile > 0,
        masterProfile: master > 0,
      },
      sessions: {
        // No IP addresses. They are recorded on RefreshToken so a compromised
        // account can be traced by somebody with database access; a console
        // screen that lists them builds a map of where colleagues live.
        activeSessions: refreshTokens,
        pushDevices: devices,
      },
    };
  }

  /**
   * THE WHOLE LIST, AS A FILE.
   *
   * Through the same projection as every other citizen read, so the export can
   * never contain a column the screen would not show — including the contact
   * details, which stay masked here whatever the caller holds. A CSV is the one
   * artefact that reliably outlives the decision to make it: it lands in a
   * Downloads folder, gets attached to an email, and is still there in two
   * years. Unmasking one record on screen is a considered act; unmasking
   * fourteen thousand into a spreadsheet is a different thing that has not been
   * asked for and is not offered.
   *
   * AUDITED, unlike other reads, and for the same reason as the reveal: this is
   * the entire user table leaving the system in one movement.
   */
  async citizensCsv(userId: string, reason: string) {
    await this.access.assert(userId, 'users.read');
    await this.access.record({
      actorId: userId,
      action: 'users.export',
      entity: 'user', entityId: 'all',
      reason: reason.trim() || 'No reason given.',
    });

    // unbounded: an export that stopped at a page would be a file somebody
    // believes is the whole list. If it gets slow it needs streaming, not a cap.
    const rows = await this.prisma.user.findMany({
      select: this.citizenSelect,
      orderBy: { createdAt: 'desc' },
    }) as unknown as CitizenRow[];

    const HEAD = ['id', 'handle', 'name', 'city', 'joined', 'lastSeen', 'email', 'emailVerified', 'phone', 'phoneVerified', 'status', 'suspendedAt', 'suspendedReason', 'moderator'];
    // A leading apostrophe, =, + or - makes a spreadsheet treat the cell as a
    // formula. A handle of "=cmd|..." is a real attack on whoever opens the
    // file, and it is the citizen who chose the handle.
    const cell = (v: unknown): string => {
      const raw = v === null || v === undefined ? '' : String(v);
      const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const lines = [HEAD.join(',')];
    for (const r of rows) {
      const v = toCitizenView(r);
      lines.push([
        v.id, v.handle, v.name, v.city, v.joinedAt.toISOString(), v.lastSeen.toISOString(),
        v.email, v.emailVerified, v.phone, v.phoneVerified,
        v.status, v.suspendedAt?.toISOString() ?? '', v.suspendedReason, v.moderator,
      ].map(cell).join(','));
    }
    return { csv: lines.join('\n'), rows: rows.length, contactMasked: true };
  }

  /**
   * One business, from the console's side.
   *
   * The queue can approve and reject and shows almost nothing to decide on.
   * This is what a decision actually needs: the whole listing, who owns it and
   * what else they have listed, what the automated moderation thought, and
   * every human decision taken on it so far.
   */
  async business(userId: string, listingId: string) {
    await this.access.assert(userId, 'business.read');
    const l = await this.prisma.serviceListing.findUnique({ where: { id: listingId } }) as unknown as {
      id: string; ownerId: string; businessName: string; categoryKey: string; city: string;
      areas: string; about: string | null; photosJson: string; createdAt: Date; slug: string | null;
      moderation: string; moderationJson: string | null; phone: string | null;
    } | null;
    if (!l) throw new NotFoundException('listing not found');

    const owner = await this.prisma.user.findUnique({
      where: { id: l.ownerId },
      select: this.citizenSelect,
    }) as unknown as CitizenRow | null;

    const [siblings, log, history, reviews] = await Promise.all([
      this.prisma.serviceListing.findMany({
        where: { ownerId: l.ownerId, id: { not: l.id } },
        select: { id: true, businessName: true, moderation: true },
        orderBy: { createdAt: 'desc' }, take: 20,
      }),
      this.prisma.moderationLog.findMany({
        where: { listingId }, orderBy: { createdAt: 'desc' }, take: 30,
      }),
      this.prisma.adminAudit.findMany({
        where: { entity: 'listing', entityId: listingId },
        select: { id: true, action: true, reason: true, at: true, actorId: true },
        orderBy: { at: 'desc' }, take: 30,
      }),
      this.prisma.serviceReview.count({ where: { listingId } }),
    ]);

    const actors = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(history.map((h) => h.actorId))] } },
      select: { id: true, name: true, handle: true }, take: 30,
    });
    const byId = new Map(actors.map((a) => [a.id, a]));

    const parse = (json: string): Array<{ url: string }> => {
      try { return JSON.parse(json) as Array<{ url: string }>; } catch { return []; }
    };

    return {
      listing: {
        id: l.id, slug: l.slug, businessName: l.businessName, categoryKey: l.categoryKey,
        city: l.city, areas: l.areas.split(',').map((a) => a.trim()).filter(Boolean),
        about: l.about, photos: parse(l.photosJson).map((p) => p.url).slice(0, 10),
        moderation: l.moderation, createdAt: l.createdAt.toISOString(),
        reviewCount: reviews,
      },
      // The owner through the same projection as everywhere else. A business
      // page is not a way around the citizen allow-list.
      owner: owner ? toCitizenView(owner) : null,
      alsoOwns: siblings.map((s) => ({ id: s.id, businessName: s.businessName, moderation: s.moderation })),
      // What the automated pass decided, verbatim and unparsed. A summary here
      // would be this file's opinion of another module's output.
      autoModeration: l.moderationJson,
      moderationLog: log.map((m) => ({
        id: m.id, actor: m.actor, decision: m.decision, reason: m.reason, at: m.createdAt.toISOString(),
      })),
      history: history.map((h) => ({
        id: h.id, action: h.action, reason: h.reason, at: h.at.toISOString(),
        actor: byId.get(h.actorId) ? { name: byId.get(h.actorId)!.name, handle: byId.get(h.actorId)!.handle } : null,
      })),
    };
  }
}
