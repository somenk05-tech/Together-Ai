import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto';
import { timingSafeEqualStr } from '../mail/mail-inbound';

/**
 * ── A TOKEN AT REST IS A TOKEN SEALED ───────────────────────────────────────
 *
 * The desk keeps eighteen sign-ins — each one able to post to a public account
 * with the city's name on it. A database dump, a read replica or a console
 * that renders a row must not hand any of them over, so they are stored
 * AES-256-GCM-sealed under SOCIAL_TOKEN_KEY and opened only in the process
 * that is about to use them. The same key signs the sign-in `state`, so a
 * callback cannot be forged or replayed into another operator's session.
 *
 * FAILS CLOSED. No key, or a key that is not 32 bytes, and nothing is sealed,
 * nothing is opened and no Connect button works — a desk that fell back to
 * storing tokens in the clear would look identical from the page.
 */

/** 32 bytes, from base64 or hex. Null when unset or the wrong length. */
export function sealKey(env: NodeJS.ProcessEnv = process.env): Buffer | null {
  const raw = (env.SOCIAL_TOKEN_KEY ?? '').trim();
  if (!raw) return null;
  const buf = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  return buf.length === 32 ? buf : null;
}

export function seal(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), body.toString('base64url')].join('.');
}

/** The plain text, or null for anything tampered with, truncated or sealed under another key. */
export function unseal(sealed: string, key: Buffer): string | null {
  const [v, iv, tag, body] = sealed.split('.');
  if (v !== 'v1' || !iv || !tag || body === undefined) return null;
  try {
    const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
    d.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(body, 'base64url')), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}

export interface SignInState {
  platform: string;
  topic: string;
  /** The operator who pressed Connect. Only they may finish the sign-in. */
  actor: string;
  /** Epoch ms after which the state is refused. */
  exp: number;
  nonce: string;
}

/** Ten minutes: long enough to find the right account in a chooser. */
export const STATE_TTL_MS = 10 * 60 * 1000;

export function signState(s: Omit<SignInState, 'nonce' | 'exp'>, key: Buffer, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ ...s, exp: now + STATE_TTL_MS, nonce: randomBytes(9).toString('base64url') }))
    .toString('base64url');
  return `${body}.${createHmac('sha256', key).update(body).digest('base64url')}`;
}

export function readState(raw: string, key: Buffer, now = Date.now()): SignInState | null {
  const [body, mac] = (raw ?? '').split('.');
  if (!body || !mac) return null;
  if (!timingSafeEqualStr(mac, createHmac('sha256', key).update(body).digest('base64url'))) return null;
  try {
    const s = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SignInState;
    if (typeof s.exp !== 'number' || s.exp < now) return null;
    if (typeof s.platform !== 'string' || typeof s.topic !== 'string' || typeof s.actor !== 'string') return null;
    return s;
  } catch {
    return null;
  }
}
