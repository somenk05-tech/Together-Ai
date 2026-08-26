import { ForbiddenException, Injectable, Logger } from '@nestjs/common';

/**
 * Cloudflare Turnstile, the server half. (26 Aug.)
 *
 * TURNSTILE_SECRET unset: nothing is checked, nothing is required — the
 * per-IP throttle and the per-handle lockout are the whole defence, as
 * before. Set: sign-up and sign-in need a token that Cloudflare confirms,
 * and a missing or stale one is refused. Fail-CLOSED once the key exists:
 * if Cloudflare cannot be reached the request is refused rather than
 * waved through, because a bot check that opens on outage is a bot check
 * with a known off switch.
 */
const VERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

@Injectable()
export class TurnstileService {
  private readonly logger = new Logger(TurnstileService.name);
  private readonly secret = process.env.TURNSTILE_SECRET ?? '';

  get enabled(): boolean { return this.secret.length > 0; }

  /** Throws unless the token is confirmed; a no-op when Turnstile is off. */
  async assert(token: string | undefined, ip?: string): Promise<void> {
    if (!this.enabled) return;
    if (!token) throw new ForbiddenException('Complete the "are you human" check and try again.');
    const body = new URLSearchParams({ secret: this.secret, response: token });
    if (ip) body.set('remoteip', ip);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 5000);
    try {
      const res = await fetch(VERIFY, { method: 'POST', body, signal: ctl.signal });
      const out = (await res.json()) as { success?: boolean; 'error-codes'?: string[] };
      if (!out.success) {
        this.logger.warn(`turnstile refused: ${(out['error-codes'] ?? []).join(',') || 'no reason given'}`);
        throw new ForbiddenException('The "are you human" check did not pass. Reload and try again.');
      }
    } catch (e) {
      if (e instanceof ForbiddenException) throw e;
      this.logger.warn(`turnstile unreachable: ${(e as Error).message}`);
      throw new ForbiddenException('Could not confirm the "are you human" check. Try again in a moment.');
    } finally {
      clearTimeout(timer);
    }
  }
}
