import { Controller, Get, HttpCode, ServiceUnavailableException } from '@nestjs/common';
import { readiness } from '../shared/readiness';
import { AiService } from '../ai/ai.service';
import { Public } from '../shared/public.decorator';

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
    const body = {
      ok: r.ready,
      warming: r.pending,
      aiEnabled: this.ai.enabled,          // true when an Anthropic key is configured
      photoAnalysis: this.ai.enabled ? 'live' : 'fallback (deterministic)',
    };
    if (!r.ready) throw new ServiceUnavailableException(body);
    return body;
  }
}
