import { Body, Controller, Get, Post, Query, Req, Res, UseGuards, UsePipes } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { Public } from '../shared/public.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthService } from './auth.service';
import { VerificationCodeService } from './verification-code.service';
import type { Channel } from './verification-policy';
import type { SessionMeta } from './token.service';
import {
  ForgotDto,
  ForgotSchema,
  LoginDto,
  LoginSchema,
  RegisterDto,
  RegisterSchema,
  ResetDto,
  ResetSchema,
} from './dto/auth.dto';

// ─── Refresh-token cookie ───────────────────────────────────────────────────
// The long-lived refresh token also rides in a Secure, HttpOnly cookie so the
// browser can silently restore a session on restart without exposing the token
// to JS. Frontend and backend are on different domains (Vercel ↔ Railway), so
// the cookie is SameSite=None; Secure in production. The access token stays a
// Bearer token in the body, and the refresh token is ALSO returned in the body
// as a fallback for browsers that block third-party cookies (Safari ITP) — so
// auth never depends solely on the cookie.
const REFRESH_COOKIE = 'tc_refresh';
const isProd = (): boolean => process.env.NODE_ENV === 'production';
const refreshTtlSec = (): number => Number(process.env.JWT_REFRESH_TTL ?? 5184000);

function cookieOptions() {
  return {
    httpOnly: true,
    secure: isProd(),
    sameSite: (isProd() ? 'none' : 'lax') as 'none' | 'lax',
    path: '/api/auth',
    maxAge: refreshTtlSec() * 1000,
  };
}
function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, cookieOptions());
}
function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, { httpOnly: true, secure: isProd(), sameSite: isProd() ? 'none' : 'lax', path: '/api/auth' });
}
function readCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.cookie;
  if (!raw) return undefined;
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return undefined;
}
/** The current refresh token from the cookie, the x-refresh-token header, or the body (fallback order). */
function currentRefresh(req: Request, bodyToken?: string): string | undefined {
  return readCookie(req, REFRESH_COOKIE) ?? (req.headers['x-refresh-token'] as string | undefined) ?? bodyToken;
}
function metaFrom(req: Request): SessionMeta {
  const device = (req.headers['user-agent'] ?? '').toString().slice(0, 200) || undefined;
  const fwd = req.headers['x-forwarded-for'];
  const ip = ((Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0] ?? req.ip ?? '').toString().slice(0, 60) || undefined;
  return { device, ip };
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly codes: VerificationCodeService,
  ) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Public()
  @Post('register')
  @UsePipes(new ZodValidationPipe(RegisterSchema))
  async register(@Body() dto: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.register(dto, metaFrom(req));
    setRefreshCookie(res, result.refreshToken);
    return result;
  }

  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Public()
  @Post('login')
  @UsePipes(new ZodValidationPipe(LoginSchema))
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(dto, metaFrom(req));
    setRefreshCookie(res, result.refreshToken);
    return result;
  }

  // Live handle availability + suggestions for the sign-up form.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Public()
  @Get('handle-available')
  handleAvailable(@Query('handle') handle: string) {
    return this.auth.handleAvailable(handle ?? '');
  }

  // POST /auth/check-handle and /auth/check-email were unused duplicates of
  // the GET *-available endpoints the sign-up form actually calls — deleted
  // 1 Aug when the route-reach review reached them.

  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @Public()
  @Get('email-available')
  emailAvailable(@Query('email') email: string) {
    return this.auth.emailAvailable(email ?? '');
  }

  // Silent refresh — token from the HttpOnly cookie, or the body as a fallback.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Public()
  @Post('refresh')
  async refresh(@Body() dto: { refreshToken?: string }, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const fromBody = typeof dto?.refreshToken === 'string' && dto.refreshToken.length > 0;
    const token = currentRefresh(req, dto?.refreshToken) ?? '';
    const pair = await this.auth.refresh(token, metaFrom(req));
    setRefreshCookie(res, pair.refreshToken);
    // THE COOKIE PATH NEVER HANDS THE REFRESH TOKEN BACK IN THE BODY. A caller
    // that authenticated with the ambient cookie is, by definition, a caller
    // whose JS did not need to know the token — and a cross-site page that
    // manages to ride the cookie must not be able to read it out. The body
    // fallback (Safari ITP, no cookie) still gets both, because it proved it
    // already held the token by sending it. See main.ts's CORS note.
    if (!fromBody) return { ...pair, refreshToken: undefined };
    return pair;
  }

  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  @Public()
  @Post('forgot')
  @UsePipes(new ZodValidationPipe(ForgotSchema))
  forgot(@Body() dto: ForgotDto) {
    return this.auth.forgot(dto);
  }

  @Throttle({ default: { limit: 6, ttl: 300_000 } })
  @Public()
  @Post('reset')
  @UsePipes(new ZodValidationPipe(ResetSchema))
  reset(@Body() dto: ResetDto) {
    return this.auth.reset(dto);
  }

  // Log out THIS device: revoke the presented refresh token + clear the cookie.
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  logout(@CurrentUser() user: JwtUser, @Body() dto: { refreshToken?: string }, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = currentRefresh(req, dto?.refreshToken);
    clearRefreshCookie(res);
    return token ? this.auth.logout(token) : this.auth.logoutAll(user.sub);
  }

  /**
   * Permanently delete the signed-in citizen's account. Destructive, so it
   * re-authenticates with the account password and then signs out every device.
   */
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  @Post('delete-account')
  @UseGuards(JwtAuthGuard)
  async deleteAccount(
    @CurrentUser() user: JwtUser,
    @Body() dto: { password?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const out = await this.auth.deleteAccount(user.sub, dto?.password ?? '');
    clearRefreshCookie(res);
    return out;
  }

  // ── Multi-device session management ──
  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  sessions(@CurrentUser() user: JwtUser, @Req() req: Request) {
    return this.auth.listSessions(user.sub, currentRefresh(req));
  }

  @Post('sessions/revoke')
  @UseGuards(JwtAuthGuard)
  revokeSession(@CurrentUser() user: JwtUser, @Body() dto: { id?: string }) {
    return this.auth.revokeSession(user.sub, dto?.id ?? '');
  }

  @Post('logout-others')
  @UseGuards(JwtAuthGuard)
  logoutOthers(@CurrentUser() user: JwtUser, @Body() dto: { refreshToken?: string }, @Req() req: Request) {
    return this.auth.logoutOthers(user.sub, currentRefresh(req, dto?.refreshToken));
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  logoutAll(@CurrentUser() user: JwtUser, @Res({ passthrough: true }) res: Response) {
    clearRefreshCookie(res);
    return this.auth.logoutAll(user.sub);
  }

  // ── Six-digit verification of a real email address and phone (p2, p3, p19) ──
  //
  // Signed-in only, all three. Verification proves that the person holding this
  // session controls that address — an anonymous endpoint would let anyone
  // trigger codes to any address, which is a way to use us to send spam.
  //
  // The throttler here is the coarse outer limit; the real policy (60-second
  // cooldown, five an hour per address, twenty an hour per connection) lives in
  // verification-policy.ts, because it has to be per-target rather than
  // per-route to mean anything.
  @Throttle({ default: { limit: 10, ttl: 300_000 } })
  @Post('verification/send')
  @UseGuards(JwtAuthGuard)
  sendCode(
    @CurrentUser() user: JwtUser,
    @Body() dto: { channel?: string; target?: string },
    @Req() req: Request,
  ) {
    return this.codes.send(user.sub, channelOf(dto?.channel), dto?.target?.trim() || undefined, clientIp(req));
  }

  @Throttle({ default: { limit: 20, ttl: 300_000 } })
  @Post('verification/confirm')
  @UseGuards(JwtAuthGuard)
  confirmCode(@CurrentUser() user: JwtUser, @Body() dto: { channel?: string; code?: string }) {
    return this.codes.confirm(user.sub, channelOf(dto?.channel), dto?.code ?? '');
  }

  @Get('verification/status')
  @UseGuards(JwtAuthGuard)
  verificationStatus(@CurrentUser() user: JwtUser) {
    return this.codes.status(user.sub);
  }

}

/** Only two channels exist; anything else is a client bug, not a new feature. */
function channelOf(raw?: string): Channel {
  const c = (raw ?? '').toLowerCase();
  if (c === 'phone' || c === 'sms') return 'phone';
  return 'email';
}

/**
 * The caller's IP, for the per-connection send cap.
 *
 * X-Forwarded-For is a list and only the LAST hop is trustworthy behind our own
 * proxy — a client can put anything at the front of it. Express's req.ip already
 * applies the trust-proxy setting, so it is preferred; the header is a fallback
 * for a deployment where trust proxy is not configured, and even then we take
 * the final entry rather than the first.
 */
function clientIp(req: Request): string | undefined {
  if (req.ip) return req.ip;
  const fwd = req.headers['x-forwarded-for'];
  const raw = Array.isArray(fwd) ? fwd[fwd.length - 1] : fwd;
  if (!raw) return req.socket?.remoteAddress ?? undefined;
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
  return parts[parts.length - 1] ?? undefined;
}
