import { ForbiddenException, Injectable, Logger } from '@nestjs/common';

/**
 * Cloudflare Turnstile, the server half. (26 Aug; hostname + action, 28 Aug.)
 *
 * TURNSTILE_SECRET unset: nothing is checked, nothing is required — the
 * per-IP throttle and the per-handle lockout are the whole defence, as
 * before. Set: sign-up and sign-in need a token that Cloudflare confirms,
 * and a missing or stale one is refused. Fail-CLOSED once the key exists:
 * if Cloudflare cannot be reached the request is refused rather than
 * waved through, because a bot check that opens on outage is a bot check
 * with a known off switch.
 *
 * `success` IS NOT THE WHOLE ANSWER, AND THAT WAS THE GAP. (28 Aug.)
 *
 * Siteverify returns two more fields than this file used to read, and both
 * exist to be checked:
 *
 *   hostname — the page the token was minted on. A sitekey is public and
 *   works on every domain its widget lists, so a widget that lists
 *   localhost hands anyone a valid production token: render the sitekey on
 *   your own machine, pass the challenge honestly, spend the token here.
 *   Cloudflare cannot know which of the widget's own domains we meant, so
 *   it reports the origin and leaves the decision with us. TURNSTILE_HOSTNAMES
 *   is that decision, and it is per-deployment: production lists
 *   togethercity.app and NEVER localhost.
 *
 *   action — the surface that minted it. Without it a token collected at
 *   the cheaper of two doors opens either one. Sign-up and sign-in are the
 *   same cost today, so this buys little now and costs nothing, and it is
 *   the check that keeps its value when a third surface is added at a
 *   different price.
 *
 * With a secret and no hostname list there is nothing to compare against,
 * so this refuses rather than skipping the comparison — an allowlist that
 * silently means "anywhere" is the bypass with extra steps. Production
 * never reaches that state: assertProductionConfig() makes it fatal at boot,
 * where it is loud, rather than leaving every sign-in to fail at 403 with
 * no explanation.
 */
const VERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Comma-separated, trimmed, lowercased. Empty entries dropped. */
function hostList(raw: string | undefined): Set<string> {
  return new Set((raw ?? '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean));
}

interface Siteverify {
  success?: boolean;
  action?: string;
  hostname?: string;
  'error-codes'?: string[];
}

@Injectable()
export class TurnstileService {
  private readonly logger = new Logger(TurnstileService.name);
  private readonly secret = process.env.TURNSTILE_SECRET ?? '';
  private readonly hosts = hostList(process.env.TURNSTILE_HOSTNAMES);

  get enabled(): boolean { return this.secret.length > 0; }

  /**
   * Throws unless the token is confirmed, minted on an approved hostname and
   * carrying `action`; a no-op when Turnstile is off.
   */
  async assert(token: string | undefined, action: string, ip?: string): Promise<void> {
    if (!this.enabled) return;
    if (this.hosts.size === 0) {
      this.logger.error('TURNSTILE_SECRET is set but TURNSTILE_HOSTNAMES is empty — refusing rather than accepting a token from any origin.');
      throw new ForbiddenException('The "are you human" check is misconfigured. Try again shortly.');
    }
    if (!token) throw new ForbiddenException('Complete the "are you human" check and try again.');
    const body = new URLSearchParams({ secret: this.secret, response: token });
    if (ip) body.set('remoteip', ip);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 5000);
    try {
      const res = await fetch(VERIFY, { method: 'POST', body, signal: ctl.signal });
      const out = (await res.json()) as Siteverify;
      if (!out.success) {
        this.logger.warn(`turnstile refused: ${(out['error-codes'] ?? []).join(',') || 'no reason given'}`);
        throw new ForbiddenException('The "are you human" check did not pass. Reload and try again.');
      }
      const host = (out.hostname ?? '').toLowerCase();
      if (!this.hosts.has(host)) {
        this.logger.warn(`turnstile hostname refused: ${host || 'none reported'}`);
        throw new ForbiddenException('The "are you human" check did not pass. Reload and try again.');
      }
      if (out.action !== action) {
        this.logger.warn(`turnstile action refused: wanted ${action}, got ${out.action ?? 'none'}`);
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
