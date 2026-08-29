import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../shared/public.decorator';
import { InboundSecretGuard } from './inbound-secret.guard';
import { UnsubscribeTokenGuard, type UnsubscribeRequest } from './unsubscribe-token.guard';
import { MailService } from './mail.service';

/**
 * Inbound mail webhook — where replies to a citizen's @togethercity.app address
 * come back into the city. Point the Resend Inbound webhook at
 * `POST https://api.togethercity.app/api/mail/inbound`.
 *
 * ITS OWN CONTROLLER, AND EXPLICITLY PUBLIC. MailController is authenticated
 * like everything else; an inbound webhook carries no user JWT, so this route
 * needs @Public() to be reachable at all — the global JwtAuthGuard protects by
 * omission, so a controller that simply says nothing is protected, not exposed.
 * (An earlier draft of this file relied on "public by omission", which stopped
 * being true when that guard landed and would have 401'd every reply Resend
 * ever sent.)
 *
 * Being public, it is authenticated by InboundSecretGuard instead — a shared
 * secret compared in constant time. See that file for why the check is a guard
 * and not a line inside the service.
 *
 * Always answers 200 for a well-formed-but-unmatched message so the provider
 * doesn't retry an email addressed to a handle we don't host; a bad or absent
 * secret is refused by the guard before this handler runs (403).
 */
@Controller('mail')
export class MailInboundController {
  constructor(private readonly mail: MailService) {}

  /**
   * OUT OF THE GLOBAL BUCKET, and the reason is the shape of webhook traffic
   * rather than its volume (fifth audit, 29 Aug).
   *
   * This route carried no throttle of its own, so it fell under the app-wide
   * 120 a minute — which is counted per caller. Every event a provider sends
   * arrives from a handful of its own addresses, so at any real volume the
   * city would start 429ing its own inbound mail and its own bounce
   * notifications: exactly the messages that must not be dropped, refused for
   * arriving too fast from the one source they can only arrive from.
   *
   * Authentication is unchanged and is what actually protects this route —
   * InboundSecretGuard, a constant-time shared secret, fail-closed in every
   * environment. A rate limit was never the control here.
   */
  @Public()
  @SkipThrottle()
  @UseGuards(InboundSecretGuard)
  @Post('inbound')
  @HttpCode(200)
  inbound(@Body() payload: unknown) {
    return this.mail.ingestInbound(payload);
  }

  /**
   * One-click unsubscribe, as List-Unsubscribe-Post requires.
   *
   * PUBLIC AND UNAUTHENTICATED BY DESIGN: the mail client presses this by
   * itself, with nobody signed in, which is the whole point of the header. The
   * token is an HMAC over the address and an expiry, so the link proves itself
   * — see MailService.unsubscribe, which also explains why a bad one gets a
   * flat `{ ok: false }` and not a description of what was wrong.
   *
   * Throttled, unlike the webhook above: this one is reachable by anybody.
   */
  @Public()
  @UseGuards(UnsubscribeTokenGuard)
  @Post('unsubscribe')
  @HttpCode(200)
  unsubscribe(@Req() req: UnsubscribeRequest) {
    return this.mail.unsubscribe(req.unsubscribeAddress ?? '');
  }
}
