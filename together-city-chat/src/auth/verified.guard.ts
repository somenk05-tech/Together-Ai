import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';

/**
 * Soft-gate for email verification.
 *
 * The app deliberately does NOT lock unverified users out at the door: they can
 * sign in, look around, and fill in their profile. This guard is applied only to
 * the handful of actions that are public-facing or hard to undo — publishing
 * content, listing property, entering the dating pool — so an unconfirmed
 * address can't be used to broadcast to other citizens.
 *
 * Users with no email on file are NOT blocked (legacy/phone-only accounts);
 * there is nothing for them to confirm. Only an account that has an email and
 * hasn't confirmed it is stopped.
 *
 * Throws 403 with `code: 'EMAIL_NOT_VERIFIED'` so the client can show the
 * "verify your email" prompt instead of a generic error.
 */
@Injectable()
export class VerifiedGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<{ user?: { sub?: string } }>();
    const userId = req.user?.sub;
    if (!userId) return true; // JwtAuthGuard owns authentication; nothing to check here.

    const user = await this.prisma.user
      .findUnique({ where: { id: userId }, select: { email: true, emailVerified: true } })
      .catch(() => null);

    // Unknown user or no email on file → nothing to verify, let it through.
    if (!user || !user.email) return true;
    if (user.emailVerified) return true;

    throw new ForbiddenException({
      code: 'EMAIL_NOT_VERIFIED',
      message: 'Confirm your email address to use this. Check your inbox for the verification link, or resend it from the banner at the top of the app.',
    });
  }
}
