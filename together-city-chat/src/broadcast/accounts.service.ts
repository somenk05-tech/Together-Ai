import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { AdminAccessService } from '../admin/admin-access.service';
import { swallow } from '../shared/swallow';
import { channel, isConfigured, isPlatform, missingFor, PLATFORM_KEYS, type PlatformKey } from './channels';
import { deskDb, type SocialAccountRow } from './desk.db';
import type { Http } from './http';
import { authorizeUrl, exchangeCode, refreshGrant, type Grant } from './oauth';
import { readState, seal, sealKey, signState, unseal } from './seal';
import { topic as topicOf, TOPICS, type Topic } from './topics';

/**
 * ── EIGHTEEN SIGN-INS, EACH ONE CHECKED ─────────────────────────────────────
 *
 * The owner signs in once per topic per platform, in a pop-up, and the desk
 * keeps the result sealed. Three rules make that safe to leave running:
 *
 * 1. THE STATE IS SIGNED AND NAMES WHO ASKED. A callback carrying somebody
 *    else's state, an old one, or one for another operator is refused.
 *
 * 2. THE ACCOUNT MUST BE THE ONE THE TOPIC NAMES. topics.ts writes down each
 *    channel id and username; a sign-in that returns anything else is
 *    refused and nothing is stored. The six YouTube channels share one
 *    Google login, and "I picked the wrong one in the chooser" is the most
 *    likely mistake anybody will make on this page.
 *
 * 3. A TOKEN IS OPENED ONLY TO BE USED, and refreshed first when it is near
 *    its end — Google's hourly access token from the refresh token, Meta's
 *    60-day tokens once they are a day old and inside their last fortnight.
 *    A daily job (social.refresh) extends the Meta ones even when nothing is
 *    being posted, because an unused Meta token simply dies.
 */

export interface AccountState {
  platform: PlatformKey;
  topic: string;
  /** Who this slot is for: the channel handle or the username. */
  expected: string;
  connected: boolean;
  handle: string | null;
  connectedAt: string | null;
  expiresAt: string | null;
  lastError: string | null;
}

/** Refresh a Meta token when it has fewer than this many days left. */
const META_REFRESH_WITHIN_MS = 14 * 24 * 3600 * 1000;
/** Meta refuses to refresh a token younger than a day. */
const META_MIN_AGE_MS = 24 * 3600 * 1000;

export const expectedFor = (p: PlatformKey, t: Topic): string =>
  p === 'youtube' ? t.youtube.handle : `@${p === 'instagram' ? t.instagram : t.threads}`;

/** Does this sign-in belong in this slot? Null for yes, a sentence for no. */
export function wrongAccount(p: PlatformKey, t: Topic, g: Pick<Grant, 'externalId' | 'handle'>): string | null {
  const signedIn = p === 'youtube' ? g.handle : `@${g.handle}`;
  const right = p === 'youtube'
    ? g.externalId === t.youtube.channelId
    : g.handle.toLowerCase() === (p === 'instagram' ? t.instagram : t.threads).toLowerCase();
  return right ? null
    : `That sign-in was ${signedIn}, and the ${t.label} slot is for ${expectedFor(p, t)}. Nothing was saved — press Connect again and choose ${expectedFor(p, t)}.`;
}

@Injectable()
export class SocialAccountsService {
  private readonly logger = new Logger('SocialAccounts');
  /** Swappable in a spec; the real network everywhere else. */
  http: Http = (url, init) => fetch(url, init);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AdminAccessService,
  ) {}

  private get db() { return deskDb(this.prisma); }

  private key(): Buffer {
    const k = sealKey();
    if (!k) throw new BadRequestException('SOCIAL_TOKEN_KEY is not set (32 bytes, base64 or hex), so no account can be connected or used.');
    return k;
  }

  /** Every slot, and whether it is filled. Never a token, never its length. */
  async list(): Promise<AccountState[]> {
    // unbounded: at most 18 rows — three platforms times six topics, unique on the pair
    const rows = await this.db.socialAccount.findMany({ select: { platform: true, topic: true, handle: true, connectedAt: true, expiresAt: true, lastError: true } });
    const out: AccountState[] = [];
    for (const t of TOPICS) {
      for (const p of PLATFORM_KEYS) {
        const r = rows.find((x) => x.platform === p && x.topic === t.key);
        out.push({
          platform: p, topic: t.key, expected: expectedFor(p, t), connected: Boolean(r),
          handle: r?.handle ?? null,
          connectedAt: r?.connectedAt?.toISOString() ?? null,
          expiresAt: r?.expiresAt?.toISOString() ?? null,
          lastError: r?.lastError ?? null,
        });
      }
    }
    return out;
  }

  /** The address of the platform's sign-in page, with a signed state. */
  async start(actorId: string, platform: string, topicKey: string, ip?: string | null): Promise<{ url: string }> {
    const { p, t } = this.slot(platform, topicKey);
    const def = channel(p)!;
    if (!isConfigured(def)) {
      throw new BadRequestException(`${def.label} is not set up on this server — ${missingFor(def).join(', ')} not set.`);
    }
    const key = this.key();
    return this.access.act({
      actorId, need: 'notify.send', action: 'social.connect.started', entity: 'socialAccount', entityId: `${p}:${t.key}`,
      reason: `Connecting ${def.label} for ${t.label}`, ip,
    }, async () => ({ url: authorizeUrl(p, signState({ platform: p, topic: t.key, actor: actorId }, key)) }));
  }

  /** The pop-up came back. Check it, exchange it, check WHO, seal it. */
  async finish(actorId: string, code: string, rawState: string, ip?: string | null): Promise<AccountState> {
    const key = this.key();
    const state = readState(rawState, key);
    if (!state) throw new BadRequestException('That sign-in has expired or was not started here. Press Connect again.');
    if (state.actor !== actorId) throw new ForbiddenException('That sign-in was started by another account.');
    const { p, t } = this.slot(state.platform, state.topic);

    return this.access.act({
      actorId, need: 'notify.send', action: 'social.connected', entity: 'socialAccount', entityId: `${p}:${t.key}`,
      reason: `Signed in ${channel(p)!.label} for ${t.label}`, ip,
    }, async () => {
      const grant = await exchangeCode(p, code, this.http).catch((e: Error) => {
        throw new BadRequestException(e.message.slice(0, 400));
      });
      const wrong = wrongAccount(p, t, grant);
      if (wrong) throw new BadRequestException(wrong);
      const sealed = seal(JSON.stringify({ access: grant.access, refresh: grant.refresh }), key);
      const data = {
        externalId: grant.externalId, handle: grant.handle, sealed, expiresAt: grant.expiresAt,
        connectedBy: actorId, connectedAt: new Date(), refreshedAt: null, lastError: null,
      };
      await this.db.socialAccount.upsert({
        where: { platform_topic: { platform: p, topic: t.key } },
        create: { platform: p, topic: t.key, ...data },
        update: data,
      });
      this.logger.log(`${p} connected for ${t.key} as ${grant.handle}`);
      return (await this.list()).find((a) => a.platform === p && a.topic === t.key)!;
    });
  }

  async disconnect(actorId: string, platform: string, topicKey: string, ip?: string | null) {
    const { p, t } = this.slot(platform, topicKey);
    return this.access.act({
      actorId, need: 'notify.send', action: 'social.disconnected', entity: 'socialAccount', entityId: `${p}:${t.key}`,
      // The platform still lists the app as connected until the owner removes
      // it there; forgetting the token here is what this button can do.
      reason: `Forgetting the ${channel(p)!.label} sign-in for ${t.label}`, ip,
    }, async () => {
      const row = await this.db.socialAccount.findFirst({ where: { platform: p, topic: t.key } });
      if (row) await this.db.socialAccount.delete({ where: { id: row.id } });
      return { platform: p, topic: t.key, connected: false };
    });
  }

  /**
   * A usable token for one slot, refreshed if it needs to be. Throws a
   * sentence the target row can carry when the slot cannot post.
   */
  async use(platform: PlatformKey, topicKey: string): Promise<{ access: string; externalId: string; handle: string }> {
    const t = topicOf(topicKey);
    const row = await this.db.socialAccount.findFirst({ where: { platform, topic: topicKey } });
    if (!t || !row) throw new NotConnected(`${channel(platform)!.label} is not connected for ${t?.label ?? topicKey} — press Connect on the desk.`);
    const key = this.key();
    const opened = unseal(row.sealed, key);
    if (!opened) throw new NotConnected(`The ${channel(platform)!.label} sign-in for ${t.label} could not be opened (SOCIAL_TOKEN_KEY changed?). Connect it again.`);
    let tokens = JSON.parse(opened) as { access: string; refresh: string | null };
    const now = Date.now();
    const exp = row.expiresAt?.getTime() ?? null;

    const due = platform === 'youtube'
      ? exp === null || exp - now < 2 * 60 * 1000
      : exp !== null && exp - now < META_REFRESH_WITHIN_MS && now - (row.refreshedAt ?? row.connectedAt).getTime() > META_MIN_AGE_MS;
    if (due) {
      try {
        tokens = await this.refresh(row, platform, tokens, key);
      } catch (e) {
        const msg = String((e as Error).message).slice(0, 400);
        await swallow(this.db.socialAccount.update({ where: { id: row.id }, data: { lastError: msg } }), 'social account error', { id: row.id });
        // A Meta token that is still inside its life works without the refresh.
        if (platform === 'youtube' || (exp !== null && exp <= now)) {
          throw new NotConnected(`${channel(platform)!.label} for ${t.label} needs connecting again: ${msg}`);
        }
      }
    } else if (exp !== null && exp <= now) {
      throw new NotConnected(`The ${channel(platform)!.label} sign-in for ${t.label} has expired. Connect it again.`);
    }
    await swallow(this.db.socialAccount.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }), 'social account used', { id: row.id });
    return { access: tokens.access, externalId: row.externalId, handle: row.handle };
  }

  /** The daily keep-alive: extend every Meta token that is near its end. */
  async refreshDue(): Promise<number> {
    const key = sealKey();
    if (!key) return 0;
    const soon = new Date(Date.now() + META_REFRESH_WITHIN_MS);
    // unbounded: at most 12 rows (two Meta platforms times six topics)
    const rows = await this.db.socialAccount.findMany({ where: { platform: { in: ['instagram', 'threads'] }, expiresAt: { lt: soon } } });
    let done = 0;
    for (const row of rows) {
      const opened = unseal(row.sealed, key);
      if (!opened || !isPlatform(row.platform)) continue;
      if (Date.now() - (row.refreshedAt ?? row.connectedAt).getTime() < META_MIN_AGE_MS) continue;
      try {
        await this.refresh(row, row.platform, JSON.parse(opened), key);
        done++;
      } catch (e) {
        await swallow(this.db.socialAccount.update({ where: { id: row.id }, data: { lastError: String((e as Error).message).slice(0, 400) } }), 'social refresh', { id: row.id });
      }
    }
    return done;
  }

  private async refresh(row: SocialAccountRow, platform: PlatformKey, tokens: { access: string; refresh: string | null }, key: Buffer) {
    const fresh = await refreshGrant(platform, tokens, this.http);
    const next = { access: fresh.access, refresh: fresh.refresh ?? tokens.refresh };
    await this.db.socialAccount.update({
      where: { id: row.id },
      data: {
        sealed: seal(JSON.stringify(next), key),
        expiresAt: fresh.expiresAt ?? row.expiresAt,
        // Google's hourly access token is not a "refresh" in Meta's sense —
        // only Meta's clock cares when the token was last extended.
        refreshedAt: platform === 'youtube' ? row.refreshedAt : new Date(),
        lastError: null,
      },
    });
    return next;
  }

  private slot(platform: string, topicKey: string): { p: PlatformKey; t: Topic } {
    const t = topicOf(topicKey);
    if (!isPlatform(platform) || !t) throw new BadRequestException('No such account slot.');
    return { p: platform, t };
  }
}

/** A slot that cannot post right now. The message is what the target row says. */
export class NotConnected extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotConnected';
  }
}
