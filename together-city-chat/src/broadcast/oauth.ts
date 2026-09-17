import type { PlatformKey } from './channels';
import { callJson, form, query, type Http } from './http';

/**
 * ── SIGNING IN TO THREE PLATFORMS, ONCE PER TOPIC ──────────────────────────
 *
 * Each platform's standard authorization-code flow, in the shape its own
 * documentation gives (read 17 Sep):
 *
 *   YouTube    Google OAuth 2.0 — accounts.google.com/o/oauth2/v2/auth,
 *              oauth2.googleapis.com/token, access_type=offline so a refresh
 *              token comes back. Who signed in is read from
 *              youtube/v3/channels?mine=true.
 *   Instagram  Instagram API with Instagram Login — instagram.com/oauth/authorize,
 *              api.instagram.com/oauth/access_token, then graph.instagram.com
 *              access_token (ig_exchange_token) for the 60-day token and
 *              refresh_access_token (ig_refresh_token) to extend it.
 *   Threads    threads.net/oauth/authorize, graph.threads.net/oauth/access_token,
 *              then access_token (th_exchange_token) and refresh_access_token
 *              (th_refresh_token).
 *
 * Nothing here stores anything. accounts.service.ts seals what comes back.
 */

export interface Grant {
  access: string;
  /** Google's refresh token. Meta has none: its long-lived token refreshes itself. */
  refresh: string | null;
  expiresAt: Date | null;
  /** The platform's id for the account that signed in. */
  externalId: string;
  /** What a person would call it: @handle, or the username. */
  handle: string;
}

export interface Fresh { access: string; refresh: string | null; expiresAt: Date | null }

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
].join(' ');
const IG_SCOPES = 'instagram_business_basic,instagram_business_content_publish';
const TH_SCOPES = 'threads_basic,threads_content_publish';

const inSeconds = (s: unknown, now: number): Date | null =>
  typeof s === 'number' && Number.isFinite(s) && s > 0 ? new Date(now + s * 1000) : null;

const env = (e: NodeJS.ProcessEnv, name: string): string => (e[name] ?? '').trim();

export function authorizeUrl(platform: PlatformKey, state: string, e: NodeJS.ProcessEnv = process.env): string {
  const redirect = env(e, 'SOCIAL_OAUTH_REDIRECT_URL');
  switch (platform) {
    case 'youtube':
      return query('https://accounts.google.com/o/oauth2/v2/auth', {
        client_id: env(e, 'GOOGLE_OAUTH_CLIENT_ID'), redirect_uri: redirect, response_type: 'code',
        scope: GOOGLE_SCOPES, access_type: 'offline',
        // consent: a refresh token is only issued on a consent screen.
        // select_account: all six channels are one Google login, so the
        // chooser must appear every time or the last channel is reused.
        prompt: 'consent select_account', include_granted_scopes: 'false', state,
      });
    case 'instagram':
      return query('https://www.instagram.com/oauth/authorize', {
        client_id: env(e, 'INSTAGRAM_APP_ID'), redirect_uri: redirect, response_type: 'code',
        scope: IG_SCOPES, force_reauth: 'true', state,
      });
    case 'threads':
      return query('https://threads.net/oauth/authorize', {
        client_id: env(e, 'THREADS_APP_ID'), redirect_uri: redirect, response_type: 'code',
        scope: TH_SCOPES, state,
      });
  }
}

export async function exchangeCode(platform: PlatformKey, rawCode: string, http: Http, e: NodeJS.ProcessEnv = process.env, now = Date.now()): Promise<Grant> {
  // Instagram appends "#_" to the code it hands back; it is not part of it.
  const code = rawCode.replace(/#_$/, '').trim();
  const redirect = env(e, 'SOCIAL_OAUTH_REDIRECT_URL');

  if (platform === 'youtube') {
    const t = await callJson<{ access_token: string; refresh_token?: string; expires_in?: number }>(
      http, 'YouTube', 'https://oauth2.googleapis.com/token',
      form({ code, client_id: env(e, 'GOOGLE_OAUTH_CLIENT_ID'), client_secret: env(e, 'GOOGLE_OAUTH_CLIENT_SECRET'), redirect_uri: redirect, grant_type: 'authorization_code' }),
    );
    if (!t.refresh_token) {
      throw new Error('Google did not hand back a refresh token, so this channel could not stay connected. Press Connect again and approve the consent screen.');
    }
    const me = await callJson<{ items?: Array<{ id: string; snippet?: { customUrl?: string; title?: string } }> }>(
      http, 'YouTube', query('https://www.googleapis.com/youtube/v3/channels', { part: 'snippet', mine: 'true' }),
      { headers: { Authorization: `Bearer ${t.access_token}` } },
    );
    const ch = me.items?.[0];
    if (!ch) throw new Error('That Google sign-in has no YouTube channel.');
    return {
      access: t.access_token, refresh: t.refresh_token, expiresAt: inSeconds(t.expires_in, now),
      externalId: ch.id, handle: ch.snippet?.customUrl ?? ch.snippet?.title ?? ch.id,
    };
  }

  if (platform === 'instagram') {
    // The short-lived exchange has answered both flat and wrapped in `data`.
    const raw = await callJson<{ access_token?: string; data?: Array<{ access_token: string }> }>(
      http, 'Instagram', 'https://api.instagram.com/oauth/access_token',
      form({ client_id: env(e, 'INSTAGRAM_APP_ID'), client_secret: env(e, 'INSTAGRAM_APP_SECRET'), grant_type: 'authorization_code', redirect_uri: redirect, code }),
    );
    const short = raw.access_token ?? raw.data?.[0]?.access_token;
    if (!short) throw new Error('Instagram answered the sign-in without a token.');
    const long = await callJson<{ access_token: string; expires_in?: number }>(
      http, 'Instagram', query('https://graph.instagram.com/access_token', { grant_type: 'ig_exchange_token', client_secret: env(e, 'INSTAGRAM_APP_SECRET'), access_token: short }),
    );
    const me = await callJson<{ user_id?: string | number; id?: string; username?: string }>(
      http, 'Instagram', query('https://graph.instagram.com/me', { fields: 'user_id,username', access_token: long.access_token }),
    );
    const id = String(me.user_id ?? me.id ?? '');
    if (!id || !me.username) throw new Error('Instagram did not say which account signed in.');
    return { access: long.access_token, refresh: null, expiresAt: inSeconds(long.expires_in, now), externalId: id, handle: me.username };
  }

  const short = await callJson<{ access_token: string }>(
    http, 'Threads', 'https://graph.threads.net/oauth/access_token',
    form({ client_id: env(e, 'THREADS_APP_ID'), client_secret: env(e, 'THREADS_APP_SECRET'), grant_type: 'authorization_code', redirect_uri: redirect, code }),
  );
  const long = await callJson<{ access_token: string; expires_in?: number }>(
    http, 'Threads', query('https://graph.threads.net/access_token', { grant_type: 'th_exchange_token', client_secret: env(e, 'THREADS_APP_SECRET'), access_token: short.access_token }),
  );
  const me = await callJson<{ id?: string; username?: string }>(
    http, 'Threads', query('https://graph.threads.net/v1.0/me', { fields: 'id,username', access_token: long.access_token }),
  );
  if (!me.id || !me.username) throw new Error('Threads did not say which profile signed in.');
  return { access: long.access_token, refresh: null, expiresAt: inSeconds(long.expires_in, now), externalId: me.id, handle: me.username };
}

/** A fresh access token. Google spends the refresh token; Meta extends the token itself. */
export async function refreshGrant(platform: PlatformKey, current: { access: string; refresh: string | null }, http: Http, e: NodeJS.ProcessEnv = process.env, now = Date.now()): Promise<Fresh> {
  if (platform === 'youtube') {
    if (!current.refresh) throw new Error('This YouTube channel has no refresh token. Connect it again.');
    const t = await callJson<{ access_token: string; expires_in?: number; refresh_token?: string }>(
      http, 'YouTube', 'https://oauth2.googleapis.com/token',
      form({ client_id: env(e, 'GOOGLE_OAUTH_CLIENT_ID'), client_secret: env(e, 'GOOGLE_OAUTH_CLIENT_SECRET'), refresh_token: current.refresh, grant_type: 'refresh_token' }),
    );
    return { access: t.access_token, refresh: t.refresh_token ?? current.refresh, expiresAt: inSeconds(t.expires_in, now) };
  }
  const [url, grant, label] = platform === 'instagram'
    ? ['https://graph.instagram.com/refresh_access_token', 'ig_refresh_token', 'Instagram']
    : ['https://graph.threads.net/refresh_access_token', 'th_refresh_token', 'Threads'];
  const t = await callJson<{ access_token: string; expires_in?: number }>(
    http, label, query(url, { grant_type: grant, access_token: current.access }),
  );
  return { access: t.access_token, refresh: null, expiresAt: inSeconds(t.expires_in, now) };
}
