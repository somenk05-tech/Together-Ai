import type { PrismaService } from '../shared/prisma/prisma.service';

/**
 * Typed access to the desk's tables. The generated client on a developer's
 * machine may predate the migration (the repo's own pattern — see
 * medical-mail.db.ts), so the shapes are written here and the client is
 * reached through them. Every method the desk uses is declared; nothing else.
 */
export interface MediaPostRow {
  id: string; authorId: string; kind: string; topic: string; storageKey: string;
  mediaUrl: string | null; thumbUrl: string | null; note: string | null;
  title: string | null; description: string | null; tagsJson: string | null;
  caption: string; threadsText: string | null; overridesJson: string | null;
  privacy: string; aiDisclosure: boolean; tvPostId: string | null; tvMediaId: string | null;
  state: string; scheduledAt: Date | null; createdAt: Date; updatedAt: Date;
  series: string | null; episode: string | null; campaign: string | null;
}
export interface MediaTargetRow {
  id: string; postId: string; channel: string; state: string; skipReason: string | null;
  externalId: string | null; externalUrl: string | null; error: string | null; notice: string | null;
  attempts: number; startedAt: Date | null; finishedAt: Date | null; updatedAt: Date;
}
export interface SocialAccountRow {
  id: string; platform: string; topic: string; externalId: string; handle: string;
  sealed: string; expiresAt: Date | null; connectedBy: string; connectedAt: Date;
  refreshedAt: Date | null; lastUsedAt: Date | null; lastError: string | null; updatedAt: Date;
}
export type MediaPostWithTargets = MediaPostRow & { targets: MediaTargetRow[] };
/** One reading of one published post (content analytics). Null: not given. */
export interface MediaMetricRow {
  id: string; targetId: string; postId: string; channel: string; capturedAt: Date;
  views: number | null; likes: number | null; comments: number | null; shares: number | null; saves: number | null;
}
/** One reading of one account. */
export interface ChannelMetricRow {
  id: string; platform: string; topic: string; capturedAt: Date;
  followers: number | null; views: number | null; posts: number | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Args = any;
interface Table<Row> {
  findUnique(a: Args): Promise<Row | null>;
  findFirst(a: Args): Promise<Row | null>;
  findMany(a: Args): Promise<Row[]>;
  create(a: Args): Promise<Row>;
  update(a: Args): Promise<Row>;
  updateMany(a: Args): Promise<{ count: number }>;
  upsert(a: Args): Promise<Row>;
  delete(a: Args): Promise<Row>;
}
export interface DeskDb {
  /* Every read the desk makes of a post includes its targets. */
  mediaPost: Omit<Table<MediaPostRow>, 'findUnique' | 'findMany' | 'create'> & {
    findUnique(a: Args): Promise<MediaPostWithTargets | null>;
    findMany(a: Args): Promise<MediaPostWithTargets[]>;
    create(a: Args): Promise<MediaPostWithTargets>;
  };
  mediaTarget: Table<MediaTargetRow>;
  socialAccount: Table<SocialAccountRow>;
  mediaMetric: Pick<Table<MediaMetricRow>, 'findMany'> & { createMany(a: Args): Promise<{ count: number }> };
  channelMetric: Pick<Table<ChannelMetricRow>, 'findMany'> & { createMany(a: Args): Promise<{ count: number }> };
  postMedia: {
    findUnique(a: Args): Promise<{ id: string; url: string; thumbUrl: string | null; state: string } | null>;
    findMany(a: Args): Promise<Array<{ id: string; thumbUrl: string | null; state: string }>>;
  };
}
export const deskDb = (prisma: PrismaService): DeskDb => prisma as unknown as DeskDb;
