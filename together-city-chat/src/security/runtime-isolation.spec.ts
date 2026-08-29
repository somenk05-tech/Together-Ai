/**
 * The guard that runs the app.
 *
 * Next door, two specs read the source: one freezes which routes answer without
 * a token, the other finds Prisma queries that never name an owner. Both are
 * worth having and both share a blindness — they reason about code, and code
 * that reads correctly can still behave wrongly. A findFirst scoped by userId
 * followed by an update that trusts the id; a guard applied to the controller
 * but bypassed by a service another controller calls; an ownership check that
 * throws on a value the route never actually receives. None of that shows up in
 * a regex.
 *
 * So this one boots the real application against a real database, registers two
 * citizens who have nothing to do with each other, has the first create things,
 * and has the second try to read, change and delete every one of them by id.
 *
 * It needs a Postgres it is allowed to write to, which CI has and a laptop
 * usually does not, so the live half runs only when TEST_DATABASE_URL is set:
 *
 *     TEST_DATABASE_URL=postgres://…/together_city_test npm test
 *
 * A suite that quietly skips is a suite that reports green while checking
 * nothing, so the structural half below ALWAYS runs. It proves the probe list
 * is well-formed and — the part that matters — that every controller with an
 * id-taking route is either probed here or listed as knowingly unprobed. Adding
 * a hub with a `:id` route fails this until somebody decides which it is.
 */
import { allRoutes } from './route-inventory';
import { RegisterSchema } from '../auth/dto/auth.dto';
import { swallow } from '../shared/swallow';

const TEST_DB = process.env.TEST_DATABASE_URL;
const LIVE = Boolean(TEST_DB);

// The config module reads DATABASE_URL at import time, so this must happen
// before AppModule is pulled in below.
if (LIVE) process.env.DATABASE_URL = TEST_DB;

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

interface Attempt {
  method: Method;
  path: string;
  body?: unknown;
}

interface Probe {
  /** Controller prefix, matched against the route inventory. */
  hub: string;
  /** What the first citizen makes. */
  create: { path: string; body: unknown };
  /** Where it shows up. The check is deliberately crude — does the other
   *  citizen's payload contain this id ANYWHERE — because that is the actual
   *  question, and it survives every response shape. */
  list: string;
  /** Everything the second citizen will try, none of which may succeed. */
  attempts: (id: string) => Attempt[];
}

const PROBES: Probe[] = [
  {
    hub: 'thoughts',
    create: { path: '/api/thoughts', body: { body: 'Something I would not want read.' } },
    list: '/api/thoughts',
    attempts: (id) => [
      { method: 'GET', path: `/api/thoughts/${id}` },
      { method: 'PATCH', path: `/api/thoughts/${id}`, body: { body: 'edited by a stranger' } },
      { method: 'DELETE', path: `/api/thoughts/${id}` },
    ],
  },
  {
    hub: 'avatars',
    create: { path: '/api/avatars', body: { hairStyle: 'curly', background: 'forest' } },
    list: '/api/avatars',
    attempts: (id) => [
      { method: 'GET', path: `/api/avatars/${id}` },
      { method: 'GET', path: `/api/avatars/${id}/asset` },
      { method: 'POST', path: `/api/avatars/${id}/select`, body: {} },
      { method: 'DELETE', path: `/api/avatars/${id}` },
    ],
  },
  {
    /**
     * Local Services is probeable in a way most hubs are not: a bare account can
     * put up a business page in one call, with no upload, no second party and no
     * external key. So it gets a real probe rather than a line on the UNPROBED
     * list — the hub whose whole promise is "the other side does not know who you
     * are" should be the last one taken on trust.
     *
     * GET /services/:id is deliberately NOT attempted. The directory is public by
     * design; a stranger reading a listing is the feature. What must not work is
     * a stranger EDITING or CLOSING one.
     */
    hub: 'services',
    create: {
      path: '/api/services',
      body: { businessName: 'Sharma Plumbing', categoryKey: 'plumbers', city: 'Mumbai', areas: 'Bandra' },
    },
    list: '/api/services/mine',
    attempts: (id) => [
      { method: 'PATCH', path: `/api/services/${id}`, body: { businessName: 'mine now' } },
      { method: 'DELETE', path: `/api/services/${id}` },
      { method: 'DELETE', path: `/api/services/${id}/forever` },
    ],
  },
  {
    /**
     * The pets book is probeable for the same reason Local Services is: a bare
     * account can put an animal in it in one call, with no upload, no second
     * party and no provider key. So it gets a real probe rather than a line on
     * the UNPROBED list.
     *
     * The two photo routes (POST /pets/photos/:photoId/first, DELETE
     * /pets/photos/:photoId) are NOT attempted — a photo id cannot exist until
     * something has been PUT into the vault, which this harness cannot do. They
     * are scoped by findFirst({ id: photoId, userId }) in pets.service.ts:296
     * and :313 and covered by a-pet-is-a-citizens-record.spec.ts.
     */
    hub: 'pets',
    create: { path: '/api/pets', body: { name: 'Bruno', species: 'dog' } },
    list: '/api/pets',
    attempts: (id) => [
      { method: 'GET', path: `/api/pets/${id}` },
      { method: 'PATCH', path: `/api/pets/${id}`, body: { name: 'mine now' } },
      { method: 'DELETE', path: `/api/pets/${id}` },
      // The pet is looked up before the key is, so a stranger never reaches
      // the vault check at all — which is the refusal being asserted.
      { method: 'POST', path: `/api/pets/${id}/photos`, body: { fileKey: 'pets/somebody-else/x.jpg' } },
    ],
  },
  {
    hub: 'drive',
    create: { path: '/api/drive/folders', body: { name: 'Private papers' } },
    list: '/api/drive',
    attempts: (id) => [
      { method: 'PATCH', path: `/api/drive/folders/${id}`, body: { name: 'mine now' } },
      { method: 'DELETE', path: `/api/drive/folders/${id}` },
    ],
  },
];

/**
 * Controllers with an id-taking route that this harness does NOT drive, and why.
 *
 * Being on this list is a claim somebody made, not an oversight — which is the
 * only reason a list like this is worth keeping. The honest summary of most of
 * these is "the resource cannot be created from a bare account without external
 * state", which is a reason to extend the harness later, not a reason the route
 * is safe. The static query-scoping guard next door still covers them.
 */
const UNPROBED = [
  // Public catalogues by design — everyone is meant to read every row.
  'entertainment', 'lookups', 'travel', 'city', 'realestate', 'jobs',
  // Need a second party, a match, or a connection before anything exists.
  'connections', 'conversations', 'messages', 'chat', 'dating', 'social', 'calls',
  // Need an uploaded file, an external key, or a paid provider to create.
  'medical', 'prescriptions', 'media', 'mail', 'beauty', 'nutrition',
  // Mira's only id-taking route is DELETE /mira/knows/:id, and a fact cannot
  // be created from a bare account: facts are written by a SECOND model call
  // made after a conversation turn (mira.service.ts:1594 onward), so there is
  // nothing to delete without a provider key. The delete itself is a
  // deleteMany({ id, userId }) (mira.service.ts:1589) — and note that the
  // static guard next door CANNOT see it, because MiraFact is reached through
  // a cast rather than a named delegate (mira.service.ts:1545). This line is
  // the only place that says so.
  'mira',
  // The food journal reads and writes the caller's own entries only; there is
  // no other citizen's id to pass it. Landed 4 Aug and never listed here.
  'nutrition/journal',
  // The daybook DOES take another citizen's id — PATCH and DELETE
  // /daybook/items/:id and DELETE /daybook/photos/:id — so it is here for a
  // narrower reason than the rest: this harness cannot drive it. Every daybook
  // write answers with the whole day page rather than the row it just made, so
  // `create` yields no id for the second citizen to try, and a probe that
  // cannot create proves nothing. The refusal is proven instead in
  // the-daybook.spec.ts:172 ("another citizen cannot tick, edit or delete your
  // line — the id is not a key"), and all three writes now name the owner in
  // the WHERE rather than only in the findFirst above them
  // (daybook.service.ts:207, 284, 292). Giving those routes a create that
  // returns an id would make this hub probeable, and is worth doing.
  'daybook',
  // Operate on the caller's own record only — there is no other citizen's id to pass.
  'auth', 'users', 'profile', 'privacy', 'notifications', 'push', 'health', 'hub',
  'astrology', 'financial', 'fitness', 'ai', 'admin', '',
  // The Till. Every id-taking route here needs a resource that cannot exist
  // from a bare account: an invoice requires a listing, a citizen who has
  // opened a thread with it, AND that citizen having revealed their name.
  // Extending the harness to build that chain is worth doing and is not this
  // commit; until then the static guard next door covers it, every route is
  // scoped by userId or ownerId in the query itself, and commerce/access.spec.ts
  // drives the same refusals against a stubbed service.
  'pay',
].sort();

// ── structural checks: these run whether or not a database is present ────

/**
 * THE BODY `register()` POSTS, at module scope so the always-on half of this
 * file can check it against the real schema without a database.
 *
 * This is the fix for how the harness broke: `RegisterSchema` gained
 * `dateOfBirth` and `gender`, this fixture kept sending the old three fields,
 * and nothing noticed for a fortnight — the live half skips without
 * TEST_DATABASE_URL, so it never runs on a laptop, and CI died at
 * `prisma migrate deploy` from 14 Aug until 68942d2a. A guard that runs in
 * exactly one place is only as reliable as that place, so the CHEAP half of it
 * now runs everywhere.
 *
 * A fixed adult date, not `now - 25 years`: a fixture that computes its own age
 * passes on a machine whose clock is wrong, and this suite's whole value is
 * that it argues with the real endpoint rather than agreeing with itself.
 */
const registrationBody = (handle: string, label: string) => ({
  handle,
  name: `Isolation ${label}`,
  email: `${handle}@isolation.test`,
  // Must satisfy the real policy (recovery.service.ts assertStrongPassword):
  // 12+ chars, upper, lower, digit, symbol. The first CI run failed here,
  // which is the harness working — it went through the actual endpoint and
  // got the actual validator rather than a mock that would have agreed.
  password: 'Correct-Horse-Battery-9!',
  dateOfBirth: '1995-06-15',
  gender: 'female' as const,
});

describe('the cross-user harness itself', () => {
  const idRouteHubs = [...new Set(
    allRoutes()
      .filter((r) => r.takesRouteParam && !r.isPublic)
      .map((r) => r.prefix),
  )].sort();

  /**
   * Parsed by the SAME schema the endpoint uses, so a field added to
   * registration fails here — on every machine, in a second — instead of
   * waiting for the one environment that has a database.
   */
  it('sends a registration the real schema accepts', () => {
    const parsed = RegisterSchema.safeParse(registrationBody('iso_alice_test', 'alice'));
    expect(parsed.success ? [] : parsed.error.issues.map((i) => i.path.join('.'))).toEqual([]);
  });

  it('probes hubs that actually exist', () => {
    const known = new Set(allRoutes().map((r) => r.prefix));
    for (const p of PROBES) expect(known.has(p.hub)).toBe(true);
  });

  it('accounts for every controller that takes an id from the caller', () => {
    // If this fails, a new hub takes ids from requests and nobody has said
    // whether the runtime harness covers it. Add a probe, or add it to UNPROBED
    // with a reason. Do not delete this test.
    const accounted = new Set([...PROBES.map((p) => p.hub), ...UNPROBED]);
    const unaccounted = idRouteHubs.filter((h) => !accounted.has(h));
    expect(unaccounted).toEqual([]);
  });

  it('does not list a hub as unprobed while also probing it', () => {
    const probed = new Set(PROBES.map((p) => p.hub));
    expect(UNPROBED.filter((h) => probed.has(h))).toEqual([]);
  });

  it('says out loud when the live half did not run', () => {
    // Not an assertion about the app — an assertion that nobody reads a green
    // run as proof of something this skipped.
    if (!LIVE) {
      // eslint-disable-next-line no-console
      console.warn(
        '\n  cross-user isolation: SKIPPED (no TEST_DATABASE_URL).' +
          '\n  The static guards ran; nothing was proven against a live database.\n',
      );
    }
    expect(typeof LIVE).toBe('boolean');
  });
});

// ── the live half ────────────────────────────────────────

const describeLive = LIVE ? describe : describe.skip;

describeLive('one citizen cannot touch another citizen’s rows', () => {
  jest.setTimeout(180_000);

  interface Citizen { token: string; id: string; handle: string }

  let app: { close(): Promise<void>; getUrl(): Promise<string> } | null = null;
  let base = '';
  let alice: Citizen;
  let mallory: Citizen;

  const call = async (
    token: string | null,
    method: Method,
    path: string,
    body?: unknown,
  ): Promise<{ status: number; text: string }> => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: res.status, text: await res.text() };
  };

  const register = async (label: string): Promise<Citizen> => {
    const stamp = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
    const handle = `iso_${label}_${stamp}`.slice(0, 30);
    const res = await call(null, 'POST', '/api/auth/register', registrationBody(handle, label));
    if (res.status >= 300) throw new Error(`could not register ${label}: ${res.status} ${res.text}`);
    const { accessToken } = JSON.parse(res.text) as { accessToken: string };

    // The id comes from asking the API who this token belongs to, rather than
    // from reading the registration payload. Twice now this harness has been
    // wrong about a response shape it guessed at, and there is no reason to
    // guess: /users/me is the canonical answer and cannot drift out of step
    // with itself. It also proves the freshly-issued token actually works
    // before any of the isolation probes rely on it.
    const me = await call(accessToken, 'GET', '/api/users/me');
    if (me.status >= 300) throw new Error(`could not read /users/me for ${label}: ${me.status} ${me.text}`);
    const { id } = JSON.parse(me.text) as { id: string };
    if (!id) throw new Error(`/users/me returned no id for ${label}: ${me.text}`);
    return { token: accessToken, id, handle };
  };

  beforeAll(async () => {
    /* eslint-disable @typescript-eslint/no-var-requires */
    const { Test } = require('@nestjs/testing');
    const { ValidationPipe } = require('@nestjs/common');
    const { AppModule } = require('../app.module');
    const { AllExceptionsFilter } = require('../shared/filters/all-exceptions.filter');
    /* eslint-enable @typescript-eslint/no-var-requires */

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const instance = moduleRef.createNestApplication();
    // The same global setup main.ts applies. A harness that boots the app
    // differently from production is testing a different app.
    instance.setGlobalPrefix('api');
    instance.useGlobalFilters(new AllExceptionsFilter());
    instance.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await instance.init();
    await instance.listen(0);
    app = instance;
    base = (await instance.getUrl()).replace('[::1]', '127.0.0.1');

    alice = await register('alice');
    mallory = await register('mallory');
  });

  afterAll(async () => {
    // Best-effort: leave the test database as we found it.
    for (const who of [alice, mallory]) {
      if (who?.token) await swallow(call(who.token, 'POST', '/api/auth/delete-account', {}), 'runtime-isolation: teardown delete-account');
    }
    await app?.close();
  });

  it('registered two unrelated citizens', () => {
    expect(alice.id).toBeTruthy();
    expect(mallory.id).toBeTruthy();
    expect(alice.id).not.toBe(mallory.id);
  });

  describe.each(PROBES.map((p) => [p.hub, p] as const))('%s', (hub, probe) => {
    let id = '';

    it('the first citizen can create and see it (control)', async () => {
      const made = await call(alice.token, 'POST', probe.create.path, probe.create.body);
      // A probe that cannot create is a probe proving nothing. Fix the body;
      // do not delete the probe.
      expect(`${hub} create → ${made.status} ${made.text.slice(0, 200)}`).toContain(`${hub} create → 20`);
      const json = JSON.parse(made.text) as { id?: string };
      id = json.id ?? '';
      expect(id).toBeTruthy();

      const list = await call(alice.token, 'GET', probe.list);
      expect(list.status).toBeLessThan(300);
      expect(list.text).toContain(id);
    });

    it('the second citizen is refused every way in', async () => {
      const refusals: string[] = [];
      for (const attempt of probe.attempts(id)) {
        const res = await call(mallory.token, attempt.method, attempt.path, attempt.body);
        refusals.push(`${attempt.method} ${attempt.path} → ${res.status}`);
        // 403 and 404 are both correct answers, and which one is a product
        // decision (404 refuses to confirm an id exists). 2xx never is.
        expect(res.status).toBeGreaterThanOrEqual(400);
      }
      expect(refusals.length).toBeGreaterThan(0);
    });

    it('the second citizen’s own listing does not mention it', async () => {
      const list = await call(mallory.token, 'GET', probe.list);
      expect(list.status).toBeLessThan(300);
      expect(list.text).not.toContain(id);
    });

    it('and it is still there afterwards, so nothing was quietly destroyed', async () => {
      // Without this, a DELETE that returned 403 but deleted anyway would pass
      // every assertion above.
      const list = await call(alice.token, 'GET', probe.list);
      expect(list.text).toContain(id);
    });
  });

  it('refuses everything without a token at all', async () => {
    for (const probe of PROBES) {
      const res = await call(null, 'GET', probe.list);
      expect(res.status).toBe(401);
    }
  });
});
