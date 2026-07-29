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
export interface IceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

export interface IceConfig {
  iceServers: IceServer[];
  /** True when at least one TURN/TURNS server is configured. */
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
}

const SCHEMES = /^(stun|stuns|turn|turns):/;

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
        servers.push({
          urls,
          ...(typeof e.username === 'string' && e.username ? { username: e.username } : {}),
          ...(typeof e.credential === 'string' && e.credential ? { credential: e.credential } : {}),
        });
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
      servers.push({
        urls,
        ...(env.TURN_USERNAME ? { username: env.TURN_USERNAME } : {}),
        ...(env.TURN_CREDENTIAL ? { credential: env.TURN_CREDENTIAL } : {}),
      });
    }
  }

  return { servers, problems };
}

/** True when the list contains something that can actually relay media. */
export function hasRelay(servers: IceServer[]): boolean {
  return servers.some((s) => s.urls.some((u) => u.startsWith('turn:') || u.startsWith('turns:')));
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
