import { Controller, Get } from '@nestjs/common';
import { AiService } from '../ai/ai.service';

/** Public health/status endpoint. Exposes only non-sensitive booleans — used to
 *  verify the deployment (e.g. whether AI features are configured). No secrets. */
@Controller('health')
export class HealthController {
  constructor(private readonly ai: AiService) {}

  @Get()
  status() {
    return {
      ok: true,
      aiEnabled: this.ai.enabled,          // true when an Anthropic key is configured
      photoAnalysis: this.ai.enabled ? 'live' : 'fallback (deterministic)',
      // Bumped on deploys to confirm which backend build is live on Railway.
      build: 'profile-visibility-2',
    };
  }
}
