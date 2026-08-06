import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { ENV_MANIFEST, presence, reportEnv } from './env-manifest';
import { FLAGS, FLAG_KEYS, NEVER_FLAGGABLE, flagForPath, isFlagKey } from './feature-flags';
import { devPassword, usingDefaultPassword } from './dev-password.guard';

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
    expect(service).not.toMatch(/user\.findMany|user\.findUnique|user\.findFirst/);
    expect(service).toMatch(/user\.count/);
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
