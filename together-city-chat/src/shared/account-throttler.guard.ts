import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * RATE LIMITS BELONG TO THE ACCOUNT, NOT TO THE ADDRESS IT DIALLED FROM.
 *
 * Every limit in this app — the global 120/minute and every `@Throttle` on top
 * of it — was keyed on `req.ip`, because that is what the default tracker
 * returns. Two consequences, in opposite directions, and both of them wrong:
 *
 * A COLLEGE, AN OFFICE OR A MOBILE CARRIER IS ONE BUCKET. Everybody behind one
 * NAT shares the 120, so the citizens most likely to be on a shared address are
 * the ones who get the 429. India's mobile networks are precisely this shape.
 *
 * AND A ROTATING ADDRESS IS NO BUCKET AT ALL. The limits that matter — reports,
 * likes, uploads, sending — exist to stop one PERSON doing something too often,
 * and a person with a proxy pool had no limit whatsoever. The dating hub's
 * careful per-route ceilings were all measuring the wrong noun.
 *
 * So: the JWT subject where there is one, and the IP where there is not. An
 * unauthenticated route — login, register, forgot — has no account to key on
 * and keeps the old behaviour, which is the right answer there: the whole point
 * of throttling those is that nobody has proved who they are yet.
 */
@Injectable()
export class AccountThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    /* `user` is what JwtAuthGuard attaches, and `sub` is the account id. The
       prefix keeps the two namespaces apart, so a user id can never collide
       with an address and inherit its count. */
    const user = req.user as { sub?: unknown } | undefined;
    if (user && typeof user.sub === 'string' && user.sub) return `u:${user.sub}`;
    return `ip:${String(req.ip ?? '')}`;
  }
}
