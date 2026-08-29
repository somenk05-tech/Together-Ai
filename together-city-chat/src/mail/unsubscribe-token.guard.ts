import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { addressFromUnsubscribeToken } from './mail-inbound';

/** What the guard attaches once the token has proved itself. */
export interface UnsubscribeRequest extends Request {
  unsubscribeAddress?: string;
}

/**
 * Authenticates a one-click unsubscribe.
 *
 * IT IS A GUARD RATHER THAN A LINE IN THE SERVICE, for the reason
 * `route-exposure.spec.ts` writes down about the inbound webhook: the API's
 * rule is that a public MUTATION must name the mechanism that protects it, and
 * that mechanism has to be a real guard on the route — where the route
 * inventory, and a reviewer skimming the controller, can both see it. A check
 * hidden inside the handler is a route that reads as unprotected.
 *
 * The token IS the credential. List-Unsubscribe-Post is pressed by a mail
 * client with nobody signed in, so there is no session to check; an HMAC over
 * the address and an expiry is what stands in for one.
 *
 * A refusal says nothing about why. This endpoint takes an address, and a
 * talkative refusal is a way to ask whether one is on our list.
 */
@Injectable()
export class UnsubscribeTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<UnsubscribeRequest>();
    const raw = req.query?.t;
    const address = addressFromUnsubscribeToken(typeof raw === 'string' ? raw : '');
    if (!address) throw new ForbiddenException('That link is not valid.');
    req.unsubscribeAddress = address;
    return true;
  }
}
