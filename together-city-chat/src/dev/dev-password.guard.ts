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
 * ── AND SINCE 27 AUG IT IS NOT ENOUGH ON ITS OWN ──
 *
 * Owner: "let this dev page be reachable only through my account login and
 * nobody else." So there is a THIRD lock, and it is the one that actually
 * answers the question a shared password cannot: WHO.
 *
 * DEV_PAGE_ACCOUNTS names the accounts allowed to open this page — handles,
 * user ids, or both. Everything above about a shared password remains true;
 * what changes is that knowing it is no longer sufficient, and the audit
 * question "who opened the developer page" now has an answer, because only a
 * named account can.
 *
 * IT FAILS CLOSED, and that is a real trade the owner chose knowingly. With
 * the variable unset NOBODY opens this page — including whoever needed it to
 * work out why the deploy is wrong. The alternative was to fall back to the
 * old behaviour when unset, which would mean one forgotten variable silently
 * reopens the page to every account that can guess a password living in this
 * repository. A recoverable lockout beats a silent hole: set the variable and
 * redeploy. The refusal below names the variable in the log for exactly that
 * moment.
 *
 * THE RESPONSE DOES NOT SAY WHICH LOCK FAILED. Wrong password, wrong account
 * and no allowlist all answer identically, because "your password was right
 * but you are not on the list" tells an attacker they have half of it. The LOG
 * distinguishes all three, because the operator reading it has already proved
 * who they are.
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

/**
 * The accounts allowed to open the developer page.
 *
 * Handles or user ids, comma-separated. Both are accepted because they fail
 * differently and neither is right for everyone: a handle is what the owner
 * knows and breaks the day they rename themselves; an id is stable and is not
 * something anybody has memorised. Listing either — or both — is allowed, and
 * the check below is an OR.
 *
 * Lower-cased and trimmed here so the comparison does not have to care, and so
 * a stray space after a comma is not a lockout.
 */
export const devAccounts = (env: NodeJS.ProcessEnv = process.env): string[] =>
  (env.DEV_PAGE_ACCOUNTS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

/** One sentence for all three failures. Which lock closed is in the log, not
 *  in the response — "your password was right but you are not on the list"
 *  tells an attacker they hold half of it. */
const REFUSAL = 'Wrong password.';

@Injectable()
export class DevPasswordGuard implements CanActivate {
  private readonly logger = new Logger('DevPage');

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{
      headers?: Record<string, unknown>;
      user?: { sub?: string; handle?: string };
    }>();

    // ── LOCK THREE: WHICH ACCOUNT ────────────────────────────────────────────
    // Checked BEFORE the password, deliberately. An account that may never open
    // this page should not get to make password attempts at all, and the
    // throttle on the controller is shared between the two.
    const allowed = devAccounts();
    if (allowed.length === 0) {
      // The one refusal an operator will actually need to diagnose, so it names
      // the variable. Reading this log already required being able to read logs.
      this.logger.error('developer page: DEV_PAGE_ACCOUNTS is unset, so nobody may open it. '
        + 'Set it to the handle or user id of the account that should have access, and redeploy.');
      throw new ForbiddenException(REFUSAL);
    }
    const user = req.user;
    const id = (user?.sub ?? '').toLowerCase();
    const handle = (user?.handle ?? '').toLowerCase();
    if (!allowed.includes(id) && !allowed.includes(handle)) {
      // The handle is safe to log: it is not a secret, and "who tried" is the
      // whole reason this lock exists.
      this.logger.warn(`developer page: ${handle || 'an account'} is not on DEV_PAGE_ACCOUNTS`);
      throw new ForbiddenException(REFUSAL);
    }

    // ── LOCK TWO: THE PASSWORD ───────────────────────────────────────────────
    const raw = req.headers?.['x-dev-password'];
    const presented = typeof raw === 'string' ? raw : '';

    if (!presented || !timingSafeEqualStr(presented, devPassword())) {
      // Not logged with the attempt in it. A log line containing a wrong
      // password is a log line containing somebody's right password for
      // something else, about a third of the time.
      this.logger.warn(`developer page: wrong password from ${handle || 'an account'}`);
      throw new ForbiddenException(REFUSAL);
    }
    return true;
  }
}
