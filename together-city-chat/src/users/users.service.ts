import { BadRequestException, Injectable, Optional, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { orderPair } from '../connections/connection.util';
import { mayReadHub } from '../connections/hub-grants';
import { PresenceService } from './presence.service';
import { PostMediaGuard } from '../social/post-media-guard';

export type Relationship = 'none' | 'pending_out' | 'pending_in' | 'accepted' | 'blocked';

/** The hubs a pending request would open. Stored as a JSON array of slugs; a
 *  malformed value reads as none rather than throwing, because a lookup that
 *  cannot parse one row should still tell you who the person is. */
const parseModules = (raw: unknown): string[] => {
  if (typeof raw !== 'string' || !raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch { return []; }
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
    /**
     * Optional so a spec asserting a lookup does not have to stand up an image
     * classifier — and, exactly as in SocialService, ABSENT MEANS REFUSE. See
     * setAvatar: the safe default is the one the citizen is told about, not the
     * convenient one.
     */
    @Optional() private readonly screening?: PostMediaGuard,
  ) {}

  async me(userId: string) {
    // `email` + `emailVerified` are included so the app can soft-gate: show a
    // "verify your email" banner and block the few sensitive actions until the
    // address is confirmed. (Own record only — never exposed for other users.)
    //
    // The phone fields joined them with the six-digit flow (p2, p3). phoneE164
    // is the one to show: `phone` is whatever was typed, which may predate E.164
    // storage and may not be dialable.
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, handle: true, name: true, profileImage: true, lastSeen: true,
        email: true, emailVerified: true, emailVerifiedAt: true,
        phone: true, phoneE164: true, phoneVerifiedAt: true,
      },
    });
  }

  /**
   * Find ONE citizen by their EXACT handle. Discovery is deliberately private:
   * there is no directory — you can only reach someone whose handle you already
   * know. Returns null for no match or for yourself, and includes the current
   * relationship so the UI can show the right action.
   */
  async lookupByHandle(userId: string, handleRaw: string) {
    const handle = (handleRaw ?? '').trim().replace(/^@/, '').toLowerCase();
    if (!handle) return null;
    const target = await this.prisma.user.findUnique({
      where: { handle },
      select: { id: true, handle: true, name: true, profileImage: true },
    });
    if (!target || target.id === userId) return null;

    const { userOneId, userTwoId } = orderPair(userId, target.id);
    const conn = await this.prisma.connection.findFirst({
      where: { userOneId, userTwoId, connectionType: 'FRIEND' },
      select: { status: true, requestedById: true, modulesJson: true, relationship: true },
    });
    let relationship: Relationship = 'none';
    if (conn?.status === 'ACCEPTED') relationship = 'accepted';
    else if (conn?.status === 'BLOCKED') relationship = 'blocked';
    else if (conn?.status === 'PENDING') relationship = conn.requestedById === userId ? 'pending_out' : 'pending_in';

    // What the pending request would actually open, and what the sender called
    // the relationship.
    //
    // Owner decision: the REQUESTER picks the relationship and the hubs, and the
    // accepter cannot edit either before accepting. That is fine as a rule and
    // it is fine that this endpoint does not let them change it — but it made
    // this payload a problem, because two screens offer "Accept request" off the
    // back of it and neither had anything to show. `relationship: 'pending_in'`
    // is a status, not a disclosure. Somebody was granting hub access chosen by
    // another person, from a button whose only label was "Accept".
    //
    // So the proposal travels with the status. Only for a pending row: an
    // accepted connection's hubs are managed in People, and none of this is any
    // of the caller's business on a blocked one.
    const pending = conn?.status === 'PENDING';
    return {
      ...target,
      relationship,
      // Filtered through mayReadHub, not handed over raw. Stored modules should
      // already be legal for the stated relationship — request() refuses an
      // illegal grant and updateModules() refuses adding one — but this is a
      // consent surface, and of the two ways to be wrong, over-stating what a
      // request would open is the one that matters. The connections service
      // filters the same way for the same reason.
      requestedModules: pending
        ? parseModules(conn?.modulesJson).filter((slug) => mayReadHub(slug, conn?.relationship ?? null))
        : null,
      requestedRelationship: pending ? conn?.relationship ?? null : null,
    };
  }

  /** Online users among a caller's accepted connections. */
  async onlineContacts(userId: string): Promise<string[]> {
    // unbounded: accepted connections — socially bounded presence set
    const conns = await this.prisma.connection.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [{ userOneId: userId }, { userTwoId: userId }],
      },
      select: { userOneId: true, userTwoId: true },
    });
    const contactIds = conns.map((c) => (c.userOneId === userId ? c.userTwoId : c.userOneId));
    const online: string[] = [];
    for (const id of contactIds) if (await this.presence.isOnline(id)) online.push(id);
    return online;
  }

  /**
   * Set the user's profile photo (a resized data: URL — no external storage needed).
   *
   * ── AND IT IS SCREENED NOW, LIKE EVERY OTHER PICTURE IN THE CITY ───────────
   *
   * This checked a `data:image/` prefix and a 400 KB length, and that was the
   * whole of it. A dating photo goes through fail-closed Rekognition before ONE
   * person sees it; a post goes through PostMediaGuard; a chat image and a snap
   * go through ChatMediaGuard. The avatar renders on every feed row, every
   * comment, every chat header and every search result — more exposed than any
   * of them, protected by less than any of them, which is precisely the
   * inversion `post-media-guard.ts` opens by saying this codebase does not do.
   *
   * FAIL-CLOSED WHEN THE CLASSIFIER IS ABSENT, the same call the owner made for
   * posts on 30 Aug: with Rekognition unreachable nobody's profile photo
   * changes, and the guard says so in the boot log rather than leaving it to be
   * discovered from a support message.
   *
   * AND THE REFUSALS ARE 400s. `throw new Error(...)` reaches the exception
   * filter as a 500 — "the server is broken" told to a citizen who picked the
   * wrong file, which is both wrong and un-actionable. "Could not be checked"
   * is a 503 and worth retrying; "did not pass" is a 400 and is not.
   */
  async setAvatar(userId: string, image: string): Promise<{ profileImage: string }> {
    const ok = typeof image === 'string' && image.startsWith('data:image/') && image.length <= 400_000;
    if (!ok) throw new BadRequestException('Invalid image — use a small photo.');
    const consequence = 'so your profile photo hasn’t changed';
    if (!this.screening) {
      throw new ServiceUnavailableException(`We couldn’t check that photo just now, ${consequence}. Try again in a moment.`);
    }
    const verdict = await this.screening.screenInlineImage(userId, image, consequence);
    if (!verdict.ok) {
      throw verdict.retryable
        ? new ServiceUnavailableException(verdict.reason)
        : new BadRequestException(verdict.reason);
    }
    await this.prisma.user.update({ where: { id: userId }, data: { profileImage: image } });
    return { profileImage: image };
  }
}
