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
  { name: 'STRICT_PROD_CONFIG', group: 'Core', purpose: 'Refuse to boot when a required production variable is missing.', whenMissing: 'The API boots with gaps and you find out from a symptom instead of from a crash.' },

  // ── Database & cache ────────────────────────────────────────────────────
  { name: 'DATABASE_URL', group: 'Database & cache', purpose: 'Postgres connection string.', whenMissing: 'Nothing works at all.', required: true, secret: true },
  { name: 'REDIS_URL', group: 'Database & cache', purpose: 'Redis, for rate limiting and socket fan-out across instances.', whenMissing: 'Rate limits count per process instead of per deployment, and real-time delivery stops crossing instances.', secret: true },

  // ── Mail ────────────────────────────────────────────────────────────────
  { name: 'EMAIL_PROVIDER', group: 'Mail', purpose: 'resend | stub. Which sender is wired up.', whenMissing: 'Mail is written to the log instead of sent — everything looks fine and nothing arrives.' },
  { name: 'RESEND_API_KEY', group: 'Mail', purpose: 'The Resend API key.', whenMissing: 'No outbound email: no verification codes, no password resets, no receipts.', secret: true },
  { name: 'EMAIL_FROM', group: 'Mail', purpose: 'The address outbound mail is sent from.', whenMissing: 'Falls back to a default sender, which the receiving domain may reject as unauthenticated.' },
  { name: 'RESEND_INBOUND_SECRET', group: 'Mail', purpose: 'The shared secret on the inbound-mail webhook.', whenMissing: 'Inbound mail is REFUSED entirely — replies sent from Gmail never reach a citizen\'s mailbox.', secret: true },
  { name: 'ALLOW_UNSIGNED_INBOUND', group: 'Mail', purpose: 'Development-only: accept inbound mail with no secret.', whenMissing: 'Correct. This should never be set on a public deployment.' },

  // ── Messaging & calls ───────────────────────────────────────────────────
  { name: 'MESSAGING_PROVIDER', group: 'Messaging & calls', purpose: 'twilio | stub. Which SMS sender is wired up.', whenMissing: 'SMS is logged instead of sent, so phone verification silently never arrives.' },
  { name: 'SMS_PROVIDER', group: 'Messaging & calls', purpose: 'Alternate name read by the SMS path.', whenMissing: 'Falls back to the stub.' },
  { name: 'TWILIO_ACCOUNT_SID', group: 'Messaging & calls', purpose: 'The Twilio account SMS is sent from.', whenMissing: 'Phone verification codes never arrive, so anyone verifying a number is stuck on the code screen with no error.', secret: true },
  { name: 'TWILIO_AUTH_TOKEN', group: 'Messaging & calls', purpose: 'The credential for that Twilio account.', whenMissing: 'Same as a missing account SID: codes are accepted by us and never sent.', secret: true },
  { name: 'TWILIO_FROM', group: 'Messaging & calls', purpose: 'The sending number.', whenMissing: 'No SMS, unless a messaging service is set instead.' },
  { name: 'TWILIO_MESSAGING_SERVICE_SID', group: 'Messaging & calls', purpose: 'A Twilio messaging service, as an alternative to a from-number.', whenMissing: 'Fine if TWILIO_FROM is set.' },
  { name: 'ALLOW_STUB_MESSAGING', group: 'Messaging & calls', purpose: 'Development-only: allow the stub SMS sender outside development.', whenMissing: 'Correct. Set on a public deployment it means verification codes go to the log instead of a phone.' },
  { name: 'TURN_URL', group: 'Messaging & calls', purpose: 'A TURN relay for voice and video.', whenMissing: 'Calls fall back to STUN only, so two people behind symmetric NATs — a very common mobile-network case — connect and hear silence.' },
  { name: 'TURN_USERNAME', group: 'Messaging & calls', purpose: 'TURN credential.', whenMissing: 'The relay is unusable even if its URL is set.', secret: true },
  { name: 'TURN_CREDENTIAL', group: 'Messaging & calls', purpose: 'TURN credential.', whenMissing: 'The relay is unusable even if its URL is set.', secret: true },
  { name: 'ICE_SERVERS', group: 'Messaging & calls', purpose: 'A full custom ICE server list as JSON, instead of the three TURN_* variables.', whenMissing: 'Fine if the TURN_* trio is set.' },
  { name: 'TYPING_TIMEOUT_MS', group: 'Messaging & calls', purpose: 'How long a typing indicator lingers.', whenMissing: 'Uses the built-in default.' },
  { name: 'MESSAGES_PAGE_SIZE', group: 'Messaging & calls', purpose: 'Messages per history page.', whenMissing: 'Uses the built-in default.' },
  { name: 'MESSAGE_EDIT_WINDOW_SEC', group: 'Messaging & calls', purpose: 'How long a sent message stays editable.', whenMissing: 'Uses the built-in default.' },
  { name: 'MESSAGE_DELETE_EVERYONE_WINDOW_SEC', group: 'Messaging & calls', purpose: 'How long delete-for-everyone is offered.', whenMissing: 'Uses the built-in default.' },

  // ── Push ────────────────────────────────────────────────────────────────
  { name: 'VAPID_PUBLIC_KEY', group: 'Push', purpose: 'Web push, browser side.', whenMissing: 'No web push notifications. The app never says so — subscriptions simply fail.', },
  { name: 'VAPID_PRIVATE_KEY', group: 'Push', purpose: 'Web push, server side.', whenMissing: 'No web push notifications.', secret: true },
  { name: 'VAPID_SUBJECT', group: 'Push', purpose: 'The mailto: contact push services require.', whenMissing: 'Some push services reject the payload.' },
  { name: 'FCM_ENABLED', group: 'Push', purpose: 'Turns Firebase push on.', whenMissing: 'No native push on the mobile shell.' },
  { name: 'FCM_PROJECT_ID', group: 'Push', purpose: 'The Firebase project native push is sent through.', whenMissing: 'The mobile shell registers for push and then never receives any, silently.' },
  { name: 'FCM_CLIENT_EMAIL', group: 'Push', purpose: 'The Firebase service account that signs push requests.', whenMissing: 'Native push fails at send time; the app never learns and shows nothing.' },
  { name: 'FCM_PRIVATE_KEY', group: 'Push', purpose: 'The key for that Firebase service account.', whenMissing: 'Native push fails at send time. Watch for a key pasted without its newlines — that reads as SET here and still fails.', secret: true },

  // ── Media ───────────────────────────────────────────────────────────────
  { name: 'MEDIA_PROVIDER', group: 'Media', purpose: 's3 | local. Where uploads go.', whenMissing: 'Uploads land on the container\'s disk and vanish on the next deploy.' },
  { name: 'MEDIA_BUCKET', group: 'Media', purpose: 'The public bucket.', whenMissing: 'Photo uploads fail.' },
  { name: 'MEDIA_PRIVATE_BUCKET', group: 'Media', purpose: 'The private bucket — blood reports, CVs, documents.', whenMissing: 'Private uploads fail, or worse, fall back to the public bucket.' },
  { name: 'MEDIA_PUBLIC_BASE_URL', group: 'Media', purpose: 'The base URL public media is served from.', whenMissing: 'Images upload and then render as broken.' },
  { name: 'MEDIA_CORS_ORIGINS', group: 'Media', purpose: 'Origins allowed to fetch media directly.', whenMissing: 'Cross-origin media loads fail silently in the browser.' },
  { name: 'S3_ENDPOINT', group: 'Media', purpose: 'The S3-compatible endpoint uploads are written to.', whenMissing: 'Every photo, CV and report upload fails at the point the citizen presses save.' },
  { name: 'S3_REGION', group: 'Media', purpose: 'The region the buckets live in.', whenMissing: 'Uploads fail, usually with a signature error that reads as a credential problem.' },
  { name: 'S3_ACCESS_KEY_ID', group: 'Media', purpose: 'The access key for those buckets.', whenMissing: 'Every upload fails, and existing media keeps loading — so it looks like a broken form, not a broken bucket.', secret: true },
  { name: 'S3_SECRET_ACCESS_KEY', group: 'Media', purpose: 'The secret half of that access key.', whenMissing: 'Same as a missing access key: uploads fail while existing media still loads.', secret: true },
  { name: 'MAX_UPLOAD_BYTES', group: 'Media', purpose: 'Upload size ceiling.', whenMissing: 'Uses the built-in default.' },

  // ── AI ──────────────────────────────────────────────────────────────────
  { name: 'ANTHROPIC_API_KEY', group: 'AI', purpose: 'Every AI feature: meal planning, blood-report reading, beauty analysis, CV parsing.', whenMissing: 'Those features fail or fall back, hub by hub.', secret: true },
  { name: 'ANTHROPIC_MODEL', group: 'AI', purpose: 'The default text model.', whenMissing: 'Uses the built-in default.' },
  { name: 'ANTHROPIC_VISION_MODEL', group: 'AI', purpose: 'The model used for photographs — menus, food journal, beauty.', whenMissing: 'Uses the built-in default.' },
  { name: 'ANTHROPIC_BLOOD_MODEL', group: 'AI', purpose: 'The model used to read blood reports.', whenMissing: 'Uses the built-in default.' },

  // ── Third-party data ────────────────────────────────────────────────────
  { name: 'GOOGLE_MAPS_API_KEY', group: 'Third-party data', purpose: 'Maps and geocoding.', whenMissing: 'Maps do not render and address lookup fails.', secret: true },
  { name: 'MAPS_API_KEY', group: 'Third-party data', purpose: 'Alternate name read by the maps path.', whenMissing: 'Fine if GOOGLE_MAPS_API_KEY is set.', secret: true },
  { name: 'TMDB_API_KEY', group: 'Third-party data', purpose: 'Film and television data for Entertainment.', whenMissing: 'Entertainment has no catalogue.', secret: true },
  { name: 'WATCHMODE_API_KEY', group: 'Third-party data', purpose: 'Where-to-watch availability.', whenMissing: 'Streaming availability is missing from Entertainment.', secret: true },

  // ── Operations ──────────────────────────────────────────────────────────
  { name: 'CONSOLE_FOUNDERS', group: 'Operations', purpose: 'Handles granted the founder role at boot — the only way to open the admin console for the first time.', whenMissing: 'The console cannot be opened by anybody, and it says "not open to this account" with nothing in the logs.' },
  { name: 'MODERATION_ADMINS', group: 'Operations', purpose: 'Handles granted the moderator role at boot.', whenMissing: 'Nobody can reach the moderation surfaces outside the console.' },
  { name: 'DEV_PAGE_PASSWORD', group: 'Operations', purpose: 'The password on this page.', whenMissing: 'This page falls back to its shipped default, which is in the source and therefore public. Set it.', secret: true },
  { name: 'SEED_DEMO', group: 'Operations', purpose: 'Development-only: write demo rows at boot.', whenMissing: 'Correct for a real deployment.' },
  // ── Dating engine switches ──────────────────────────────────────────────
  // Every one of these is a reversal, not a feature. The defaults are what
  // ships; the variable exists so that undoing a 26 Aug decision is a deploy
  // setting rather than a rewrite. None is required.
  { name: 'DATING_WEIGHTS', group: 'Operations', purpose: 'Which weight table scores a pair: unset = astrology 0.90; astro-personality = astrology 0.75 + personality 0.15; retuned = the balanced audit table.', whenMissing: 'Correct. Astrology carries nine tenths of every percentage, as decided on 26 Aug.' },
  { name: 'DATING_ZODIAC', group: 'Operations', purpose: 'tropical restores the Western sun sign. Unset reads the same sidereal chart the Astrology Zone shows.', whenMissing: 'Correct. Dating and the Astrology Zone agree on every citizen\'s sign.' },
  { name: 'DATING_CORE_FILTERS', group: 'Operations', purpose: 'off returns intent, children and diet to opt-in chips only.', whenMissing: 'Correct. The three core questions filter for everybody who has answered them.' },
  { name: 'DATING_BAR', group: 'Operations', purpose: 'fixed restores the fixed 75% curated bar. Unset draws the bar at the viewer\'s own top tenth.', whenMissing: 'Correct. Every citizen with candidates has a curated shelf, including half-finished profiles.' },
  { name: 'DATING_BAR_FLOOR', group: 'Operations', purpose: 'A score below which the percentile bar will not be drawn, so a top tenth of nothing stays nothing.', whenMissing: 'No floor: the bar is purely the top tenth of the list.' },
  { name: 'DATING_CONFIDENCE', group: 'Operations', purpose: 'off disables the multiplier that lowers a score in proportion to how few of the six questions both people answered.', whenMissing: 'Correct. A number built from almost no answers is shown lower than one built from all of them.' },
  { name: 'DATING_POOL_CEILING', group: 'Operations', purpose: 'The most profiles one match request will read, most recently active first. Default 2000.', whenMissing: 'Uses the built-in 2000. The response says when the cap bound, so nobody mistakes a capped list for the city.' },
  { name: 'TURNSTILE_SECRET', group: 'Safety', purpose: 'Cloudflare Turnstile secret. Set, sign-up and sign-in need a confirmed token and refuse without one — fail-closed, including when Cloudflare is unreachable.', whenMissing: 'No bot check. The per-IP throttle and per-handle lockout are the whole defence, which is enough for a private beta and not for a public launch.', secret: true },
  { name: 'SENTRY_DSN', group: 'Operations', purpose: 'Where 5xx errors and unhandled rejections are reported. No request bodies, no citizen data.', whenMissing: 'Errors go to the process log only. Fine in development; in production nobody is told.', secret: true },
  { name: 'SENTRY_RELEASE', group: 'Operations', purpose: 'The release name errors are filed under. Falls back to the Vercel commit sha.', whenMissing: 'Errors are filed without a release name, which only makes them harder to place.' },
  { name: 'PHOTO_MODERATION', group: 'Safety', purpose: '"rekognition" (default) reviews every dating photo before another citizen sees it; "off" approves all, for development only.', whenMissing: 'Correct. Rekognition, and without its keys every photo stays pending — fail-closed.' },
  { name: 'REKOGNITION_REGION', group: 'Safety', purpose: 'AWS region of the Rekognition endpoint, e.g. ap-south-1.', whenMissing: 'Photo review cannot run; every dating photo stays pending and is shown to nobody but its owner.' },
  { name: 'REKOGNITION_ACCESS_KEY_ID', group: 'Safety', purpose: 'An IAM key allowed rekognition:DetectModerationLabels and nothing else.', whenMissing: 'Photo review cannot run — see REKOGNITION_REGION.', secret: true },
  { name: 'REKOGNITION_SECRET_ACCESS_KEY', group: 'Safety', purpose: 'The secret for REKOGNITION_ACCESS_KEY_ID.', whenMissing: 'Photo review cannot run — see REKOGNITION_REGION.', secret: true },
  { name: 'PHOTO_MODERATION_HOLD_AT', group: 'Safety', purpose: 'Confidence (0–100) at which a moderation label holds a photo for a person. Default 60.', whenMissing: 'Uses the built-in 60, which holds anything the machine is more than slightly unsure of.' },
  { name: 'PHOTO_MODERATION_REJECT_AT', group: 'Safety', purpose: 'Confidence at which explicit, violent or hateful content is refused outright. Default 90.', whenMissing: 'Uses the built-in 90; below it a person decides rather than the machine.' },
  { name: 'DATING_LIST_CACHE_SEC', group: 'Operations', purpose: 'How long one viewer\'s dating list answer is kept in Redis before it is scored again. Their own like, pass, connect or save drops it at once. Default 60.', whenMissing: 'Uses the built-in sixty seconds per viewer, per page.' },
  { name: 'DATING_REINDEX_DEBOUNCE_MS', group: 'Operations', purpose: 'How long a profile save waits for the next one before the new-match scan runs. Default 5000.', whenMissing: 'Uses the built-in five seconds between a save and its scan.' },
  { name: 'WALLET_SELF_TOPUP', group: 'Operations', purpose: '"on" lets a citizen credit their own wallet through the API. Off in production until a payment processor confirms the money.', whenMissing: 'Correct: in production, self top-up is refused.' },
  { name: 'CORS_PREVIEW_PROJECT', group: 'Operations', purpose: 'The Vercel project slug whose preview URLs may call the API with credentials.', whenMissing: 'No preview URL is allowed. Only CORS_ORIGIN and the site itself.' },
  { name: 'CORS_PREVIEW_TEAM', group: 'Operations', purpose: 'The Vercel team slug, so preview URLs are matched to this team and not to every *.vercel.app.', whenMissing: 'Preview URLs are matched by project alone.' },
  { name: 'TEST_DATABASE_URL', group: 'Operations', purpose: 'A throwaway database for the cross-user isolation tests.', whenMissing: 'Those tests SKIP rather than fail — the static guards still run, but nothing is proven against a live database.', secret: true },
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
  }));
}
