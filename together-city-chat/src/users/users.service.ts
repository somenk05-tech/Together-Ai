import { Injectable } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { orderPair } from '../connections/connection.util';
import { PresenceService } from './presence.service';

export type Relationship = 'none' | 'pending_out' | 'pending_in' | 'accepted' | 'blocked';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
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
      select: { status: true, requestedById: true },
    });
    let relationship: Relationship = 'none';
    if (conn?.status === 'ACCEPTED') relationship = 'accepted';
    else if (conn?.status === 'BLOCKED') relationship = 'blocked';
    else if (conn?.status === 'PENDING') relationship = conn.requestedById === userId ? 'pending_out' : 'pending_in';

    return { ...target, relationship };
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

  /** Set the user's profile photo (a resized data: URL — no external storage needed). */
  async setAvatar(userId: string, image: string): Promise<{ profileImage: string }> {
    const ok = typeof image === 'string' && image.startsWith('data:image/') && image.length <= 400_000;
    if (!ok) throw new Error('Invalid image — use a small photo.');
    await this.prisma.user.update({ where: { id: userId }, data: { profileImage: image } });
    return { profileImage: image };
  }

  async registerDeviceToken(userId: string, token: string, platform: string): Promise<void> {
    await this.prisma.deviceToken.upsert({
      where: { token },
      create: { userId, token, platform },
      update: { userId, platform },
    });
  }
}
