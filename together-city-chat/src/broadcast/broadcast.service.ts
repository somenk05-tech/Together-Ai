import { BadRequestException, Injectable, Logger, NotFoundException, type OnModuleInit } from '@nestjs/common';
import { mkdtemp, rm, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { PrismaService } from '../shared/prisma/prisma.service';
import { AdminAccessService } from '../admin/admin-access.service';
import { AiService } from '../ai/ai.service';
import { StorageProvider } from '../media/storage.provider';
import { QueueService } from '../shared/queue/queue.service';
import { SocialService } from '../social/social.service';
import { optional, swallow } from '../shared/swallow';
import { CHANNELS, channel, isChannel, isConfigured, isPlatform, missingFor, type ChannelKey } from './channels';
import { NotConnected, SocialAccountsService } from './accounts.service';
import { instagramCaption, threadsText, tvText, youtubeMeta, type Words } from './compose';
import { deskDb, type MediaPostWithTargets, type MediaTargetRow } from './desk.db';
import { publishReel, publishThread, uploadToYouTube } from './platforms';
import { topic as topicOf, topicForHub, TOPICS, type Topic, type TopicKey } from './topics';
import { trackedLink } from './tracking';

export interface CreateInput {
  topic: TopicKey;
  storageKey: string;
  note?: string;
  title: string;
  description: string;
  tags: string[];
  caption: string;
  threadsText: string;
  privacy: 'public' | 'unlisted' | 'private';
  aiDisclosure: boolean;
  channels: ChannelKey[];
  /** Send it now, rather than leave it as a draft. */
  publish: boolean;
  /** Where it belongs, for the content analytics. All optional. */
  series?: string;
  episode?: string;
  campaign?: string;
}

export interface Draft { title: string; description: string; tags: string[]; caption: string; threadsText: string }

export const JOB_PUBLISH = 'social.publish';
export const JOB_REFRESH = 'social.refresh';
/** How long to wait for the city's transcode before giving up: 90 checks, a minute apart. */
const WAIT_EVERY_MS = 60_000;
const WAIT_CHECKS = 90;
/** A signed link Instagram and Threads fetch the video from. They fetch within minutes; six hours is slack. */
const FETCH_LINK_TTL_SEC = 6 * 3600;

/**
 * ── THE MEDIA DESK (owner, 9 Sep; rebuilt 17 Sep) ───────────────────────────
 *
 * "Create a together social media page where I upload the video there and all
 * details are automatically uploaded on youtube and instagram channels from
 * there, connect dating with dating site, health with health."
 *
 * ONE UPLOAD. The owner picks a topic, uploads a video and writes one line
 * about it; the model drafts the words (`suggest`), the owner edits and
 * presses Publish.
 *
 * THE CITY'S COPY FIRST. Publishing makes a Together TV post from the upload —
 * public when TV is ticked, private to the operator when it is not — because
 * that is the pipeline that already screens a video and re-encodes it into
 * the H.264 MP4 every platform accepts. The three platforms are then sent
 * THAT file, once the transcode has finished (the job waits for it).
 *
 * ONE ROW PER DESTINATION, ONE ANSWER EACH, and one refusing never stops the
 * next: an Instagram token that expired overnight must not be why nothing
 * reached YouTube. Each row records the platform's own id and link, or the
 * platform's own words.
 *
 * WHAT IT CANNOT DO, said on the page as well as here: take a post down from
 * a platform, or make Google publish an upload publicly before the API
 * project has been audited.
 */
@Injectable()
export class BroadcastService implements OnModuleInit {
  private readonly logger = new Logger('MediaDesk');

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AdminAccessService,
    private readonly accounts: SocialAccountsService,
    private readonly social: SocialService,
    private readonly storage: StorageProvider,
    private readonly ai: AiService,
    private readonly jobs: QueueService,
  ) {}

  private get db() { return deskDb(this.prisma); }

  onModuleInit(): void {
    this.jobs.handle(JOB_PUBLISH, async (data) => { await this.runPublish(String(data.postId), Number(data.checks ?? 0)); });
    this.jobs.handle(JOB_REFRESH, async () => { await this.accounts.refreshDue(); });
    void this.jobs.schedule(JOB_REFRESH, '17 3 * * *');
  }

  /** Every destination and every account slot, as this deployment stands. */
  async desk() {
    return {
      channels: CHANNELS.map((c) => ({
        key: c.key, label: c.label, configured: isConfigured(c), missing: missingFor(c), obtain: c.obtain, limit: c.limit,
      })),
      topics: TOPICS.map((t) => ({ key: t.key, label: t.label, hubPath: t.hubPath, hashtags: t.hashtags, disclaimer: t.disclaimer })),
      accounts: await this.accounts.list(),
    };
  }

  /**
   * Words for the owner to edit. Drafted to each channel's formula from the
   * one line the owner wrote; never published without being shown.
   */
  async suggest(topicKey: string, note: string, fileName: string): Promise<Draft> {
    const t = topicOf(topicKey);
    if (!t) throw new BadRequestException('No such topic.');
    const plain = fallbackDraft(t, note, fileName);
    const system = [
      `You write the words for one short video on ${t.brief}`,
      'Return JSON: {"title": string, "description": string, "tags": string[], "caption": string, "threadsText": string}.',
      'title: at most 70 characters, the specific benefit or hook first, no clickbait, no emoji, no hashtags, no ALL CAPS.',
      'description: 2 short paragraphs (under 700 characters) — what happens and why it matters. No links and no hashtags (they are added after).',
      'tags: 8 to 12 plain search phrases a person would type, no # sign.',
      'caption: an Instagram caption under 600 characters — a first line that stops the scroll, then two or three short lines, then a question to the viewer. At most 3 hashtags. No links.',
      'threadsText: one or two sentences under 280 characters that invite a reply. No hashtags, no links.',
      'Use only what the note says. Never invent facts, numbers, prices, medical or veterinary claims, results or guarantees.',
      'Audience: the whole world, the United States included. Plain international English with American spelling; no regional slang, no local currencies, prices, holidays or references that only make sense in one country.',
    ].join('\n');
    const out = await this.ai.json<Partial<Draft> | null>(system, `The owner's note: ${note || '(none)'}\nFile name: ${fileName || '(none)'}`, null, 1200);
    if (!out) return plain;
    const str = (v: unknown, d: string) => (typeof v === 'string' && v.trim() ? v.trim() : d);
    return {
      title: str(out.title, plain.title).slice(0, 100),
      description: str(out.description, plain.description),
      tags: Array.isArray(out.tags) ? out.tags.filter((x): x is string => typeof x === 'string').slice(0, 15) : plain.tags,
      caption: str(out.caption, plain.caption),
      threadsText: str(out.threadsText, plain.threadsText),
    };
  }

  async create(actorId: string, dto: CreateInput, ip?: string | null) {
    const t = topicOf(dto.topic);
    if (!t) throw new BadRequestException('No such topic.');
    const wanted = [...new Set(dto.channels)].filter(isChannel);
    if (!wanted.length) throw new BadRequestException('Tick at least one place for it to go.');
    if (!this.storage.isOwnPostKey(actorId, dto.storageKey)) {
      throw new BadRequestException('That upload was not made here, by this account.');
    }
    const words = wordsOf(dto);

    const post = await this.access.act({
      actorId, need: 'cms.write', action: 'media.drafted', entity: 'mediaPost', entityId: dto.storageKey,
      after: { topic: t.key, channels: wanted },
      reason: `${t.label} video for ${wanted.join(', ')}`, ip,
    }, async () => {
      /* THE CITY'S COPY. Screened and queued for transcode by the same code
         every citizen's post goes through. Private when TV is not ticked:
         the three platforms are still sent the file it produces. */
      const onTv = wanted.includes('tv');
      const tv = await this.social.createPost(actorId, {
        text: tvText(words, t),
        media: [{ url: dto.storageKey, kind: 'video' }],
        audience: onTv ? 'public' : 'private',
      } as never) as { id: string; media?: Array<{ id: string }> };
      const tvMedia = await this.prisma.postMedia.findFirst({ where: { postId: tv.id }, select: { id: true } });

      // Refusals are decided now, where the owner reads them while deciding.
      const accounts = await this.accounts.list();
      return this.db.mediaPost.create({
        data: {
          authorId: actorId, kind: 'video', topic: t.key, storageKey: dto.storageKey,
          note: dto.note?.trim() || null, title: words.title, description: words.description,
          series: dto.series?.trim() || null, episode: dto.episode?.trim() || null, campaign: dto.campaign?.trim() || null,
          tagsJson: JSON.stringify(words.tags), caption: words.caption, threadsText: words.threadsText,
          privacy: words.privacy, aiDisclosure: words.aiDisclosure,
          tvPostId: tv.id, tvMediaId: tvMedia?.id ?? null, state: 'draft',
          targets: {
            create: wanted.map((key) => {
              if (key === 'tv') {
                return { channel: 'tv', state: 'posted', externalId: tv.id, externalUrl: `/social/p/${tv.id}`, finishedAt: new Date(), attempts: 1 };
              }
              const def = channel(key)!;
              if (!isConfigured(def)) {
                return { channel: key, state: 'skipped', skipReason: `${def.label} is not set up on this server — ${missingFor(def).join(', ')} not set.` };
              }
              const slot = accounts.find((a) => a.platform === key && a.topic === t.key);
              if (!slot?.connected) {
                return { channel: key, state: 'skipped', skipReason: `${def.label} is not connected for ${t.label} (${slot?.expected}). Connect it, then press Try again.` };
              }
              return { channel: key, state: 'pending' };
            }),
          },
        },
        include: { targets: true },
      });
    });

    if (dto.publish && post.targets.some((x) => x.state === 'pending')) return this.publish(actorId, post.id, ip);
    return this.settle(post.id);
  }

  async list(limit = 50) {
    // unbounded: capped by `take` below, and the page is a desk, not a feed
    return this.db.mediaPost.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
      include: { targets: { orderBy: { channel: 'asc' } } },
    });
  }

  private async one(id: string): Promise<MediaPostWithTargets> {
    const post = await this.db.mediaPost.findUnique({ where: { id }, include: { targets: true } });
    if (!post) throw new NotFoundException('No such post');
    return post;
  }

  /** Send every pending (or failed) platform row. The work runs on the media lane. */
  async publish(actorId: string, id: string, ip?: string | null) {
    const post = await this.one(id);
    const due = post.targets.filter((x) => isPlatform(x.channel) && (x.state === 'pending' || x.state === 'failed'));
    if (!due.length) throw new BadRequestException('Nothing on that post is waiting to go out.');
    return this.access.act({
      actorId, need: 'notify.send', action: 'media.published', entity: 'mediaPost', entityId: id,
      before: { state: post.state }, after: { channels: due.map((x) => x.channel) },
      reason: `Publishing a ${post.topic} video to ${due.map((x) => x.channel).join(', ')}`, ip,
    }, async () => {
      await this.db.mediaTarget.updateMany({ where: { id: { in: due.map((x) => x.id) } }, data: { state: 'pending', error: null } });
      await this.db.mediaPost.update({ where: { id }, data: { state: 'publishing' } });
      await this.kick(id, 0, 0);
      return this.one(id);
    });
  }

  /** One platform, again — after a failure, or after its account was connected. */
  async retry(actorId: string, id: string, channelKey: string, ip?: string | null) {
    const post = await this.one(id);
    const target = post.targets.find((x) => x.channel === channelKey);
    if (!target || !isPlatform(channelKey)) throw new NotFoundException('That post has no such destination');
    if (target.state === 'posted') throw new BadRequestException('That one is already published. Trying again would post it twice.');
    if (target.state === 'publishing' && target.startedAt && Date.now() - target.startedAt.getTime() < 2 * 3600 * 1000) {
      throw new BadRequestException('That one is still going out. Wait for its answer before trying again.');
    }
    return this.access.act({
      actorId, need: 'notify.send', action: 'media.retried', entity: 'mediaTarget', entityId: target.id,
      before: { state: target.state, error: target.error }, after: { channel: channelKey },
      reason: `Retrying ${channelKey}`, ip,
    }, async () => {
      await this.db.mediaTarget.update({ where: { id: target.id }, data: { state: 'pending', error: null, skipReason: null } });
      await this.db.mediaPost.update({ where: { id }, data: { state: 'publishing' } });
      await this.kick(id, 0, 0);
      return this.one(id);
    });
  }

  /** Queue the work, or run it here when this container is allowed to. */
  private async kick(postId: string, checks: number, delayMs: number): Promise<void> {
    const queued = await this.jobs.add(JOB_PUBLISH, { postId, checks }, { jobId: `social-${postId}-${checks}-${Date.now()}`, delayMs, attempts: 1 });
    if (queued) return;
    if (!this.jobs.consuming) {
      this.logger.warn(`publish ${postId} not queued and this container does not run jobs — it waits for the queue`);
      return;
    }
    setTimeout(() => { void this.runPublish(postId, checks).catch((e: Error) => this.logger.warn(`publish ${postId}: ${e.message}`)); }, delayMs);
  }

  /**
   * THE JOB. Waits for the city's transcode, then sends each pending row.
   * Public for the queue handler only.
   */
  async runPublish(postId: string, checks: number): Promise<void> {
    const post = await this.db.mediaPost.findUnique({ where: { id: postId }, include: { targets: true } });
    if (!post) return;
    const pending = post.targets.filter((x) => isPlatform(x.channel) && x.state === 'pending');
    if (!pending.length) { await this.settle(postId); return; }
    const t = topicOf(post.topic);
    if (!t) { for (const x of pending) await this.fail(x.id, `Unknown topic ${post.topic}.`); await this.settle(postId); return; }

    const media = post.tvMediaId ? await this.db.postMedia.findUnique({ where: { id: post.tvMediaId }, select: { id: true, url: true, thumbUrl: true, state: true } }) : null;
    if (!media) {
      for (const x of pending) await this.fail(x.id, 'The Together TV copy of this video is gone, so there is no file to send.');
      await this.settle(postId); return;
    }
    if (media.state === 'processing') {
      if (checks >= WAIT_CHECKS) {
        for (const x of pending) await this.fail(x.id, 'Together TV was still preparing the video after 90 minutes. Press Try again when it plays on TV.');
        await this.settle(postId); return;
      }
      await this.kick(postId, checks + 1, WAIT_EVERY_MS);
      return;
    }
    if (media.state === 'failed') {
      for (const x of pending) await this.fail(x.id, 'Together TV could not make this video playable, so it was not sent anywhere. Try a different export (H.264 MP4 is safest).');
      await this.settle(postId); return;
    }

    const words = storedWords(post);
    for (const target of pending) {
      await this.attempt(target, post, t, words, media);
    }
    await this.settle(postId);
  }

  private async attempt(target: MediaTargetRow, post: MediaPostWithTargets, t: Topic, words: Words, media: { url: string; thumbUrl: string | null }) {
    await this.db.mediaTarget.update({ where: { id: target.id }, data: { state: 'publishing', startedAt: new Date(), attempts: { increment: 1 }, error: null } });
    try {
      if (target.channel === 'youtube') {
        const acct = await this.accounts.use('youtube', t.key);
        const dir = await mkdtemp(join(tmpdir(), 'tc-yt-'));
        try {
          const file = join(dir, 'video.mp4');
          if (!(await this.storage.downloadPostObjectToFile(media.url, file))) throw new Error('The stored video could not be read.');
          const size = (await stat(file)).size;
          const done = await uploadToYouTube(this.accounts.http, acct.access, file, size, youtubeMeta(words, t, trackedLink(t, 'youtube', post.id)));
          const notice = done.privacy !== words.privacy
            ? `YouTube set it to ${done.privacy}, not ${words.privacy}. Until Google has audited the API project, every upload from it is private — change it in YouTube Studio.`
            : null;
          await this.posted(target.id, done.id, done.url, notice);
        } finally {
          await optional(rm(dir, { recursive: true, force: true }));
        }
        return;
      }
      const videoUrl = await this.storage.signPostObject(media.url, FETCH_LINK_TTL_SEC);
      if (!videoUrl) throw new Error('No link could be signed for the stored video, so the platform had nothing to fetch.');
      if (target.channel === 'instagram') {
        const acct = await this.accounts.use('instagram', t.key);
        const coverUrl = media.thumbUrl ? await this.storage.signPostObject(media.thumbUrl, FETCH_LINK_TTL_SEC) : null;
        const done = await publishReel(this.accounts.http, acct.access, acct.externalId, { videoUrl, caption: instagramCaption(words, t), coverUrl, handle: acct.handle });
        await this.posted(target.id, done.id, done.url, null);
        return;
      }
      const acct = await this.accounts.use('threads', t.key);
      const done = await publishThread(this.accounts.http, acct.access, acct.externalId, { videoUrl, text: threadsText(words, t, trackedLink(t, 'threads', post.id)), handle: acct.handle });
      await this.posted(target.id, done.id, done.url, null);
    } catch (e) {
      const msg = String((e as Error)?.message ?? e).slice(0, 900);
      if (e instanceof NotConnected) {
        await swallow(this.db.mediaTarget.update({ where: { id: target.id }, data: { state: 'skipped', skipReason: msg, finishedAt: new Date() } }), 'media target skipped', { id: target.id });
      } else {
        this.logger.warn(`${target.channel} for ${post.id}: ${msg}`);
        await this.fail(target.id, msg);
      }
    }
  }

  private async posted(targetId: string, externalId: string, externalUrl: string, notice: string | null) {
    await this.db.mediaTarget.update({
      where: { id: targetId },
      data: { state: 'posted', externalId, externalUrl, notice, error: null, skipReason: null, finishedAt: new Date() },
    });
  }

  private async fail(targetId: string, error: string) {
    await swallow(this.db.mediaTarget.update({
      where: { id: targetId },
      data: { state: 'failed', error, finishedAt: new Date() },
    }), 'media target failure', { targetId });
  }

  /**
   * The post's own state, derived from its targets. `done` means nothing is
   * waiting and at least one destination has it; everything skipped or failed
   * is `failed`, because nothing went out and "done" would be read as "sent".
   */
  private async settle(id: string) {
    const post = await this.one(id);
    const busy = post.targets.some((x) => x.state === 'publishing' || (x.state === 'pending' && post.state === 'publishing'));
    const waiting = post.targets.some((x) => x.state === 'pending');
    const posted = post.targets.some((x) => x.state === 'posted');
    const state = busy ? 'publishing' : waiting ? 'draft' : posted ? 'done' : 'failed';
    if (state !== post.state) await this.db.mediaPost.update({ where: { id }, data: { state } });
    return { ...post, state };
  }

  async remove(actorId: string, id: string, ip?: string | null) {
    const post = await this.one(id);
    return this.access.act({
      actorId, need: 'cms.write', action: 'media.removed', entity: 'mediaPost', entityId: id,
      before: { state: post.state, posted: post.targets.filter((x) => x.state === 'posted').map((x) => x.channel) },
      reason: 'Removing the desk record — anything already published stays published, including the Together TV post', ip,
    }, async () => {
      await this.db.mediaPost.delete({ where: { id } });
      return { removed: id };
    });
  }

  /**
   * ── THE HUB'S SHELF ────────────────────────────────────────────────────────
   * "Connect dating with the dating site": a hub page shows the latest videos
   * of its topic. Only what a citizen can actually open is offered — a TV post
   * that is public, a YouTube video that is not private, the Reel, the thread.
   */
  async shelf(hub: string) {
    const t = topicForHub(hub);
    if (!t) return { topic: null, items: [] };
    // unbounded: capped by `take`
    const posts = await this.db.mediaPost.findMany({
      where: { topic: t.key, state: 'done' },
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: { targets: { where: { state: 'posted' } } },
    });
    const mediaIds = posts.map((p) => p.tvMediaId).filter((x): x is string => Boolean(x));
    // unbounded: at most 8 ids, from the capped read above
    const media = mediaIds.length ? await this.db.postMedia.findMany({ where: { id: { in: mediaIds } }, select: { id: true, thumbUrl: true, state: true } }) : [];
    const signed = await this.storage.signPostMedia(media.map((m) => m.thumbUrl));
    const items = posts.map((p) => {
      const at = (c: string) => p.targets.find((x) => x.channel === c);
      const yt = at('youtube');
      const m = media.find((x) => x.id === p.tvMediaId);
      const thumb = m?.thumbUrl ? signed.get(m.thumbUrl) ?? null : null;
      return {
        id: p.id,
        title: p.title ?? t.label,
        createdAt: p.createdAt.toISOString(),
        tvPostId: at('tv') && m?.state === 'ready' ? p.tvPostId : null,
        youtubeUrl: yt && !yt.notice && p.privacy !== 'private' ? yt.externalUrl : null,
        instagramUrl: at('instagram')?.externalUrl ?? null,
        threadsUrl: at('threads')?.externalUrl ?? null,
        thumb: at('tv') ? thumb : null,
      };
    }).filter((i) => i.tvPostId || i.youtubeUrl || i.instagramUrl || i.threadsUrl);
    return { topic: { key: t.key, label: t.label, youtube: t.youtube.handle }, items: items.slice(0, 6) };
  }
}

function wordsOf(dto: Pick<CreateInput, 'title' | 'description' | 'tags' | 'caption' | 'threadsText' | 'privacy' | 'aiDisclosure'>): Words {
  return {
    title: dto.title.trim(), description: dto.description.trim(),
    tags: dto.tags.map((x) => x.trim()).filter(Boolean),
    caption: dto.caption.trim(), threadsText: dto.threadsText.trim(),
    privacy: dto.privacy, aiDisclosure: dto.aiDisclosure,
  };
}

function storedWords(p: MediaPostWithTargets): Words {
  let tags: string[] = [];
  try { const v: unknown = JSON.parse(p.tagsJson ?? '[]'); if (Array.isArray(v)) tags = v.filter((x): x is string => typeof x === 'string'); } catch { tags = []; }
  const privacy = p.privacy === 'unlisted' || p.privacy === 'private' ? p.privacy : 'public';
  return { title: p.title ?? '', description: p.description ?? '', tags, caption: p.caption, threadsText: p.threadsText ?? '', privacy, aiDisclosure: p.aiDisclosure };
}

/** The words when the model is not there: plain, true, and editable. */
export function fallbackDraft(t: Topic, note: string, fileName: string): Draft {
  const base = (note || fileName.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ')).trim();
  const title = (base || `${t.label} on Together City`).slice(0, 70);
  return {
    title,
    description: base ? `${base}.` : `A new ${t.label.toLowerCase()} film from Together City.`,
    tags: [t.label, 'Together City', ...t.hashtags.map((h) => h.slice(1))],
    caption: base ? `${base}.\n\nWhat do you think?` : `New on Together City.\n\nWhat do you think?`,
    threadsText: base ? `${base}. What do you think?` : 'New on Together City. What do you think?',
  };
}
