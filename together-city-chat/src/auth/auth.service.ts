import { swallow } from '../shared/swallow';
import { RedisService } from '../shared/redis/redis.service';
import { StorageProvider } from '../media/storage.provider';
import { isDisposableEmail } from './disposable-domains';
import {
  ConflictException,
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomInt } from 'crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../shared/prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { ForgotDto, LoginDto, RegisterDto, ResetDto } from './dto/auth.dto';
import { TokenService, TokenPair, SessionMeta } from './token.service';
import { assertStrongPassword } from './password-policy';
import { isCityAddress } from '../mail/mail.constants';
import { passwordChangedEmail, recoveryOtpEmail } from '../mail/email-templates';
import { isReservedAdminHandle } from './admin';

/** Wrong guesses allowed against one recovery code before it is burned. */
const MAX_RESET_ATTEMPTS = 5;
/** Failed sign-ins per handle before the handle is refused, and for how long. */
const LOGIN_LOCK_AFTER = 10;
const LOGIN_LOCK_WINDOW_SEC = 15 * 60;
/** Recovery codes one identifier may be sent in an hour. The same number
 *  `verification-policy.ts` uses for its own targets, and for the same reason:
 *  well above anybody's honest fumbling, well below a flood. */
const RECOVERY_SENDS_PER_HOUR = 5;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly mail: MailService,
    private readonly redis: RedisService,
    /* Optional so the many specs that construct this service directly keep
       working; a deletion with no storage is still a deletion of the rows, and
       `purgePostObjects` says loudly in the log when that is what happened. */
    @Optional() private readonly storage?: StorageProvider,
  ) {}

  /**
   * PER-ACCOUNT LOCKOUT. The login route is throttled per IP (8/min), which a
   * distributed guess walks around; this counts failures per HANDLE. Ten in
   * fifteen minutes and the handle is refused for the rest of the window —
   * with the same "Invalid credentials" as every other refusal, so the lock
   * does not become the oracle it exists to close. Redis down: no lockout,
   * the per-IP throttle still stands.
   */
  private lockKey(handle: string): string { return `login:fail:${handle.toLowerCase()}`; }

  private async isLocked(handle: string): Promise<boolean> {
    if (!this.redis?.up) return false;
    const n = await swallow(this.redis.raw.get(this.lockKey(handle)), 'login lockout read');
    return Number(n ?? 0) >= LOGIN_LOCK_AFTER;
  }

  private async noteFailure(handle: string): Promise<void> {
    if (!this.redis?.up) return;
    const key = this.lockKey(handle);
    await swallow((async () => {
      const n = await this.redis.raw.incr(key);
      if (n === 1) await this.redis.raw.expire(key, LOGIN_LOCK_WINDOW_SEC);
    })(), 'login lockout write');
  }

  private async clearFailures(handle: string): Promise<void> {
    if (!this.redis?.up) return;
    await swallow(this.redis.raw.del(this.lockKey(handle)), 'login lockout clear');
  }

  /** Every new account is fully initialised on sign-up — no lazy gaps. Seeds the
   *  default hub profiles (nutrition, beauty, fitness) so the account is complete
   *  the moment it's created; other hubs read from these + self-seed on demand. */
  private async initializeAccount(userId: string): Promise<void> {
    const p = this.prisma as unknown as Record<string, { create(a: unknown): Promise<unknown> }>;
    await Promise.all([
      swallow(p.foodPref?.create({ data: { userId } }), 'seed FoodPref at sign-up', { userId }), // Nutrition Hub
      swallow(p.beautyProfile?.create({ data: { userId } }), 'seed BeautyProfile at sign-up', { userId }), // Beauty Hub
      swallow(p.fitnessProfile?.create({ data: { userId } }), 'seed FitnessProfile at sign-up', { userId }), // Fitness Hub
    ]);
  }

  async register(dto: RegisterDto, meta: SessionMeta = {}): Promise<TokenPair & { userId: string }> {
    // Open registration — Together City is no longer invite-only.
    assertStrongPassword(dto.password);
    // Same generic message for a taken handle and a reserved moderator handle,
    // so registration doesn't reveal which names are privileged.
    if (isReservedAdminHandle(dto.handle)) throw new ConflictException('That handle is already taken.');
    const existing = await this.prisma.user.findUnique({ where: { handle: dto.handle.toLowerCase() } });
    if (existing) throw new ConflictException('That handle is already taken.');
    if (dto.email) {
      // M1: the availability check already refuses these; enforce at the write
      // too, because a form is not the only client an endpoint ever has.
      if (isDisposableEmail(dto.email)) {
        throw new ConflictException('Please use a real email address — temporary inboxes cannot recover an account.');
      }
      const emailTaken = await this.prisma.user.findFirst({ where: { email: dto.email.toLowerCase() } });
      if (emailTaken) throw new ConflictException('That email is already registered.');
    }
    const user = await this.prisma.user.create({
      data: {
        handle: dto.handle.toLowerCase(),
        name: dto.name.trim(),
        email: dto.email?.toLowerCase(),
        phone: dto.phone,
        profileImage: dto.profileImage,
        passwordHash: await argon2.hash(dto.password),
      },
    });
    await this.initializeAccount(user.id);            // fully-initialised account
    // The age claim goes ON THE RECORD, not just past a validator. Before this,
    // the server kept no evidence that anybody had ever asserted they were an
    // adult — which is the first thing anyone would ask for afterwards.
    // `?.` and not a bare access: reaching for a delegate that is not there
    // throws SYNCHRONOUSLY, before there is a promise for swallow to catch —
    // the same trap dating.service.ts carries a comment about. A registration
    // must not fail because a write beside it could not be attempted.
    const mp = (this.prisma as unknown as Record<string, { upsert?: (a: unknown) => Promise<unknown> } | undefined>).masterProfile;
    // Gender rides the SAME write. It is the social answer (genderIdentity),
    // never the clinical one — sexAtBirth stays unasked here and is collected
    // by the hub that actually needs a coefficient. From this row,
    // prefillFromMaster hands it to the dating form, so the question is asked
    // once in the city rather than once per hub. Editable afterwards on the
    // Master Profile page: asked once is not locked.
    //
    // UPSERT, NOT updateMany — and this is a correction, not a preference.
    // `initializeAccount` seeds FoodPref, BeautyProfile and FitnessProfile and
    // NOT MasterProfile; nothing creates that row until a hub write or the
    // gap-consolidation inside MasterProfileService.get() does. So the
    // updateMany this replaces matched ZERO rows for every brand-new account,
    // wrote nothing, and — being wrapped in swallow — said nothing about it.
    // The evidence-on-record the 18+ commit was written to leave was never
    // being left. A guard is only proven where the data has reached.
    const master = {
      dateOfBirth: new Date(`${dto.dateOfBirth}T00:00:00.000Z`),
      genderIdentity: dto.gender,
      genderIdentityOther: dto.gender === 'other' ? (dto.genderOther?.trim() || null) : null,
      // Special-category data, on the same row and the same write. It is
      // stored and nothing reads it but the citizen's own profile — see the
      // DTO for why that sentence is the whole design.
      // Optional since 28 Aug — the door no longer asks. Null means "never
      // said", which is not the same answer as preferNotToSay.
      orientation: dto.orientation ?? null,
      orientationOther: dto.orientation === 'other' ? (dto.orientationOther?.trim() || null) : null,
    };
    await swallow(mp?.upsert?.({
      where: { userId: user.id },
      create: { userId: user.id, ...master },
      update: master,
    }) ?? Promise.resolve(null), 'record date of birth and gender at sign-up', { userId: user.id });
    // No verification email is sent here any more. Sign-up now finishes on a
    // six-digit code screen (VerifyChannel), which asks for the code the person
    // is about to receive rather than mailing a link they have to go and find.
    // Firing both meant two emails for one action, and the link half was the
    // unsound one: it was filed in the citizen's in-app inbox, so a link
    // proving control of an external mailbox could be clicked by anyone
    // holding a session. Removed in 20260730160000_retire_verification_links.
    const pair = await this.tokens.issuePair({ sub: user.id, handle: user.handle }, meta);
    return { ...pair, userId: user.id };
  }

  /** Live handle availability + alternative suggestions (for the sign-up form). */
  async handleAvailable(raw: string): Promise<{ handle: string; valid: boolean; available: boolean; suggestions: string[] }> {
    const handle = (raw ?? '').trim().toLowerCase();
    if (!/^[a-z0-9_.]{3,30}$/.test(handle)) return { handle, valid: false, available: false, suggestions: [] };
    // NOTE: on a failed read this still reports "available" — an absence the
    // form never established. Logged now; the honest API shape (available:
    // unknown) is a separate, client-visible change.
    const taken = await swallow(this.prisma.user.findUnique({ where: { handle } }), 'handle availability read', { handle });
    if (!taken) return { handle, valid: true, available: true, suggestions: [] };
    const base = handle.replace(/[._]+$/, '') || handle;
    const candidates = [`${base}_${randomInt(10, 99)}`, `${base}.city`, `${base}_official`, `the.${base}`, `${base}${randomInt(1, 9)}`, `${base}_${randomInt(100, 999)}`];
    const suggestions: string[] = [];
    for (const c of candidates) {
      if (suggestions.length >= 4) break;
      if (!/^[a-z0-9_.]{3,30}$/.test(c) || suggestions.includes(c)) continue;
      if (!(await swallow(this.prisma.user.findUnique({ where: { handle: c } }), 'handle suggestion read', { candidate: c }))) suggestions.push(c);
    }
    return { handle, valid: true, available: false, suggestions };
  }

  /** Live email availability + format check (for the sign-up form). */
  async emailAvailable(raw: string): Promise<{ email: string; valid: boolean; available: boolean }> {
    const email = (raw ?? '').trim().toLowerCase();
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 160;
    if (!valid) return { email, valid: false, available: false };
    // M1: throwaway domains make accounts nobody answers for. Reported as
    // invalid HERE, at the availability check, so the form says so before
    // the citizen fills anything else in.
    if (isDisposableEmail(email)) return { email, valid: false, available: false };
    // NOT AN ORACLE ANY MORE. This used to answer "is somebody registered
    // with this address" to anyone, unauthenticated, 15 times a minute — a
    // list of addresses in, a list of members out. The form gets the format
    // and disposable-domain answer, which is what it needs to say something
    // before the citizen fills the rest in; whether the address is taken is
    // answered once, by register(), after a password has been typed.
    return { email, valid: true, available: true };
  }

  /**
   * Resolve a recovery identifier (primary email, phone, or handle / city
   * address) to a user. Forgot and reset MUST use the exact same resolution, or
   * a code requested one way can't be redeemed the other way (e.g. an SMS
   * recovery by phone number would strand the user at the reset step).
   */
  private async findByIdentifier(identifier: string) {
    const raw = identifier.trim();
    const id = raw.toLowerCase();
    if (id.includes('@') && !isCityAddress(id)) {
      return this.prisma.user.findFirst({ where: { email: id } });
    }
    if (/^[+0-9][0-9\s-]{5,}$/.test(id)) {
      return this.prisma.user.findFirst({ where: { phone: raw } });
    }
    return this.prisma.user.findUnique({ where: { handle: id.replace(/@togethercity\.tech$/, '') } });
  }

  /**
   * MAY THIS IDENTIFIER BE SENT A RECOVERY CODE RIGHT NOW? (fifth audit, 29 Aug.)
   *
   * `/auth/forgot` carried one `@Throttle` — five in five minutes, counted per
   * IP address — and no history of its own. `VerificationCodeService` next
   * door has a whole policy for the same act (`decideSend`: a 60-second
   * cooldown, five per target per hour) and this route called none of it. So
   * any address known to be a member could be sent an unlimited stream of
   * "reset your password" mail from rotating addresses: at Resend's cost, and
   * against the sender reputation of the one domain that carries every OTP
   * this city sends.
   *
   * KEYED ON THE IDENTIFIER AS TYPED, not on the account, so a MISS is
   * throttled too — otherwise the counter is itself an oracle, answering
   * "does this address exist" by which requests get a cooldown. Hashed,
   * because this key names an email address and lives in a shared cache.
   *
   * REDIS DOWN: allowed, and loud. The per-IP throttle still stands, and a
   * cache outage that locks every citizen out of account recovery is a worse
   * failure than the one this prevents.
   */
  private async mayRecover(identifier: string): Promise<boolean> {
    if (!this.redis.up) return true;
    const key = `recover:${createHash('sha256').update(identifier.trim().toLowerCase()).digest('hex').slice(0, 32)}`;
    try {
      // One counter, two windows: the value is the count in the hour, and a
      // second key is the 60-second cooldown between consecutive asks.
      const gate = `${key}:gate`;
      const fresh = await this.redis.raw.set(gate, '1', 'EX', 60, 'NX');
      if (fresh === null) return false;
      const n = await this.redis.raw.incr(key);
      if (n === 1) await this.redis.raw.expire(key, 3600);
      return n <= RECOVERY_SENDS_PER_HOUR;
    } catch (e) {
      this.logger.warn(`recovery cooldown unavailable: ${(e as Error).message}`);
      return true;
    }
  }

  /** Forgot password — send a recovery OTP to the citizen's primary email or phone (and their city inbox). */
  async forgot(dto: ForgotDto): Promise<{ sent: true; delivery: 'live' | 'unconfigured'; channel: 'email' | 'sms' }> {
    const channel = dto.channel === 'sms' ? 'sms' : 'email';
    // System-wide fact (same for every request) — so the client can warn when
    // external delivery isn't wired instead of the code silently going nowhere.
    const delivery = this.mail.deliveryConfigured(channel) ? 'live' : 'unconfigured';
    // `channel` is the channel that was REQUESTED, echoed back — never the one
    // actually used. Those differ when SMS is asked for and the account has no
    // phone, and reporting the real one would answer "does this account have a
    // phone number?" for any address a stranger cares to type. The whole
    // response is identical for a hit and a miss; this field must not be the
    // thing that breaks that.
    const allowed = await this.mayRecover(dto.identifier);
    const user = allowed ? await this.findByIdentifier(dto.identifier) : null;
    /**
     * THE TWO BRANCHES HAVE TO COST THE SAME (fifth audit, 29 Aug).
     *
     * The response body was already identical for a hit and a miss, and
     * `auth.spec.ts` asserts it — but the bodies were the only thing being
     * compared. A hit did an updateMany, an argon2 hash, a create and an
     * AWAITED HTTP call to Resend; a miss returned after one findFirst. That
     * is hundreds of milliseconds to seconds of difference, on a public route,
     * which is a reliable answer to "is this address a member of this city"
     * for anybody willing to time it — and on a DATING product that answer is
     * not a small thing to give away.
     *
     * argon2 is the dominant cost and the only one worth matching; the dummy
     * runs with the same parameters as the real one, on a value that is
     * discarded. The provider call is deliberately NOT simulated — see below.
     */
    if (!user) {
      await argon2.hash(String(randomInt(0, 1_000_000)).padStart(6, '0'));
    }
    // Always respond the same way — never leak whether an account exists.
    if (user) {
      // Fall back to email if SMS was asked for but there's no phone on file.
      const sendChannel = dto.channel === 'sms' && user.phone ? 'sms' : 'email';
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      // Requesting a new code invalidates every outstanding one, so a code read
      // over someone's shoulder or left in an old inbox stops working the moment
      // the citizen asks for another.
      await this.prisma.passwordReset.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      // Stored hashed. This row used to hold the live code in plaintext, so
      // anyone who could read the table — a backup, a log, a stray query —
      // could take over any account that had ever asked for a reset.
      await this.prisma.passwordReset.create({
        data: { userId: user.id, code: await argon2.hash(code), expiresAt: new Date(Date.now() + 30 * 60 * 1000) },
      });
      /* THE BRANDED TEMPLATE, WHICH HAD BEEN SITTING UNUSED TWO FILES AWAY
         (fifth audit, 29 Aug). `recoveryOtpEmail` and `passwordChangedEmail`
         were written, reviewed and never imported by anything — grep returned
         only their own definitions — while the real security mail went out as
         plain text with a leading emoji in the subject line. Text-only with a
         decorated subject is a measurably weaker inbox-placement profile than
         the multipart message that was already built, and inbox placement is
         the whole job of a message somebody is waiting for.
         SMS keeps the one-liner: there is no html half of a text message. */
      const letter = recoveryOtpEmail(code, 30);
      const body = sendChannel === 'sms'
        ? `Together City recovery code: ${code}. Expires in 30 minutes. Didn't request it? Ignore this message.`
        : letter.text;
      // deliverTo, NOT deliverSystem. deliverSystem files a copy of every
      // message in the citizen's own in-app Together City inbox — which put the
      // password-reset code somewhere any holder of a session could read it,
      // and a reset code readable from inside a session is an escalation from
      // "borrowed a logged-in laptop" to "owns the account and can lock you
      // out". Same defect as the verification link removed alongside this.
      //
      // The "password was changed" notice below stays on deliverSystem: that is
      // correspondence, not a secret, and belongs in the inbox.
      const target = sendChannel === 'sms' ? user.phone : user.email;
      if (target) {
        // If this fails, the citizen was told "sent" and no code is coming.
        // That was invisible; now it is a [swallowed] line with their id.
        await swallow(this.mail.deliverTo(user.id, sendChannel, target,
          {
            // No emoji on a security subject: it is the line a spam filter and
            // a worried person both read first.
            subject: letter.subject,
            body,
            ...(sendChannel === 'email' ? { html: letter.html } : {}),
          }, 'recovery'),
          'recovery-code delivery', { userId: user.id, channel: sendChannel });
      }
    }
    return { sent: true, delivery, channel };
  }

  /** Reset password with the recovery code; emails a security confirmation. */
  async reset(dto: ResetDto): Promise<{ ok: true }> {
    // Enforce the SAME strength policy as registration — otherwise the reset
    // path is a backdoor to weak passwords the sign-up form would reject.
    assertStrongPassword(dto.newPassword);
    const user = await this.findByIdentifier(dto.identifier);
    if (!user) throw new UnauthorizedException('That code is invalid or has expired.');
    // The code is hashed, so it can't be looked up directly: take the newest
    // live code for this citizen and verify against it. Only one is ever live —
    // requesting a new one retires the rest.
    const reset = await this.prisma.passwordReset.findFirst({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    // One message for every failure mode — no code, wrong code, expired code,
    // burned code — so this never becomes an oracle for which accounts exist or
    // which of them have a reset in flight.
    const invalid = new UnauthorizedException('That code is invalid or has expired.');
    if (!reset) throw invalid;
    if (reset.attempts >= MAX_RESET_ATTEMPTS) {
      // Burn it rather than leave a half-guessed code alive for the full 30 min.
      await this.prisma.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } });
      throw invalid;
    }
    if (!(await argon2.verify(reset.code, dto.code).catch(() => false))) {
      await this.prisma.passwordReset.update({ where: { id: reset.id }, data: { attempts: { increment: 1 } } });
      throw invalid;
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: await argon2.hash(dto.newPassword) } });
    await this.prisma.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } });
    await this.tokens.revokeAll(user.id); // sign out everywhere after a reset
    const notice = passwordChangedEmail();
    await swallow(this.mail.deliverSystem(user.id, {
      subject: notice.subject, body: notice.text, html: notice.html,
    }, 'security'), 'password-changed notice', { userId: user.id });
    return { ok: true };
  }

  async login(dto: LoginDto, meta: SessionMeta = {}): Promise<TokenPair & { userId: string }> {
    if (await this.isLocked(dto.handle)) throw new UnauthorizedException('Invalid credentials');
    const user = await this.prisma.user.findUnique({ where: { handle: dto.handle } });
    if (!user || !(await argon2.verify(user.passwordHash, dto.password))) {
      await this.noteFailure(dto.handle);
      throw new UnauthorizedException('Invalid credentials');
    }
    // A deleted account can never be signed into again (same generic message,
    // so the endpoint doesn't reveal which handles once existed).
    if ((user as unknown as { deletedAt?: Date | null }).deletedAt) {
      throw new UnauthorizedException('Invalid credentials');
    }
    // A suspended account is refused at the door as well as at every request.
    // JwtStrategy already stops a token that exists; this stops a new one
    // being minted, which otherwise gives a suspended person a working refresh
    // token and a session that dies one request later — a confusing loop that
    // looks like a fault in the app rather than a decision about their account.
    //
    // The SAME generic message, deliberately. Telling an unauthenticated
    // caller "that account is suspended" answers "does this handle exist" and
    // "is this password right" for anybody typing handles into a form.
    if ((user as unknown as { suspendedAt?: Date | null }).suspendedAt) {
      throw new UnauthorizedException('Invalid credentials');
    }
    await this.clearFailures(dto.handle);
    const pair = await this.tokens.issuePair({ sub: user.id, handle: user.handle }, meta);
    return { ...pair, userId: user.id };
  }

  /**
   * Delete the signed-in citizen's account.
   *
   * SOFT delete + anonymisation, deliberately:
   *  - Other citizens' conversations reference this user (Message.sender has no
   *    cascade), so a hard delete would corrupt their chat history.
   *  - Everything that is purely this user's own public presence is removed
   *    outright (posts + media cascade, follows, social graph), so nothing of
   *    theirs keeps appearing around the city.
   *  - Remaining references are anonymised: the row survives only as
   *    "Deleted citizen" with no personal data attached.
   *
   * Requires the account password (re-authentication for a destructive action).
   * All sessions/refresh tokens are revoked, so every device is signed out.
   */
  /**
   * Delete the stored objects behind this citizen's posts.
   *
   * Best-effort by necessity — a bucket that refuses must not stop an account
   * deletion — but LOUD, and loud with the keys in the message. If this fails,
   * the rows are about to be deleted and the log line becomes the only record
   * of which files were left behind; a log that says "3 objects failed" and
   * not which ones is a log that cannot be acted on.
   *
   * Paged, because a prolific citizen's post history is not a bounded set and
   * this runs inside a request.
   *
   * ── AND IT USED TO BE ABLE TO STOP HALFWAY (31 Aug audit) ─────────────────
   *
   * This deleted one object per round trip, up to a hundred thousand of them,
   * inside the delete-account request. The ordering above — objects before
   * rows — is right and stays; what made it dangerous was that a proxy timeout
   * landed in the MIDDLE of it. The citizen got an error, kept their account,
   * and lost an arbitrary prefix of their photographs: the worst of the two
   * outcomes and the one nobody chose.
   *
   * Two changes, and they answer different halves of that.
   *
   *  · A PAGE IS ONE CALL. S3 takes a thousand keys per delete, so a page of
   *    five hundred rows is one round trip instead of a thousand. An ordinary
   *    account now finishes in one.
   *
   *  · A BUDGET, AND CROSSING IT DOES NOT ABORT THE DELETION. If the bucket
   *    work runs past `PURGE_BUDGET_MS` the remaining keys are named in the
   *    log and the account deletion CARRIES ON. The account going is the thing
   *    the citizen asked for and the thing that must not fail; an object left
   *    behind is an operator's problem with a written record. Stopping here
   *    would reproduce exactly the state this change exists to prevent.
   */
  /** How long the bucket may hold up a delete-account request. Chosen well
   *  inside a typical 30s proxy timeout, with the rest of the deletion — five
   *  deleteManys, a user update and a token revoke — still to run after it. */
  private static readonly PURGE_BUDGET_MS = 12_000;
  private async purgePostObjects(userId: string): Promise<void> {
    if (!this.storage) {
      this.logger.error(
        `deletion: no storage provider wired — post media for ${userId} was NOT removed from the bucket. `
        + 'The rows are about to be deleted, so these objects are now orphaned.',
      );
      return;
    }
    const storage = this.storage;
    const media = this.prisma as unknown as {
      postMedia: { findMany: (a: unknown) => Promise<Array<{ id: string; url: string; thumbUrl: string | null }>> };
    };
    const deadline = Date.now() + AuthService.PURGE_BUDGET_MS;
    let cursor: string | undefined;
    let removed = 0;
    const failed: string[] = [];
    let ranOut = false;
    for (let guard = 0; guard < 200; guard++) {
      const rows = await swallow(media.postMedia.findMany({
        where: { post: { authorId: userId } },
        select: { id: true, url: true, thumbUrl: true },
        orderBy: { id: 'asc' },
        take: 500,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }), 'deletion: read post media keys', { userId });
      if (!rows?.length) break;
      // Legacy inline `data:` photos and old public https URLs are not keys and
      // have nothing in the private bucket to remove.
      const keys = rows.flatMap((row) => [row.url, row.thumbUrl])
        .filter((k): k is string => Boolean(k) && storage.isPostKey(k as string));
      /* THE ANSWER IS READ, WHICH IT WAS NOT BEFORE. This was a try/catch
         around `deleteObject`, which caught its own error and returned void —
         so the catch could not run, `failed` was always empty, and every
         failure was counted in `removed`. A deletion that left a hundred
         photographs in the bucket logged "removed 100". */
      const out = await storage.deletePrivateObjects(keys);
      failed.push(...out.failed);
      removed += keys.length - out.failed.length;
      if (rows.length < 500) break;
      cursor = rows[rows.length - 1].id;
      if (Date.now() > deadline) { ranOut = true; break; }
    }
    if (ranOut) {
      this.logger.error(
        `deletion: ran out of time purging post objects for ${userId} after ${removed} — the rest are ORPHANED `
        + 'in the bucket. The account deletion continues; a stopped deletion would leave a live account with '
        + 'half its photographs gone, which is the worse of the two.',
      );
    }
    if (failed.length) {
      this.logger.error(
        `deletion: ${failed.length} post object(s) for ${userId} are ORPHANED in the bucket — ${failed.join(', ')}`,
      );
    } else if (removed) {
      this.logger.log(`deletion: removed ${removed} post object(s) for ${userId}`);
    }
  }

  async deleteAccount(userId: string, password: string): Promise<{ ok: true }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Account not found.');
    if ((user as unknown as { deletedAt?: Date | null }).deletedAt) return { ok: true }; // already gone — idempotent
    if (!password || !(await argon2.verify(user.passwordHash, password).catch(() => false))) {
      throw new UnauthorizedException('That password is incorrect.');
    }

    /**
     * ── 1) THE PHOTOGRAPHS GO BEFORE THE ROWS THAT NAME THEM ────────────────
     *
     * The comment that stood here read "Post media/likes/comments cascade from
     * Post", and every word of it is true about the DATABASE. It is silent
     * about the bucket, and the bucket is where the photographs are.
     *
     * `PostMedia` rows cascade; the objects those rows point at do not. So
     * every photograph and video a citizen ever posted to Social Life survived
     * their account deletion — and survived the thirty-day purge too, because
     * the purge plan classifies `Post` as already handled here and, by the
     * time it runs, the rows carrying the keys are long gone. Deleting the
     * posts DESTROYED THE ONLY RECORD OF WHICH OBJECTS TO DELETE, which is why
     * this cannot be left to the purge and has to happen at this line.
     *
     * The asymmetry is the tell: `SocialService.deletePost` has cleaned the
     * bucket since 30 Aug, so deleting ONE post removed its files and deleting
     * the WHOLE ACCOUNT did not. purge-plan.ts already has the sentence for
     * this, written for pet photographs three hundred lines from the rule that
     * missed it here: "a deleted account that leaves its pictures in a bucket
     * is not a deleted account."
     *
     * Order matters and is deliberate. The keys are read and the objects
     * deleted BEFORE the rows go, because after the rows go there is nothing
     * left to ask.
     */
    await this.purgePostObjects(userId);
    // A step that fails here leaves public presence live behind an account
    // that reports itself deleted — the log line is the only witness.
    await swallow(this.prisma.post.deleteMany({ where: { authorId: userId } }), 'deletion: posts', { userId });
    await swallow(this.prisma.follow.deleteMany({ where: { OR: [{ followerId: userId }, { followeeId: userId }] } }), 'deletion: follows', { userId });
    await swallow(this.prisma.connection.deleteMany({ where: { OR: [{ userOneId: userId }, { userTwoId: userId }] } }), 'deletion: connections', { userId });

    // 2) Anonymise the surviving row. The handle is released in a form that can
    //    never collide with a real one, and the password is replaced with an
    //    unusable value so the account cannot be signed into again.
    const tombstone = `deleted_${userId.replace(/-/g, '').slice(0, 12)}`;
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        deletedAt: new Date(),
        handle: tombstone,
        name: 'Deleted citizen',
        email: null,
        phone: null,
        profileImage: null,
        bio: null,
        city: null,
        website: null,
        emailVerified: false,
        emailVerifiedAt: null,
        onlineStatus: false,
        passwordHash: await argon2.hash(randomInt(1_000_000, 9_999_999).toString() + userId + Date.now()),
      },
    });

    // 3) Sign out everywhere — every refresh token/session is revoked.
    await swallow(this.tokens.revokeAll(userId), 'deletion: revoke all sessions', { userId });
    return { ok: true };
  }

  async refresh(refreshToken: string, meta: SessionMeta = {}): Promise<TokenPair> {
    try {
      return await this.tokens.rotate(refreshToken, meta);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  /** Log out THIS device only (revoke the presented refresh token). */
  async logout(refreshToken?: string): Promise<{ ok: true }> {
    if (refreshToken) await this.tokens.revokeOne(refreshToken);
    return { ok: true };
  }

  /** Log out of every device (also used after a password change). */
  async logoutAll(userId: string): Promise<{ ok: true }> {
    await this.tokens.revokeAll(userId);
    return { ok: true };
  }

  /** Log out of all OTHER devices, keeping the current session. */
  async logoutOthers(userId: string, currentRefreshToken?: string): Promise<{ ok: true }> {
    await this.tokens.revokeOthers(userId, currentRefreshToken);
    return { ok: true };
  }

  listSessions(userId: string, currentRefreshToken?: string) {
    return this.tokens.listSessions(userId, currentRefreshToken);
  }

  async revokeSession(userId: string, sessionId: string): Promise<{ ok: true }> {
    await this.tokens.revokeSession(userId, sessionId);
    return { ok: true };
  }
}
