import { Controller, Get, HttpCode, ServiceUnavailableException } from '@nestjs/common';
import { readiness } from '../shared/readiness';
import { AiService } from '../ai/ai.service';
import { Public } from '../shared/public.decorator';
import { messagingConfigured } from '../mail/messaging-provider';
import { pushConfigured } from '../notifications/web-push.provider';

/** Public health/status endpoint. Exposes only non-sensitive booleans — used to
 *  verify the deployment (e.g. whether AI features are configured). No secrets. */
@Controller('health')
export class HealthController {
  constructor(private readonly ai: AiService) {}

  /**
   * 200 once this instance can actually serve; 503 while it is still warming.
   *
   * THE 503 IS THE POINT. Render routes traffic the moment this returns 200 and,
   * during a deploy, keeps the OLD instance serving until the new one does — so
   * a truthful answer here is the difference between a citizen waiting on a
   * half-booted process and never knowing a deploy happened.
   */
  @Public()
  @Get()
  @HttpCode(200)
  status() {
    const r = readiness.state;
    /* NOTHING BELOW MAY THROW (re-audit, 29 Aug). `messagingConfigured` used
       to CONSTRUCT a provider, and the Resend client throws on an empty key —
       so a missing mail secret turned every probe into a 500, which on a host
       that routes on health means an instance that is never routed and a
       deploy that never finishes. It reads env now, and this belt is here
       because a health endpoint that can fail is worse than one that says
       less. */
    const configured = (f: () => boolean): boolean => { try { return f(); } catch { return false; } };
    const body = {
      ok: r.ready,
      warming: r.pending,
      aiEnabled: this.ai.enabled,          // true when an Anthropic key is configured
      photoAnalysis: this.ai.enabled ? 'live' : 'fallback (deterministic)',
      /* THE TWO SILENT OUTAGES (fifth audit, 29 Aug). Both of these subsystems
         disable themselves when their variables are unset, and both do it
         without failing anything: mail falls through to a stub that reports
         `sent`, push returns before it does any work and hands the browser an
         empty key. A deploy missing either one passed this check and looked
         perfectly healthy while no citizen received anything.
         Booleans only, like everything else here — whether a sender is wired,
         never which one or with what. */
      emailConfigured: configured(() => messagingConfigured('email')),
      pushConfigured: configured(pushConfigured),
    };
    if (!r.ready) throw new ServiceUnavailableException(body);
    return body;
  }
}
