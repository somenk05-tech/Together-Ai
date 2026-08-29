import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ── PUSH, AS SHIPPED, DELIVERED NOTHING (fifth audit, 29 Aug) ──────────────
 *
 * Four things, and the first one made the other three invisible.
 *
 *  1 · VAPID appeared NOWHERE — not in render.yaml, not in .env.example, not
 *      in assertProductionConfig. Web push is the whole of push on this
 *      deployment (`push-reaches-a-browser.spec.ts`: "the FCM list is always
 *      empty"), so a deploy straight from the repo pushed to nobody. The
 *      provider logs one line at boot, every send() returns early, and
 *      /push/vapid-public-key answers with an empty string that the browser
 *      treats as "no push here". Nothing failed.
 *  2 · `POST /users/device-token` upserted on the token ALONE, so anybody
 *      holding another citizen's subscription string could re-point it at
 *      their own account. Forty lines away, push.controller guards exactly
 *      this and says why.
 *  3 · Every bell push went out with an empty conversationId, which the
 *      service worker collapsed into one shared tag — so a match alert and a
 *      like alert arriving together left one of them.
 *  4 · And a dating message push carried no url, so the worker fell back to
 *      the CITY chats route: the one list dating threads are stripped from.
 */
const API = join(__dirname, '..', '..');
const WEB = join(API, '..', 'together-city-react');
const read = (p: string) => readFileSync(p, 'utf8');

describe('a deploy that forgets its keys is told so', () => {
  /**
   * ── THE FILE THAT DEPLOYS NOWHERE (re-audit, 29 Aug) ─────────────────────
   *
   * The first version of this block asserted `render.yaml` and stopped. That
   * file's own header says, in capitals, that it is the Render FALLBACK and
   * that the live API runs on Railway — "adding a variable HERE sets it
   * nowhere: the runbook's environment-variable reference is what a real
   * deploy is read from, and every variable added here must be added there
   * too." So the suite went green on a change that had not reached
   * production: push was still off on the live deployment.
   *
   * The runbook is asserted FIRST now, because it is the one that matters.
   */
  it('the runbook — the live deploy — carries the VAPID pair and the strict switch', () => {
    const r = read(join(API, '..', 'together-city-deployment-runbook.md'));
    expect(r).toMatch(/VAPID_PUBLIC_KEY/);
    expect(r).toMatch(/VAPID_PRIVATE_KEY/);
    expect(r).toMatch(/STRICT_PROD_CONFIG/);
  });

  it('render.yaml carries the VAPID pair', () => {
    const y = read(join(API, 'render.yaml'));
    expect(y).toMatch(/key: VAPID_PUBLIC_KEY/);
    expect(y).toMatch(/key: VAPID_PRIVATE_KEY/);
  });

  it('and everything else that same file refuses to boot without', () => {
    // The blueprint is kept as the emergency fallback, and a fallback that
    // cannot start is not one. PHOTO_MODERATION had no row at all, so a Render
    // deploy refused after every secret had been filled, with no hint in the
    // file that the variable existed.
    const y = read(join(API, 'render.yaml'));
    for (const key of ['PHOTO_MODERATION', 'REKOGNITION_REGION', 'CORS_ORIGIN', 'MEDIA_PRIVATE_BUCKET']) {
      expect(y).toMatch(new RegExp(`key: ${key}`));
    }
  });

  it('.env.example does too, with what happens without them', () => {
    const e = read(join(API, '.env.example'));
    expect(e).toMatch(/VAPID_PUBLIC_KEY=/);
    expect(e).toMatch(/VAPID_PRIVATE_KEY=/);
  });

  it('and the boot check names them', () => {
    const c = read(join(__dirname, '..', 'shared', 'config', 'configuration.ts'));
    expect(c).toMatch(/VAPID_PUBLIC_KEY/);
    expect(c).toMatch(/NO push notification will be delivered/);
  });

  it('the health probe cannot itself throw', () => {
    // `messagingConfigured` used to CONSTRUCT a provider, and the Resend
    // client throws on an empty key — so a missing mail secret turned every
    // probe into a 500, an instance that is never routed, and a deploy that
    // never finishes. (re-audit, 29 Aug)
    const mp = read(join(__dirname, '..', 'mail', 'messaging-provider.ts'))
      .replace(/\/\*[\s\S]*?\*\//g, ' ');
    const fn = mp.slice(mp.indexOf('export function messagingConfigured'), mp.indexOf('export function createMessagingProvider'));
    expect(fn).not.toMatch(/createMessagingProvider\(/);
    expect(read(join(__dirname, '..', 'health', 'health.controller.ts'))).toMatch(/try \{ return f\(\); \} catch \{ return false; \}/);
  });

  it('and pushConfigured asks what the provider asks, not just whether two strings exist', () => {
    // A malformed or swapped pair left `ready` false and every send returning
    // early, while the endpoint answered `pushConfigured: true` — the same
    // "healthy while nothing arrives" it was added to expose.
    const p = read(join(__dirname, 'web-push.provider.ts'));
    const fn = p.slice(p.indexOf('export function pushConfigured'), p.indexOf('@Injectable()'));
    expect(fn).toMatch(/webpush\.setVapidDetails\(/);
  });

  it('the health endpoint says whether push and mail are wired', () => {
    // Both subsystems disable themselves silently when unconfigured, and this
    // endpoint reported neither — so a deploy with no mail and no push was
    // indistinguishable from a healthy one.
    const h = read(join(__dirname, '..', 'health', 'health.controller.ts'));
    expect(h).toMatch(/emailConfigured: configured\(\(\) => messagingConfigured\('email'\)\)/);
    expect(h).toMatch(/pushConfigured: configured\(pushConfigured\)/);
  });
});

describe('a subscription cannot be taken over', () => {
  it('the unguarded route is gone', () => {
    const c = read(join(__dirname, '..', 'users', 'users.controller.ts'));
    const s = read(join(__dirname, '..', 'users', 'users.service.ts'));
    expect(c).not.toMatch(/@Post\('device-token'\)/);
    expect(s).not.toMatch(/registerDeviceToken/);
  });

  it('and the web client no longer offers it', () => {
    expect(read(join(WEB, 'src', 'api', 'users.api.ts'))).not.toMatch(/device-token/);
  });

  it('the one that remains claims only what is unclaimed or already yours', () => {
    const p = read(join(__dirname, 'push.controller.ts'));
    expect(p).toMatch(/if \(existing && existing\.userId !== user\.sub\) return \{ ok: false \};/);
  });

  it('and it revokes at the browser BEFORE telling the server', () => {
    // `signOut` clears the tokens before calling this, so the server call is a
    // guaranteed 401 — and awaiting it queued the one step that actually stops
    // delivery behind a doomed request and a doomed refresh. Closing the tab
    // straight after signing out left the subscription alive, which is the
    // leak this exists to close. (re-audit, 29 Aug)
    const r = read(join(WEB, 'src', 'api', 'session-reset.ts'));
    expect(r.indexOf('await sub.unsubscribe()')).toBeLessThan(r.indexOf("import('./push.api')"));
  });

  it('and signing out gives the subscription up', () => {
    // Nothing called `pushApi.unsubscribe`. A signed-out citizen went on
    // receiving their own dating previews on a shared browser, and the next
    // account on it silently had no push at all, permanently.
    const r = read(join(WEB, 'src', 'api', 'session-reset.ts'));
    expect(r).toMatch(/pushManager\.getSubscription\(\)/);
    expect(r).toMatch(/sub\.unsubscribe\(\)/);
  });

  it('and a refused claim is repaired rather than reported as success', () => {
    const h = read(join(WEB, 'src', 'hooks', 'useWebPush.ts'));
    expect(h).toMatch(/if \(claimed\.ok\) return true;/);
    expect(h).toMatch(/await sub\.unsubscribe\(\)/);
  });
});

describe('the worker that carries all of this actually takes over', () => {
  const sw = read(join(WEB, 'public', 'sw.js'));

  /**
   * A fetched service worker installs into the WAITING state and activates
   * only once every tab and installed window for the origin has closed — and
   * push is delivered to the ACTIVE worker. Without this pair, the tag and
   * destination fixes below reached nobody who already had the old worker,
   * which after a first deploy is everybody. (re-audit, 29 Aug)
   */
  it('hands over on install rather than waiting for every tab to close', () => {
    expect(sw).toMatch(/self\.skipWaiting\(\)/);
    expect(sw).toMatch(/self\.clients\.claim\(\)/);
  });

  it('and the page asks whether there is a newer one', () => {
    expect(read(join(WEB, 'src', 'hooks', 'useWebPush.ts'))).toMatch(/existing\.update\(\)/);
  });
});

describe('one notification does not erase the one before it', () => {
  const sw = read(join(WEB, 'public', 'sw.js'));

  it('the worker uses the tag the server named', () => {
    expect(sw).toMatch(/tag: payload\.tag \|\|/);
  });

  it('and no longer collapses everything with no conversation into one', () => {
    expect(sw).not.toMatch(/tag: conversationId \? `chat-\$\{conversationId\}` : 'chat'/);
  });

  it('the server names it, per notification row', () => {
    const s = read(join(__dirname, 'notifications.service.ts'));
    expect(s).toMatch(/`n-\$\{row\.id\}`/);
  });

  it('and a ringing call is its own row, which is what that method promises', () => {
    // The third emit site, missed the first time: with no tag a call shared
    // `chat-<conversationId>` with the chat notification and with every other
    // call in that conversation — while `notifyIncomingCall`'s own docblock
    // says "every call is its own row". (re-audit, 29 Aug)
    const s = read(join(__dirname, 'notifications.service.ts'));
    const fn = s.slice(s.indexOf('async notifyIncomingCall('), s.indexOf('async notifyNewMessage('));
    expect(fn).toMatch(/tag: `call-\$\{params\.callId\}`/);
    // And the href it computed forty lines earlier, instead of throwing it away.
    expect(fn).toMatch(/url: href,/);
  });
});

describe('a dating push opens the dating hub', () => {
  it('the message push carries the href the method already computed', () => {
    const s = read(join(__dirname, 'notifications.service.ts'));
    const fn = s.slice(s.indexOf('async notifyNewMessage('));
    expect(fn).toMatch(/const href = dating \? `\/dating\/chats\?c=/);
    expect(fn).toMatch(/url: href,/);
  });

  it('and the worker prefers it over the conversation fallback', () => {
    const sw = read(join(WEB, 'public', 'sw.js'));
    expect(sw).toMatch(/const url = direct \|\| \(cid \? `\/chats\?c=\$\{cid\}` : '\/chats'\);/);
  });

  it('one bad recipient no longer silences everybody after them', () => {
    // The loop runs from a floating promise on the event bus, so an error in
    // it aborted the fan-out with an unhandled rejection as the only trace.
    const s = read(join(__dirname, 'notifications.service.ts'));
    const fn = s.slice(s.indexOf('async notifyNewMessage('));
    expect(fn).toMatch(/message notification failed for one recipient/);
  });
});
