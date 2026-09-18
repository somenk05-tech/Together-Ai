import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../shared/prisma/prisma.service';
import { AdminAccessService } from '../admin/admin-access.service';
import { AiService } from '../ai/ai.service';
import { SocialAccountsService } from './accounts.service';
import { deskDb } from './desk.db';
import { publishThreadText } from './platforms';
import { topic as topicOf, type Topic } from './topics';
import { trackedLink } from './tracking';

/**
 * ── THE THREADS DESK — WORDS, NOT FILMS (owner, 18 Sep) ─────────────────────
 *
 * "Create a separate content posting page for threads … for content text
 * posting." The video desk sends one film to four places; this sends a line of
 * text to ONE topic's Threads profile, because that is what Threads rewards:
 * a question somebody answers, in that profile's own voice.
 *
 * THREE THINGS IT DOES AND THE VIDEO DESK DOES NOT.
 *  1. A CHAIN. Threads has no "post three at once": each follow-up is a reply
 *     to the one before it, by id. So the chain is posted in order and stops
 *     at the first failure — a reply with nothing above it would read as a
 *     fragment, and a retry would double-post the part that went out.
 *  2. NO LINK UNLESS ASKED. A link costs reach on Threads, so the hub link is
 *     off by default; ticked, it is the tracked one, and the arrival shows up
 *     in Content analytics against this post.
 *  3. IT IS STILL CONTENT. The post is recorded as a MediaPost of kind `text`
 *     with one `threads` target, so it appears in Content analytics beside the
 *     films, and the Content-type filter separates them.
 */
export const THREADS_LIMIT = 500;
/** Room kept for the tracked hub link the tick box adds. */
export const LINK_ROOM = 60;

export interface ThreadInput {
  topic: string;
  text: string;
  followUps: string[];
  hubLink: boolean;
  note?: string;
}

export interface ThreadDraft { text: string; followUps: string[] }

@Injectable()
export class ThreadsDeskService {
  private readonly logger = new Logger(ThreadsDeskService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AdminAccessService,
    private readonly accounts: SocialAccountsService,
    private readonly ai: AiService,
  ) {}

  private get db() { return deskDb(this.prisma); }

  /**
   * Words for the owner to edit — never posted as they arrive. The model is
   * told this channel's brief and Threads' own shape: a first post that asks
   * something a stranger can answer, then at most two follow-ups.
   */
  async suggest(actorId: string, topicKey: string, note: string): Promise<ThreadDraft> {
    await this.access.assert(actorId, 'cms.write');
    const t = this.topic(topicKey);
    const plain = fallbackThread(t, note);
    const system = [
      `You write Threads posts for ${t.brief}`,
      'Return JSON: {"text": string, "followUps": string[]}.',
      'text: one or two sentences under 280 characters that end in a question a stranger can answer from their own life. No hashtags, no links, no emoji.',
      'followUps: at most 2, each under 280 characters — the next beat of the same thought, not a summary of it. They are posted as replies.',
      'Audience: the whole world, the United States included. Plain international English with American spelling; no regional slang, no local currencies, prices or holidays.',
      'Use only what the note says. Never invent facts, numbers, prices, medical or veterinary claims, results or guarantees.',
    ].join('\n');
    const out = await this.ai.json<Partial<ThreadDraft> | null>(system, `The owner's note: ${note || '(none)'}`, null, 600);
    if (!out) return plain;
    const text = typeof out.text === 'string' && out.text.trim() ? out.text.trim() : plain.text;
    const ups = Array.isArray(out.followUps)
      ? out.followUps.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim().slice(0, THREADS_LIMIT)).slice(0, 2)
      : plain.followUps;
    return { text: text.slice(0, THREADS_LIMIT - LINK_ROOM), followUps: ups };
  }

  /**
   * Post the chain. The record is written first, because the tracked link
   * carries the post's own id — there is no tag until the row exists.
   */
  async post(actorId: string, dto: ThreadInput, ip?: string | null) {
    const t = this.topic(dto.topic);
    const text = dto.text.trim();
    if (!text) throw new BadRequestException('Write the post first.');
    const followUps = (dto.followUps ?? []).map((x) => x.trim()).filter(Boolean).slice(0, 2);
    const slot = (await this.accounts.list()).find((a) => a.platform === 'threads' && a.topic === t.key);
    if (!slot?.connected) {
      throw new BadRequestException(`Threads is not connected for ${t.label} (${slot?.expected ?? t.threads}). Connect it on the Social tab first.`);
    }

    const post = await this.access.act({
      actorId, need: 'cms.write', action: 'media.threadPosted', entity: 'mediaPost', entityId: t.key,
      after: { topic: t.key, posts: followUps.length + 1, hubLink: dto.hubLink },
      reason: `${t.label} Threads post`, ip,
    }, async () => this.db.mediaPost.create({
      data: {
        authorId: actorId, kind: 'text', topic: t.key, storageKey: `text:${randomUUID()}`,
        note: dto.note?.trim() || null, title: text.slice(0, 100), description: '',
        tagsJson: '[]', caption: '', threadsText: [text, ...followUps].join('\n\n'),
        privacy: 'public', aiDisclosure: false, state: 'draft',
        targets: { create: [{ channel: 'threads', state: 'pending' }] },
      },
      include: { targets: true },
    }));

    const target = post.targets[0];
    const first = dto.hubLink ? `${text}\n\n${trackedLink(t, 'threads', post.id)}` : text;
    await this.db.mediaTarget.update({
      where: { id: target.id },
      data: { state: 'publishing', startedAt: new Date(), attempts: { increment: 1 }, error: null },
    });
    try {
      const acct = await this.accounts.use('threads', t.key);
      const done = await publishThreadText(this.accounts.http, acct.access, acct.externalId, { text: first, handle: acct.handle });
      /* THE CHAIN STOPS AT THE FIRST REFUSAL. What is up stays up: the head is
         already recorded as posted, so Try again on the page would repeat it.
         The owner is told which reply did not go, and adds it by hand. */
      let last = done.id;
      let posted = 1;
      let replyError: string | null = null;
      for (const reply of followUps) {
        try {
          const next = await publishThreadText(this.accounts.http, acct.access, acct.externalId, { text: reply, handle: acct.handle, replyTo: last });
          last = next.id;
          posted += 1;
        } catch (e) {
          replyError = `Reply ${posted + 1} of ${followUps.length + 1} did not post: ${say(e)}`;
          break;
        }
      }
      await this.db.mediaTarget.update({
        where: { id: target.id },
        data: {
          state: 'posted', externalId: done.id, externalUrl: done.url, error: null, skipReason: null,
          notice: replyError ?? (followUps.length ? `${posted} posts in the chain.` : null),
          finishedAt: new Date(),
        },
      });
      await this.db.mediaPost.update({ where: { id: post.id }, data: { state: 'done' } });
      return { id: post.id, url: done.url, posted, of: followUps.length + 1, notice: replyError, topic: t.key, handle: acct.handle };
    } catch (e) {
      const msg = say(e);
      this.logger.warn(`threads text for ${t.key}: ${msg}`);
      await this.db.mediaTarget.update({ where: { id: target.id }, data: { state: 'failed', error: msg, finishedAt: new Date() } });
      await this.db.mediaPost.update({ where: { id: post.id }, data: { state: 'failed' } });
      throw new BadRequestException(msg);
    }
  }

  private topic(key: string): Topic {
    const t = topicOf(key);
    if (!t) throw new BadRequestException('No such topic.');
    return t;
  }
}

const say = (e: unknown): string => String((e as Error)?.message ?? e).slice(0, 900);

/** What the page shows when the model is not configured or refuses. */
export function fallbackThread(t: Topic, note: string): ThreadDraft {
  const line = note.trim();
  return {
    text: line ? `${line} What would you have done?` : `Something new from ${t.label} today. What would you like us to make next?`,
    followUps: [],
  };
}
