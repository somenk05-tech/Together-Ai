import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ── /auth/forgot WAS THE CHEAPEST DOOR IN THE CITY (fifth audit, 29 Aug) ───
 *
 * It needs no password and no account of your own: type somebody's address,
 * press the button, and mail leaves our domain. It carried one `@Throttle` —
 * five in five minutes, counted per IP — and nothing else. Next door,
 * `VerificationCodeService` has a whole written policy for the same act (a
 * 60-second cooldown, five per target per hour, twenty per address per hour)
 * and this route called none of it. So any address known to be a member could
 * be sent an unlimited stream of "reset your password" mail from rotating
 * addresses — at Resend's cost, and against the sender reputation of the one
 * domain that carries every OTP this city sends.
 *
 * It was also a timing oracle. The response body was already identical for a
 * hit and a miss, and `auth.spec.ts` asserts exactly that — but the bodies
 * were the only thing compared. A hit did an updateMany, an argon2 hash, a
 * create and an AWAITED call to the provider; a miss returned after one
 * findFirst. Hundreds of milliseconds to seconds, on a public route, on a
 * product where "is this person on this dating app" is the question.
 *
 * SOURCE-READ, not behavioural: this file must not import auth.service, which
 * pulls in argon2's native binding. `auth.spec.ts` owns the behaviour.
 */
const SRC = join(__dirname, '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const auth = read('auth/auth.service.ts');

describe('a recovery code cannot be used to flood somebody', () => {
  it('the route asks a cooldown before it resolves anybody', () => {
    const fn = auth.slice(auth.indexOf('async forgot('), auth.indexOf('async reset('));
    expect(fn).toMatch(/const allowed = await this\.mayRecover\(dto\.identifier\);/);
    // Resolution happens only if allowed — otherwise the gate is decoration
    // and the database work happens anyway.
    expect(fn).toMatch(/const user = allowed \? await this\.findByIdentifier\(dto\.identifier\) : null;/);
  });

  it('keyed on the identifier as typed, so a miss is throttled too', () => {
    // Keyed on the resolved account, the counter becomes the oracle it exists
    // beside: only real addresses would ever get a cooldown.
    expect(auth).toMatch(/private async mayRecover\(identifier: string\)/);
    expect(auth).toMatch(/createHash\('sha256'\)\.update\(identifier\.trim\(\)\.toLowerCase\(\)\)/);
  });

  it('two windows: a cooldown between asks and a ceiling per hour', () => {
    expect(auth).toMatch(/RECOVERY_SENDS_PER_HOUR = 5/);
    expect(auth).toMatch(/'EX', 60, 'NX'/);
    expect(auth).toMatch(/n <= RECOVERY_SENDS_PER_HOUR/);
  });

  it('and a cache outage does not lock the city out of its own recovery', () => {
    // Fail-open, loud, with the per-IP throttle still standing. The opposite
    // choice locks every citizen out of account recovery when Redis blinks.
    const fn = auth.slice(auth.indexOf('private async mayRecover('), auth.indexOf('async forgot('));
    expect(fn).toMatch(/if \(!this\.redis\.up\) return true;/);
    expect(fn).toMatch(/recovery cooldown unavailable/);
    expect(fn).toMatch(/return true;\s*\n\s*\}\s*\n\s*\}/);
  });
});

describe('and it does not answer "is this address a member"', () => {
  it('the miss branch pays for an argon2 hash it throws away', () => {
    const fn = auth.slice(auth.indexOf('async forgot('), auth.indexOf('async reset('));
    expect(fn).toMatch(/if \(!user\) \{\s*\n\s*await argon2\.hash\(/);
  });

  it('and the response is still a config fact, never the dispatch result', () => {
    // `delivery` says whether a sender is wired — the same for every caller.
    // Reporting what actually happened to THIS send would answer the question
    // the dummy hash above exists to refuse.
    expect(auth).toMatch(/const delivery = this\.mail\.deliveryConfigured\(channel\) \? 'live' : 'unconfigured';/);
  });
});

describe('the third door carries the same challenge as the other two', () => {
  it('the schema accepts a token', () => {
    expect(read('auth/dto/auth.dto.ts')).toMatch(/turnstileToken: z\.string\(\)\.max\(4096\)\.optional\(\),/);
  });

  it('and the route asserts it, naming its own surface', () => {
    const c = read('auth/auth.controller.ts');
    expect(c).toMatch(/this\.turnstile\.assert\(dto\.turnstileToken, 'forgot', metaFrom\(req\)\.ip\)/);
  });
});

describe('a system message is offered more than once, and shouted about when it is not', () => {
  const mail = read('mail/mail.service.ts');

  it('every dispatch goes through one path with a bounded retry', () => {
    expect(mail).toMatch(/SEND_ATTEMPTS = 3/);
    expect(mail).toMatch(/private async dispatch\(/);
    expect(mail).toMatch(/for \(let attempt = 1; attempt <= SEND_ATTEMPTS; attempt \+= 1\)/);
    // Both callers use it; neither sends on its own any more.
    expect(mail).not.toMatch(/provider\s*\n?\s*\.send\(\{ channel, to: target/);
  });

  it('and a final failure reaches the alarm, not only the log', () => {
    expect(mail).toMatch(/report\(new Error\(`mail dispatch failed/);
  });

  it('carrying the flow and the provider and NOT the recipient', () => {
    // The Resend and Twilio adapters log a domain and never an address; the
    // file that calls them does not get to relax that.
    const fn = mail.slice(mail.indexOf('private async dispatch('), mail.indexOf('private async dispatch(') + 2600);
    expect(fn).toMatch(/channel, kind: meta\.kind, provider: last\.provider, reason: last\.error,/);
    expect(fn).not.toMatch(/to: payload\.to/);
  });
});
