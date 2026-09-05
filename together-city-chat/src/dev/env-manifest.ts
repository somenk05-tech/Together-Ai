/**
 * WHAT IS CONFIGURED, AND NEVER WHAT IT IS SET TO.
 *
 * This page exists because of a specific, repeated waste of time: a feature
 * quietly does nothing on the deployment because a variable was never set, and
 * the symptom is never "TURN_URL is missing". It is "calls connect on wifi and
 * not on mobile data", or "the console says forbidden and the logs say
 * nothing", or "the email never arrived". Hours go into the feature, and the
 * answer was one unset string the whole time.
 *
 * So the page answers exactly one question per row — is it set — and states
 * what stops working when it is not. That second column is the point. A list of
 * variable names with green and red dots is a list somebody has to already
 * understand; a list that says "calls fall back to STUN, so anyone behind a
 * symmetric NAT gets silence" is a list that tells you whether to care.
 *
 * ── THE VALUE IS NEVER RETURNED, AND THAT IS ENFORCED, NOT INTENDED ──
 *
 * Half of this list is credentials: JWT signing secrets, the S3 keys, the
 * Anthropic key, Twilio's auth token, the FCM private key. A diagnostics page
 * that renders them is one screenshot away from a breach, and the screenshot is
 * the likely path — somebody pastes "here's what my dev page says" into a chat.
 *
 * `presence()` below returns a BOOLEAN. There is no code path in this module
 * that reads a value and returns it, and dev.spec.ts fails if one appears: the
 * guard scans this module for `process.env` reads that are not immediately
 * reduced to a boolean. That is what makes "never the value" a property of the
 * code rather than a promise in a comment.
 *
 * ── ADDING A VARIABLE ──
 *
 * Add it here, with a purpose and a consequence written in the same plain
 * words. A variable the API reads and this file does not list is invisible to
 * the page, which is the failure this whole file exists to prevent — so the
 * guard also checks the other direction, and names anything `process.env` reads
 * across the API that never made it into this list.
 */

export type EnvGroup =
  | 'Core' | 'Database & cache' | 'Mail' | 'Messaging & calls'
  | 'Push' | 'Media' | 'AI' | 'Third-party data' | 'Safety' | 'Operations';

export interface EnvEntry {
  name: string;
  group: EnvGroup;
  /** What it is for, in one line. */
  purpose: string;
  /** What actually stops working without it. Written as a symptom, because a
   *  symptom is what somebody arrives with. */
  whenMissing: string;
  /** True when the deployment is broken without it, rather than degraded. */
  required?: boolean;
  /** True when the value is a credential. Only affects how loudly the page
   *  says "and this page will never show you what it is". */
  secret?: boolean;
  /** True when UNSET is the correct state on a public deployment — a
   *  development escape hatch, or one of two routes to the same thing with the
   *  other taken. The page draws the row "off" and leaves it out of the count:
   *  a count that cannot fall to zero is a count nobody reads (owner, 5 Sep). */
  expectUnset?: boolean;
  /** What has to exist before this can be set — an account, a key, a Worker,
   *  a volume — so the page says what to go and get, not only what is missing. */
  needs?: string;
}

export const ENV_MANIFEST: EnvEntry[] = [
  // ── Core ────────────────────────────────────────────────────────────────
  { name: 'NODE_ENV', group: 'Core', purpose: 'production | development. Several guards refuse to relax outside production.', whenMissing: 'Treated as not-production: some development escape hatches become available.' },
  { name: 'PORT', group: 'Core', purpose: 'The port the API listens on.', whenMissing: 'Falls back to the built-in default. Railway sets this for you.' },
  { name: 'CORS_ORIGIN', group: 'Core', purpose: 'Which browser origins may call this API.', whenMissing: 'The web app is refused by the browser on every request and the whole site looks down.', required: true },
  { name: 'JWT_ACCESS_SECRET', group: 'Core', purpose: 'Signs access tokens.', whenMissing: 'Nobody can sign in, and every existing session is invalid.', required: true, secret: true },
  { name: 'JWT_REFRESH_SECRET', group: 'Core', purpose: 'Signs refresh tokens.', whenMissing: 'Sessions die after fifteen minutes and cannot be renewed.', required: true, secret: true },
  { name: 'JWT_ACCESS_TTL', group: 'Core', purpose: 'How long an access token lives.', whenMissing: 'Uses the built-in default.' },
  { name: 'JWT_REFRESH_TTL', group: 'Core', purpose: 'How long a refresh token lives.', whenMissing: 'Uses the built-in default.' },
  { name: 'TRUST_PROXY_HOPS', group: 'Core', purpose: 'How many proxies stand between the internet and this process (Railway alone: 1; Cloudflare in front of it: 2). Rate limiting keys on the address the last trusted hop appended.', whenMissing: 'One proxy hop is trusted — right for Railway alone.' },
  { name: 'JWT_REFRESH_ABSOLUTE_TTL', group: 'Core', purpose: 'The most a session can slide to from sign-in, in seconds, however often it refreshes (5 Sep).', whenMissing: 'Ninety days from sign-in, then the citizen signs in again.' },
  { name: 'STRICT_PROD_CONFIG', group: 'Core', purpose: 'Refuse to boot when a required production variable is missing.', whenMissing: 'The API boots with gaps and you find out from a symptom instead of from a crash.' },

  // ── Database & cache ────────────────────────────────────────────────────
  { name: 'DATABASE_URL', group: 'Database & cache', purpose: 'Postgres connection string.', whenMissing: 'Nothing works at all.', required: true, secret: true },
  { name: 'REDIS_URL', group: 'Database & cache', purpose: 'Redis, for rate limiting, the read cache and socket fan-out across instances.', whenMissing: 'Rate limits count per process instead of per deployment, reads go to Postgres every time, and real-time delivery stops crossing instances.', secret: true },
  { name: 'APP_NAME', group: 'Core', purpose: 'The name this process reports to Postgres, so pg_stat_activity names the culprit instead of showing twenty rows of \u201cnode\u201d.', whenMissing: 'Connections are labelled together-city-api, which is right until there is more than one service sharing the server.' },
  { name: 'DB_POOL_MAX', group: 'Database & cache', purpose: 'Postgres connections this container may hold. containers × this + headroom must stay under the server\u2019s max_connections; raise it well past 20 only behind a transaction pooler.', whenMissing: 'Twenty. Enough for roughly five containers on a stock hundred-connection server; it was ten, and ten was the ~20\u201340 concurrent ceiling.' },
  { name: 'DB_CONNECT_TIMEOUT_MS', group: 'Database & cache', purpose: 'How long a request waits for a free connection before failing.', whenMissing: 'Five seconds. Unset in node-postgres it is forever, which turns a busy minute into an out-of-memory crash instead of a handful of 500s.' },
  { name: 'DB_STATEMENT_TIMEOUT_MS', group: 'Database & cache', purpose: 'Server-side cap on a single query.', whenMissing: 'Fifteen seconds. Without one, a runaway query holds its connection indefinitely and a few of them empty the pool.' },
  { name: 'DB_QUERY_TIMEOUT_MS', group: 'Database & cache', purpose: 'Client-side cap, for when the server never answers at all.', whenMissing: 'Twenty seconds. This one only fires when the server accepts a query and then never answers at all.' },
  { name: 'DB_IDLE_TIMEOUT_MS', group: 'Database & cache', purpose: 'How long an unused connection is kept before being returned.', whenMissing: 'Thirty seconds. Held longer, an idle connection is capacity another container cannot have.' },
  { name: 'DB_IDLE_TX_TIMEOUT_MS', group: 'Database & cache', purpose: 'Cap on a connection left idle inside a transaction — the shape that holds locks as well as a connection.', whenMissing: 'Thirty seconds. Unset, a stuck transaction blocks every writer touching the same rows until somebody notices.' },
  { name: 'SOCIAL_CACHE_TTL_S', group: 'Database & cache', purpose: 'Seconds the social read cache keeps a citizen\u2019s follow/connection/block graph.', whenMissing: 'Thirty seconds. Set to 0 to switch the cache off entirely and read Postgres every time.' },
  { name: 'SOCIAL_NETWORK_MAX', group: 'Database & cache', purpose: 'The most accounts one citizen\u2019s bounded feed lenses may be drawn from \u2014 this list becomes an IN-clause, so it is a cap on query size, not on friendship.', whenMissing: 'Five thousand, newest follows first. Uncapped, one account following a million turns every page of its feed into a million-element IN-clause.' },
  { name: 'SOCIAL_NAME_TTL_S', group: 'Database & cache', purpose: 'Seconds a citizen\u2019s display name is reused for notification text.', whenMissing: 'Five minutes. One user read per like, comment, share and follow without it.' },
  { name: 'SOCIAL_FANOUT_MAX', group: 'Database & cache', purpose: 'How many people one post, like or comment may be pushed to live. Everyone beyond it sees the change on their next read.', whenMissing: 'One thousand. Unbounded, a single heart tap on a large account loads every follower into memory and emits to all of them.' },

  // ── Mail ────────────────────────────────────────────────────────────────
  { name: 'EMAIL_PROVIDER', group: 'Mail', purpose: 'resend | stub. Which sender is wired up.', whenMissing: 'Mail is written to the log instead of sent — everything looks fine and nothing arrives.', required: true },
  { name: 'RESEND_API_KEY', group: 'Mail', purpose: 'The Resend API key.', whenMissing: 'No outbound email: no verification codes, no password resets, no receipts.', required: true, secret: true },
  { name: 'EMAIL_FROM', group: 'Mail', purpose: 'The address outbound mail is sent from.', whenMissing: 'Falls back to a default sender, which the receiving domain may reject as unauthenticated.' },
  { name: 'RESEND_WEBHOOK_SECRET', group: 'Mail', purpose: 'The whsec_… signing secret from the inbound webhook\u2019s page in Resend. The guard verifies svix-id / svix-timestamp / svix-signature over the raw body with it \u2014 the one form Resend can actually send (4 Sep).', whenMissing: 'Only the shared-secret forms are accepted (Authorization: Bearer, or ?secret= behind ALLOW_INBOUND_SECRET_IN_URL). Resend cannot set a header, so without this a Resend webhook needs the URL form.', secret: true },
  { name: 'RESEND_INBOUND_SECRET', group: 'Mail', purpose: 'The shared secret on the inbound-mail webhook.', whenMissing: 'Inbound mail is REFUSED entirely — replies sent from Gmail never reach a citizen\'s mailbox.', secret: true },
  { name: 'ALLOW_UNSIGNED_INBOUND', group: 'Mail', purpose: 'Development-only: accept inbound mail with no secret.', whenMissing: 'Correct. This should never be set on a public deployment.', expectUnset: true },
  { name: 'ALLOW_INBOUND_SECRET_IN_URL', group: 'Mail', purpose: 'Migration-only: accept the inbound secret as ?secret= on the URL, where the platform logs it.', whenMissing: 'Correct. The secret belongs in an Authorization: Bearer header.', expectUnset: true },

  // ── Messaging & calls ───────────────────────────────────────────────────
  { name: 'MESSAGING_PROVIDER', group: 'Messaging & calls', purpose: 'twilio | stub. Which SMS sender is wired up.', whenMissing: 'SMS is logged instead of sent, so phone verification silently never arrives.' },
  { name: 'SMS_PROVIDER', group: 'Messaging & calls', purpose: 'Alternate name read by the SMS path.', whenMissing: 'Falls back to the stub.' },
  { name: 'TWILIO_ACCOUNT_SID', group: 'Messaging & calls', purpose: 'The Twilio account SMS is sent from.', whenMissing: 'Phone verification codes never arrive, so anyone verifying a number is stuck on the code screen with no error.', secret: true, needs: 'a Twilio account with a verified sending number' },
  { name: 'TWILIO_AUTH_TOKEN', group: 'Messaging & calls', purpose: 'The credential for that Twilio account.', whenMissing: 'Same as a missing account SID: codes are accepted by us and never sent.', secret: true, needs: 'a Twilio account with a verified sending number' },
  { name: 'TWILIO_FROM', group: 'Messaging & calls', purpose: 'The sending number.', whenMissing: 'No SMS, unless a messaging service is set instead.', needs: 'a Twilio number or messaging service' },
  { name: 'TWILIO_MESSAGING_SERVICE_SID', group: 'Messaging & calls', purpose: 'A Twilio messaging service, as an alternative to a from-number.', whenMissing: 'Fine if TWILIO_FROM is set.' },
  { name: 'ALLOW_STUB_MESSAGING', group: 'Messaging & calls', purpose: 'Development-only: allow the stub SMS sender outside development.', whenMissing: 'Correct. Set on a public deployment it means verification codes go to the log instead of a phone.', expectUnset: true },
  { name: 'TURN_URL', group: 'Messaging & calls', purpose: 'A TURN relay for voice and video.', whenMissing: 'Calls fall back to STUN only, so two people behind symmetric NATs — a very common mobile-network case — connect and hear silence.', expectUnset: true },
  { name: 'TURN_USERNAME', group: 'Messaging & calls', purpose: 'TURN credential.', whenMissing: 'The relay is unusable even if its URL is set.', secret: true, expectUnset: true },
  { name: 'TURN_CREDENTIAL', group: 'Messaging & calls', purpose: 'TURN credential.', whenMissing: 'The relay is unusable even if its URL is set.', secret: true, expectUnset: true },
  { name: 'ICE_SERVERS', group: 'Messaging & calls', purpose: 'A full custom ICE server list as JSON, instead of the three TURN_* variables.', whenMissing: 'Fine if the TURN_* trio is set.' },
  { name: 'TURN_SHARED_SECRET', group: 'Messaging & calls', purpose: 'TURN REST API secret (coturn use-auth-secret, or any provider that supports it): each citizen gets a relay credential of their own that expires (5 Sep).', whenMissing: 'If METERED_APP + METERED_SECRET_KEY are set, those mint the credential; otherwise the static pair in ICE_SERVERS is handed to every account — anybody who has seen it can relay on the city\'s bill.', secret: true, expectUnset: true },
  { name: 'METERED_APP', group: 'Messaging & calls', purpose: 'The metered.ca app subdomain (<app>.metered.live) at which POST /api/v1/turn/credential creates a per-citizen, expiring TURN credential.', whenMissing: 'See TURN_SHARED_SECRET — one of the two minting routes.' },
  { name: 'METERED_SECRET_KEY', group: 'Messaging & calls', purpose: 'The metered.ca SECRET KEY (dashboard → Developers) that POST /turn/credential requires. Not a credential\'s "API key" — that key only reads the static pair back.', whenMissing: 'See TURN_SHARED_SECRET.', secret: true },
  { name: 'TURN_CREDENTIAL_TTL', group: 'Messaging & calls', purpose: 'Seconds a minted relay credential lives (floor 600).', whenMissing: 'A minted credential lives four hours.' },
  { name: 'TYPING_TIMEOUT_MS', group: 'Messaging & calls', purpose: 'How long a typing indicator lingers.', whenMissing: 'Uses the built-in default.' },
  { name: 'MESSAGES_PAGE_SIZE', group: 'Messaging & calls', purpose: 'Messages per history page.', whenMissing: 'Uses the built-in default.' },
  { name: 'MESSAGE_EDIT_WINDOW_SEC', group: 'Messaging & calls', purpose: 'How long a sent message stays editable.', whenMissing: 'Uses the built-in default.' },
  { name: 'MESSAGE_DELETE_EVERYONE_WINDOW_SEC', group: 'Messaging & calls', purpose: 'How long delete-for-everyone is offered.', whenMissing: 'Uses the built-in default.' },

  // ── Push ────────────────────────────────────────────────────────────────
  // REQUIRED SINCE 29 AUG, and the entry above already said why: web push is
  // the whole of push here, and it fails by doing nothing at all. What was
  // missing was any consequence — these were in this manifest and in NO deploy
  // config, so the shipped render.yaml pushed to nobody. Both are in it now,
  // and assertProductionConfig says so at boot.
  { name: 'VAPID_PUBLIC_KEY', group: 'Push', purpose: 'Web push, browser side.', whenMissing: 'No web push notifications. The app never says so — subscriptions simply fail.', required: true },
  { name: 'VAPID_PRIVATE_KEY', group: 'Push', purpose: 'Web push, server side.', whenMissing: 'No web push notifications.', required: true, secret: true },
  { name: 'VAPID_SUBJECT', group: 'Push', purpose: 'The mailto: contact push services require.', whenMissing: 'Some push services reject the payload.' },
  // NOTHING REGISTERS A NATIVE TOKEN YET (checked 28 Aug). `/push/subscribe` is
  // the only route that writes a DeviceToken and it always writes
  // platform: 'webpush'; the Capacitor shell carries no push plugin. So the FCM
  // branch of pushToDevices always sends to an empty array and these four are
  // inert — setting them today changes nothing. The old wording here said the
  // mobile shell "registers for push and then never receives any", which read
  // as a live failure and is what made the 28 Aug audit call this a gap.
  // Pinned by push-reaches-a-browser.spec.ts, which goes red the day a native
  // token can be stored — at which point these become required.
  { name: 'FCM_ENABLED', group: 'Push', purpose: 'Turns Firebase push on. Only meaningful once the mobile shell registers a native token — it does not today.', whenMissing: 'Nothing. Browser push (VAPID) is the whole of push right now and is unaffected.' },
  { name: 'FCM_PROJECT_ID', group: 'Push', purpose: 'The Firebase project native push would be sent through.', whenMissing: 'Nothing yet — no native token is ever stored, so the FCM send is always to an empty list.', needs: 'a Firebase project and a native shell that registers tokens' },
  { name: 'FCM_CLIENT_EMAIL', group: 'Push', purpose: 'The Firebase service account that signs push requests.', whenMissing: 'Nothing yet — see FCM_PROJECT_ID.', needs: 'a Firebase service account for that project' },
  { name: 'FCM_PRIVATE_KEY', group: 'Push', purpose: 'The key for that Firebase service account.', whenMissing: 'Nothing yet. When native push does arrive: watch for a key pasted without its newlines — that reads as SET here and still fails.', secret: true, needs: 'a Firebase service account for that project' },

  // ── Media ───────────────────────────────────────────────────────────────
  { name: 'MEDIA_BUCKET', group: 'Media', purpose: 'The public bucket.', whenMissing: 'Photo uploads fail.' },
  { name: 'MEDIA_PRIVATE_BUCKET', group: 'Media', purpose: 'The private bucket — blood reports, CVs, documents.', whenMissing: 'Private uploads fail, or worse, fall back to the public bucket.' },
  { name: 'MEDIA_PUBLIC_BASE_URL', group: 'Media', purpose: 'The base URL public media is served from, and what an attachment\'s origin is checked against.', whenMissing: 'Production refuses to boot (3 Sep): unset, the attachment origin check does not weaken, it disappears.' },
  { name: 'PUBLIC_API_URL', group: 'Media', purpose: 'The public origin of this API, exactly as the browser reaches it — the same value the web app uses for VITE_API_URL, e.g. https://api.togethercity.app/api. Dating photo links are minted from it: /dating/photo/:token, one link naming one viewer, re-checked on every fetch. The /api prefix is added if you leave it off.', whenMissing: 'Dating photos are served as presigned S3 links instead, which cannot be revoked before they expire: a block, a takedown or a deleted photo leaves the old link loading until it times out.' },
  { name: 'MEDIA_LEGACY_PUBLIC_BASES', group: 'Media', purpose: 'Every base a stored public URL may still carry, comma-separated \u2014 the r2.dev address rows were written under before a custom domain. Deletes, the chat attachment gate and the chat media screen recognise all of them. Set it BEFORE cutting MEDIA_PUBLIC_BASE_URL over, not after.', whenMissing: 'Only the current base is recognised; rows written under an earlier one cannot be deleted from the bucket or forwarded in chat.' },
  { name: 'MEDIA_LINK_SECRET', group: 'Media', purpose: 'The secret that signs media links \u2014 the value the media-edge Worker holds as LINK_SECRET. A random \u226532-char value of its own, never JWT_ACCESS_SECRET (4 Sep).', whenMissing: 'Derived from JWT_ACCESS_SECRET one-way; `node scripts/print-media-link-secret.mjs` prints it for the Worker. Works, but rotating the JWT secret then rotates this too.' },
  { name: 'MAIL_UNSUBSCRIBE_SECRET', group: 'Mail', purpose: 'Keys the unsubscribe links in outbound mail. Never leaves the API.', whenMissing: 'Derived from JWT_ACCESS_SECRET one-way. Links sent before 4 Sep still verify against the old key until 5 Oct 2026.' },
  { name: 'MEDIA_CDN_BASE', group: 'Media', purpose: 'Where the media-edge Worker answers, e.g. https://media.togethercity.tech. Post media is then served from Cloudflare\u2019s cache for a token this API signs (workers/media-edge). Set the Worker\u2019s LINK_SECRET to the same value as MEDIA_LINK_SECRET \u2014 both derive the media key from it.', whenMissing: 'Post media keeps the presigned R2 links it has today. Those only work on the r2.cloudflarestorage.com S3 endpoint, which Cloudflare does NOT cache \u2014 so every photograph in every feed page is fetched from storage on every request, with no edge in between.', needs: 'the media-edge Worker deployed on a togethercity hostname' },
  { name: 'MEDIA_CORS_ORIGINS', group: 'Media', purpose: 'Origins allowed to fetch media directly.', whenMissing: 'Cross-origin media loads fail silently in the browser.' },
  { name: 'S3_ENDPOINT', group: 'Media', purpose: 'The S3-compatible endpoint uploads are written to.', whenMissing: 'Every photo, CV and report upload fails at the point the citizen presses save.' },
  { name: 'S3_REGION', group: 'Media', purpose: 'The region the buckets live in.', whenMissing: 'Uploads fail, usually with a signature error that reads as a credential problem.' },
  { name: 'S3_ACCESS_KEY_ID', group: 'Media', purpose: 'The access key for those buckets.', whenMissing: 'Every upload fails, and existing media keeps loading — so it looks like a broken form, not a broken bucket.', secret: true },
  { name: 'S3_SECRET_ACCESS_KEY', group: 'Media', purpose: 'The secret half of that access key.', whenMissing: 'Same as a missing access key: uploads fail while existing media still loads.', secret: true },
  { name: 'MAX_UPLOAD_BYTES', group: 'Media', purpose: 'Upload size ceiling.', whenMissing: 'Uses the built-in default.' },
  { name: 'MAX_POST_VIDEO_BYTES', group: 'Media', purpose: 'Ceiling for a video on a post (5 Sep: 2 GB, up to an hour).', whenMissing: 'Uses the built-in default (2 GiB).' },

  // ── AI ──────────────────────────────────────────────────────────────────
  { name: 'ANTHROPIC_API_KEY', group: 'AI', purpose: 'Every AI feature: meal planning, blood-report reading, beauty analysis, CV parsing.', whenMissing: 'Those features fail or fall back, hub by hub.', secret: true },
  { name: 'AI_DAILY_CALLS_GLOBAL', group: 'AI', purpose: 'How many model calls the whole city may spend per UTC day, whoever is asking — jobs and socket frames included. Past it the model refuses everybody until midnight UTC and the deterministic fallbacks answer. Default 20,000.', whenMissing: 'Uses the built-in twenty thousand.' },
  { name: 'AI_DAILY_CALLS_PER_CITIZEN', group: 'AI', purpose: 'How many model calls one citizen may spend per UTC day across every model call in the city — charged at the call itself since 4 Sep, so the blood-report reads, Mira, the CV reader and the menu scan all count. Default 60. Kept in Redis; with Redis away only the per-minute throttle holds.', whenMissing: 'Uses the built-in sixty.' },
  { name: 'ANTHROPIC_MODEL', group: 'AI', purpose: 'The default text model.', whenMissing: 'Uses the built-in default.' },
  { name: 'ANTHROPIC_VISION_MODEL', group: 'AI', purpose: 'The model used for photographs — menus, food journal, beauty.', whenMissing: 'Uses the built-in default.' },
  { name: 'ANTHROPIC_BLOOD_MODEL', group: 'AI', purpose: 'The model used to read blood reports.', whenMissing: 'Uses the built-in default.' },

  // ── Third-party data ────────────────────────────────────────────────────
  // GOOGLE_MAPS_API_KEY and MAPS_API_KEY are gone from this list (28 Aug): no
  // code in either package reads either name, and the row said "maps do not
  // render and address lookup fails", which is not what happens — geocoding
  // goes through this API's own /geo endpoints to Nominatim, and there is no
  // Google Maps anywhere. One of the two is set in production, which is a key
  // somebody created, pays for, and has never been used by anything.
  { name: 'TMDB_API_KEY', group: 'Third-party data', purpose: 'Film and television data for Entertainment.', whenMissing: 'Entertainment has no catalogue.', secret: true },
  { name: 'WATCHMODE_API_KEY', group: 'Third-party data', purpose: 'Where-to-watch availability.', whenMissing: 'Streaming availability is missing from Entertainment.', secret: true },

  { name: 'ADZUNA_APP_ID', group: 'Third-party data', purpose: 'The Adzuna application id. Widens the jobs shelf past the ATS boards, through their licensed API rather than scraping.', whenMissing: 'Adzuna is skipped on every sweep, so the shelf carries only jobs from companies that run a Greenhouse, Lever or Ashby board. The log says so once a sweep; the page says nothing at all.', secret: true, needs: 'an Adzuna developer application (developer.adzuna.com)' },
  { name: 'ADZUNA_APP_KEY', group: 'Third-party data', purpose: 'The key half of the Adzuna pair. Both are needed or the source is not used.', whenMissing: 'Same as a missing app id: the source is skipped whole, and a thinner shelf looks exactly like a quiet job market.', secret: true, needs: 'an Adzuna developer application (developer.adzuna.com)' },
  { name: 'JOOBLE_API_KEY', group: 'Third-party data', purpose: 'The Jooble key — the second aggregator behind the jobs shelf.', whenMissing: 'Jooble contributes no postings. With Adzuna also unset the shelf is company boards only, which is a narrower city than the hub promises.', secret: true, needs: 'a Jooble partner API key (jooble.org/api/about)' },

  // ── Operations ──────────────────────────────────────────────────────────
  { name: 'CONSOLE_FOUNDERS', group: 'Operations', purpose: 'Handles granted the founder role at boot — the only way to open the admin console for the first time.', whenMissing: 'The console cannot be opened by anybody, and it says "not open to this account" with nothing in the logs.' },
  { name: 'MODERATION_ADMINS', group: 'Operations', purpose: 'Handles granted the moderator role at boot.', whenMissing: 'Nobody can reach the moderation surfaces outside the console.' },
  { name: 'DEV_PAGE_PASSWORD', group: 'Operations', purpose: 'The password on this page.', whenMissing: 'This page falls back to its shipped default, which is in the source and therefore public. Set it.', secret: true },
  { name: 'DEV_PAGE_ACCOUNTS', group: 'Operations', purpose: 'Handles or user ids allowed to open the developer page, comma-separated. The third lock: an account, the password, AND being on this list.', whenMissing: 'NOBODY can open the developer page — it fails closed on purpose, so one forgotten variable cannot silently reopen it to every account that can guess a password living in the repository. Set it and redeploy.', required: true },
  { name: 'SEED_DEMO', group: 'Operations', purpose: 'Development-only: write demo rows at boot.', whenMissing: 'Correct for a real deployment.', expectUnset: true },
  // ── Dating engine switches ──────────────────────────────────────────────
  // Every one of these is a reversal, not a feature. The defaults are what
  // ships; the variable exists so that undoing a 26 Aug decision is a deploy
  // setting rather than a rewrite. None is required.
  { name: 'DATING_WEIGHTS', group: 'Operations', purpose: 'Which weight table scores a pair: unset = astrology 0.90; astro-personality = astrology 0.75 + personality 0.15; retuned = the balanced audit table.', whenMissing: 'Correct. Astrology carries nine tenths of every percentage, as decided on 26 Aug.' },
  { name: 'MIGRATE_ON_BOOT', group: 'Operations', purpose: 'off skips `prisma migrate deploy` in the container entrypoint, for a host whose release step (railway.json preDeployCommand) already ran it (5 Sep).', whenMissing: 'Migrations also run at boot — idempotent, so a no-op after the release step.' },
  { name: 'DATING_REPORTS_AUTO_HOLD', group: 'Operations', purpose: 'Distinct open reports at which a matchmaking card leaves Browse until a moderator decides (5 Sep).', whenMissing: 'Three distinct open reports hold a card.' },
  { name: 'DATING_ZODIAC', group: 'Operations', purpose: 'tropical restores the Western sun sign. Unset reads the same sidereal chart the Astrology Zone shows.', whenMissing: 'Correct. Dating and the Astrology Zone agree on every citizen\'s sign.' },
  { name: 'DATING_CORE_FILTERS', group: 'Operations', purpose: 'off returns intent, children and diet to opt-in chips only.', whenMissing: 'Correct. The three core questions filter for everybody who has answered them.' },
  { name: 'DATING_MISMATCH_PENALTY', group: 'Operations', purpose: 'off stops a deal-breaker mismatch lowering the score, so every pair is scored as if nothing were wrong.', whenMissing: 'Correct. A mismatch on intent, children, diet, religion, distance or the two habits multiplies the score down instead of hiding the person.' },
  { name: 'DATING_BAR', group: 'Operations', purpose: 'fixed restores the fixed 75% curated bar. Unset draws the bar at the viewer\'s own top tenth.', whenMissing: 'Correct. Every citizen with candidates has a curated shelf, including half-finished profiles.' },
  { name: 'DATING_BAR_FLOOR', group: 'Operations', purpose: 'A score below which the percentile bar will not be drawn, so a top tenth of nothing stays nothing.', whenMissing: 'No floor: the bar is purely the top tenth of the list.' },
  { name: 'DATING_CONFIDENCE', group: 'Operations', purpose: 'off disables the multiplier that lowers a score in proportion to how few of the six questions both people answered.', whenMissing: 'Correct. A number built from almost no answers is shown lower than one built from all of them.' },
  { name: 'DATING_POOL_CEILING', group: 'Operations', purpose: 'The most profiles one match request will read, most recently active first. Default 2000.', whenMissing: 'Uses the built-in 2000. The response says when the cap bound, so nobody mistakes a capped list for the city.' },
  { name: 'TURNSTILE_SECRET', group: 'Safety', purpose: 'Cloudflare Turnstile secret. Set, sign-up and sign-in need a confirmed token and refuse without one — fail-closed, including when Cloudflare is unreachable.', whenMissing: 'No bot check. The per-IP throttle and per-handle lockout are the whole defence, which is enough for a private beta and not for a public launch.', secret: true },
  { name: 'TURNSTILE_HOSTNAMES', group: 'Safety', purpose: 'Comma-separated hostnames a Turnstile token may be minted on, compared against siteverify\u2019s hostname. Per-deployment: production lists togethercity.app and never localhost.', whenMissing: 'With TURNSTILE_SECRET set the API refuses to start, because a sitekey is public and a token minted on any domain the widget lists would otherwise be accepted here. Unset alongside an unset secret, Turnstile is simply off.' },
  { name: 'SENTRY_DSN', group: 'Operations', purpose: 'Where 5xx errors and unhandled rejections are reported. No request bodies, no citizen data.', whenMissing: 'Errors go to the process log only. Fine in development; in production nobody is told.', secret: true },
  { name: 'SENTRY_RELEASE', group: 'Operations', purpose: 'The release name errors are filed under. Falls back to the Vercel commit sha.', whenMissing: 'Errors are filed without a release name, which only makes them harder to place.' },
  { name: 'PHOTO_MODERATION', group: 'Safety', purpose: '"rekognition" (default) reviews every dating photo before another citizen sees it; "off" approves all, for development only.', whenMissing: 'Correct. Rekognition, and without its keys every photo stays pending — fail-closed.' },
  { name: 'REKOGNITION_REGION', group: 'Safety', purpose: 'AWS region of the Rekognition endpoint, e.g. ap-south-1.', whenMissing: 'Photo review cannot run: every dating photo stays pending and is shown to nobody but its owner, and NO photo or video can be posted to the city feed at all \u2014 posting fails closed rather than publishing something unchecked.' },
  { name: 'REKOGNITION_ACCESS_KEY_ID', group: 'Safety', purpose: 'An IAM key allowed rekognition:DetectModerationLabels and nothing else.', whenMissing: 'Photo review cannot run — see REKOGNITION_REGION.', secret: true },
  { name: 'REKOGNITION_SECRET_ACCESS_KEY', group: 'Safety', purpose: 'The secret for REKOGNITION_ACCESS_KEY_ID.', whenMissing: 'Photo review cannot run — see REKOGNITION_REGION.', secret: true },
  { name: 'PHOTO_MODERATION_HOLD_AT', group: 'Safety', purpose: 'Confidence (0–100) at which a moderation label holds a photo for a person. Default 60.', whenMissing: 'Uses the built-in 60, which holds anything the machine is more than slightly unsure of.' },
  { name: 'PHOTO_MODERATION_REJECT_AT', group: 'Safety', purpose: 'Confidence at which explicit, violent or hateful content is refused outright. Default 90.', whenMissing: 'Uses the built-in 90; below it a person decides rather than the machine.' },
  { name: 'DATING_LIST_CACHE_SEC', group: 'Operations', purpose: 'How long one viewer\'s dating list answer is kept in Redis before it is scored again. Their own like, pass, connect or save drops it at once. Default 60.', whenMissing: 'Uses the built-in sixty seconds per viewer, per page.' },
  { name: 'DATING_REINDEX_DEBOUNCE_MS', group: 'Operations', purpose: 'How long a profile save waits for the next one before the new-match scan runs. Default 5000.', whenMissing: 'Uses the built-in five seconds between a save and its scan.' },
  { name: 'WALLET_SELF_TOPUP', group: 'Operations', purpose: '"on" lets a citizen credit their own wallet through the API. Off in production until a payment processor confirms the money.', whenMissing: 'Correct: in production, self top-up is refused.', expectUnset: true },
  { name: 'PAYMENTS_SANDBOX', group: 'Operations', purpose: '"on" lets the simulated payment and payout providers run with NODE_ENV=production — a staging deploy, never the live city. Off, card payments, card linking and payouts are refused with "not available yet" until a real processor is signed and bound in commerce.module.ts.', whenMissing: 'Correct: in production the sandbox refuses every charge, card link and payout; wallet-only payments still work.', expectUnset: true },
  { name: 'CORS_PREVIEW_PROJECT', group: 'Operations', purpose: 'The Vercel project slug whose preview URLs may call the API with credentials.', whenMissing: 'No preview URL is allowed. Only CORS_ORIGIN and the site itself.' },
  { name: 'CORS_PREVIEW_TEAM', group: 'Operations', purpose: 'The Vercel team slug, so preview URLs are matched to this team and not to every *.vercel.app.', whenMissing: 'Preview URLs are matched by project alone.' },

  // ── Background work and the scanners ────────────────────────────────────
  { name: 'EXTERNAL_JOBS_SCAN', group: 'Operations', purpose: '"off" stops the external jobs scanner — the first-boot fill and the six-hourly sweep both.', whenMissing: 'Correct. The scanner runs, and a fresh deployment fills an empty shelf on first boot instead of showing nobody any jobs.' },
  { name: 'JOBS', group: 'Operations', purpose: '"off" turns the durable job queue off; deferred work runs in-process, as it did before BullMQ.', whenMissing: 'Correct. The reindex after a profile save and the review after a photo upload go to Redis, so a restart between the save and the scan no longer loses it.' },
  { name: 'JOBS_CONCURRENCY', group: 'Operations', purpose: 'How many queued jobs one instance runs at once. Default 4.', whenMissing: 'Uses the built-in four per instance.' },

  // ── Mira's ask log ──────────────────────────────────────────────────────
  { name: 'MIRA_LOG_DIR', group: 'Operations', purpose: 'Where Mira\'s daily ask log is written. Point it at a mounted volume to keep it.', whenMissing: 'The log lives inside the container, so a redeploy takes the day\'s questions with it — genuinely useful for watching a launch, useless as an archive.', needs: 'a Railway volume mounted on the API service' },
  { name: 'MIRA_LOG_SALT', group: 'Safety', purpose: 'Salts the twelve-hex hash that stands in for who asked, in Mira\'s ask log.', whenMissing: 'Every question is recorded WITHOUT its text: the lanes, latencies and counts survive and nobody can read what citizens actually asked. The boot log says so once, loudly.', secret: true },

  // ── What the metal costs ────────────────────────────────────────────────
  // The three rates are read as process.env[name] rather than process.env.NAME,
  // so the guard in dev.spec.ts cannot see them and will never ask for them.
  // They are listed by hand for the reason that guard exists: an unset rate is a
  // price quoted off a dated fallback, and nothing on the invoice says so.
  { name: 'GOLD_22K_INR_PER_G', group: 'Operations', purpose: 'Rupees per gram of 22 carat gold, making charge included, behind every ring and pendant quote.', whenMissing: 'The counter quotes the indicative fallback of ₹9,000/g dated 1 Aug 2026 — last quarter\'s gold, priced with total confidence, on an invoice a citizen pays.' },
  { name: 'SILVER_INR_PER_G', group: 'Operations', purpose: 'Rupees per gram of silver, for the same quotes.', whenMissing: 'The counter quotes the ₹110/g fallback dated 1 Aug 2026.' },
  { name: 'PANCHDHATU_INR_PER_G', group: 'Operations', purpose: 'Rupees per gram of panchdhatu, for the same quotes.', whenMissing: 'The counter quotes the ₹900/g fallback dated 1 Aug 2026.' },
  { name: 'METAL_RATES_AS_OF', group: 'Operations', purpose: 'The date the three rates above are good for, carried with them so staleness is visible to us.', whenMissing: 'Corrected rates are still recorded as good for 1 Aug 2026, so nothing tells a rate refreshed this morning from the one that shipped.' },

  { name: 'TEST_DATABASE_URL', group: 'Operations', purpose: 'A throwaway database for the cross-user isolation tests.', whenMissing: 'Those tests SKIP rather than fail — the static guards still run, but nothing is proven against a live database.', secret: true, expectUnset: true },
];

/**
 * Set or not. A boolean, and never anything else.
 *
 * Whitespace counts as unset: a variable pasted with a trailing newline behaves
 * as unset everywhere it is read, so reporting it as set would send somebody
 * looking in the wrong place entirely.
 */
export function presence(name: string, env: NodeJS.ProcessEnv = process.env): boolean {
  return (env[name] ?? '').trim().length > 0;
}

/** The whole manifest, answered. Nothing here can carry a value out. */
export function reportEnv(env: NodeJS.ProcessEnv = process.env) {
  return ENV_MANIFEST.map((e) => ({
    name: e.name,
    group: e.group,
    purpose: e.purpose,
    whenMissing: e.whenMissing,
    required: e.required === true,
    secret: e.secret === true,
    set: presence(e.name, env),
    expectUnset: e.expectUnset === true,
    needs: e.needs ?? null,
  }));
}
