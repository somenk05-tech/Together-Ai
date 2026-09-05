import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { timingSafeEqualStr } from './mail-inbound';

/**
 * ── THE PROVIDER'S OWN SIGNATURE (launch gate, third reading, 4 Sep) ────────
 *
 * The bearer form below is right and Resend cannot send it: a Resend webhook
 * is configured as a URL and nothing else — no custom header — and it is
 * authenticated the way Svix-backed webhooks are, with `svix-id`,
 * `svix-timestamp` and `svix-signature` over the raw body, keyed by the
 * endpoint's `whsec_…` signing secret. So refusing `?secret=` by default
 * with only the bearer path open would have stopped inbound mail on the
 * first deploy. This is the path the provider can actually take:
 *
 *   signed = `${svix-id}.${svix-timestamp}.${rawBody}`
 *   sig    = base64(HMAC-SHA256(base64decode(secret after 'whsec_'), signed))
 *   header = 'v1,<sig>' — possibly several, space separated, when a secret
 *            was recently rotated; any one matching is a pass.
 *   the timestamp must be within five minutes of now, or a captured request
 *   replays forever.
 *
 * RESEND_WEBHOOK_SECRET holds the `whsec_…` value from the webhook's page.
 * The raw body comes from express.json's `verify` hook in main.ts, because a
 * re-serialised body is not the bytes that were signed.
 */
const TOLERANCE_SEC = 5 * 60;

export function verifySvixSignature(
  secret: string,
  headers: { id?: string; timestamp?: string; signature?: string },
  rawBody: Buffer | string | undefined,
  nowSec = Math.floor(Date.now() / 1000),
): { ok: true } | { ok: false; why: string } {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return { ok: false, why: 'no svix headers' };
  if (rawBody == null) return { ok: false, why: 'no raw body to verify — main.ts must capture it' };
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, why: 'svix-timestamp is not a number' };
  if (Math.abs(nowSec - ts) > TOLERANCE_SEC) return { ok: false, why: 'svix-timestamp outside the five-minute window' };
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  if (!key.length) return { ok: false, why: 'RESEND_WEBHOOK_SECRET is not a whsec_ value' };
  const body = typeof rawBody === 'string' ? Buffer.from(rawBody) : rawBody;
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.`).update(body).digest();
  for (const part of signature.split(' ')) {
    const [version, sig] = part.split(',');
    if (version !== 'v1' || !sig) continue;
    const given = Buffer.from(sig, 'base64');
    if (given.length === expected.length && timingSafeEqual(given, expected)) return { ok: true };
  }
  return { ok: false, why: 'no v1 signature matched' };
}

/**
 * THE ONE PUBLIC MUTATION IN THIS API, AND WHAT GUARDS IT INSTEAD.
 *
 * Every other route is authenticated by the global JwtAuthGuard. An inbound mail
 * webhook cannot be: Resend has no user session and cannot mint a token. So this
 * route carries @Public() — and @Public() alone would leave an endpoint that
 * writes into a named citizen's mailbox open to anyone who can POST.
 *
 * WHY A GUARD RATHER THAN A CHECK INSIDE THE SERVICE. The check was originally
 * the first few lines of MailService.ingestInbound, which works and is invisible
 * where it matters: route-inventory.ts reads controllers to answer "what is
 * reachable without a token", and a secret buried in a service is not something
 * that inventory — or a reviewer skimming the controller — can see. As a guard
 * it sits on the handler, next to @Public(), and route-exposure.spec.ts can
 * assert that this route is public BUT GUARDED rather than simply exempt.
 *
 * AN UNSET SECRET REFUSES EVERYWHERE. The version this replaces refused only
 * when NODE_ENV was 'production' and accepted anything otherwise — which is an
 * open mail-injection endpoint on every preview and staging deploy, all of them
 * on public URLs. Local testing is now an explicit opt-in that cannot be true in
 * production, rather than the default everywhere production isn't.
 *
 * AND THE SECRET DOES NOT TRAVEL IN A URL ANY MORE, unless somebody says so.
 * `?secret=…` was accepted because it is the easiest thing to paste into a
 * provider's webhook box — and a query string is the one part of a request that
 * is written down everywhere: the platform's access log, every proxy in front of
 * it, the error tracker's breadcrumb, the browser history of whoever opened the
 * URL to check it. This credential is not a session token. It is the single
 * thing standing between a stranger and a write into any named citizen's inbox,
 * so a copy of it sitting in a log line is a copy of it in the hands of anybody
 * who can read logs — which, on a hosted platform, is a much larger set of
 * people than the ones trusted with the secret itself.
 *
 * The header is now the only form that works by default. The URL form is behind
 * ALLOW_INBOUND_SECRET_IN_URL so an existing deployment is not cut off with no
 * warning and no way back: set it, move the secret to
 * `Authorization: Bearer …` in the provider's console, unset it. When a correct
 * secret arrives on the URL with the flag off, the LOG says exactly that and
 * exactly what to do; the response does not, because the response is read by
 * whoever sent the request.
 */
@Injectable()
export class InboundSecretGuard implements CanActivate {
  private readonly logger = new Logger('MailInbound');

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{
      query?: Record<string, unknown>;
      headers?: Record<string, unknown>;
      rawBody?: Buffer | string;
    }>();

    // The provider's signature first: it is the one form Resend can send.
    const signing = (process.env.RESEND_WEBHOOK_SECRET ?? '').trim();
    const h = (name: string): string | undefined => {
      const v = req.headers?.[name];
      return typeof v === 'string' ? v : Array.isArray(v) ? String(v[0]) : undefined;
    };
    if (signing) {
      const verdict = verifySvixSignature(signing, { id: h('svix-id'), timestamp: h('svix-timestamp'), signature: h('svix-signature') }, req.rawBody);
      if (verdict.ok) return true;
      if (h('svix-signature')) {
        // A signed request that does not verify is either a wrong secret or a
        // forgery; either way the log says which check failed and the response
        // does not.
        this.logger.error(`inbound mail refused: svix signature did not verify (${verdict.why})`);
        throw new ForbiddenException('invalid inbound signature');
      }
      // No svix headers at all: fall through to the shared-secret forms, which
      // a hand-configured relay may still use.
    }

    const expected = (process.env.RESEND_INBOUND_SECRET ?? '').trim();
    if (!expected) {
      if (signing) throw new ForbiddenException('invalid inbound signature');
      if (process.env.NODE_ENV !== 'production' && process.env.ALLOW_UNSIGNED_INBOUND === 'true') {
        this.logger.warn('inbound mail accepted UNSIGNED — ALLOW_UNSIGNED_INBOUND is set. Never do this in production.');
        return true;
      }
      this.logger.error('inbound mail refused: neither RESEND_WEBHOOK_SECRET nor RESEND_INBOUND_SECRET is set');
      throw new ForbiddenException('inbound mail is not configured');
    }

    // `Authorization: Bearer …` is the way in. It is the only form that keeps
    // the credential out of access logs, and it is what the provider's console
    // should carry.
    const auth = typeof req.headers?.authorization === 'string' ? req.headers.authorization : '';
    const fromBearer = /^bearer /i.test(auth) ? auth.slice(7).trim() : undefined;
    if (fromBearer && timingSafeEqualStr(fromBearer, expected)) return true;

    // The URL form, kept only so an existing webhook is not cut off silently.
    const fromQuery = typeof req.query?.secret === 'string' ? req.query.secret : undefined;
    if (fromQuery && timingSafeEqualStr(fromQuery, expected)) {
      if (process.env.ALLOW_INBOUND_SECRET_IN_URL === 'true') {
        this.logger.warn(
          'inbound mail authenticated by ?secret= — the credential is now in this platform\'s access log. '
          + 'Move it to an Authorization: Bearer header in the provider\'s webhook settings, then unset '
          + 'ALLOW_INBOUND_SECRET_IN_URL. Rotate the secret afterwards: the old one has been logged.',
        );
        return true;
      }
      // Correct secret, wrong channel. Said in the LOG, because otherwise this
      // is an outage whose cause is invisible — inbound mail simply stops. Not
      // said in the response: that is read by whoever sent the request.
      this.logger.error(
        'inbound mail refused: the secret arrived on the query string, which is no longer accepted. '
        + 'Send it as `Authorization: Bearer <secret>` — or set ALLOW_INBOUND_SECRET_IN_URL=true to '
        + 'restore the old behaviour while you migrate.',
      );
    }

    throw new ForbiddenException('invalid inbound secret');
  }
}
