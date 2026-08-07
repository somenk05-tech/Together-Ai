import { readFileSync } from 'fs';
import { join } from 'path';
import { CITIZEN_FIELDS, NEVER_IN_CONSOLE, maskEmail, maskPhone, toCitizenView, type CitizenRow, type CitizenView } from './citizen-view';
import { ALL_PERMISSIONS, MUST_AUDIT, can } from './permissions';

const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

const service = stripComments(src('admin/admin.service.ts'));
const view = stripComments(src('admin/citizen-view.ts'));

/** One row, shared by every unit check below. */
const BASE: CitizenRow = {
  id: 'u1', handle: 'asha', name: 'Asha', city: 'Mumbai', profileImage: null,
  createdAt: new Date('2026-01-01'), lastSeen: new Date('2026-08-01'),
  email: 'asha@gmail.com', emailVerified: true,
  phoneE164: '+919812345678', phoneVerifiedAt: new Date('2026-01-02'),
  deletedAt: null, purgedAt: null, suspendedAt: null, suspendedReason: null,
  role: 'citizen',
};

/**
 * THE 360° VIEW IS WHERE A CONSOLE TURNS INTO SURVEILLANCE.
 *
 * Not in one decision — by accretion. Somebody handling a support case needs
 * one more field, and one more, and eighteen months later a support account
 * can read a citizen's blood work because nobody ever wrote the line down.
 *
 * The line is citizen-view.ts. These are the checks that make it a line rather
 * than a comment: the console may not read a User column that is not on the
 * allow-list, it may not reach the citizen's private hubs at all, and the one
 * genuinely arguable field — contact details — is masked in the one place that
 * produces them, so no screen can render the real address by accident.
 */
describe('what the console may know about a person', () => {
  it('never selects a User column that is not on the allow-list', () => {
    // The first version of this demanded that every query use the shared
    // projection, and it was wrong in a way worth keeping: the suspension
    // pre-read selects three lifecycle columns and nothing else, which is
    // NARROWER than the allow-list, not a way around it. Insisting on the
    // shared projection would have pushed that query into reading fifteen
    // columns to satisfy a guard — a rule that makes the code read more.
    //
    // So the rule is the one the file actually states: a column the console
    // reads must be a column the console is allowed to read.
    const allowed = new Set<string>(CITIZEN_FIELDS as readonly string[]);
    const queries = [...service.matchAll(/prisma\.user\.(?:findMany|findUnique|findFirst)\(\{[\s\S]*?\}\)/g)]
      .map((m) => m[0]);
    expect(queries.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const q of queries) {
      if (/select:\s*this\.citizenSelect/.test(q)) continue;
      const inline = /select:\s*\{([^}]*)\}/.exec(q);
      if (!inline) {
        // No select at all means the whole row, which is the thing this guard
        // exists to stop.
        offenders.push('a User query with no select — that is every column');
        continue;
      }
      for (const [, col] of inline[1].matchAll(/(\w+)\s*:\s*true/g)) {
        if (!allowed.has(col)) offenders.push(col);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('keeps the forbidden columns out of the allow-list itself', () => {
    // Two lists that catch different mistakes: the one above catches a field
    // added to a query, this catches a field added to the allow-list.
    for (const banned of NEVER_IN_CONSOLE) {
      expect(CITIZEN_FIELDS as readonly string[]).not.toContain(banned);
    }
  });

  it('never reaches a citizen’s private hubs from the console at all', () => {
    // Refused once already, when the CRM asked to read chats. The health hubs
    // are the same argument and were never separately argued, so they are
    // named here rather than left to a principle.
    const FORBIDDEN_TABLES = [
      'message', 'conversation', 'conversationMember',
      'bloodReport', 'medicalProfile', 'prescription', 'foodPref', 'masterProfile',
      'beautyProfile', 'fitnessProfile', 'datingProfile',
      'mailMessage', 'driveFile', 'driveFolder',
    ];
    for (const t of FORBIDDEN_TABLES) {
      expect(service).not.toMatch(new RegExp(`prisma\\.${t}\\b`));
    }
  });

  it('masks contact details in the one place that produces them', () => {
    // If any screen could build its own, "masked" would be a property of that
    // screen rather than of the console.
    expect(view).toMatch(/email: unmask \? \(r\.email \?\? null\) : maskEmail\(r\.email\)/);
    expect(view).toMatch(/phone: unmask \? \(r\.phoneE164 \?\? null\) : maskPhone\(r\.phoneE164\)/);
    // and the raw columns never leave the service by any other route
    expect(service).not.toMatch(/\br\.email\b/);
    expect(service).not.toMatch(/phoneE164/);
  });

  it('masks when nobody asked, including when a caller forgets the option', () => {
    // `rows.map(toCitizenView)` passes the INDEX as the options object. It is
    // harmless because the default is false — and that is exactly why the
    // default has to be false rather than merely documented.
    const base = { ...BASE };
    expect(toCitizenView(base).email).toBe('a•••@gmail.com');
    expect(toCitizenView(base, {}).email).toBe('a•••@gmail.com');
    expect((toCitizenView as unknown as (r: CitizenRow, i: number) => CitizenView)(base, 3).email)
      .toBe('a•••@gmail.com');
    expect(toCitizenView(base).contactRevealed).toBe(false);
  });

  it('reveals only when asked AND permitted, and says so in the payload', () => {
    const revealed = toCitizenView({ ...BASE }, { unmask: true });
    expect(revealed.email).toBe('asha@gmail.com');
    expect(revealed.phone).toBe('+919812345678');
    // The screen has to be able to LOOK different when it is showing a real
    // address. One that renders a mask and a real address identically is one
    // that gets screenshotted.
    expect(revealed.contactRevealed).toBe(true);
  });
});

/**
 * UNMASKING IS A CAPABILITY, NOT A VIEW.
 *
 * The first version of citizen-view.ts said that if unmasking were ever needed
 * it would get its own permission and its own audit entry rather than being
 * folded into users.read. It was needed. These are the checks that make that
 * sentence true rather than a thing somebody wrote once.
 */
describe('revealing a real email and phone number', () => {
  it('has its own permission, held by nobody from admin downwards', () => {
    expect(ALL_PERMISSIONS).toContain('users.contact');
    for (const role of ['admin', 'operations', 'support', 'finance', 'moderator',
      'marketing', 'engineering', 'business_success'] as const) {
      expect(can([role], 'users.contact')).toBe(false);
      // …while the everyday permission stays where it was, so this did not
      // quietly take anything away from a support agent.
      // marketing, engineering and business_success never held users.read —
      // this change did not take it from them, and the list says which.
      if (!['marketing', 'engineering', 'business_success'].includes(role)) {
        expect(can([role], 'users.read')).toBe(true);
      }
    }
    expect(can(['founder'], 'users.contact')).toBe(true);
    expect(can(['superadmin'], 'users.contact')).toBe(true);
  });

  it('is the one READ that must be audited', () => {
    // Every other entry on MUST_AUDIT changes something. This one does not,
    // and it is on the list because a contact detail leaving the system in a
    // usable form is not a page view.
    expect(MUST_AUDIT).toContain('users.contact');
  });

  it('checks the permission and records BEFORE it unmasks', () => {
    expect(service).toMatch(/const allowed = await this\.access\.holds\(userId, 'users\.contact'\)/);
    expect(service).toMatch(/action: 'user\.contact\.reveal'/);
    // Order matters: record, then set the flag. A reveal that happened without
    // a row is the thing the row exists to prevent.
    const at = (re: RegExp) => service.search(re);
    expect(at(/user\.contact\.reveal/)).toBeLessThan(at(/unmask = true/));
  });

  it('does not 403 a caller who asks without holding it', () => {
    // Refusing would turn the option into a probe for who holds what. They
    // get the masked record, which is what they were entitled to anyway.
    expect(service).toMatch(/if \(allowed\) \{/);
    expect(service).not.toMatch(/assert\(userId, 'users\.contact'\)/);
  });
});

/**
 * THE EXPORT. A CSV is the one artefact that reliably outlives the decision to
 * make it — Downloads folder, email attachment, still there in two years.
 */
describe('the whole-list export', () => {
  it('never unmasks, whatever the caller holds', () => {
    // Unmasking one record on screen is a considered act. Unmasking the whole
    // table into a spreadsheet is a different thing, and it is not offered.
    expect(service).toMatch(/const v = toCitizenView\(r\);/);
    expect(service).toMatch(/contactMasked: true/);
  });

  it('is audited, like the reveal and unlike every other read', () => {
    expect(service).toMatch(/action: 'users\.export'/);
  });

  it('defuses spreadsheet formulas in citizen-chosen text', () => {
    // A handle of "=cmd|..." is a real attack on whoever opens the file, and
    // the citizen chose the handle.
    expect(service).toMatch(/\/\^\[=\+\\-@\\t\\r\]\//);
  });
});

/**
 * ACTIVITY. The distance between "has a medical record" and "has hypertension"
 * is the whole distance between an admin tool and a health data breach.
 */
describe('which hubs an account uses', () => {
  it('counts, and never reads a row', () => {
    const activity = service.slice(service.indexOf('async activity('), service.indexOf('async citizensCsv('));
    expect(activity.length).toBeGreaterThan(200);
    expect(activity).not.toMatch(/findMany|findFirst/);
    // findUnique appears once, to check the account exists, and selects only id.
    expect(activity).toMatch(/findUnique\(\{ where: \{ id: targetId \}, select: \{ id: true \} \}\)/);
  });

  it('reports the health hubs as presence, not contents', () => {
    const activity = service.slice(service.indexOf('async activity('), service.indexOf('async citizensCsv('));
    for (const hub of ['dating', 'beauty', 'fitness', 'medical', 'astrology']) {
      expect(activity).toMatch(new RegExp(`${hub}: \\w+ > 0`));
    }
  });

  it('does not put IP addresses on a screen', () => {
    // They are recorded on RefreshToken so a compromised account can be traced
    // by somebody with database access. A console list of them is a map of
    // where colleagues live.
    const activity = service.slice(service.indexOf('async activity('), service.indexOf('async citizensCsv('));
    expect(activity).not.toMatch(/\bip\b/i);
  });

  it('masks enough to recognise and not enough to contact', () => {
    expect(maskEmail('somen@gmail.com')).toBe('s••••@gmail.com');
    // Two accounts at the same provider stay distinguishable — the whole
    // reason the field exists at all.
    expect(maskEmail('asha@gmail.com')).not.toBe(maskEmail('ravi@gmail.com'));
    expect(maskEmail(null)).toBeNull();
    expect(maskEmail('nonsense')).toBe('•••');
    // A long local part does not leak its length.
    expect(maskEmail('averyverylongaddress@x.com')).toBe('a••••••@x.com');
    expect(maskPhone('+919812345678')).toBe('+91•••78');
    expect(maskPhone(null)).toBeNull();
  });
});

describe('an account’s status is one word, decided in one place', () => {
  const base = BASE;

  it('shows the LAST thing that happened, not the first one that matched', () => {
    // An account suspended and then closed is both; a purged account is also
    // deleted. Reading the ladder in the wrong order would report a suspension
    // months after the data was destroyed.
    expect(toCitizenView(base).status).toBe('live');
    expect(toCitizenView({ ...base, suspendedAt: new Date() }).status).toBe('suspended');
    expect(toCitizenView({ ...base, suspendedAt: new Date(), deletedAt: new Date() }).status).toBe('deleted');
    expect(toCitizenView({ ...base, suspendedAt: new Date(), deletedAt: new Date(), purgedAt: new Date() }).status).toBe('purged');
  });
});

/**
 * A SUSPENSION THAT DOES NOT SUSPEND IS WORSE THAN NO BUTTON.
 *
 * The button would look like it worked, the audit row would say it happened,
 * and the account would keep posting. So both doors are checked: the token
 * already in a browser, and the request for a new one.
 */
describe('a suspension actually bites', () => {
  it('is refused on every request, from the row rather than the token', () => {
    const s = stripComments(src('auth/jwt.strategy.ts'));
    expect(s).toMatch(/suspendedAt: true/);
    expect(s).toMatch(/if \(user\.suspendedAt\) throw new UnauthorizedException/);
  });

  it('is refused at sign-in, with the same message an unknown handle gets', () => {
    const s = stripComments(src('auth/auth.service.ts'));
    expect(s).toMatch(/suspendedAt\b[\s\S]{0,120}throw new UnauthorizedException\('Invalid credentials'\)/);
  });

  it('does not touch the citizen’s own session controls', () => {
    // sessionsRevokedAt belongs to password resets and "sign out everywhere".
    // An admin writing to it puts a moderation action in a field the citizen's
    // own security features read.
    expect(service).not.toMatch(/sessionsRevokedAt/);
  });

  it('cannot happen without a written reason, through act()', () => {
    expect(service).toMatch(/action: suspended \? 'user\.suspend' : 'user\.restore'/);
    expect(service).toMatch(/need: 'users\.suspend'/);
    // act() refuses an empty reason and records BEFORE it runs.
    expect(service).toMatch(/return this\.access\.act\(\{[\s\S]{0,400}need: 'users\.suspend'/);
  });
});

/**
 * THE FIRST ADMIN.
 *
 * The grants table starts empty and only a route needing `admin.grant` can
 * write to it, so without this the console cannot be opened by anybody. The
 * risk in the unlock is that it becomes a permanent side door.
 */
describe('the bootstrap', () => {
  const boot = stripComments(src('admin/console-bootstrap.ts'));

  it('takes its list from the environment, like the moderator role already does', () => {
    expect(boot).toMatch(/process\.env\.CONSOLE_FOUNDERS/);
  });

  it('is idempotent — a live grant means nothing happens', () => {
    expect(boot).toMatch(/adminGrant\.findFirst\(\{[\s\S]{0,160}revokedAt: null/);
    expect(boot).toMatch(/if \(existing === undefined \|\| existing\) continue/);
  });

  it('writes the grant and its audit row together, or neither', () => {
    // A founder who appears in the grants table with no trace of where they
    // came from is the one grant nobody can account for.
    expect(boot).toMatch(/\$transaction\(\[/);
    expect(boot).toMatch(/adminGrant\.create/);
    expect(boot).toMatch(/adminAudit\.create/);
  });

  it('never revokes — that is a decision a person takes in the console', () => {
    expect(boot).not.toMatch(/revokedAt: new Date\(\)/);
    expect(boot).not.toMatch(/adminGrant\.delete|adminGrant\.updateMany/);
  });

  it('says so loudly when a handle in the variable matches no account', () => {
    // The single most likely mistake, and without this its only symptom is
    // "the console still says forbidden" with nothing in the logs.
    expect(boot).toMatch(/logger\.warn\(/);
    expect(boot).toMatch(/no account has that handle/);
  });
});
