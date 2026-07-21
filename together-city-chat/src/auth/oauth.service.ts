import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { createHmac, randomBytes } from 'crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../shared/prisma/prisma.service';
import { TokenService, TokenPair } from './token.service';
import { assertStrongPassword } from './recovery.service';

const CALLBACK_BASE = (process.env.OAUTH_CALLBACK_BASE || 'https://together-ai-production.up.railway.app/api').replace(/\/$/, '');
const WEB_APP_URL = (process.env.WEB_APP_URL || 'https://together-ai-five.vercel.app').replace(/\/$/, '');
const STATE_SECRET = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'together-city-oauth-state';
const PENDING_TTL_MS = 20 * 60 * 1000;

interface ProviderConfig { id?: string; secret?: string; authUrl: string; tokenUrl: string; scope: string }
const PROVIDERS: Record<string, ProviderConfig> = {
  google: {
    id: process.env.GOOGLE_CLIENT_ID, secret: process.env.GOOGLE_CLIENT_SECRET,
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: 'https://oauth2.googleapis.com/token', scope: 'openid email profile',
  },
  microsoft: {
    id: process.env.MICROSOFT_CLIENT_ID, secret: process.env.MICROSOFT_CLIENT_SECRET,
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize', tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token', scope: 'openid email profile',
  },
};

interface IdClaims { email?: string; name?: string; given_name?: string; email_verified?: boolean | string; picture?: string; sub?: string }
interface Pending { provider: string; sub: string; email: string; name: string; picture: string; verified: boolean }
interface OAuthDelegate {
  create(a: unknown): Promise<unknown>;
  findFirst(a: unknown): Promise<{ userId: string } | null>;
}

/** Social sign-in as an AUTH METHOD only. Every user is a native Together City
 *  account (source of truth); a provider links to it. New users still choose a
 *  handle + password before a permanent account is created. */
@Injectable()
export class OAuthService {
  private readonly logger = new Logger('OAuth');
  constructor(private readonly prisma: PrismaService, private readonly tokens: TokenService) {}

  private get accounts(): OAuthDelegate {
    return (this.prisma as unknown as { oAuthAccount: OAuthDelegate }).oAuthAccount;
  }

  configured(): Record<string, boolean> {
    const out: Record<string, boolean> = {};
    for (const [k, p] of Object.entries(PROVIDERS)) out[k] = Boolean(p.id && p.secret);
    out.apple = false;
    return out;
  }

  private redirectUri(provider: string) { return `${CALLBACK_BASE}/auth/oauth/${provider}/callback`; }
  private sign(payload: string) { return createHmac('sha256', STATE_SECRET).update(payload).digest('hex'); }

  private signState(provider: string): string {
    const payload = `${provider}:${Date.now() + 10 * 60 * 1000}:${randomBytes(8).toString('hex')}`;
    return Buffer.from(`${payload}:${this.sign(payload)}`).toString('base64url');
  }
  private verifyState(state: string, provider: string): void {
    let dec = '';
    try { dec = Buffer.from(state, 'base64url').toString(); } catch { throw new BadRequestException('bad state'); }
    const [prov, exp, nonce, sig] = dec.split(':');
    if (prov !== provider || this.sign(`${prov}:${exp}:${nonce}`) !== sig || !exp || Number(exp) < Date.now()) throw new BadRequestException('Invalid or expired sign-in state.');
  }

  /** Short-lived signed token carrying the verified provider identity (no DB row). */
  private signPending(p: Pending): string {
    const body = Buffer.from(JSON.stringify({ ...p, exp: Date.now() + PENDING_TTL_MS })).toString('base64url');
    return `${body}.${this.sign(body)}`;
  }
  private verifyPending(token: string): Pending {
    const [body, sig] = (token ?? '').split('.');
    if (!body || !sig || this.sign(body) !== sig) throw new BadRequestException('Your sign-in session is invalid — start again.');
    const p = JSON.parse(Buffer.from(body, 'base64url').toString()) as Pending & { exp: number };
    if (!p.exp || p.exp < Date.now()) throw new BadRequestException('Your sign-in session has expired — start again.');
    return p;
  }

  start(provider: string): string {
    const p = PROVIDERS[provider];
    if (!p || !p.id || !p.secret) throw new BadRequestException('That sign-in provider is not available.');
    const params = new URLSearchParams({
      client_id: p.id, redirect_uri: this.redirectUri(provider), response_type: 'code',
      scope: p.scope, state: this.signState(provider), access_type: 'offline', prompt: 'select_account',
    });
    return `${p.authUrl}?${params.toString()}`;
  }

  /** Callback → verify token server-side → link+login an existing user, or hand
   *  a NEW user a pending-registration token to finish choosing handle+password. */
  async callback(provider: string, code: string, state: string): Promise<string> {
    const p = PROVIDERS[provider];
    if (!p || !p.id || !p.secret) throw new BadRequestException('provider not available');
    if (!code) throw new BadRequestException('missing code');
    this.verifyState(state, provider);

    const tokenRes = await fetch(p.tokenUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: p.id, client_secret: p.secret, redirect_uri: this.redirectUri(provider), grant_type: 'authorization_code' }),
    });
    if (!tokenRes.ok) throw new BadRequestException('Token exchange failed.');
    const tok = await tokenRes.json() as { id_token?: string };
    const claims = this.decodeIdToken(tok.id_token);      // server-side identity — never trust the frontend
    const email = (claims.email ?? '').trim().toLowerCase();
    const sub = claims.sub ?? '';
    if (!email || !sub) throw new BadRequestException('The provider did not share a verified email.');
    const verified = claims.email_verified === true || claims.email_verified === 'true';
    const picture = claims.picture ?? '';
    const name = (claims.name || claims.given_name || '').slice(0, 80);

    // Already linked, or an account with this email exists → link + log in.
    const link = await this.accounts.findFirst({ where: { provider, providerUserId: sub } }).catch(() => null);
    let user = link ? await this.prisma.user.findUnique({ where: { id: link.userId } }).catch(() => null) : await this.prisma.user.findFirst({ where: { email } }).catch(() => null);
    if (user) {
      if (!link) await this.accounts.create({ data: { userId: user.id, provider, providerUserId: sub, providerEmail: email, providerAvatar: picture } as never }).catch(() => undefined);
      if (verified && !(user as unknown as { emailVerified?: boolean }).emailVerified) {
        await this.prisma.user.update({ where: { id: user.id }, data: { emailVerified: true, emailVerifiedAt: new Date() } as never });
      }
      const pair = await this.tokens.issuePair({ sub: user.id, handle: user.handle });
      return `${WEB_APP_URL}/oauth/complete#${new URLSearchParams({ access: pair.accessToken, refresh: pair.refreshToken }).toString()}`;
    }

    // New citizen → finish signup (handle + password) with prefilled details.
    const pending = this.signPending({ provider, sub, email, name, picture, verified });
    return `${WEB_APP_URL}/oauth/complete#${new URLSearchParams({ register: pending, email, name, avatar: picture }).toString()}`;
  }

  /** Finish a provider signup: create the permanent native account + link. */
  async completeRegistration(registrationToken: string, handleRaw: string, password: string, phone?: string): Promise<{ ok: true } & TokenPair & { userId: string }> {
    const p = this.verifyPending(registrationToken);
    assertStrongPassword(password);
    const handle = (handleRaw ?? '').trim().toLowerCase();
    if (!/^[a-z0-9_.]{3,30}$/.test(handle)) throw new BadRequestException('Choose a handle: 3–30 letters, numbers, . or _.');
    if (await this.prisma.user.findUnique({ where: { handle } }).catch(() => null)) throw new ConflictException('That handle is already taken.');

    // If the email was claimed meanwhile, link to that account instead of duplicating.
    let user = await this.prisma.user.findFirst({ where: { email: p.email } }).catch(() => null);
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          handle, name: (p.name || handle).slice(0, 80), email: p.email,
          emailVerified: true, emailVerifiedAt: new Date(), profileImage: p.picture || null,
          phone: phone?.trim() || null, passwordHash: await argon2.hash(password),
        } as never,
      });
      await (this.prisma as unknown as { foodPref: { create(a: unknown): Promise<unknown> } }).foodPref.create({ data: { userId: user.id } }).catch(() => undefined);
    }
    await this.accounts.create({ data: { userId: user.id, provider: p.provider, providerUserId: p.sub, providerEmail: p.email, providerAvatar: p.picture || null } as never }).catch(() => undefined);
    const pair = await this.tokens.issuePair({ sub: user.id, handle: user.handle });
    this.logger.log(`oauth signup complete provider=${p.provider} user=${user.id}`);
    return { ok: true, ...pair, userId: user.id };
  }

  errorRedirect(reason = 'oauth_failed'): string { return `${WEB_APP_URL}/oauth/complete#error=${encodeURIComponent(reason)}`; }

  private decodeIdToken(idToken?: string): IdClaims {
    if (!idToken) return {};
    try { return JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString()) as IdClaims; } catch { return {}; }
  }
}
