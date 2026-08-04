import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Public } from '../shared/public.decorator';
import { InboundSecretGuard } from './inbound-secret.guard';
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

  @Public()
  @UseGuards(InboundSecretGuard)
  @Post('inbound')
  @HttpCode(200)
  inbound(@Body() payload: unknown) {
    return this.mail.ingestInbound(payload);
  }
}
