import { Body, Controller, Get, Post, Query, Req, Res, UseGuards, UsePipes } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthService } from './auth.service';
import { VerificationService } from './verification.service';
import { RecoveryService } from './recovery.service';
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
    private readonly verification: VerificationService,
    private readonly recovery: RecoveryService,
  ) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  @UsePipes(new ZodValidationPipe(RegisterSchema))
  async register(@Body() dto: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.register(dto, metaFrom(req));
    setRefreshCookie(res, result.refreshToken);
    return result;
  }

  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('login')
  @UsePipes(new ZodValidationPipe(LoginSchema))
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(dto, metaFrom(req));
    setRefreshCookie(res, result.refreshToken);
    return result;
  }

  // Live handle availability + suggestions for the sign-up form.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('handle-available')
  handleAvailable(@Query('handle') handle: string) {
    return this.auth.handleAvailable(handle ?? '');
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('check-handle')
  checkHandle(@Body() dto: { handle?: string }) {
    return this.auth.handleAvailable(dto?.handle ?? '');
  }

  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @Post('check-email')
  checkEmail(@Body() dto: { email?: string }) {
    return this.auth.emailAvailable(dto?.email ?? '');
  }

  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @Get('email-available')
  emailAvailable(@Query('email') email: string) {
    return this.auth.emailAvailable(email ?? '');
  }

  // Silent refresh — token from the HttpOnly cookie, or the body as a fallback.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  async refresh(@Body() dto: { refreshToken?: string }, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = currentRefresh(req, dto?.refreshToken) ?? '';
    const pair = await this.auth.refresh(token, metaFrom(req));
    setRefreshCookie(res, pair.refreshToken);
    return pair;
  }

  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  @Post('forgot')
  @UsePipes(new ZodValidationPipe(ForgotSchema))
  forgot(@Body() dto: ForgotDto) {
    return this.auth.forgot(dto);
  }

  @Throttle({ default: { limit: 6, ttl: 300_000 } })
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

  // ── Email verification ──
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('verify-email')
  verifyEmail(@Body() dto: { token?: string }) {
    return this.verification.verify(dto?.token ?? '');
  }

  @Throttle({ default: { limit: 3, ttl: 300_000 } })
  @Post('resend-verification')
  resendVerification(@Body() dto: { email?: string }) {
    return this.verification.resend(dto?.email ?? '');
  }

  @Throttle({ default: { limit: 3, ttl: 300_000 } })
  @Post('send-verification')
  @UseGuards(JwtAuthGuard)
  sendVerification(@CurrentUser() user: JwtUser) {
    return this.verification.send(user.sub);
  }

  // ── OTP account recovery (production forgot-password) ──
  @Throttle({ default: { limit: 4, ttl: 300_000 } })
  @Post('recovery/request')
  recoveryRequest(@Body() dto: { identifier?: string; channel?: 'email' | 'sms' }, @Req() req: Request) {
    return this.recovery.request(dto?.identifier ?? '', dto?.channel === 'sms' ? 'sms' : 'email', req.ip, req.headers['user-agent']);
  }

  @Throttle({ default: { limit: 8, ttl: 300_000 } })
  @Post('recovery/verify')
  recoveryVerify(@Body() dto: { recoveryToken?: string; otp?: string }) {
    return this.recovery.verify(dto?.recoveryToken ?? '', dto?.otp ?? '');
  }

  @Throttle({ default: { limit: 3, ttl: 300_000 } })
  @Post('recovery/resend')
  recoveryResend(@Body() dto: { recoveryToken?: string }) {
    return this.recovery.resend(dto?.recoveryToken ?? '');
  }

  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  @Post('recovery/reset')
  recoveryReset(@Body() dto: { resetToken?: string; newPassword?: string }) {
    return this.recovery.reset(dto?.resetToken ?? '', dto?.newPassword ?? '');
  }
}
