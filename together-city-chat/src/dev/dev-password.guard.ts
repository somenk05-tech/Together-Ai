import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { timingSafeEqualStr } from '../mail/mail-inbound';

/**
 * THE PASSWORD, AND WHAT IT IS AND IS NOT WORTH.
 *
 * Asked for as "a password protected page which only the developer can see",
 * password `togethercity`. It is built exactly that way and it works exactly
 * that way. What follows is what a shared password does not do, written here
 * rather than said once in a message, because the next person to touch this
 * file needs it more than the person who asked for it.
 *
 * A shared password has no attribution — the audit trail can say the page was
 * opened and never by whom. It has no revocation short of a redeploy. It cannot
 * be rotated per person. And it is one paste away from being in a chat log
 * forever. Those are the reasons the admin console next door is built on
 * per-person grants read from a table on every request, and this page is
 * deliberately NOT how anything in that console is reached.
 *
 * ── SO THE SHAPE COMPENSATES WHERE IT CAN ──
 *
 * THE PASSWORD IS NEVER IN THE BUNDLE. The check is here, on the server. The
 * web app sends what the person typed and holds it in memory for the session.
 * A client-side string comparison would put the password in a file anyone can
 * download, which is not protection, it is a costume.
 *
 * IT IS THE SECOND LOCK, NOT THE ONLY ONE. These routes sit behind the global
 * JwtAuthGuard like everything else, so reaching this page needs an account AND
 * the password. That costs nothing and means a leaked password on its own opens
 * nothing.
 *
 * THE COMPARISON IS CONSTANT-TIME, reusing the helper the inbound-mail guard
 * uses. A length-sensitive `===` leaks the password one character at a time to
 * anyone patient, and the fix is one function call.
 *
 * IT IS OVERRIDABLE, AND THE PAGE NAGS. DEV_PAGE_PASSWORD replaces the default
 * without a code change. Until it is set, the page's own diagnostics list
 * DEV_PAGE_PASSWORD as unset with the note that the fallback is in the source
 * and therefore public — the page telling you the truth about itself.
 */

/** The shipped default, exactly as asked for. Public by construction: it is in
 *  this file, and this file is in the repository. */
const DEFAULT_PASSWORD = 'togethercity';

export const devPassword = (env: NodeJS.ProcessEnv = process.env): string =>
  (env.DEV_PAGE_PASSWORD ?? '').trim() || DEFAULT_PASSWORD;

/** True when the deployment is still using the password that ships in source. */
export const usingDefaultPassword = (env: NodeJS.ProcessEnv = process.env): boolean =>
  !(env.DEV_PAGE_PASSWORD ?? '').trim();

@Injectable()
export class DevPasswordGuard implements CanActivate {
  private readonly logger = new Logger('DevPage');

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{ headers?: Record<string, unknown> }>();
    const raw = req.headers?.['x-dev-password'];
    const presented = typeof raw === 'string' ? raw : '';

    if (!presented || !timingSafeEqualStr(presented, devPassword())) {
      // Not logged with the attempt in it. A log line containing a wrong
      // password is a log line containing somebody's right password for
      // something else, about a third of the time.
      this.logger.warn('developer page: wrong password');
      throw new ForbiddenException('Wrong password.');
    }
    return true;
  }
}
