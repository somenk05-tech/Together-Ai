/**
 * Where two browsers agree to meet.
 *
 * A call never flows through this API. The server's whole job is to hand each
 * side a list of STUN/TURN servers and relay the handshake; the audio and video
 * go peer to peer. That makes this file small and makes what it gets wrong
 * expensive: a bad ICE list is a call that rings, connects, and then sits in
 * silence.
 *
 * The honest part is `relayAvailable`. STUN alone lets two peers discover their
 * public addresses, which is enough for most home networks and not enough for
 * symmetric NAT — corporate wifi, some mobile carriers. Those calls need a TURN
 * relay to carry the media, and without one they fail with no explanation the
 * citizen could act on. So when no TURN server is configured we say so, in the
 * response, in words a frontend can show, rather than shipping a config that
 * looks complete and works for whoever happens to test it.
 */
import { createHmac } from 'crypto';

export interface IceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

export interface IceConfig {
  iceServers: IceServer[];
  /** True when at least one TURN/TURNS server is configured AND can be
   *  authenticated to. A URL on its own is not a relay — see isRelay. */
  relayAvailable: boolean;
  /** Set when something is missing or malformed. Null when all is well. */
  note: string | null;
}

/** Free public STUN. Address discovery only — it relays nothing. */
export const PUBLIC_STUN = 'stun:stun.l.google.com:19302';

export interface IceEnv {
  /** JSON array of RTCIceServer objects, for a full custom list. */
  ICE_SERVERS?: string;
  /** Or just a TURN server, the common case. */
  TURN_URL?: string;
  TURN_USERNAME?: string;
  TURN_CREDENTIAL?: string;
  /**
   * ── A CREDENTIAL THAT EXPIRES, MINTED PER CITIZEN (5 Sep) ─────────────────
   * ICE_SERVERS carried ONE static username/credential pair, handed to every
   * account: anybody who had ever opened the calls screen could relay any
   * traffic through the relay on the city's bill, forever. Two ways to mint a
   * short-lived pair instead, and the static pair is then only what the
   * relay's URLs are read from:
   *   TURN_SHARED_SECRET — the TURN REST API (coturn `use-auth-secret`, and
   *     every provider that supports it): username `<expiry>:<userId>`,
   *     credential base64(HMAC-SHA1(secret, username)).
   *   METERED_APP + METERED_SECRET_KEY — metered.ca: POST
   *     /api/v1/turn/credential?secretKey=… CREATES a pair that expires in
   *     TURN_CREDENTIAL_TTL seconds. (Not the GET …/credentials?apiKey=
   *     endpoint: that one ignores expiryInSeconds and hands back the same
   *     static pair — proved against the live app on 5 Sep before this was
   *     corrected. The secret key is on the dashboard's Developers page.)
   */
  TURN_SHARED_SECRET?: string;
  METERED_APP?: string;
  METERED_SECRET_KEY?: string;
  /** Seconds a minted credential lives; default 4 hours, floor 10 minutes. */
  TURN_CREDENTIAL_TTL?: string;
}

export function credentialTtl(env: IceEnv): number {
  const n = Number.parseInt(env.TURN_CREDENTIAL_TTL ?? '', 10);
  return Number.isFinite(n) && n >= 600 ? n : 4 * 3600;
}

/** TURN REST API credential: deterministic given (secret, userId, expiry). */
export function mintTurnCredential(secret: string, userId: string, expiresAtSec: number): { username: string; credential: string } {
  const username = `${expiresAtSec}:${userId}`;
  const credential = createHmac('sha1', secret).update(username).digest('base64');
  return { username, credential };
}

/** The relay entries of a list with the static pair swapped for a minted one. */
export function withMintedCredential(servers: IceServer[], minted: { username: string; credential: string }): IceServer[] {
  return servers.map((s) => (isRelay(s) ? { urls: s.urls, ...minted } : { urls: s.urls }));
}

/** The static pair, stripped — what a citizen gets when minting fails. */
export function withoutRelay(servers: IceServer[]): IceServer[] {
  return servers.filter((s) => !isRelay(s));
}

const SCHEMES = /^(stun|stuns|turn|turns):/;

/**
 * A relay, and not merely a `turn:` URL.
 *
 * TURN is the one ICE server that authenticates. Every public TURN deployment
 * refuses an allocation without a username and credential, so an entry missing
 * either relays nothing — and counting it made `relayAvailable: true` the most
 * expensive lie in this file: the honest note above went unsaid, the frontend
 * showed nothing, and the citizen on office wifi got a call that rang,
 * connected and sat in silence. The exact failure the note exists to prevent,
 * produced by the check that was supposed to raise it.
 */
function isRelay(server: IceServer): boolean {
  const turn = server.urls.some((u) => u.startsWith('turn:') || u.startsWith('turns:'));
  return turn && !!server.username && !!server.credential;
}

/** Set when a TURN entry was kept but cannot be used. */
function credentialProblem(server: IceServer, where: string): string | null {
  const turn = server.urls.some((u) => u.startsWith('turn:') || u.startsWith('turns:'));
  if (!turn || (server.username && server.credential)) return null;
  return `${where} names a TURN server with no ${server.username ? 'credential' : 'username and credential'} — it cannot relay anything.`;
}

function urlsOf(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : [value];
  return raw
    .filter((u): u is string => typeof u === 'string')
    .map((u) => u.trim())
    .filter((u) => SCHEMES.test(u));
}

/**
 * Parse the configured servers, dropping anything unusable.
 *
 * Deliberately total: a malformed ICE_SERVERS returns an empty list and a note,
 * never an exception. This is read at boot and on every call setup, and a typo
 * in an env var should degrade calling, not take the API down.
 */
export function parseIceServers(env: IceEnv): { servers: IceServer[]; problems: string[] } {
  const servers: IceServer[] = [];
  const problems: string[] = [];

  if (env.ICE_SERVERS?.trim()) {
    try {
      const parsed: unknown = JSON.parse(env.ICE_SERVERS);
      if (!Array.isArray(parsed)) throw new Error('not an array');
      for (const entry of parsed) {
        const e = entry as { urls?: unknown; username?: unknown; credential?: unknown };
        const urls = urlsOf(e?.urls);
        if (!urls.length) continue;
        const server: IceServer = {
          urls,
          ...(typeof e.username === 'string' && e.username ? { username: e.username } : {}),
          ...(typeof e.credential === 'string' && e.credential ? { credential: e.credential } : {}),
        };
        servers.push(server);
        // Kept in the list — the browser is welcome to try — but said out loud,
        // because otherwise this is a relay only on paper.
        const problem = credentialProblem(server, 'ICE_SERVERS');
        if (problem) problems.push(problem);
      }
      if (!servers.length) problems.push('ICE_SERVERS parsed but contained no usable stun:/turn: URLs.');
    } catch {
      problems.push('ICE_SERVERS is not valid JSON — ignoring it.');
    }
  }

  const turn = env.TURN_URL?.trim();
  if (turn) {
    const urls = urlsOf(turn);
    if (!urls.length) {
      problems.push('TURN_URL is not a turn:/turns: URL — ignoring it.');
    } else {
      const server: IceServer = {
        urls,
        ...(env.TURN_USERNAME ? { username: env.TURN_USERNAME } : {}),
        ...(env.TURN_CREDENTIAL ? { credential: env.TURN_CREDENTIAL } : {}),
      };
      servers.push(server);
      const problem = credentialProblem(server, 'TURN_URL');
      if (problem) problems.push(problem);
    }
  }

  return { servers, problems };
}

/** True when the list contains something that can actually relay media. */
export function hasRelay(servers: IceServer[]): boolean {
  return servers.some(isRelay);
}

export function buildIceConfig(env: IceEnv): IceConfig {
  const { servers, problems } = parseIceServers(env);
  // Always give the peers somewhere to discover themselves, even if nothing is
  // configured. A call with no ICE servers at all cannot connect off localhost.
  if (!servers.some((s) => s.urls.some((u) => u.startsWith('stun')))) {
    servers.unshift({ urls: [PUBLIC_STUN] });
  }
  const relayAvailable = hasRelay(servers);
  if (!relayAvailable) {
    problems.push(
      'No TURN relay is configured. Calls between people on restrictive networks ' +
        '(some office wifi and mobile carriers) will ring but never connect. Set ' +
        'TURN_URL, TURN_USERNAME and TURN_CREDENTIAL to fix that.',
    );
  }
  return { iceServers: servers, relayAvailable, note: problems.length ? problems.join(' ') : null };
}
