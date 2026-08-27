import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { ENV_MANIFEST, presence, reportEnv } from './env-manifest';
import { FLAGS, FLAG_KEYS, NEVER_FLAGGABLE, VISIBILITY_FLAGS, VISIBILITY_KEYS, VISIBILITY_PREFIX,
  flagForPath, isFlagKey, isVisibilityKey } from './feature-flags';
import { devAccounts, devPassword, usingDefaultPassword } from './dev-password.guard';

const SRC = join(__dirname, '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

/**
 * A DIAGNOSTICS PAGE IS A LEAK WITH A FRIENDLY NAME, UNLESS SOMETHING STOPS IT.
 *
 * Half of what it reports on is credentials — the JWT signing secrets, the S3
 * keys, Twilio's auth token, the Anthropic key. The page is reached with a
 * SHARED password rather than a per-person grant, which means it has no
 * attribution and no revocation, which means the blast radius of it ever
 * printing a value is everybody who has ever been told the password.
 *
 * And the likely path is not an attack. It is somebody pasting "here's what my
 * dev page says" into a chat.
 */
describe('the developer page never says what anything is set to', () => {
  it('reduces every env read to a boolean, in one function', () => {
    const manifest = stripComments(read('dev/env-manifest.ts'));
    // The only place process.env is read in this module, and it is immediately
    // measured rather than returned.
    expect(manifest).toMatch(/return \(env\[name\] \?\? ''\)\.trim\(\)\.length > 0/);
    const reads = manifest.match(/env\[[^\]]+\]|process\.env\.\w+/g) ?? [];
    expect(reads.length).toBe(1);
  });

  it('carries no value out of any file in the module', () => {
    // A `process.env.X` anywhere in dev/ that is not compared, tested for
    // truthiness or reduced to a boolean is a value on its way to a screen.
    const ALLOWED = [
      // dev.service.ts: the deployment's own identity, published by the
      // platform. A commit sha and a branch name are not secrets, and a build
      // page that cannot say which build it is has missed the point.
      'RAILWAY_GIT_COMMIT_SHA', 'VERCEL_GIT_COMMIT_SHA',
      'RAILWAY_GIT_BRANCH', 'VERCEL_GIT_COMMIT_REF',
      'NODE_ENV',
      // dev-password.guard.ts: read to COMPARE against, never returned.
      'DEV_PAGE_PASSWORD',
    ];
    const offenders: string[] = [];
    for (const f of readdirSync(join(SRC, 'dev'))) {
      if (!f.endsWith('.ts') || f.endsWith('.spec.ts')) continue;
      const code = stripComments(read(join('dev', f)));
      for (const m of code.matchAll(/process\.env\.(\w+)/g)) {
        if (!ALLOWED.includes(m[1])) offenders.push(`${f} → ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('reports presence, and whitespace is not presence', () => {
    // A variable pasted with a trailing newline behaves as unset everywhere it
    // is read. Reporting it as set sends somebody looking in the wrong place.
    expect(presence('X', { X: 'value' })).toBe(true);
    expect(presence('X', { X: '   ' })).toBe(false);
    expect(presence('X', { X: '' })).toBe(false);
    expect(presence('X', {})).toBe(false);
  });

  it('returns booleans and prose, never a value, even when everything is set', () => {
    const env: NodeJS.ProcessEnv = {};
    for (const e of ENV_MANIFEST) env[e.name] = `SECRET-${e.name}`;
    const json = JSON.stringify(reportEnv(env));
    expect(json).not.toMatch(/SECRET-/);
  });
});

/**
 * THE OTHER HALF OF THE SAME RULE. The page shows COUNTS. The moment it shows a
 * row it becomes the citizen browser the admin console deliberately is not —
 * reachable with a password everybody shares instead of a grant that names one
 * person.
 */
describe('the developer page shows counts, not people', () => {
  const service = stripComments(read('dev/dev.service.ts'));

  it('reads no citizen rows at all', () => {
    // THE PAGE NOW SHOWS USER RECORDS, AND THIS RULE DID NOT MOVE.
    //
    // The Users tab was asked for and built, and every request it makes goes
    // to the ADMIN console's endpoints, which check users.read from the grants
    // table. Nothing about a person is served from this module.
    //
    // That is the difference the whole design turns on. The password opens the
    // PAGE; a per-person grant opens the PEOPLE. A leaked password shows
    // nobody, and "who looked at this citizen" has an answer, which "whoever
    // knew the password" never can. The moment this file grows its own user
    // query, both of those stop being true and nothing else would notice.
    expect(service).not.toMatch(/user\.findMany|user\.findUnique|user\.findFirst/);
    expect(service).toMatch(/user\.count/);
  });

  it('declares no route that serves a person', () => {
    // Route PATHS, not the whole file: the handlers take @CurrentUser to know
    // WHO IS ASKING, which is the opposite of serving somebody's record. The
    // first version of this matched the word "user" anywhere and flagged
    // exactly the parameter that makes the routes safe.
    const controller = stripComments(read('dev/dev.controller.ts'));
    const paths = [...controller.matchAll(/@(?:Get|Post|Patch|Put|Delete)\('([^']*)'\)/g)].map((m) => m[1]);
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      expect(path).not.toMatch(/citizen|user|people|account/i);
    }
  });

  it('reads no listing, message or health rows', () => {
    for (const t of ['message', 'conversation', 'serviceListing.findMany', 'bloodReport', 'mailMessage']) {
      expect(service).not.toMatch(new RegExp(t.replace('.', '\\.')));
    }
  });

  it('does not print the raw migrations table as an empty list when it could not read it', () => {
    // "No migrations have run" and "we could not read the migrations table" are
    // different problems, and a page that prints one when it means the other
    // sends somebody to rebuild a database that was fine.
    expect(service).toMatch(/recentMigrations: migrations\s*\?/);
    expect(service).toMatch(/:\s*null,/);
  });
});

/**
 * THE PASSWORD. Built as asked; the checks are about the shape around it.
 */
describe('the password', () => {
  it('is togethercity by default, and overridable without a code change', () => {
    expect(devPassword({})).toBe('togethercity');
    expect(devPassword({ DEV_PAGE_PASSWORD: 'something else' })).toBe('something else');
    // Whitespace is not an override — an env var set to a stray space would
    // otherwise make the password a space, silently.
    expect(devPassword({ DEV_PAGE_PASSWORD: '   ' })).toBe('togethercity');
  });

  it('knows when it is still the one that ships in the source', () => {
    expect(usingDefaultPassword({})).toBe(true);
    expect(usingDefaultPassword({ DEV_PAGE_PASSWORD: 'x' })).toBe(false);
    // and the page says so about itself
    expect(stripComments(read('dev/dev.service.ts'))).toMatch(/usingDefaultPassword: usingDefaultPassword\(\)/);
  });

  it('is compared in constant time, not with ===', () => {
    const guard = stripComments(read('dev/dev-password.guard.ts'));
    expect(guard).toMatch(/timingSafeEqualStr\(presented, devPassword\(\)\)/);
    expect(guard).not.toMatch(/presented\s*===/);
  });

  /**
   * ── AND THE THIRD LOCK: WHICH ACCOUNT (owner, 27 Aug) ──────────────────────
   *
   * "Let this dev page be reachable only through my account login and nobody
   * else." A shared password cannot answer WHO; an allowlist can, and it is
   * checked BEFORE the password so an account that may never open this page
   * does not get to spend the shared throttle making attempts.
   *
   * It fails CLOSED, which is the trade: with the variable unset nobody opens
   * the page at all, including whoever needed it to find out why. The
   * alternative — falling back to the old behaviour when unset — would mean one
   * forgotten variable silently reopens the page to every account that can
   * guess a password that lives in this repository. A recoverable lockout beats
   * a silent hole.
   */
  it('names the accounts that may open the page, and closes when none are named', () => {
    expect(devAccounts({ DEV_PAGE_ACCOUNTS: 'somen' })).toEqual(['somen']);
    // Trimmed, lower-cased, blanks dropped: a stray space after a comma is not
    // a lockout, and neither is a capital letter.
    expect(devAccounts({ DEV_PAGE_ACCOUNTS: ' Somen , usr_123 ,, ' })).toEqual(['somen', 'usr_123']);
    expect(devAccounts({})).toEqual([]);
    expect(devAccounts({ DEV_PAGE_ACCOUNTS: '   ' })).toEqual([]);

    const guard = stripComments(read('dev/dev-password.guard.ts'));
    // Empty list refuses. This is the fail-closed decision, in one line.
    expect(guard).toMatch(/if \(allowed\.length === 0\)[\s\S]{0,400}throw new ForbiddenException/);
    // Identity is compared before the password is even read.
    expect(guard.indexOf('allowed.includes')).toBeLessThan(guard.indexOf("x-dev-password"));
    // Handle OR id — the two fail differently and neither suits everyone.
    expect(guard).toMatch(/!allowed\.includes\(id\) && !allowed\.includes\(handle\)/);
  });

  /**
   * AND THE RESPONSE NEVER SAYS WHICH LOCK CLOSED. "Your password was right
   * but you are not on the list" hands an attacker half the answer. All three
   * refusals are one sentence; the LOG separates them, because whoever is
   * reading the log has already proved who they are.
   */
  it('refuses all three ways in the same words', () => {
    const guard = stripComments(read('dev/dev-password.guard.ts'));
    expect((guard.match(/throw new ForbiddenException\(REFUSAL\)/g) ?? []).length).toBe(3);
    expect(guard).not.toMatch(/ForbiddenException\('(?!.*REFUSAL)/);
    // The log, by contrast, is specific — including the variable to set.
    expect(guard).toMatch(/DEV_PAGE_ACCOUNTS is unset/);
    expect(guard).toMatch(/is not on DEV_PAGE_ACCOUNTS/);
  });

  it('is the SECOND lock — these routes are not public', () => {
    const controller = stripComments(read('dev/dev.controller.ts'));
    // The global JwtAuthGuard protects by default; @Public() would opt out.
    expect(controller).not.toMatch(/@Public\(\)/);
    expect(controller).toMatch(/@UseGuards\(DevPasswordGuard\)/);
  });

  it('is throttled far below the global limit', () => {
    // The API allows 120/min. A shared secret with 120 guesses a minute per
    // client is 170,000 guesses a day.
    const controller = stripComments(read('dev/dev.controller.ts'));
    const m = /@Throttle\(\{ default: \{ ttl: 60_000, limit: (\d+) \} \}\)/.exec(controller);
    expect(m).toBeTruthy();
    expect(Number(m![1])).toBeLessThanOrEqual(10);
  });

  it('never logs what was presented', () => {
    // A log line containing a wrong password contains somebody's right password
    // for something else about a third of the time.
    const guard = stripComments(read('dev/dev-password.guard.ts'));
    expect(guard).not.toMatch(/logger\.\w+\([^)]*presented/);
  });
});

/**
 * KILL SWITCHES. The dangerous property of a switch is not that it turns
 * something off — it is that it turns something off by accident, or that it
 * cannot be turned back on.
 */
describe('the kill switches', () => {
  it('are a fixed list — a typo cannot invent one', () => {
    expect(isFlagKey('dating')).toBe(true);
    expect(isFlagKey('datng')).toBe(false);
    expect(isFlagKey('')).toBe(false);
    expect(new Set(FLAG_KEYS).size).toBe(FLAG_KEYS.length);
  });

  it('cannot reach anything that would lock out the person holding the switch', () => {
    const gated = FLAGS.flatMap((f) => f.prefixes);
    for (const forbidden of NEVER_FLAGGABLE) {
      expect(gated).not.toContain(forbidden);
    }
  });

  /**
   * EVERY HUB ON THE CITIZEN'S GRID IS ACCOUNTED FOR (owner, 27 Aug: a
   * developer dashboard that "overrides all the controls of the website at
   * will").
   *
   * The dashboard draws one card per hub. A hub that is neither flaggable nor
   * declared un-flaggable simply would not appear — and an absent card reads
   * as "this one is always on", which is the most expensive kind of quiet.
   * So the fourteen hubs the citizen can switch off for themselves must each
   * be a KILL switch or a VISIBILITY switch here, and this fails the build if a
   * fifteenth is added without somebody deciding which kind it gets.
   *
   * The list is duplicated rather than imported because it lives in the web
   * app and this is the API. That duplication is the point: the day they
   * disagree, this test says so, which is what a copy is FOR when the two
   * sides cannot share a module.
   */
  it('accounts for every hub the citizen can switch, as one kind of switch or the other', () => {
    const DESIGNABLE = ['astrology', 'beauty', 'dating', 'ecommerce', 'entertainment',
      'financial', 'fitness', 'jobs', 'medical', 'nutrition', 'pets', 'realestate',
      'services', 'social'];
    // A sector needs a VISIBILITY switch — that is the control the owner asked
    // for, and it is the one that exists for every one of them. A kill switch
    // on top is a stronger, separate thing that not every sector can carry.
    const seen = new Set(VISIBILITY_KEYS);
    const orphans = DESIGNABLE.filter((k) => !seen.has(k));
    expect({ orphans }).toEqual({ orphans: [] });
    // And the kill switches remain a SUBSET, never the other way round: every
    // hub that can be closed can also be hidden.
    const hideable = new Set(VISIBILITY_KEYS);
    const closableHubs = FLAG_KEYS.filter((k) => DESIGNABLE.includes(k));
    expect(closableHubs.filter((k) => !hideable.has(k))).toEqual([]);
  });

  /**
   * ── A DOOR-HIDER MUST NEVER BE MISTAKEN FOR A KILL SWITCH ──────────────────
   *
   * Owner, 27 Aug: switches for E-Commerce visibility and for Mira that "just
   * turn off visibility from the user app or site".
   *
   * That is a different animal from everything in FLAGS, and rule 1 at the top
   * of feature-flags.ts is the reason it gets its own cage: a flag that only
   * hides a link is not a switch. The danger is not the feature, it is the
   * confusion — an operator reaching for a switch during an incident must never
   * get a door-hider while believing the hub is off.
   *
   * Four things keep them apart, and all four are asserted: separate list,
   * separate storage namespace, unreachable from the request gate, and never
   * accepted by the kill-switch key check.
   */
  it('keeps visibility switches out of the gate, in every direction', () => {
    // A sector now has BOTH kinds under one key — 'astrology' is a kill switch
    // and a visibility switch — so the key name is no longer what separates
    // them. The STORAGE key is, and that is what this asserts.
    for (const v of VISIBILITY_FLAGS) {
      expect(v.storeKey).toBe(`${VISIBILITY_PREFIX}${v.key}`);
      // Namespaced, so a row cannot be read as a kill switch under any name...
      expect(isFlagKey(v.storeKey)).toBe(false);
      // ...and no request path can ever route to it.
      expect(flagForPath(`/api/${v.storeKey}`)).toBeNull();
      expect(flagForPath(v.storeKey)).toBeNull();
      // It says what it does NOT do, which is the whole safety of it.
      expect(v.hides).toMatch(/keeps? answering|still works|still open|still reaches/i);
      expect(v.hides.length).toBeGreaterThan(60);
    }
    expect(VISIBILITY_KEYS).toContain('mira');
    expect(isVisibilityKey('dating')).toBe(true);
    expect(isVisibilityKey('nonsense')).toBe(false);
  });

  /**
   * AND THE WRITER IS TOLD WHICH KIND, NEVER LEFT TO GUESS.
   *
   * This is the sharp edge of sharing a key between the two. An earlier draft
   * routed on the key alone, which meant every sector's DOOR switch would have
   * been sent to the gate writer — closing hubs somebody only meant to hide,
   * silently, with an audit row saying the wrong thing.
   */
  it('routes a flip by the kind asked for, not by the shape of the key', () => {
    const svc = stripComments(read('dev/dev.service.ts'));
    expect(svc).toMatch(/kind: 'kill' \| 'visibility' = 'kill'/);
    expect(svc).toMatch(/if \(kind === 'visibility'\)/);
    // The default is the safer one to land on by accident: a sector left
    // answering is recoverable, a sector closed by a typo is an outage.
    const ctl = stripComments(read('dev/dev.controller.ts'));
    expect(ctl).toMatch(/kind: z\.enum\(\['kill', 'visibility'\]\)\.default\('kill'\)/);
    expect(ctl).toMatch(/dto\.kind\)/);
  });

  /**
   * MIRA IS A DOOR, NOT A MUZZLE, and that was a decision rather than a
   * limitation. `mira` is a live API prefix and gating it would work — the
   * owner asked for visibility, so `mira` is deliberately absent from FLAGS.
   * If she should ever stop ANSWERING as well as stop appearing, that is a
   * second switch and a considered choice; this fails if somebody makes it by
   * accident.
   */
  /**
   * MAIL AND CHAT GOT A DOOR SWITCH AND STAY UN-KILLABLE.
   *
   * The owner asked for them by name. They are the two sectors on the list
   * that carry correspondence between people, so the asymmetry is deliberate
   * and this pins both halves: hideable, never closeable.
   */
  it('can hide the inbox door, and can never close the inbox', () => {
    for (const key of ['mail', 'chat', 'personal']) {
      expect({ key, hideable: isVisibilityKey(key) }).toEqual({ key, hideable: true });
    }
    // Still un-killable, and the never-list still says so.
    for (const key of ['mail', 'chat', 'messages']) {
      expect(NEVER_FLAGGABLE).toContain(key);
      expect(FLAGS.flatMap((f) => f.prefixes)).not.toContain(key);
    }
    // The copy carries the warning that matters: a hidden inbox reads as
    // silence to the person waiting on a reply.
    const mail = VISIBILITY_FLAGS.find((f) => f.key === 'mail');
    expect(mail?.hides).toMatch(/keeps arriving and keeps sending/);
    expect(mail?.hides).toMatch(/silence/);
  });

  it('leaves Mira answering, because only her door was switched', () => {
    expect(FLAGS.flatMap((f) => f.prefixes)).not.toContain('mira');
    expect(flagForPath('/api/mira/say')).toBeNull();
    const mira = VISIBILITY_FLAGS.find((f) => f.key === 'mira');
    expect(mira?.hides).toMatch(/keeps answering/);
  });

  it('gives every switch something to switch, and every hider a reason', () => {
    for (const f of FLAGS) {
      expect({ key: f.key, prefixes: f.prefixes.length > 0 }).toEqual({ key: f.key, prefixes: true });
    }
    // Nothing on the request path may read the visibility list. The guard's
    // cache holds the rows; `canActivate` must never consult them.
    const guard = stripComments(read('dev/feature-flag.guard.ts'));
    const act = guard.slice(guard.indexOf('async canActivate'), guard.indexOf('invalidate()'));
    expect(act).not.toContain('VISIBILITY');
    expect(act).not.toContain('visibilitySnapshot');
  });

  /**
   * MEDICAL IS FLAGGABLE NOW, AND HEALTH STILL IS NOT.
   *
   * Moved off NEVER_FLAGGABLE on 27 Aug at the owner's explicit instruction,
   * asked and answered in those terms. This pins the two halves of that
   * decision so neither drifts: the hub CAN be switched off, and the check
   * endpoint that tells us the site is up cannot — nor can the four routes
   * without which nobody could switch it back on.
   */
  it('can reach the medical hub, and still cannot reach the way back in', () => {
    const medical = FLAGS.find((f) => f.key === 'medical');
    expect(medical?.prefixes).toEqual(['medical', 'medicines', 'prescriptions']);
    // The whole cost, spelled out — this string is the only thing between a
    // bad afternoon and somebody unable to read their own prescription.
    expect(medical?.turnsOff).toMatch(/prescriptions/);
    expect(medical?.turnsOff).toMatch(/every citizen/);
    for (const locked of ['auth', 'health', 'admin', 'dev', 'users']) {
      expect(NEVER_FLAGGABLE).toContain(locked);
    }
    expect(NEVER_FLAGGABLE).not.toContain('medical');
  });

  it('matches whole path segments, never a prefix of a word', () => {
    expect(flagForPath('/api/dating')?.key).toBe('dating');
    expect(flagForPath('/api/dating/matches')?.key).toBe('dating');
    expect(flagForPath('dating/matches')?.key).toBe('dating');
    // The bug this exists to stop: a startsWith() check gates a route that
    // merely begins with the same letters.
    expect(flagForPath('/api/datingsomethingelse')).toBeNull();
    expect(flagForPath('/api/auth/login')).toBeNull();
    expect(flagForPath('/api/health')).toBeNull();
    expect(flagForPath('')).toBeNull();
  });

  it('fails OPEN in every direction', () => {
    const guard = stripComments(read('dev/feature-flag.guard.ts'));
    // No row means on.
    expect(guard).toMatch(/this\.cache\.get\(flag\.key\) \?\? true/);
    // A path that matches no flag means on.
    expect(guard).toMatch(/if \(!flag\) return true/);
    // A non-HTTP context means on.
    expect(guard).toMatch(/if \(ctx\.getType\(\) !== 'http'\) return true/);
    // A failed read keeps the last known state rather than clearing to empty —
    // clearing would be correct only if empty meant off, and it means on.
    expect(guard).toMatch(/Keep whatever we had|this\.loadedAt = Date\.now\(\) - TTL_MS/);
    // And it never throws anything but the deliberate 503.
    expect(guard).toMatch(/ServiceUnavailableException/);
    expect(guard).not.toMatch(/ForbiddenException|NotFoundException/);
  });

  it('refuses with 503 and a Retry-After, not 403 or 404', () => {
    // 403 says "you are not allowed", which sends a citizen to support asking
    // what they did. 404 says the feature never existed and breaks a client
    // that cached its routes.
    const guard = stripComments(read('dev/feature-flag.guard.ts'));
    expect(guard).toMatch(/setHeader\?\.\('Retry-After'/);
  });

  it('flipping one is an audited action with a reason, not a password away', () => {
    // The password gets you the page. Turning a hub off for every citizen is a
    // change to the product and goes through the console's own door.
    const service = stripComments(read('dev/dev.service.ts'));
    expect(service).toMatch(/need: 'ops\.flags'/);
    expect(service).toMatch(/this\.access\.act\(/);
    expect(service).toMatch(/if \(!isFlagKey\(key\)\) throw new BadRequestException/);
  });

  it('takes effect immediately for the person who flipped it', () => {
    expect(stripComments(read('dev/dev.service.ts'))).toMatch(/this\.flagGuard\.invalidate\(\)/);
  });
});

/**
 * THE MANIFEST HAS TO KEEP UP WITH THE API, or the page's whole promise —
 * "this is what is configured" — quietly becomes "this is what somebody
 * remembered to list", which is the failure it was built to prevent.
 */
describe('the manifest covers what the API actually reads', () => {
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (p.endsWith('.ts') && !p.endsWith('.spec.ts')) out.push(p);
    }
    return out;
  };

  it('names every environment variable the API reads', () => {
    const listed = new Set(ENV_MANIFEST.map((e) => e.name));
    // Read from the platform, not configured by us — nothing to report.
    const PLATFORM = new Set(['PORT', 'RAILWAY_GIT_COMMIT_SHA', 'VERCEL_GIT_COMMIT_SHA', 'RAILWAY_GIT_BRANCH', 'VERCEL_GIT_COMMIT_REF']);
    const found = new Set<string>();
    for (const f of walk(SRC)) {
      for (const m of stripComments(readFileSync(f, 'utf8')).matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
        found.add(m[1]);
      }
    }
    const missing = [...found].filter((n) => !listed.has(n) && !PLATFORM.has(n)).sort();
    expect(missing).toEqual([]);
  });

  it('says what breaks for every one of them, in symptoms', () => {
    // The column that makes the page useful to somebody who does not already
    // know what the variable does. An empty one is a row that says nothing.
    for (const e of ENV_MANIFEST) {
      expect(e.purpose.length).toBeGreaterThan(15);
      expect(e.whenMissing.length).toBeGreaterThan(15);
    }
  });

  it('has no duplicate entries', () => {
    const names = ENV_MANIFEST.map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
