import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { devCopyAdmits, isDevCopy } from './dev-city-door';

/**
 * THE OWNER, ON THE DEVELOPER COPY — WITHOUT THE PASSWORD.
 *
 * The floating Go live button (owner, 16 Sep: "a go live button wherever
 * there is a change in the developer site") has to know, on every page,
 * whether anything is waiting. Asking for the /dev password on every page is
 * not a button; so READING what is waiting needs only this: the developer
 * copy, a signed-in account (the global JwtAuthGuard), and that account on
 * DEV_PAGE_ACCOUNTS. PRESSING still goes through /dev/release/go-live and
 * the password, the ops.deploy grant and the audit row.
 *
 * On the live site this refuses everybody.
 */
@Injectable()
export class DevAccountGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{ user?: { sub?: string; handle?: string } }>();
    const user = req.user;
    if (!isDevCopy() || !user?.handle || !devCopyAdmits({ id: user.sub, handle: user.handle })) {
      throw new ForbiddenException('Not available.');
    }
    return true;
  }
}
