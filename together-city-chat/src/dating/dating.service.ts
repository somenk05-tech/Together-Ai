import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { ConversationsService } from '../conversations/conversations.service';
import { FinancialService } from '../financial/financial.service';
import { compatibilityScore, zodiacSign } from './astrology';
import type { MatchKind, UpsertDatingProfileDto } from './dto/dating.dto';

const MATCH_THRESHOLD = 75; // only curated matches ≥75% are ever shown (spec)

@Injectable()
export class DatingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
    private readonly financial: FinancialService,
  ) {}

  // ─────────────── profile ───────────────
  async getProfile(userId: string) {
    const profile = await this.prisma.datingProfile.findUnique({ where: { userId } });
    if (!profile) return null;
    return this.shapeProfile(profile);
  }

  async upsertProfile(userId: string, dto: UpsertDatingProfileDto) {
    const data = {
      gender: dto.gender,
      seeking: dto.seeking,
      bio: dto.bio ?? null,
      birthDate: new Date(dto.birthDate + 'T00:00:00Z'),
      birthTime: dto.birthTime ?? null,
      birthPlace: dto.birthPlace ?? null,
      interests: (dto.interests ?? []).join(','),
      visible: dto.visible ?? true,
    };
    const profile = await this.prisma.datingProfile.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });
    return this.shapeProfile(profile);
  }

  // ─────────────── curated matches ───────────────
  /**
   * Curated Matches (romantic) / New Friends (platonic). Scores every visible,
   * mutually-compatible profile with the astrology engine and returns only
   * pairs ≥75% that haven't been passed. Existing likes/matches carry state.
   */
  async matches(userId: string, kind: MatchKind) {
    const mine = await this.prisma.datingProfile.findUnique({ where: { userId } });
    if (!mine) throw new NotFoundException('create your dating profile first');

    const candidates = await this.prisma.datingProfile.findMany({
      where: { userId: { not: userId }, visible: true },
      include: { user: { select: { id: true, handle: true, name: true, profileImage: true } } },
    });

    const states = await this.prisma.datingMatch.findMany({
      where: { OR: [{ userOneId: userId }, { userTwoId: userId }], kind },
    });
    const stateFor = (otherId: string) =>
      states.find((s) => s.userOneId === otherId || s.userTwoId === otherId);

    const results = [];
    for (const cand of candidates) {
      // Romantic matches respect seeking/gender both ways; friendships don't.
      if (kind === 'romantic') {
        const iWant = mine.seeking === 'any' || mine.seeking === cand.gender;
        const theyWant = cand.seeking === 'any' || cand.seeking === mine.gender;
        if (!iWant || !theyWant) continue;
      }
      const { score, signA, signB } = compatibilityScore(
        { userId, birthDate: mine.birthDate, interests: this.splitInterests(mine.interests) },
        { userId: cand.userId, birthDate: cand.birthDate, interests: this.splitInterests(cand.interests) },
      );
      if (score < MATCH_THRESHOLD) continue;

      const state = stateFor(cand.userId);
      if (state && this.passedBy(state, userId)) continue; // I passed — hidden forever
      results.push({
        matchId: state?.id ?? null,
        user: cand.user,
        bio: cand.bio,
        interests: this.splitInterests(cand.interests),
        yourSign: signA,
        theirSign: signB,
        score,
        likedByMe: state ? this.likedBy(state, userId) : false,
        matched: state?.status === 'matched',
        conversationId: state?.conversationId ?? null,
      });
    }
    return results.sort((a, b) => b.score - a.score);
  }

  // ─────────────── like / pass state machine ───────────────
  async like(userId: string, targetUserId: string, kind: MatchKind) {
    const state = await this.upsertState(userId, targetUserId, kind);
    const meIsOne = state.userOneId === userId;
    const updated = await this.prisma.datingMatch.update({
      where: { id: state.id },
      data: meIsOne ? { likedByOne: true } : { likedByTwo: true },
    });

    // Mutual like → matched. Chat is NOT opened yet — it's unlocked via a paid
    // service through the Financial hub (see unlockChat).
    if (updated.likedByOne && updated.likedByTwo && updated.status !== 'matched') {
      const matched = await this.prisma.datingMatch.update({
        where: { id: updated.id },
        data: { status: 'matched' },
      });
      return { matched: true, conversationId: null, chatLocked: true, matchId: matched.id };
    }
    return { matched: false, conversationId: null, chatLocked: false, matchId: updated.id };
  }

  /**
   * Unlock chat with a match — charges the city wallet (Financial hub) at the
   * current rate-card price, then opens the connection + conversation. All money
   * flows through Financial; if the wallet can't cover it, charge() throws 400.
   */
  async unlockChat(userId: string, targetUserId: string, kind: MatchKind, method?: 'wallet' | 'card') {
    const state = await this.upsertState(userId, targetUserId, kind);
    if (state.status !== 'matched') throw new NotFoundException('no active match to unlock');
    if (state.conversationId) return { conversationId: state.conversationId, alreadyOpen: true };

    await this.financial.charge(userId, {
      hub: 'Dating', category: 'dating', label: 'Chat unlock — new match',
      amountInr: this.financial.rate('datingChatUnlock'), method,
    });

    const connectionType = kind === 'romantic' ? 'COUPLE' : 'FRIEND';
    const [userOneId, userTwoId] = [state.userOneId, state.userTwoId];
    await this.prisma.connection.upsert({
      where: { userOneId_userTwoId_connectionType: { userOneId, userTwoId, connectionType } },
      update: { status: 'ACCEPTED' },
      create: { userOneId, userTwoId, connectionType, status: 'ACCEPTED', requestedById: userId },
    });
    const conversation = await this.conversations.startDirect(userId, targetUserId);
    await this.prisma.datingMatch.update({ where: { id: state.id }, data: { conversationId: conversation.id } });
    return { conversationId: conversation.id, alreadyOpen: false };
  }

  async pass(userId: string, targetUserId: string, kind: MatchKind) {
    const state = await this.upsertState(userId, targetUserId, kind);
    const meIsOne = state.userOneId === userId;
    await this.prisma.datingMatch.update({
      where: { id: state.id },
      data: { ...(meIsOne ? { passedByOne: true } : { passedByTwo: true }), status: 'passed' },
    });
    return { ok: true };
  }

  // ─────────────── helpers ───────────────
  /** Order-independent pair row, like Connection: userOneId is the smaller id. */
  private async upsertState(userId: string, targetUserId: string, kind: MatchKind) {
    const [userOneId, userTwoId] = [userId, targetUserId].sort();
    return this.prisma.datingMatch.upsert({
      where: { userOneId_userTwoId_kind: { userOneId, userTwoId, kind } },
      update: {},
      create: { userOneId, userTwoId, kind, status: 'pending' },
    });
  }

  private likedBy(s: { userOneId: string; likedByOne: boolean; likedByTwo: boolean }, userId: string) {
    return s.userOneId === userId ? s.likedByOne : s.likedByTwo;
  }

  private passedBy(s: { userOneId: string; passedByOne: boolean; passedByTwo: boolean }, userId: string) {
    return s.userOneId === userId ? s.passedByOne : s.passedByTwo;
  }

  private splitInterests(csv: string): string[] {
    return csv ? csv.split(',').filter(Boolean) : [];
  }

  private shapeProfile(p: {
    userId: string; gender: string; seeking: string; bio: string | null;
    birthDate: Date; birthTime: string | null; birthPlace: string | null;
    interests: string; visible: boolean;
  }) {
    return {
      userId: p.userId,
      gender: p.gender,
      seeking: p.seeking,
      bio: p.bio,
      birthDate: p.birthDate.toISOString().slice(0, 10),
      birthTime: p.birthTime,
      birthPlace: p.birthPlace,
      interests: this.splitInterests(p.interests),
      sign: zodiacSign(p.birthDate).name,
      visible: p.visible,
    };
  }
}
