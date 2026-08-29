import { swallowed } from '../shared/swallow';
import { ForbiddenException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { spawn } from 'child_process';
import { PrismaService } from '../shared/prisma/prisma.service';
import { BlockingService } from '../connections/blocking.service';
import { VISIBLE, VISIBLE_ONLY, removedNotice } from './post-visibility';
import { AdminAccessService } from '../admin/admin-access.service';
import { ConnectionsService } from '../connections/connections.service';
import { RECORD_CAP } from '../shared/paging';
import { SocialGateway } from './social.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { StorageProvider } from '../media/storage.provider';
import { shownName } from '../dating/matching';
import type { CreateCommentDto, CreatePostDto, FeedQueryDto } from './dto/social.dto';

const AUTHOR_SELECT = { id: true, handle: true, name: true, profileImage: true } as const;

/**
 * The dating profile a moderator is shown alongside a report about a citizen.
 *
 * Reduced here rather than selected in the query, because the interesting
 * fields live inside the free-form `extras` blob and the blob itself must not
 * reach this screen: it carries the citizen's preferences, their religion and
 * their storage keys, none of which is any of a moderator's business and none
 * of which any other citizen can see.
 *
 * Photo COUNT rather than photos. The keys are private-bucket keys that mean
 * nothing without signing, signing them here would hand a moderator a bearer
 * link to somebody's pictures on a screen that needed no such power, and the
 * held-photo queue is where photographs are actually reviewed.
 */
function datingSummary(dp: Record<string, unknown>) {
  let city: unknown = null, photos = 0, firstName: unknown = null;
  try {
    const dx = JSON.parse(String(dp.extras ?? '{}')) as Record<string, unknown>;
    city = dx.city ?? null;
    firstName = dx.firstName ?? null;
    photos = Array.isArray(dx.photos) ? dx.photos.length : 0;
  } catch { /* an unreadable blob tells the moderator nothing, and says so by staying null */ }
  const dob = dp.birthDate instanceof Date ? dp.birthDate : null;
  return {
    bio: dp.bio ?? null,
    shownName: firstName,
    city,
    photos,
    age: dob ? Math.max(0, new Date().getUTCFullYear() - dob.getUTCFullYear()) : null,
    moderation: dp.moderation ?? null,
    visible: dp.visible ?? null,
    updatedAt: dp.updatedAt ?? null,
  };
}

type ReportDecision = 'remove' | 'dismiss' | 'warn' | 'suspend';

@Injectable()
export class SocialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: SocialGateway,
    private readonly notifications: NotificationsService,
    private readonly storage: StorageProvider,
    private readonly connections: ConnectionsService,
    private readonly blocking: BlockingService,
    private readonly access: AdminAccessService,
  ) {}

  /** Set a video post's cover: extract the frame at `timeSec` with ffmpeg from
   *  the stored video, upload it, and pin it as the media's thumbUrl — so the
   *  poster is fixed once and grids never fetch the video to render a frame. */
  async setCover(userId: string, postId: string, timeSec: number) {
    const post = await this.prisma.post.findUnique({ where: { id: postId }, include: { media: true } });
    if (!post) throw new NotFoundException('post not found');
    if (post.authorId !== userId) throw new ForbiddenException('not your post');
    const video = (post.media ?? []).find((m) => m.kind === 'video');
    if (!video) throw new ForbiddenException('this post has no video');
    /**
     * FFMPEG IS HANDED A URL WE MINTED, NOT ONE THE CLIENT CHOSE.
     *
     * The stored value used to be any `https://` string the client sent, and it
     * went straight into `ffmpeg -i`. So this endpoint fetched whatever host
     * the author named, from inside the VPC, and the three possible answers —
     * a frame, "could not extract", or a hang — were an oracle for what is
     * reachable in there. Media is one of our own keys now, and what ffmpeg
     * receives is a two-minute signed GET for that key.
     */
    const source = await this.storage.signPostObject(video.url);
    if (!source) throw new ForbiddenException('That video is not one this post can read a frame from.');
    if (SocialService.coversRunning >= SocialService.COVER_LIMIT) {
      throw new InternalServerErrorException('Too many covers are being made right now — try again in a moment.');
    }
    SocialService.coversRunning += 1;
    let jpeg: Buffer | null = null;
    try {
      jpeg = await this.extractFrame(source, Math.max(0, Number(timeSec) || 0));
    } finally {
      SocialService.coversRunning -= 1;
    }
    if (!jpeg) throw new InternalServerErrorException('could not extract that frame');
    // The cover goes where the video went: the private bucket, signed on read.
    // Putting it in the public one would have published a frame of a Family
    // video at a permanent URL, which is most of the original bug.
    const thumbKey = await this.storage.putPrivateObject('social', userId, jpeg, 'image/jpeg', 'jpg');
    if (!thumbKey) throw new InternalServerErrorException('could not store that frame');
    const thumbUrl = thumbKey;
    await this.prisma.postMedia.update({ where: { id: video.id }, data: { thumbUrl } });
    return { ok: true, thumbUrl };
  }

  /**
   * HOW MANY FFMPEGS MAY BE ALIVE AT ONCE, AND FOR HOW LONG.
   *
   * There was no answer to either question: no timeout, no kill, no cap. Ten
   * citizens setting covers on fifty-megabyte videos meant ten ffmpeg processes
   * decoding on a shared vCPU, and one pointed at an endpoint that accepts a
   * connection and never sends bytes hung forever with nothing to end it.
   *
   * A counter rather than a queue, deliberately: a queue makes the eleventh
   * citizen wait an unknown time and then probably fail anyway; a refusal tells
   * them now and costs nothing. Static because the limit belongs to the
   * process, not to a request-scoped instance of the service.
   */
  private static readonly COVER_LIMIT = 2;
  private static readonly COVER_TIMEOUT_MS = 20_000;
  private static coversRunning = 0;

  /** Grab a single JPEG frame at `timeSec` from a video URL via ffmpeg (stdout).
   *  `-ss` before `-i` seeks first, so only the needed bytes are fetched. */
  private extractFrame(videoUrl: string, timeSec: number): Promise<Buffer | null> {
    return new Promise((resolve) => {
      try {
        const ff = spawn('ffmpeg', [
          '-ss', String(timeSec), '-i', videoUrl,
          '-frames:v', '1', '-q:v', '3', '-f', 'image2pipe', '-vcodec', 'mjpeg', 'pipe:1',
        ], { stdio: ['ignore', 'pipe', 'ignore'] });
        const chunks: Buffer[] = [];
        let settled = false;
        const done = (v: Buffer | null) => { if (settled) return; settled = true; clearTimeout(timer); resolve(v); };
        // SIGKILL and not SIGTERM: a stalled ffmpeg waiting on a socket does not
        // always act on a term, and the whole point of the timer is that this
        // ends.
        const timer = setTimeout(() => { try { ff.kill('SIGKILL'); } catch { /* already gone */ } done(null); }, SocialService.COVER_TIMEOUT_MS);
        ff.stdout.on('data', (d: Buffer) => chunks.push(d));
        ff.on('error', () => done(null));
        ff.on('close', (code) => done(code === 0 && chunks.length ? Buffer.concat(chunks) : null));
      } catch { resolve(null); }
    });
  }

  /**
   * The people whose posts you see = yourself + everyone you follow + everyone
   * you're connected to (accepted connections auto-follow, so this is mostly the
   * follow graph; connections are unioned in as a safety net). Keeps the feed to
   * your circle — strangers' posts don't appear.
   */
  private async networkIds(userId: string): Promise<string[]> {
    const [follows, conns, blocked] = await Promise.all([
      // unbounded: the feed's network set — follows + connections, socially bounded
      this.prisma.follow.findMany({ where: { followerId: userId }, select: { followeeId: true } }),
      // unbounded: same network set
      this.prisma.connection.findMany({
        where: { status: 'ACCEPTED', OR: [{ userOneId: userId }, { userTwoId: userId }] },
        select: { userOneId: true, userTwoId: true },
      }),
      this.blockedWith(userId),
    ]);
    const ids = new Set<string>([userId]);
    for (const f of follows) ids.add(f.followeeId);
    for (const c of conns) ids.add(c.userOneId === userId ? c.userTwoId : c.userOneId);
    // Never surface anyone you've blocked, or who has blocked you.
    for (const b of blocked) ids.delete(b);
    ids.add(userId); // your own posts always stay visible to you
    return [...ids];
  }

  /**
   * YOUR CIRCLE — ACCEPTED CONNECTIONS, AND NOTHING ELSE.
   *
   * `networkIds` above is the set whose posts you SEE. This is the much smaller
   * set that a `friends`-audience post was written FOR, and the audit of 30 Aug
   * is why they are now two functions instead of one.
   *
   * The friends branch of the feed gate read `networkIds`, which includes
   * everyone you follow. Following is unilateral — a handle, no approval — so
   * pressing Follow on somebody handed you their entire friends-audience
   * history. The composer's own hint reads "Friends — Your accepted
   * connections"; the citizen consented to that sentence and the query enforced
   * a different one.
   *
   * This is the same set `ConnectionsService.visibleAudiences` gates on, which
   * is what `assertCanView` already used — so the read path and the interaction
   * path now agree. They did not before, and whichever was wrong, one of them
   * was leaking.
   */
  private async circleIds(userId: string): Promise<string[]> {
    // unbounded: the viewer's accepted connections — socially bounded, and the
    // same set the friends lens and familyIds already read
    const conns = await this.prisma.connection.findMany({
      where: { status: 'ACCEPTED', OR: [{ userOneId: userId }, { userTwoId: userId }] },
      select: { userOneId: true, userTwoId: true },
    }).catch(swallowed('social.circleIds', [] as { userOneId: string; userTwoId: string }[]));
    const blocked = await this.blockedWith(userId);
    return conns
      .map((c) => (c.userOneId === userId ? c.userTwoId : c.userOneId))
      .filter((id) => !blocked.has(id));
  }

  /** All userIds in a block relationship with this user (either direction).
   *  Reads BOTH the Block table and connection-level blocks — this used to read
   *  only the first, so someone blocked on their connection record still had
   *  their posts in the feed. See connections/blocking.ts. */
  private async blockedWith(userId: string): Promise<Set<string>> {
    return this.blocking.blockedWith(userId);
  }

  /** Strip HTML tags from free text (defense-in-depth against stored XSS). */
  private clean(s: string | null | undefined): string | null {
    if (s == null) return null;
    const stripped = s.replace(/<[^>]*>/g, '').trim();
    return stripped.length ? stripped : null;
  }

  /** The set of userIds THIS user follows (their outbound follow edges). */
  private async myFollowingSet(userId: string): Promise<Set<string>> {
    // unbounded: their outbound follows — socially bounded set
    const rows = await this.prisma.follow.findMany({ where: { followerId: userId }, select: { followeeId: true } });
    return new Set(rows.map((r) => r.followeeId));
  }

  /** Followers = people who follow you OR are connected to you. Each carries
   *  `iFollow` (do you follow them back?) so the UI shows Following / Follow back. */
  async followers(userId: string) {
    const [rows, conns, iFollow] = await Promise.all([
      // unbounded: followers page — the social graph is the bound; pagination is the named follow-up
      this.prisma.follow.findMany({ where: { followeeId: userId }, select: { follower: { select: AUTHOR_SELECT } } }),
      // unbounded: same page, connection halves
      this.prisma.connection.findMany({
        where: { status: 'ACCEPTED', OR: [{ userOneId: userId }, { userTwoId: userId }] },
        include: { userOne: { select: AUTHOR_SELECT }, userTwo: { select: AUTHOR_SELECT } },
      }),
      this.myFollowingSet(userId),
    ]);
    const byId = new Map<string, { id: string; handle: string; name: string; profileImage: string | null }>();
    for (const r of rows) byId.set(r.follower.id, r.follower);
    for (const c of conns) {
      const u = c.userOneId === userId ? c.userTwo : c.userOne;
      byId.set(u.id, u);
    }
    // Somebody you blocked is not one of your followers. The block dropped the
    // edge, but a connection row or a re-follow put them back on this list with
    // their name and their photograph — which is the one place a blocked person
    // must never turn up.
    const blocked = await this.blockedWith(userId);
    return [...byId.values()]
      .filter((u) => !blocked.has(u.id))
      .map((u) => ({ ...u, followsMe: true, iFollow: iFollow.has(u.id) }));
  }

  /** Following = people you follow OR are connected to (connections are mutual).
   *  Each carries `followsMe` so the UI can flag mutuals. */
  async following(userId: string) {
    const network = await this.networkIds(userId);
    const others = network.filter((id) => id !== userId);
    if (!others.length) return [];
    const [users, followerRows] = await Promise.all([
      // unbounded: `in:` of the network set bounds it
      this.prisma.user.findMany({ where: { id: { in: others } }, select: AUTHOR_SELECT }),
      // unbounded: follower id set — socially bounded
      this.prisma.follow.findMany({ where: { followeeId: userId }, select: { followerId: true } }),
    ]);
    const followsMe = new Set(followerRows.map((r) => r.followerId));
    return users.map((u) => ({ ...u, iFollow: true, followsMe: followsMe.has(u.id) }));
  }

  /**
   * Follow another citizen (idempotent). You can't follow yourself.
   *
   * BY HANDLE, AND ONLY BY HANDLE — the second dating audit, finding 02.
   *
   * A Dating card carries the other person's raw `User.id`, because every
   * action on that card — like, pass, reveal, block, open the chat — is keyed
   * by it. An anonymous card shows a first name and nothing else: no handle,
   * no account photo. That holds only while the id is inert.
   *
   * It was not inert. This lookup used to accept `OR: [{ id }, { handle }]`,
   * so anyone could POST the id off an anonymous card, then read it back from
   * GET /social/following, which returns `name`, `handle` and `profileImage`.
   * Two calls and no consent: the whole anonymity promise, undone by a lookup
   * key. `block()` below had the identical hole and the identical readback in
   * GET /social/blocks.
   *
   * So the rule the rest of the city already follows applies here too: a
   * handle is a thing a person publishes, an id is a thing the system hands
   * out. `connections.request`, `chat.start` and `mail.sendOne` have always
   * been handle-only; these two were the outliers. Nothing legitimate is lost —
   * both React call sites already had the handle in hand.
   *
   * The Dating hub keeps its own block (`dating.blockMatch`), which takes an
   * id because it is handed one and returns no identity at all.
   */
  async follow(userId: string, targetRef: string) {
    const ref = (targetRef ?? '').trim().replace(/^@/, '').toLowerCase();
    if (!ref) throw new NotFoundException('No citizen specified.');
    const target = await this.prisma.user.findFirst({ where: { handle: ref }, select: { id: true } });
    if (!target) throw new NotFoundException('No citizen with that handle.');
    if (target.id === userId) throw new ForbiddenException("You can't follow yourself.");
    /**
     * A BLOCK HAS TO SURVIVE A RE-FOLLOW.
     *
     * This was the only mutation on the graph that never consulted the block
     * set. Blocking drops the follow edges, so the sequence was: Alice blocks
     * Mallory, Mallory calls follow again, the edge is written, Alice is sent
     * "Mallory started following you", and Mallory reads her feed through the
     * Following lens. In a loop, that is a notification firehose aimed at the
     * person who blocked him.
     */
    const blockedEither = await this.blockedWith(userId);
    if (blockedEither.has(target.id)) throw new ForbiddenException('You cannot follow this citizen.');
    const before = await this.prisma.follow.findUnique({ where: { followerId_followeeId: { followerId: userId, followeeId: target.id } } }).catch(swallowed('social.follow', null));
    await this.prisma.follow.createMany({ data: [{ followerId: userId, followeeId: target.id }], skipDuplicates: true });
    /**
     * EVERY ONE OF THESE FIVE CARRIES A `.catch` NOW (30 Aug audit).
     *
     * They were `void`-ed with no catch. `void` marks a promise as
     * deliberately unawaited; it does not handle its rejection. Under Node's
     * default `--unhandled-rejections=throw`, one failing notification write
     * exits the API process — taking down every hub in the monolith because
     * somebody tapped a heart. `swallowed` was already the house pattern for
     * exactly this, nine lines from here in `reportDecide`.
     */
    // Notify only on a genuinely new follow (not a repeat).
    if (!before) {
      void this.actorName(userId).then((name) =>
        this.notifications.create({
          userId: target.id, actorId: userId, kind: 'follow',
          title: `${name} started following you`, href: '/social/profile', entityId: userId,
        })).catch(swallowed('social.notify.follow', undefined));
    }
    return { following: true, userId: target.id };
  }

  /** Stop following someone (removes only your outbound follow edge). If you're
   *  connected, they remain in your circle via the connection — by design. */
  async unfollow(userId: string, targetId: string) {
    await this.prisma.follow.deleteMany({ where: { followerId: userId, followeeId: targetId } });
    return { following: false, userId: targetId };
  }

  // ─────────────── posts ───────────────
  /**
   * EVERY KEY IS CHECKED AGAINST THE BUCKET BEFORE IT IS ATTACHED TO ANYTHING.
   *
   * The upload cap used to be whatever the client said it was: `sizeBytes` came
   * out of the request body and the presigned PUT carried no
   * content-length-range, so declaring 1 KB and pushing 200 MB worked. And the
   * media URL was only checked for an `https://` prefix — any host on the
   * internet — which is what made `setCover` an SSRF and what let a post pull
   * every viewer's browser to a server the author chose.
   *
   * Three questions, and a key that cannot answer all three is refused:
   * is it OURS (the prefix carries the uploader's id), is it THERE, and is it
   * within the cap the bucket can actually measure.
   */
  private async verifyMedia(userId: string, media: CreatePostDto['media']): Promise<void> {
    if (!media?.length) return;
    const max = 200 * 1024 * 1024;
    for (const m of media) {
      for (const value of [m.url, m.thumbUrl]) {
        if (!value) continue;
        if (!this.storage.isOwnPostKey(userId, value)) {
          throw new ForbiddenException('That media was not uploaded here, by you, for this post.');
        }
        if (!(await this.storage.privateObjectExists(value))) {
          throw new NotFoundException('That upload did not finish — try attaching it again.');
        }
        const size = await this.storage.healthObjectSize(value);
        if (size !== null && size > max) {
          throw new ForbiddenException('That file is larger than a post can carry.');
        }
      }
    }
  }

  async createPost(userId: string, dto: CreatePostDto) {
    await this.verifyMedia(userId, dto.media);
    const audience = dto.audience ?? 'public';
    const tagged = dto.tagged?.length
      ? dto.tagged.map((t) => ({ id: t.id, name: this.clean(t.name) ?? '', handle: this.clean(t.handle) ?? '' }))
      : null;
    const post = await this.prisma.post.create({
      data: {
        authorId: userId,
        text: this.clean(dto.text),
        feeling: this.clean(dto.feeling),
        audience,
        category: (dto as { category?: string }).category ?? null,
        musicUrl: (dto as { musicUrl?: string }).musicUrl ?? null,
        musicTitle: this.clean((dto as { musicTitle?: string }).musicTitle),
        placeName: this.clean(dto.placeName),
        taggedJson: tagged ? JSON.stringify(tagged) : null,
        lat: dto.lat ?? null,
        lng: dto.lng ?? null,
        media: dto.media?.length
          ? { create: dto.media.map((m) => ({ url: m.url, kind: m.kind, thumbUrl: m.thumbUrl ?? null })) }
          : undefined,
      },
      include: { author: { select: AUTHOR_SELECT }, media: true },
    });
    const shaped = this.shapePost(post, { likes: 0, comments: 0 }, false, await this.signMediaOf([post]));
    const recipients = await this.postRecipients(userId, audience);
    this.gateway.postNew(shaped, recipients);
    // "Your post is now live" — self-notification (no actor, so not skipped).
    void this.notifications.create({
      userId, kind: 'post_live', title: 'Your post is now live',
      body: post.text ? post.text.slice(0, 80) : 'Shared to your city.', href: '/social/feed', entityId: post.id,
    }).catch(swallowed('social.notify.postLive', undefined));
    return shaped;
  }

  async deletePost(userId: string, postId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('post not found');
    if (post.authorId !== userId) throw new ForbiddenException('not your post');
    const recipients = await this.postRecipients(post.authorId, (post as unknown as { audience?: string | null }).audience);
    /**
     * DELETE HAS TO REACH THE BUCKET (30 Aug audit, blocker 3).
     *
     * `post.delete` cascades the PostMedia ROWS and nothing else, so the
     * objects stayed in storage at the same public URL — reachable by anyone
     * who had ever seen the post, forever, after the citizen deleted it. This
     * is the delete people care most about being real, and it was the one that
     * was not. `StorageProvider.deleteObject` already existed and had no caller
     * in this module.
     *
     * Read the rows BEFORE the delete (the cascade takes them with it), and
     * best-effort the objects AFTER, so a bucket that is briefly unreachable
     * cannot keep the post itself alive. Inline `data:` photos have no object
     * behind them and `keyFromUrl` returns nothing for them.
     */
    // unbounded: every media row of ONE post — the DTO caps a post at ten, and
    // truncating here would orphan exactly the objects this call exists to delete
    const media = await this.prisma.postMedia.findMany({
      where: { postId },
      select: { url: true, thumbUrl: true },
    }).catch(swallowed('social.deletePost.media', [] as { url: string; thumbUrl: string | null }[]));
    await this.prisma.post.delete({ where: { id: postId } });
    for (const { key, legacy } of this.storageKeys(media)) {
      const gone = legacy ? this.storage.deleteObject(key) : this.storage.deletePrivateObject(key);
      void gone.catch(swallowed('social.deletePost.object', undefined));
    }
    this.gateway.postDeleted(postId, recipients);
    return { ok: true };
  }

  /**
   * The object keys behind a post's media rows.
   *
   * Two shapes live in this column: our own `social/<userId>/…` keys, and the
   * legacy public URLs written before 30 Aug (plus inline `data:` photos, which
   * have no object at all). Both kinds of object are deleted — the legacy ones
   * are exactly the files that were reachable forever, so they are the ones
   * that most need to go when a citizen deletes the post.
   */
  private storageKeys(media: { url: string; thumbUrl: string | null }[]): Array<{ key: string; legacy: boolean }> {
    const out = new Map<string, boolean>();
    for (const m of media) {
      for (const u of [m.url, m.thumbUrl]) {
        if (!u || u.startsWith('data:')) continue;
        if (this.storage.isPostKey(u)) { out.set(u, false); continue; }
        const key = this.storage.keyFromUrl(u);
        if (key && key !== u) out.set(key, true);
      }
    }
    return [...out.entries()].map(([key, legacy]) => ({ key, legacy }));
  }

  /** Edit a post's caption/text and/or its Work/Personal category (author only).
   *  Media stays as-is. `category: null` clears the category. */
  async updatePost(userId: string, postId: string, dto: { text?: string; category?: 'work' | 'personal' | null }) {
    const existing = await this.prisma.post.findUnique({ where: { id: postId }, select: { authorId: true } });
    if (!existing) throw new NotFoundException('post not found');
    if (existing.authorId !== userId) throw new ForbiddenException('not your post');
    const data: { text?: string | null; category?: string | null } = {};
    if (dto.text !== undefined) data.text = this.clean(dto.text);
    if (dto.category !== undefined) data.category = dto.category ?? null;
    const updated = await this.prisma.post.update({
      where: { id: postId },
      data: data,
      include: { author: { select: AUTHOR_SELECT }, media: true, _count: { select: { likes: true, comments: true } }, likes: { where: { userId }, select: { id: true } } },
    });
    const u = updated as unknown as { _count: { likes: number; comments: number }; likes: unknown[] };
    return this.shapePost(updated, u._count, u.likes.length > 0, await this.signMediaOf([updated]));
  }

  /** Cursor-paginated feed, newest first. Cursor = last post id of the previous page. */
  async feed(userId: string, query: FeedQueryDto) {
    const { cursor, limit } = query;
    const filter = (query as { filter?: string }).filter ?? 'foryou';
    let network = await this.networkIds(userId);
    // Five feed lenses (spec): For You (whole network) · Friends (connections
    // only, not yourself) · Nearby (geo-pinned posts) · Trending (most-liked
    // this week) · Following (people you follow).
    if (filter === 'friends') {
      // Friends = your ACCEPTED connections only (real friends), never the whole
      // city and never people you merely follow one-way. Your own posts are
      // excluded (you aren't your own connection).
      // unbounded: the friends feed filter set — accepted connections only
      const conns = await this.prisma.connection.findMany({
        where: { status: 'ACCEPTED', OR: [{ userOneId: userId }, { userTwoId: userId }] },
        select: { userOneId: true, userTwoId: true },
      });
      const blocked = await this.blockedWith(userId);
      network = conns
        .map((c) => (c.userOneId === userId ? c.userTwoId : c.userOneId))
        .filter((id) => !blocked.has(id));
    }
    if (filter === 'following') {
      // unbounded: the following feed filter set
      const follows = await this.prisma.follow.findMany({ where: { followerId: userId }, select: { followeeId: true } });
      // The blocked filter is NOT optional here. This lens replaces `network`
      // wholesale, and `networkIds` was the only thing removing blocked authors
      // from it — so a blocked citizen you had followed before the block read
      // through on this tab and nowhere else.
      const blockedHere = await this.blockedWith(userId);
      network = follows.map((f) => f.followeeId).filter((id) => !blockedHere.has(id));
    }
    const weekAgo = new Date(Date.now() - 7 * 86_400_000);
    // Audience gate pushed INTO the query (Universal Connection Model) so that
    // pagination math operates on already-visible rows. Previously the gate ran
    // in memory after `take: limit+1`, which silently truncated pages and
    // stalled the cursor whenever a hidden post fell inside the window.
    // Visible = your own posts (any audience) OR public/friends OR a family post
    // from a family connection. Others' private posts never match.
    const familyIds = [...(await this.familyIds(userId))];
    // The Videos (reels) tab is CITY-WIDE: it surfaces every user's PUBLIC video,
    // not just your network — so the reels scroll runs through the whole city's
    // uploads. Friends/family-audience posts still only come from your circle,
    // and blocked users (either direction) are excluded.
    /**
     * p17: "the feed must show all content other users tagged Public."
     *
     * It did not. Every lens except Videos was bounded by
     * `authorId: { in: network }`, so a post somebody deliberately marked
     * Public was invisible to anyone who did not already follow them or share a
     * connection. A city feed that only shows you people you already know is an
     * address book.
     *
     * For You is now city-wide for PUBLIC posts, and still bounded for the rest:
     * friends-audience posts come from your connections and family-audience
     * posts from your family, exactly as before. Marking something Public is the
     * citizen saying they want it seen; this is the app finally doing that.
     *
     * Friends and Following stay bounded, because that is what they are for.
     */
    /**
     * PHOTOS AND THOUGHTS JOIN THE CITY-WIDE LENSES (owner, 30 Aug).
     *
     * They were bounded to `network`, so a citizen who followed nobody saw the
     * city's photographs on For You, tapped Photos, and got an empty tab —
     * three of five tabs empty on day one, from one screen, with Videos
     * city-wide one pixel away. The bounded view is what Friends and Following
     * are FOR; these two are lenses on the same city For You shows.
     */
    const cityWide = filter === 'videos' || filter === 'foryou' || filter === 'trending'
      || filter === 'nearby' || filter === 'photos' || filter === 'thoughts';
    const blockedSet = [...(await this.blockedWith(userId))];
    /**
     * FRIENDS MEANS THE CIRCLE, ON BOTH BRANCHES (30 Aug audit, blocker 1).
     *
     * Before: the city-wide branch read `authorId: { in: network }` — everyone
     * you follow — and the bounded branch read `{ audience: { in: ['public',
     * 'friends'] } }` with no author bound at all, saved only by the outer
     * `authorId: { in: network }` a few lines down. Both spelled "friends" as
     * "your network", and the network is the follow graph.
     *
     * Now both spell it `circle`: accepted connections. The label in the
     * composer and the rule in the query say the same thing, and
     * `assertCanView` has always said it too.
     */
    const circle = await this.circleIds(userId);
    const audienceWhere = cityWide
      ? {
          OR: [
            { authorId: userId },
            // Public means public. No network bound on this branch — that was
            // the bug.
            { audience: 'public' },
            { audience: 'friends', authorId: { in: circle } },
            { audience: 'family', authorId: { in: familyIds } },
          ],
        }
      : {
          OR: [
            { authorId: userId },
            { audience: 'public' },
            { audience: 'friends', authorId: { in: circle } },
            { audience: 'family', authorId: { in: familyIds } },
          ],
        };
    /**
     * A REPOST CANNOT OUTLIVE ITS ORIGINAL'S PERMISSIONS.
     *
     * `include: { repostOf: … }` cannot be filtered — Prisma has no `where` on
     * a to-one relation include — and `shapeFeedRow` renders the ORIGINAL's
     * text, media and author. So a removed post carried on being served by
     * whoever had reposted it first, over a moderator's decision, and a blocked
     * citizen's post arrived in full through anybody who shared it.
     *
     * The filter therefore belongs in the `where`, where a to-one relation CAN
     * be constrained: either this row is not a repost, or the thing it reposts
     * is still visible and its author is not somebody you have blocked.
     */
    const repostWhere = {
      OR: [
        { repostOfId: null },
        {
          repostOf: {
            is: {
              ...VISIBLE_ONLY,
              ...(blockedSet.length ? { authorId: { notIn: blockedSet } } : {}),
            },
          },
        },
      ],
    };
    // Ignore a stale/deleted cursor instead of 500-ing on it.
    let cursorClause: { cursor: { id: string }; skip: number } | object = {};
    if (cursor) {
      const exists = await this.prisma.post.findUnique({ where: { id: cursor }, select: { id: true } });
      if (exists) cursorClause = { cursor: { id: cursor }, skip: 1 };
    }
    const posts = await this.prisma.post.findMany({
      where: {
        ...VISIBLE_ONLY,
        // City-wide videos aren't bounded to your network; every other lens is.
        // ONE `authorId` KEY, NOT TWO SPREADS. Written as two conditional
        // spreads the second silently replaces the first — which is how the
        // block filter would have been dropped on every bounded lens, the exact
        // shape of bug this change exists to close. The blocked filter now
        // applies to BOTH branches: `networkIds` removed blocked authors for
        // most lenses, but Following replaces that set wholesale, so the
        // guarantee is stated here rather than inherited from whichever helper
        // built the list.
        authorId: {
          ...(blockedSet.length ? { notIn: blockedSet } : {}),
          ...(cityWide ? {} : { in: network }),
        },
        ...(filter === 'nearby' ? { lat: { not: null } } : {}),
        ...(filter === 'trending' ? { createdAt: { gte: weekAgo } } : {}),
        // Photos / Videos sections: only posts carrying that media kind.
        ...(filter === 'photos' ? { media: { some: { kind: 'image' } } } : {}),
        ...(filter === 'videos' ? { media: { some: { kind: 'video' } } } : {}),
        // Thoughts: Twitter-style text-only posts — no media, real caption,
        // and not a repost.
        ...(filter === 'thoughts' ? { media: { none: {} }, text: { not: null }, repostOfId: null } : {}),
        // Two ORs cannot share one object literal — the second would replace
        // the first — so the audience gate and the repost gate are ANDed by name.
        AND: [audienceWhere, repostWhere],
      },
      take: limit + 1,
      ...cursorClause,
      orderBy: (filter === 'trending'
        ? [{ likes: { _count: 'desc' } }, { createdAt: 'desc' }, { id: 'desc' }]
        : [{ createdAt: 'desc' }, { id: 'desc' }]),
      include: {
        author: { select: AUTHOR_SELECT },
        media: true,
        _count: { select: { likes: true, comments: true } },
        likes: { where: { userId }, select: { id: true } },
        repostOf: {
          include: {
            author: { select: AUTHOR_SELECT },
            media: true,
            _count: { select: { likes: true, comments: true } },
            likes: { where: { userId }, select: { id: true } },
          },
        },
      },
    });
    const hasMore = posts.length > limit;
    const page = hasMore ? posts.slice(0, limit) : posts;
    return {
      items: (await (async () => {
        const signed = await this.signMediaOf(page);
        return page.map((p) => this.shapeFeedRow(p, signed));
      })()),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  /** Shape a feed row, unwrapping reposts: a repost renders the ORIGINAL post's
   *  content (so like/comment target the original) with a `repostedBy` label and
   *  a `key` unique to this feed entry, dated at the share time. */
  private shapeFeedRow(row: unknown, signed?: Map<string, string>) {
    const r = row as {
      id: string; createdAt: Date; repostOfId?: string | null;
      author: { name: string; handle: string };
      _count: { likes: number; comments: number }; likes: unknown[];
      repostOf?: { _count: { likes: number; comments: number }; likes: unknown[] } | null;
    };
    if (r.repostOfId && r.repostOf) {
      const o = r.repostOf;
      const shaped = this.shapePost(o as never, o._count, (o.likes?.length ?? 0) > 0, signed);
      return { ...shaped, key: r.id, createdAt: r.createdAt.toISOString(), repostedBy: { name: r.author.name, handle: r.author.handle } };
    }
    const shaped = this.shapePost(row as never, r._count, (r.likes?.length ?? 0) > 0, signed);
    return { ...shaped, key: r.id, repostedBy: null };
  }

  /**
   * Every stored media value on these rows, the reposted originals included.
   *
   * One pass, one `Promise.all` inside `signPostMedia`, one map — rather than a
   * signature per media row per post, which on a twenty-post page would be
   * forty awaits threaded through the shaping. Signing is a local HMAC, so the
   * cost here is the round of promises and nothing else.
   */
  private async signMediaOf(rows: unknown[]): Promise<Map<string, string>> {
    const values: Array<string | null | undefined> = [];
    for (const row of rows) {
      const r = row as { media?: Array<{ url: string; thumbUrl: string | null }>; repostOf?: { media?: Array<{ url: string; thumbUrl: string | null }> } | null };
      for (const m of r.media ?? []) values.push(m.url, m.thumbUrl);
      for (const m of r.repostOf?.media ?? []) values.push(m.url, m.thumbUrl);
    }
    return this.storage.signPostMedia(values);
  }

  /** Repost (share to feed) another citizen's post. Idempotent per user+post.
   *  Appears at the top of the reposter's network feed as "shared by …". */
  async repost(userId: string, postId: string) {
    const original = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, authorId: true, audience: true, moderation: true, repostOfId: true },
    });
    if (!original) throw new NotFoundException('post not found');
    await this.assertCanView(userId, original);
    /**
     * A SHARE CANNOT WIDEN AN AUDIENCE (30 Aug audit, blocker 2).
     *
     * The repost row was written `audience: 'public'` unconditionally, and the
     * feed renders the ORIGINAL through it. So one tap published a friends-only
     * post to the whole city — and reposting your own `private` post published
     * that, because `assertCanView` returns early for the author.
     *
     * Three rules, in the order they matter:
     *   • a removed post cannot be shared at all;
     *   • `private` cannot be shared, by anyone including its author — there is
     *     no audience for it to inherit that means anything;
     *   • everything else inherits the ORIGINAL's audience, so a share reaches
     *     the same kind of room the post was written for and never a wider one.
     *
     * And a repost of a repost is refused: `shapeFeedRow` unwraps exactly one
     * level, so the second one rendered as a card with no text, no media and no
     * likes, whose like and comment landed on a content-free stub row.
     */
    if ((original.moderation ?? VISIBLE) !== VISIBLE) throw new ForbiddenException('That post is not available to share.');
    if (original.repostOfId) throw new ForbiddenException('Share the original post rather than a share of it.');
    const inherited = original.audience ?? 'public';
    if (inherited === 'private') throw new ForbiddenException('A post kept to yourself cannot be shared.');
    const existing = await this.prisma.post.findFirst({ where: { authorId: userId, repostOfId: postId }, select: { id: true } });
    if (existing) return { reposted: true };
    const row = await this.prisma.post.create({
      data: { authorId: userId, repostOfId: postId, audience: inherited },
      include: {
        author: { select: AUTHOR_SELECT },
        _count: { select: { likes: true, comments: true } },
        likes: { where: { userId }, select: { id: true } },
        repostOf: {
          include: {
            author: { select: AUTHOR_SELECT },
            media: true,
            _count: { select: { likes: true, comments: true } },
            likes: { where: { userId }, select: { id: true } },
          },
        },
      },
    });
    const shaped = this.shapeFeedRow(row, await this.signMediaOf([row]));
    // The fan-out follows the inherited audience too, or the websocket would
    // have published to the whole follower list what the query no longer will.
    const recipients = await this.postRecipients(userId, inherited);
    this.gateway.postNew(shaped, recipients);
    if (original.authorId !== userId) {
      void this.actorName(userId).then((name) =>
        this.notifications.create({
          userId: original.authorId, actorId: userId, kind: 'repost',
          title: `${name} shared your post`, href: '/social/feed', entityId: postId,
        })).catch(swallowed('social.notify.repost', undefined));
    }
    return { reposted: true };
  }

  /** Accepted connections marked as FAMILY (for family-audience posts). */
  private async familyIds(userId: string): Promise<Set<string>> {
    // unbounded: audience gate — the family set must be COMPLETE or a family post reaches the wrong eyes
    const rows = await this.prisma.connection.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [{ userOneId: userId }, { userTwoId: userId }],
      },
    }).catch(swallowed('social.familyIds', []));
    return new Set(
      rows
        .filter((r) => ((r as unknown as { relationship?: string | null }).relationship ?? '') === 'family')
        .map((r) => (r.userOneId === userId ? r.userTwoId : r.userOneId)),
    );
  }

  /** Posts that carry geo coordinates — powers the Social map (your network). */
  async map(userId: string) {
    const network = await this.networkIds(userId);
    const familyIds = [...(await this.familyIds(userId))];
    // Deprecated (sunset 2026-08-30) and still served, so it gets the same
    // circle rule as the feed rather than being left with the bug on the way
    // out. A geo-pinned friends post is the most sensitive kind there is.
    const circle = await this.circleIds(userId);
    const posts = await this.prisma.post.findMany({
      where: {
        ...VISIBLE_ONLY,
        lat: { not: null },
        lng: { not: null },
        authorId: { in: network },
        // Same audience gate as the feed — never leak private/family geo-posts.
        OR: [
          { authorId: userId },
          { audience: 'public' },
          { audience: 'friends', authorId: { in: circle } },
          { audience: 'family', authorId: { in: familyIds } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { author: { select: AUTHOR_SELECT }, media: true, _count: { select: { likes: true, comments: true } } },
    });
    const signedMap = await this.signMediaOf(posts);
    return posts.map((p) => this.shapePost(p, p._count, false, signedMap));
  }

  // ─────────────── comments ───────────────
  async comment(userId: string, postId: string, dto: CreateCommentDto) {
    const post = await this.assertPost(postId);
    await this.assertCanView(userId, post);
    const comment = await this.prisma.comment.create({
      data: { postId, authorId: userId, text: this.clean(dto.text) ?? '' },
      include: { author: { select: AUTHOR_SELECT } },
    });
    const shaped = {
      id: comment.id,
      postId,
      text: comment.text,
      author: comment.author,
      createdAt: comment.createdAt.toISOString(),
    };
    const recipients = await this.postRecipients(post.authorId, post.audience);
    this.gateway.commentNew(shaped, recipients);
    // Notify the post author that someone commented.
    void this.notifications.create({
      userId: post.authorId, actorId: userId, kind: 'comment',
      title: `${comment.author.name} commented on your post`,
      body: comment.text.slice(0, 80), href: '/social/feed', entityId: postId,
    }).catch(swallowed('social.notify.comment', undefined));
    return shaped;
  }

  async comments(userId: string, postId: string) {
    const post = await this.assertPost(postId);
    await this.assertCanView(userId, post);
    /**
     * A BLOCK REACHES THE COMMENTS TOO (30 Aug audit).
     *
     * This read had no block filter, so on any mutual friend's post the person
     * you blocked went on speaking to you in full, with their name and their
     * photograph — the block held on the feed, held on assertCanView, and did
     * nothing here. `_count.comments` on the card still counts them; making the
     * number agree with the list means a filtered count on every feed row, and
     * that belongs with the query work rather than smuggled in here.
     */
    const blocked = [...(await this.blockedWith(userId))];
    const rows = await this.prisma.comment.findMany({
      where: { postId, ...(blocked.length ? { authorId: { notIn: blocked } } : {}) },
      orderBy: { createdAt: 'asc' },
      take: RECORD_CAP,
      include: { author: { select: AUTHOR_SELECT } },
    });
    return rows.map((c) => ({
      id: c.id,
      postId,
      text: c.text,
      author: c.author,
      createdAt: c.createdAt.toISOString(),
    }));
  }

  /**
   * DELETE A COMMENT — ITS AUTHOR, OR THE OWNER OF THE POST IT IS ON.
   *
   * There was no route at all, for anybody. A citizen who found abuse or their
   * own address in the comments under their photograph had exactly one remedy:
   * delete the photograph. The post's owner is included deliberately — it is
   * their wall, and waiting for a moderator to read a queue is not a remedy
   * that arrives on the evening it is needed.
   *
   * A DELETE AND NOT A HIDDEN FLAG, and the reason is worth writing down. The
   * post-visibility argument — leave it visible to its author so they know
   * what happened — needs a `moderation` column on Comment, which is a
   * migration. The author is told instead: a comment removed by the owner of
   * the post is a notification, not a silence. That is the same promise
   * `removedNotice` makes for posts, delivered by a different route.
   */
  async deleteComment(userId: string, postId: string, commentId: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, postId: true, authorId: true, text: true },
    });
    if (!comment || comment.postId !== postId) throw new NotFoundException('comment not found');
    const post = await this.assertPost(postId);
    const mine = comment.authorId === userId;
    const myPost = post.authorId === userId;
    if (!mine && !myPost) throw new ForbiddenException('Only the person who wrote a comment, or whoever owns the post, can remove it.');
    await this.prisma.comment.delete({ where: { id: commentId } });
    // Somebody else took your words down: say so, and say whose post it was on.
    if (!mine) {
      void this.actorName(userId).then((name) =>
        this.notifications.create({
          userId: comment.authorId, actorId: userId, kind: 'comment_removed',
          title: 'Your comment was removed',
          body: `${name} removed your comment from their post.`,
          href: '/social/feed', entityId: postId,
        })).catch(swallowed('social.notify.commentRemoved', undefined));
    }
    return { ok: true, id: commentId };
  }

  // ─────────────── likes ───────────────
  /** Idempotent toggle — returns the new state + count. */
  async toggleLike(userId: string, postId: string) {
    const post = await this.assertPost(postId);
    await this.assertCanView(userId, post);
    /* THE DELETE NAMES THE OWNER (28 Aug). It read the row by
       [postId, userId], then deleted BY ID — deciding whose row it was and
       then addressing it as if that no longer mattered, which is the shape
       `sided()` was rewritten out of in 06bc2192 and the one this file's own
       guard exists to find. `deleteMany` on the pair says it in the WHERE.

       It also drops a read: the delete's own count answers "was it liked",
       which is the only thing `existing` was ever used for, and it answers it
       from the write rather than from a row that could have changed between
       the two. Idempotent under a concurrent double-tap in both directions
       now — the unlike deletes nothing twice, and `createMany({skipDuplicates})`
       was already idempotent for the reason written beside it. */
    const removed = await this.prisma.like.deleteMany({ where: { postId, userId } });
    const wasLiked = removed.count > 0;
    if (!wasLiked) {
      // createMany({skipDuplicates}) is idempotent under a concurrent double-tap
      // (the unique [postId,userId] index would otherwise 500 on the 2nd write).
      await this.prisma.like.createMany({ data: [{ postId, userId }], skipDuplicates: true });
    }
    const likes = await this.prisma.like.count({ where: { postId } });
    const result = { postId, liked: !wasLiked, likes };
    const recipients = await this.postRecipients(post.authorId, post.audience);
    this.gateway.likeChanged(result, recipients);
    // Notify the author when a NEW like lands (not on unlike).
    if (!wasLiked) {
      void this.actorName(userId).then((name) =>
        this.notifications.create({
          userId: post.authorId, actorId: userId, kind: 'like',
          title: `${name} liked your post`, href: '/social/feed', entityId: postId,
        })).catch(swallowed('social.notify.like', undefined));
    }
    return result;
  }

  // ─────────────── blocking & reporting (safety) ───────────────
  /** Block a citizen — hides both users from each other and drops any follow
   *  edges. By handle only, for the reason written out over `follow` above. */
  async block(userId: string, targetRef: string) {
    const ref = (targetRef ?? '').trim().replace(/^@/, '').toLowerCase();
    const target = await this.prisma.user.findFirst({
      where: { handle: ref },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('No citizen with that handle.');
    // Resolving the @handle is this hub's job; writing the block is not. Dating
    // needs the same write (H6), and the city should not have two of them.
    return this.blocking.block(userId, target.id);
  }

  async unblock(userId: string, targetId: string) {
    return this.blocking.unblock(userId, targetId);
  }

  /**
   * The people this citizen has blocked.
   *
   * WHY THIS IS NOT SIMPLY THE ROWS — the second dating audit, finding 02, the
   * fifth door and the worst of them.
   *
   * Blocking is reachable from a Dating card, and it should be: safety that is
   * not reachable from where the harm happens is not safety. But Dating and
   * the city share one Block table, so a block made against an ANONYMOUS match
   * landed in the same list as the ones made in the People hub — and this
   * screen drew every row with its account name, its @handle and its photo.
   *
   * Which turned a block into a way of asking who somebody was. One tap on a
   * card that had only ever shown a first name, then Settings → Blocked
   * citizens, and there they are. The id-shaped doors closed above each cost
   * an attacker two calls and a pasted uuid; this one was a button, in the
   * product, on the safety screen.
   *
   * So anybody here who keeps a dating profile and is not a connection is
   * drawn the way Dating drew them: the first name they chose, no handle, no
   * photograph. Unblocking is unaffected — it goes by id, which this keeps.
   *
   * It over-masks in two places, both deliberately. A city acquaintance who
   * happens to date and never became a connection is shown by their dating
   * name; so is a match who already revealed themselves, because the reveal
   * flags are cleared by the block itself and cannot be asked afterwards. Both
   * cost a name you already know, spelled differently. The other direction
   * costs somebody their anonymity, and there is no version of that which is
   * only a little bit wrong.
   */
  async listBlocks(userId: string) {
    // unbounded: their block list — safety UI, must be complete
    const rows = await this.prisma.block.findMany({
      where: { blockerId: userId },
      include: { blocked: { select: AUTHOR_SELECT } },
    });
    const people = rows.map((r) => r.blocked);
    const masked = await this.datingOnly(userId, people.map((p) => p.id));
    return people.map((p) => {
      const shown = masked.get(p.id);
      return shown === undefined ? p : { id: p.id, name: shown, handle: null, profileImage: null };
    });
  }

  /**
   * Of the citizens given, the ones this citizen can only have met in Dating —
   * mapped to the name Dating showed them under. See listBlocks for why.
   *
   * Bounded by the block list, which is small, and every read is swallowed:
   * a safety screen that fails to load because the Dating tables hiccuped is a
   * worse outcome than one, and if a read does fail the citizen is masked
   * rather than named — `profiles` empty means nobody is masked, so the ORDER
   * matters and the profile read is the one that decides.
   */
  private async datingOnly(userId: string, ids: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (!ids.length) return out;

    // unbounded: bounded by the block list this is called with
    const profiles = await this.prisma.datingProfile.findMany({
      where: { userId: { in: ids } },
      select: { userId: true, extras: true },
    }).catch(swallowed('social.listBlocks: dating profiles', [] as { userId: string; extras: unknown }[]));
    if (!profiles.length) return out;

    const daters = profiles.map((p) => p.userId);
    // unbounded: bounded by the block list this is called with
    const links = await this.prisma.connection.findMany({
      where: {
        OR: [
          { userOneId: userId, userTwoId: { in: daters } },
          { userOneId: { in: daters }, userTwoId: userId },
        ],
      },
      select: { userOneId: true, userTwoId: true },
    }).catch(swallowed('social.listBlocks: connections', [] as { userOneId: string; userTwoId: string }[]));
    const connected = new Set(links.flatMap((l) => [l.userOneId, l.userTwoId]));

    for (const p of profiles) {
      if (connected.has(p.userId)) continue;
      let firstName: unknown = null;
      try { firstName = (JSON.parse(String(p.extras ?? '{}')) as Record<string, unknown>).firstName; } catch { /* an unreadable blob names nobody */ }
      // NEVER the account name as the fallback — that is the thing being kept
      // back. shownName falls back to whatever it is handed, so it is handed a
      // sentence rather than a person.
      out.set(p.userId, shownName({ firstName }, 'Someone you blocked'));
    }
    return out;
  }

  /**
   * File a report against a user, post or comment (feeds a moderation queue).
   *
   * THE SAME UNIQUE INDEX THE DATING PATH LEARNED ABOUT (launch audit, 27 Aug).
   * `(reporterId, targetType, targetId)` is not scoped to status, so a second
   * report of the same thing by the same person throws P2002 — which, with no
   * catch here, left the exception filter to turn it into a 500 and tell the
   * citizen "Internal server error". Reporting the same account twice is not an
   * error; the second one usually means the first was dismissed and the problem
   * did not stop.
   *
   * So the row is REOPENED, exactly as `reportMatch` does it: a resolved report
   * goes back to open with the new words and the moderator fields cleared, and
   * a report that is still open is a genuine repeat tap and stays one.
   */
  async report(userId: string, dto: { targetType: string; targetId: string; reason?: string }) {
    const type = dto.targetType;
    if (!['user', 'post', 'comment'].includes(type)) throw new ForbiddenException('invalid report target');
    const reason = this.clean(dto.reason) ?? null;
    try {
      await this.prisma.report.create({
        data: { reporterId: userId, targetType: type, targetId: dto.targetId, reason },
      });
    } catch (e) {
      if ((e as { code?: string }).code !== 'P2002') throw e;
      const existing = await this.prisma.report.findFirst({
        where: { reporterId: userId, targetType: type, targetId: dto.targetId },
        select: { id: true, status: true },
      });
      if (!existing || existing.status === 'open') return { reported: true, duplicate: true };
      await this.prisma.report.update({
        where: { id: existing.id },
        data: { status: 'open', reviewedById: null, reviewedAt: null, decision: null, reason, createdAt: new Date() },
      });
      return { reported: true, reopened: true };
    }
    return { reported: true };
  }

  // ─────────────── the moderation queue (BE-13.7) ───────────────
  /**
   * Open reports, grouped by what they are about.
   *
   * Grouped rather than listed, because ten people reporting one post is one
   * decision and not ten, and because the count is the single most useful thing
   * a moderator can see. A flat list buries a post ten people flagged under
   * nine older singletons.
   *
   * Reporters are counted, never named. A queue that shows who reported whom is
   * one leak away from being the reason nobody reports anything.
   */
  async reportQueue(adminId: string) {
    // ONE PERMISSION SYSTEM (third audit, finding 11). The report queue used to
    // gate on User.role === 'admin' (seeded from MODERATION_ADMINS), while the
    // dating console gated on AdminGrant rows and a permission map (seeded from
    // CONSOLE_FOUNDERS). Two env vars, never cross-referenced — so tellModerators
    // could ring an inbox the queue then 403'd at the door. Both are the
    // AdminGrant/permission system now: reading the queue needs `moderation.read`.
    await this.access.assert(adminId, 'moderation.read');
    const rows = await this.prisma.report.findMany({
      where: { status: 'open' },
      orderBy: { createdAt: 'asc' },
      take: 500,
    }) as unknown as Array<{ id: string; reporterId: string; targetType: string; targetId: string; reason: string | null; createdAt: Date }>;

    const groups = new Map<string, {
      targetType: string; targetId: string; reportCount: number;
      reporters: Set<string>; reasons: string[]; firstReportedAt: Date; lastReportedAt: Date;
    }>();
    for (const r of rows) {
      const key = `${r.targetType}:${r.targetId}`;
      const g = groups.get(key) ?? {
        targetType: r.targetType, targetId: r.targetId, reportCount: 0,
        reporters: new Set<string>(), reasons: [], firstReportedAt: r.createdAt, lastReportedAt: r.createdAt,
      };
      g.reportCount += 1;
      g.reporters.add(r.reporterId);
      if (r.reason) g.reasons.push(r.reason);
      if (r.createdAt < g.firstReportedAt) g.firstReportedAt = r.createdAt;
      if (r.createdAt > g.lastReportedAt) g.lastReportedAt = r.createdAt;
      groups.set(key, g);
    }

    const items = await Promise.all([...groups.values()].map(async (g) => ({
      targetType: g.targetType,
      targetId: g.targetId,
      reportCount: g.reportCount,
      distinctReporters: g.reporters.size,
      reasons: g.reasons.slice(0, 10),
      firstReportedAt: g.firstReportedAt,
      lastReportedAt: g.lastReportedAt,
      subject: await this.reportSubject(g.targetType, g.targetId),
    })));

    // Most-reported first, then oldest — a thing ten people flagged an hour ago
    // outranks a thing one person flagged last week, and nothing sits forever.
    items.sort((a, b) => b.distinctReporters - a.distinctReporters
      || a.firstReportedAt.getTime() - b.firstReportedAt.getTime());
    return { items, openTotal: rows.length };
  }

  /** Enough of the reported thing to judge it, and no more. */
  private async reportSubject(targetType: string, targetId: string) {
    if (targetType === 'post') {
      const p = await this.prisma.post.findUnique({
        where: { id: targetId },
        select: { id: true, text: true, createdAt: true, moderation: true, author: { select: AUTHOR_SELECT } },
      }).catch(swallowed('social.reportSubject', null)) as null | { id: string; text: string | null; createdAt: Date; moderation: string; author: unknown };
      if (!p) return { kind: 'post' as const, gone: true };
      return { kind: 'post' as const, gone: false, text: p.text, createdAt: p.createdAt, moderation: p.moderation, author: p.author };
    }
    if (targetType === 'user') {
      const u = await this.prisma.user.findUnique({ where: { id: targetId }, select: AUTHOR_SELECT }).catch(swallowed('social.reportSubject', null));
      if (!u) return { kind: 'user' as const, gone: true };
      /**
       * ENOUGH TO JUDGE IT (27 Aug, launch audit).
       *
       * A reported citizen arrived here as a handle and a name. For a dating
       * report that is not enough to decide anything: the allegation is
       * usually about what is ON the profile — the bio, the photographs, the
       * age — and a moderator was being asked to act on somebody they could
       * not see. So the dating profile comes with the report, when there is
       * one.
       *
       * WHAT IS DELIBERATELY NOT HERE: the conversation. Reading two people's
       * private messages is a bigger power than anything else on this screen,
       * it is not needed to judge a profile, and it should be a decision the
       * owner takes knowingly rather than something that arrives inside a
       * refactor. If reports about MESSAGES need it, that is its own feature
       * with its own audit row.
       *
       * Only what another citizen could already see: the same fields any match
       * is shown. A moderator gets a faster route to it, not a deeper one.
       */
      const dp = await (this.prisma as unknown as {
        datingProfile?: { findUnique(a: unknown): Promise<Record<string, unknown> | null> };
      }).datingProfile?.findUnique({
        where: { userId: targetId },
        select: { bio: true, birthDate: true, moderation: true, visible: true, extras: true, updatedAt: true },
      }).catch(swallowed('social.reportSubject.dating', null));
      return { kind: 'user' as const, gone: false, user: u, dating: dp ? datingSummary(dp) : null };
    }
    const c = await this.prisma.comment.findUnique({
      where: { id: targetId },
      select: { id: true, text: true, createdAt: true, author: { select: AUTHOR_SELECT } },
    }).catch(swallowed('social.reportSubject', null));
    return c ? { kind: 'comment' as const, gone: false, comment: c } : { kind: 'comment' as const, gone: true };
  }

  /**
   * Decide every open report about one target at once.
   *
   * 'remove' hides the post from everybody but its author — see
   * post-visibility.ts for why the author still sees it. 'dismiss' closes the
   * reports and changes nothing. Both are recorded against every report in the
   * group, so a second moderator sees that somebody already looked.
   *
   * 'remove' works on a post and on a comment; an ACCOUNT is suspended rather
   * than removed, which is a different verb with different consequences and its
   * own permission. A post is flagged and stays visible to its author; a
   * comment is deleted and its author is notified — the difference is a
   * migration, and the reason is written above deleteComment.
   */
  async reportDecide(
    adminId: string,
    dto: { targetType: string; targetId: string; decision: ReportDecision; note?: string },
  ) {
    // ONE PERMISSION SYSTEM, AND A REAL ACTION ON A PERSON (third audit, 11 & 04).
    //
    // 11 · This gated on User.role, the OTHER moderator system; now it is the
    //      AdminGrant/permission one, `moderation.act`, the same permission
    //      tellModerators derives its recipients from — so the doorbell and the
    //      door finally agree.
    //
    // 04 · A report about a PERSON could only be dismissed: `remove` was refused
    //      for anything but a post, and suspension lived behind a different
    //      permission in a different console a moderator could not reach.
    //      Detection was good and the response was empty. A moderator can now
    //      WARN (a message the person reads) or SUSPEND (the account is closed
    //      until an admin restores it) straight from the queue they already
    //      read.
    //
    //      SUSPENSION NEEDS `users.suspend` ON TOP (launch audit, 27 Aug). It
    //      was written under `moderation.act` alone, which handed the
    //      `moderator` role an account action the console refuses it — and,
    //      because restoring is behind `users.suspend`, one it could not undo.
    //      permissions.ts:23 says no permission grants another; this is that
    //      rule, enforced rather than asserted. Warn stays on `moderation.act`:
    //      it writes a message, not an account state.
    await this.access.assert(adminId, 'moderation.act');
    const { targetType, targetId, decision } = dto;
    if (!['user', 'post', 'comment'].includes(targetType)) throw new ForbiddenException('invalid report target');
    if (decision === 'remove' && targetType === 'user') {
      throw new ForbiddenException('An account is suspended, not removed. Use suspend.');
    }
    if ((decision === 'warn' || decision === 'suspend') && targetType !== 'user') {
      throw new ForbiddenException('Warn and suspend act on an account, not a post or comment.');
    }
    // The second permission, asked for before anything is written, so a
    // moderator without it is refused rather than told half a story.
    if (decision === 'suspend') await this.access.assert(adminId, 'users.suspend');
    const reason = this.clean(dto.note);

    if (decision === 'remove' && targetType === 'post') {
      const updated = await this.prisma.post.updateMany({ where: { id: targetId }, data: { moderation: 'removed' } });
      if (!updated.count) throw new NotFoundException('That post no longer exists.');
      // AND THE AUTHOR IS TOLD (30 Aug audit). `removedNotice()` has existed in
      // post-visibility.ts since the file was written, with a docstring
      // explaining that silent removal "is how people conclude the app is
      // broken and post it again" — and it was called by nothing but its own
      // unit test. A moderator's decision that reaches everybody except the one
      // person it is about is not a decision, it is a disappearance.
      const author = await this.prisma.post.findUnique({ where: { id: targetId }, select: { authorId: true } })
        .catch(swallowed('social.reportDecide.author', null));
      if (author) {
        void this.notifications.create({
          userId: author.authorId, kind: 'post_removed',
          title: 'A post of yours was removed', body: removedNotice(),
          href: '/social/profile', entityId: targetId,
        }).catch(swallowed('social.notify.postRemoved', undefined));
      }
    }

    if (decision === 'remove' && targetType === 'comment') {
      // A comment is deleted rather than flagged — see deleteComment for why —
      // and its author is told by the same rule the post branch above follows.
      const c = await this.prisma.comment.findUnique({ where: { id: targetId }, select: { authorId: true } });
      if (!c) throw new NotFoundException('That comment no longer exists.');
      await this.prisma.comment.delete({ where: { id: targetId } });
      void this.notifications.create({
        userId: c.authorId, kind: 'comment_removed',
        title: 'A comment of yours was removed',
        body: 'It was removed by a moderator after it was reported.',
        href: '/social/feed', entityId: targetId,
      }).catch(swallowed('social.notify.commentRemoved', undefined));
    }

    if (decision === 'suspend') {
      // A real account action, so it is audited like every other one, with the
      // moderator's note as the reason. JwtStrategy reads suspendedAt on the
      // next request, so the account is closed within the token's lifetime.
      await this.access.act({
        actorId: adminId, need: 'users.suspend', action: 'report.user.suspend',
        entity: 'user', entityId: targetId, reason: reason ?? 'Suspended following a report',
        before: { suspended: false }, after: { suspended: true },
      }, async () => {
        const done = await this.prisma.user.updateMany({
          where: { id: targetId, deletedAt: null },
          data: { suspendedAt: new Date(), suspendedReason: (reason ?? 'Suspended following a report').slice(0, 1000) },
        });
        if (!done.count) throw new NotFoundException('That account no longer exists.');
      });
    }

    if (decision === 'warn') {
      // The one report decision the person is told about — that is the point of
      // a warning. It carries the moderator's words, and nothing about who
      // reported them.
      //
      // Through `act` rather than beside it: `moderation.act` is in MUST_AUDIT,
      // and a warning is a moderator's decision about a named citizen. The
      // comment above this block used to claim it was audited while the call
      // went straight to the notifier — an audit trail that says a moderator
      // dismissed everything and warned nobody.
      await this.access.act({
        actorId: adminId, need: 'moderation.act', action: 'report.user.warn',
        entity: 'user', entityId: targetId, reason: reason ?? 'Warned following a report',
        before: { warned: false }, after: { warned: true },
      }, async () => {
        await this.notifications.create({
          userId: targetId, kind: 'system',
          title: 'A moderator has reviewed a report about you',
          body: reason ?? 'Please review the community guidelines. Continued reports may lead to your account being suspended.',
          href: '/',
        }).catch(swallowed('social.reportDecide: warn notification', null));
      });
    }

    const now = new Date();
    const closed = await this.prisma.report.updateMany({
      where: { targetType, targetId, status: 'open' },
      data: {
        status: decision === 'dismiss' ? 'dismissed' : 'actioned',
        reviewedById: adminId, reviewedAt: now, decision: reason,
      },
    });
    return { decided: decision, reportsClosed: closed.count };
  }

  /** Users allowed to receive live updates for a post, given its audience.
   *  Always includes the author; excludes anyone in a block relationship. */
  private async postRecipients(authorId: string, audience: string | null | undefined): Promise<string[]> {
    const aud = audience ?? 'public';
    const ids = new Set<string>([authorId]);
    if (aud === 'private') return [...ids];
    const [conns, blocked] = await Promise.all([
      // unbounded: fan-out audience — must be complete; a truncated audience silently unshares a post
      this.prisma.connection.findMany({
        where: { status: 'ACCEPTED', OR: [{ userOneId: authorId }, { userTwoId: authorId }] },
      }),
      this.blockedWith(authorId),
    ]);
    const other = (r: { userOneId: string; userTwoId: string }) => (r.userOneId === authorId ? r.userTwoId : r.userOneId);
    if (aud === 'family') {
      for (const r of conns) if (((r as unknown as { relationship?: string | null }).relationship ?? '') === 'family') ids.add(other(r));
    } else {
      // friends & public: all accepted connections
      for (const r of conns) ids.add(other(r));
      if (aud === 'public') {
        // unbounded: public fan-out includes every follower — same completeness rule
        const followers = await this.prisma.follow.findMany({ where: { followeeId: authorId }, select: { followerId: true } });
        for (const f of followers) ids.add(f.followerId);
      }
    }
    for (const b of blocked) ids.delete(b);
    ids.add(authorId);
    return [...ids];
  }

  /** Throw unless `userId` may view/interact with this post. Mirrors the feed's
   *  visibility rule exactly, so anything you can SEE you can also like/comment:
   *   • public  → any citizen
   *   • friends → anyone in the author's circle (you follow them OR are connected)
   *   • family  → a family-relationship connection
   *   • private → the author alone
   *  Blocks (either direction) always deny. */
  private async assertCanView(userId: string, post: { authorId: string; audience?: string | null }) {
    if (post.authorId === userId) return;
    const blocked = await this.blockedWith(userId);
    if (blocked.has(post.authorId)) throw new ForbiddenException('You do not have access to this post.');
    const aud = post.audience ?? 'public';
    if (aud === 'public') return; // public posts are viewable by any citizen
    if (aud === 'private') throw new ForbiddenException('This post is private.');
    // Same rule the profile grid uses — see ConnectionsService.visibleAudiences.
    const allowed = await this.connections.visibleAudiences(userId, post.authorId);
    if (allowed.includes(aud)) return;
    if (aud === 'family') throw new ForbiddenException('This post is for family only.');
    throw new ForbiddenException('You do not have access to this post.');
  }

  // ─────────────── helpers ───────────────
  private async assertPost(postId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId }, select: { id: true, authorId: true, audience: true } });
    if (!post) throw new NotFoundException('post not found');
    return post;
  }

  /** The display name of whoever triggered a notification. */
  private async actorName(userId: string): Promise<string> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } }).catch(swallowed('social.actorName', null));
    return u?.name ?? 'Someone';
  }

  private shapePost(
    p: {
      id: string;
      text: string | null;
      feeling: string | null;
      lat: number | null;
      lng: number | null;
      createdAt: Date;
      author: { id: string; handle: string; name: string; profileImage: string | null };
      media: { id: string; url: string; kind: string; thumbUrl: string | null }[];
    },
    counts: { likes: number; comments: number },
    likedByMe: boolean,
    /* What the browser should fetch for each stored value. Keys are signed;
       legacy public URLs and inline `data:` photos are absent from the map and
       pass through, because the table still holds both. */
    signed?: Map<string, string>,
  ) {
    const px = p as unknown as { audience?: string | null; placeName?: string | null; taggedJson?: string | null; musicUrl?: string | null; musicTitle?: string | null };
    let tagged: Array<{ id: string; name: string; handle: string }> = [];
    try { tagged = px.taggedJson ? JSON.parse(px.taggedJson) : []; } catch { tagged = []; }
    return {
      id: p.id,
      text: p.text,
      feeling: p.feeling,
      audience: px.audience ?? 'public',
      placeName: px.placeName ?? null,
      musicUrl: px.musicUrl ?? null,
      musicTitle: px.musicTitle ?? null,
      tagged,
      lat: p.lat,
      lng: p.lng,
      author: p.author,
      media: p.media.map((m) => ({
        id: m.id,
        url: signed?.get(m.url) ?? m.url,
        kind: m.kind,
        thumbUrl: m.thumbUrl ? (signed?.get(m.thumbUrl) ?? m.thumbUrl) : null,
      })),
      likes: counts.likes,
      comments: counts.comments,
      likedByMe,
      createdAt: p.createdAt.toISOString(),
    };
  }
}
