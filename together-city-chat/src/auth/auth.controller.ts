import { Body, Controller, Get, Param, Post, Query, Req, Res, UseGuards, UsePipes } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthService } from './auth.service';
import { VerificationService } from './verification.service';
import { RecoveryService } from './recovery.service';
import { OAuthService } from './oauth.service';
import {
  ForgotDto,
  ForgotSchema,
  LoginDto,
  LoginSchema,
  RefreshDto,
  RefreshSchema,
  RegisterDto,
  RegisterSchema,
  ResetDto,
  ResetSchema,
} from './dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly verification: VerificationService,
    private readonly recovery: RecoveryService,
    private readonly oauth: OAuthService,
  ) {}

  @Post('register')
  @UsePipes(new ZodValidationPipe(RegisterSchema))
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  @UsePipes(new ZodValidationPipe(LoginSchema))
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  // Live handle availability + suggestions for the sign-up form.
  @Get('handle-available')
  handleAvailable(@Query('handle') handle: string) {
    return this.auth.handleAvailable(handle ?? '');
  }

  // Spec aliases: check-handle / check-email (also accept POST body).
  @Post('check-handle')
  checkHandle(@Body() dto: { handle?: string }) {
    return this.auth.handleAvailable(dto?.handle ?? '');
  }

  @Post('check-email')
  checkEmail(@Body() dto: { email?: string }) {
    return this.auth.emailAvailable(dto?.email ?? '');
  }

  @Get('email-available')
  emailAvailable(@Query('email') email: string) {
    return this.auth.emailAvailable(email ?? '');
  }

  @Post('refresh')
  @UsePipes(new ZodValidationPipe(RefreshSchema))
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('forgot')
  @UsePipes(new ZodValidationPipe(ForgotSchema))
  forgot(@Body() dto: ForgotDto) {
    return this.auth.forgot(dto);
  }

  @Post('reset')
  @UsePipes(new ZodValidationPipe(ResetSchema))
  reset(@Body() dto: ResetDto) {
    return this.auth.reset(dto);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  logout(@CurrentUser() user: JwtUser) {
    return this.auth.logout(user.sub);
  }

  // ── Email verification ──
  @Post('verify-email')
  verifyEmail(@Body() dto: { token?: string }) {
    return this.verification.verify(dto?.token ?? '');
  }

  @Post('resend-verification')
  resendVerification(@Body() dto: { email?: string }) {
    return this.verification.resend(dto?.email ?? '');
  }

  @Post('send-verification')
  @UseGuards(JwtAuthGuard)
  sendVerification(@CurrentUser() user: JwtUser) {
    return this.verification.send(user.sub);
  }

  // ── OTP account recovery (production forgot-password) ──
  @Post('recovery/request')
  recoveryRequest(@Body() dto: { identifier?: string; channel?: 'email' | 'sms' }, @Req() req: Request) {
    return this.recovery.request(dto?.identifier ?? '', dto?.channel === 'sms' ? 'sms' : 'email', req.ip, req.headers['user-agent']);
  }

  @Post('recovery/verify')
  recoveryVerify(@Body() dto: { recoveryToken?: string; otp?: string }) {
    return this.recovery.verify(dto?.recoveryToken ?? '', dto?.otp ?? '');
  }

  @Post('recovery/resend')
  recoveryResend(@Body() dto: { recoveryToken?: string }) {
    return this.recovery.resend(dto?.recoveryToken ?? '');
  }

  @Post('recovery/reset')
  recoveryReset(@Body() dto: { resetToken?: string; newPassword?: string }) {
    return this.recovery.reset(dto?.resetToken ?? '', dto?.newPassword ?? '');
  }

  // ── Social sign-in (Google now; others when configured) ──
  @Get('oauth/providers')
  oauthProviders() {
    return this.oauth.configured();
  }

  @Get('oauth/:provider')
  oauthStart(@Param('provider') provider: string, @Res() res: Response) {
    try { res.redirect(this.oauth.start(provider)); }
    catch { res.redirect(this.oauth.errorRedirect('provider_unavailable')); }
  }

  @Get('oauth/:provider/callback')
  async oauthCallback(@Param('provider') provider: string, @Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    try { res.redirect(await this.oauth.callback(provider, code ?? '', state ?? '')); }
    catch { res.redirect(this.oauth.errorRedirect()); }
  }

  // Finish a social signup: create the native account with the chosen handle + password.
  @Post('oauth/complete')
  oauthComplete(@Body() dto: { registrationToken?: string; handle?: string; password?: string; phone?: string }) {
    return this.oauth.completeRegistration(dto?.registrationToken ?? '', dto?.handle ?? '', dto?.password ?? '', dto?.phone);
  }
}
