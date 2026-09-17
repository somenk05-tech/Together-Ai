/**
 * ── WHERE ONE UPLOAD CAN GO (owner, 9 Sep; rebuilt 17 Sep) ──────────────────
 *
 * 9 Sep: "Create a media page for Together City where I upload content in the
 * developer section and it goes to all social media pages and gets uploaded on
 * its own." The desk was built then with every platform refusing, because no
 * credential existed yet.
 *
 * 17 Sep: the owner named the destinations — the topic's YouTube channel, its
 * Instagram account, its Threads profile, and Together TV — and asked for the
 * posting itself. So the four channels below are the whole list, and three of
 * them now post for real (platforms.ts).
 *
 * TWO KINDS OF CREDENTIAL, AND THEY FAIL DIFFERENTLY.
 *
 *   The APP credential is one per platform, set on Railway: the Google Cloud
 *   OAuth client, the Meta app's Instagram and Threads ids. Without it no
 *   account can even be connected, and the desk says which variable is unset.
 *
 *   The ACCOUNT credential is one per topic per platform — six YouTube
 *   channels, six Instagram accounts, six Threads profiles — obtained by the
 *   owner pressing Connect and signing in, and stored sealed in the database
 *   (accounts.service.ts). Without it that one topic refuses on that one
 *   platform, and its row says so.
 *
 * Together TV needs neither: it is the city's own wall, and the post is made
 * as the operator who pressed Publish.
 */

export type ChannelKey = 'youtube' | 'instagram' | 'threads' | 'tv';
/** The three that sign in to somebody else's house. */
export type PlatformKey = Exclude<ChannelKey, 'tv'>;

export interface ChannelDef {
  key: ChannelKey;
  label: string;
  /** App-level variables. All present = the Connect buttons work. */
  needs: string[];
  /** What the operator must go and get, in the order to get it. */
  obtain: string[];
  /** The limit that will bite first, in the platform's own terms. */
  limit: string;
}

/** Shared by all three platforms: seals stored tokens and signs the sign-in state. */
export const SEAL_VAR = 'SOCIAL_TOKEN_KEY';
/** The page the platforms send the operator back to, registered in each console. */
export const REDIRECT_VAR = 'SOCIAL_OAUTH_REDIRECT_URL';

export const CHANNELS: readonly ChannelDef[] = [
  {
    key: 'youtube',
    label: 'YouTube',
    needs: ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', SEAL_VAR, REDIRECT_VAR],
    obtain: [
      'Google Cloud console → new project "Together City Social" → APIs & Services → enable "YouTube Data API v3".',
      'OAuth consent screen → External → add the two scopes youtube.upload and youtube.readonly → publish the app to "In production" (in Testing, Google expires the sign-in after 7 days).',
      'Credentials → Create OAuth client → Web application → Authorised redirect URI = the value of SOCIAL_OAUTH_REDIRECT_URL, exactly.',
      'Put the client id and secret on Railway as GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET, then press Connect on each topic and pick that topic\'s channel in Google\'s chooser.',
      'Ask Google for the YouTube API audit (the "YouTube API Services – Audit and Quota Extension" form). Until it passes, every upload is forced to Private.',
    ],
    limit: 'Uploads from an API project Google has not audited are locked to Private. Upload volume is capped by the project\'s daily quota.',
  },
  {
    key: 'instagram',
    label: 'Instagram',
    needs: ['INSTAGRAM_APP_ID', 'INSTAGRAM_APP_SECRET', SEAL_VAR, REDIRECT_VAR],
    obtain: [
      'developers.facebook.com → Create app → use case "Manage messaging & content on Instagram" (Instagram API with Instagram Login).',
      'API setup with Instagram business login → add the redirect URI (SOCIAL_OAUTH_REDIRECT_URL) and note the Instagram app id and secret.',
      'App roles → Roles → add each of the six Instagram accounts as an Instagram Tester, then accept on instagram.com from each account (Settings → Apps and websites → Tester invites). Accounts with a role on the app can be posted to without App Review.',
      'Put the id and secret on Railway as INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET, then press Connect on each topic while signed in to that topic\'s Instagram account.',
    ],
    limit: 'Instagram allows 100 API-published posts per account per 24 hours. A Reel is fetched by Instagram from a link, H.264/AAC MP4.',
  },
  {
    key: 'threads',
    label: 'Threads',
    needs: ['THREADS_APP_ID', 'THREADS_APP_SECRET', SEAL_VAR, REDIRECT_VAR],
    obtain: [
      'In the same Meta app → add the use case "Access the Threads API" → permissions threads_basic and threads_content_publish.',
      'Threads settings → add SOCIAL_OAUTH_REDIRECT_URL as a redirect callback, and note the Threads app id and secret.',
      'App roles → add each Threads profile as a Threads Tester and accept in Threads (Settings → Account → Website permissions → Invites).',
      'Put them on Railway as THREADS_APP_ID and THREADS_APP_SECRET, then press Connect on each topic while signed in to that topic\'s Threads profile.',
    ],
    limit: 'Threads allows 250 posts per profile per 24 hours; text is 500 characters and a video at most 5 minutes.',
  },
  {
    key: 'tv',
    label: 'Together TV',
    needs: [],
    obtain: [],
    limit: 'Posted as the account that pressed Publish. Unticked, the upload is still kept — as a private post only that account sees — because it is the city\'s own copy the other three are made from.',
  },
];

export const CHANNEL_KEYS = CHANNELS.map((c) => c.key) as [ChannelKey, ...ChannelKey[]];
export const PLATFORM_KEYS: readonly PlatformKey[] = ['youtube', 'instagram', 'threads'];
export const isChannel = (k: string): k is ChannelKey => (CHANNEL_KEYS as string[]).includes(k);
export const isPlatform = (k: string): k is PlatformKey => (PLATFORM_KEYS as readonly string[]).includes(k);
export const channel = (k: string): ChannelDef | undefined => CHANNELS.find((c) => c.key === k);

/**
 * Which of a channel's app variables are missing, right now.
 *
 * Names only — never a value, not even a length. This is read by a page behind
 * a password, and a page that can report the shape of a secret is a page that
 * can be used to confirm a guess about it.
 */
export function missingFor(def: ChannelDef, env: NodeJS.ProcessEnv = process.env): string[] {
  return def.needs.filter((n) => !(env[n] ?? '').trim());
}

export function isConfigured(def: ChannelDef, env: NodeJS.ProcessEnv = process.env): boolean {
  return missingFor(def, env).length === 0;
}
