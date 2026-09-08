import { Logger } from '@nestjs/common';

/**
 * ── THE ONE CHECK THIS CITY DID NOT HAVE ────────────────────────────────────
 *
 * Every image surface in Together City passes through Rekognition's
 * `DetectModerationLabels`, and until 6 September that was the whole of it.
 * Label detection answers "does this picture look explicit / violent /
 * suggestive". It is trained on adult content and it does **not** do
 * perceptual-hash matching against a known-bad list, which is the only method
 * that reliably identifies child sexual abuse material. Searching the tree for
 * `ncmec|photodna|csam|hash match` returned nothing at all.
 *
 * At a million daily citizens, on a product with dating photographs and
 * self-deleting snaps, that is a certainty rather than a risk — and it had no
 * machinery behind it: no known-hash list, no hard block, no preservation of
 * the evidence, no report.
 *
 * ── WHY THIS IS AN INTERFACE AND NOT A VENDOR ───────────────────────────────
 *
 * Hash matching is a regulated service. Cloudflare's CSAM Scanning Tool, Thorn
 * Safer and Microsoft PhotoDNA all require a registered, verified account and
 * each speaks a different protocol; two of them cannot be called at all until
 * a contract is signed. Hard-wiring one of them would mean writing an API from
 * memory and shipping it untested, which on this of all checks is worse than
 * useless — it would look like the gate exists.
 *
 * So the seam is here, in the same shape as `astrology/voice/speech.provider`:
 * an interface, a null implementation that is honest about being null, and one
 * HTTP implementation that speaks a contract small enough for any vendor to sit
 * behind in a few lines of adapter.
 *
 * ── FAIL CLOSED, AND FAIL CLOSED BY DEFAULT ─────────────────────────────────
 *
 * `NoHashMatchProvider.check` THROWS. It does not return "no match". Every
 * caller of `HashMatchService` treats a throw as `unavailable`, and every
 * surface treats `unavailable` as "do not show this to anybody" — pending on a
 * dating profile, a retryable refusal in chat, a retryable refusal on a post.
 *
 * That means: with no matcher configured, no photograph moves anywhere in the
 * city. That is deliberate, it is the owner's call (6 Sep), and it is the same
 * trade `PostMediaGuard` already makes for Rekognition. It is loud rather than
 * silent, which is the point — a CSAM gate that quietly approves when it is
 * unconfigured is the exact failure this file exists to prevent.
 */

/** What the matcher said. `source` names the list that matched, for the record. */
export type HashVerdict = { match: false } | { match: true; source: string };

/** Thrown when the matcher could not answer. Never caught into a pass. */
export class HashMatchUnavailable extends Error {
  constructor(reason: string) {
    super(`hash match unavailable: ${reason}`);
    this.name = 'HashMatchUnavailable';
  }
}

export interface HashMatchProvider {
  /** For logs and the diagnostics page. */
  readonly name: string;
  /** False when nothing is configured. `check` still throws rather than passing. */
  readonly ready: boolean;
  /**
   * Ask whether these bytes match a known-bad hash.
   *
   * MUST throw `HashMatchUnavailable` rather than returning `{ match: false }`
   * when it cannot answer. The difference between "I looked and found nothing"
   * and "I could not look" is the whole safety property.
   */
  check(bytes: Buffer, contentType: string, sha256: string): Promise<HashVerdict>;
}

/**
 * THE WORD THAT SWITCHES THE GATE OFF, ON PURPOSE (owner, 8 Sep).
 *
 * `CSAM_MATCH_URL=off`. Not unset — unset is an accident and fails closed —
 * but this one word, typed by an operator who has read what it costs. It
 * exists because the gate shipped to production before any vendor was
 * signed, and a city where nobody can post a photograph is not a safer city,
 * it is a closed one. It is temporary by construction: assertProductionConfig
 * lists it as a problem on every boot and on /dev until a real URL replaces
 * it, and the service never caches a "clear" it did not earn, so the day a
 * matcher arrives every image is asked again.
 */
export const HASH_MATCH_OFF = 'off';

/** The operator said "off". Every image is waved through, and every boot says so. */
export class BypassHashMatchProvider implements HashMatchProvider {
  readonly name = 'bypass';
  readonly ready = true;
  check(): Promise<HashVerdict> {
    return Promise.resolve({ match: false });
  }
}

/**
 * No vendor configured. Answers nothing, and says so every time.
 *
 * THE REASON IS A PARAMETER because there is now more than one way to arrive
 * here, and "unconfigured" is the answer to all of them: the URL is unset, or
 * a dialect was named without the credentials it needs. A half-configured
 * matcher must fail closed exactly like an absent one and must NEVER silently
 * fall back to a different dialect — an adapter that speaks the wrong protocol
 * to the right vendor answers 404 for every image, and 404 is an outage, not a
 * pass. The default is the original sentence, which the boot log and its spec
 * still read.
 */
export class NoHashMatchProvider implements HashMatchProvider {
  readonly name = 'none';
  readonly ready = false;
  constructor(private readonly reason = 'no matcher is configured (CSAM_MATCH_URL is unset)') {}
  check(): Promise<HashVerdict> {
    return Promise.reject(new HashMatchUnavailable(this.reason));
  }
}

/**
 * ── THE CONTRACT ────────────────────────────────────────────────────────────
 *
 * One POST, JSON in, JSON out, so a vendor adapter is a small worker rather
 * than a change in this repository.
 *
 *   POST $CSAM_MATCH_URL
 *   Authorization: Bearer $CSAM_MATCH_TOKEN        (omitted when unset)
 *   Content-Type: application/json
 *
 *   { "sha256": "<hex>", "contentType": "image/jpeg", "imageBase64": "<...>" }
 *
 *   200 → { "match": false }
 *   200 → { "match": true, "source": "<list that matched>" }
 *   anything else, a body that is not that shape, a timeout, a network error
 *        → HashMatchUnavailable
 *
 * `sha256` is sent as well as the bytes so an adapter holding its own cache, or
 * one that only does exact-hash lookup, need not decode the image at all.
 *
 * A 200 whose body cannot be read as the shape above is treated as an outage,
 * NOT as a pass. A matcher that answers `{"ok":true}` because somebody pointed
 * this at the wrong endpoint must fail closed like everything else here.
 */
export class HttpHashMatchProvider implements HashMatchProvider {
  readonly name = 'http';
  readonly ready = true;
  private readonly logger = new Logger('HashMatchProvider');

  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly timeoutMs: number,
  ) {}

  async check(bytes: Buffer, contentType: string, sha256: string): Promise<HashVerdict> {
    let res: Response;
    try {
      res = await fetch(this.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        body: JSON.stringify({ sha256, contentType, imageBase64: bytes.toString('base64') }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      throw new HashMatchUnavailable((e as Error).message);
    }
    if (!res.ok) throw new HashMatchUnavailable(`matcher answered ${res.status}`);
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new HashMatchUnavailable('matcher answered a body that is not JSON');
    }
    const m = (body as { match?: unknown; source?: unknown } | null)?.match;
    if (typeof m !== 'boolean') throw new HashMatchUnavailable('matcher answered without a boolean `match`');
    if (!m) return { match: false };
    const source = (body as { source?: unknown }).source;
    const named = typeof source === 'string' && source.trim() ? source.trim().slice(0, 200) : 'unnamed list';
    this.logger.error(`hash match HIT (${named}) on ${sha256.slice(0, 16)}…`);
    return { match: true, source: named };
  }
}

/**
 * ── THE DIALECT, BECAUSE THE FREE ONE DOES NOT SPEAK THE CONTRACT ───────────
 *
 * `CSAM_MATCH_KIND` names which protocol lives at `CSAM_MATCH_URL`. Unset, it
 * is the contract above — the shape this repository asked vendors to adapt to.
 * `arachnid` is the Arachnid Shield API run by the Canadian Centre for Child
 * Protection, and it is here for one reason: it is the only known-bad-hash
 * service a platform this size can be using THIS WEEK. It is free to
 * electronic service providers, an ESP registers for credentials themselves at
 * projectarachnid.com rather than negotiating a contract, and it matches on
 * both SHA1 and PhotoDNA against the Centre's own classified corpus.
 *
 * The other three named in .env.example are still one variable away through
 * the contract above, and should replace this the day one of them is signed:
 * Thorn Safer Match is paid and sold through AWS Marketplace, PhotoDNA Cloud
 * and Google's Hash Matching API are free but gated behind an application, and
 * Cloudflare's CSAM Scanning Tool scans what its edge already serves rather
 * than answering a call. None of them could be called today.
 *
 * WHY IT IS A SECOND PROVIDER AND NOT AN ADAPTER WORKER. The contract exists
 * so a vendor sits behind a few lines somewhere else, and that is still true
 * for anyone who wants it. But a worker is a second service to deploy, hold
 * credentials for, watch and pay for, standing in the path of every photograph
 * in the city — and this one is forty lines with a spec on it. The seam did
 * not move: `HashMatchProvider` is still the interface, this is still one
 * implementation of it, and nothing above this line changed.
 */
export const HASH_MATCH_ARACHNID = 'arachnid';

/** What Arachnid Shield calls "I looked and found nothing". Anything else is a hit. */
const ARACHNID_NO_MATCH = 'no-known-match';

/**
 * ── THE ARACHNID SHIELD DIALECT ─────────────────────────────────────────────
 *
 *   POST $CSAM_MATCH_URL            (https://shield.projectarachnid.com/v1/media/)
 *   Authorization: Basic <CSAM_MATCH_USER:CSAM_MATCH_PASSWORD>
 *   Content-Type: <the image's own mime type>
 *   <the raw bytes>
 *
 *   200 → { "classification": "no-known-match", "match_type": null, ... }
 *   200 → { "classification": "csam" | "harmful-abusive-material",
 *           "match_type": "exact" | "near", ... }
 *
 * Raw bytes rather than JSON, and Basic rather than Bearer — which is the
 * whole reason this class exists instead of a `CSAM_MATCH_URL` pointing
 * straight at them.
 *
 * ANY CLASSIFICATION THAT IS NOT `no-known-match` IS A MATCH, including one
 * this code has never heard of. The Centre says plainly that more categories
 * may be added, and the two rules that could be written here are not
 * symmetrical: treating an unknown category as a pass waves through the exact
 * material the gate exists to stop, while treating it as a hit refuses one
 * image loudly and puts a row in front of a person. The SDK's own
 * `matches_known_media` reads it the same way.
 *
 * A MISSING CLASSIFICATION IS AN OUTAGE, NOT A PASS — the same rule the
 * contract above applies to a missing boolean, and for the same reason: a body
 * in the wrong shape means somebody pointed this at the wrong endpoint.
 */
export class ArachnidHashMatchProvider implements HashMatchProvider {
  readonly name = 'arachnid';
  readonly ready = true;
  private readonly logger = new Logger('HashMatchProvider');
  private readonly auth: string;

  constructor(
    private readonly url: string,
    username: string,
    password: string,
    private readonly timeoutMs: number,
  ) {
    this.auth = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  }

  async check(bytes: Buffer, contentType: string, sha256: string): Promise<HashVerdict> {
    let res: Response;
    try {
      res = await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': contentType, Authorization: this.auth },
        body: new Uint8Array(bytes),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      throw new HashMatchUnavailable((e as Error).message);
    }
    if (!res.ok) throw new HashMatchUnavailable(`matcher answered ${res.status}`);
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new HashMatchUnavailable('matcher answered a body that is not JSON');
    }
    const raw = (body as { classification?: unknown } | null)?.classification;
    if (typeof raw !== 'string' || !raw.trim()) {
      throw new HashMatchUnavailable('matcher answered without a `classification`');
    }
    const classification = raw.trim().toLowerCase();
    if (classification === ARACHNID_NO_MATCH) return { match: false };
    const how = (body as { match_type?: unknown }).match_type;
    const named = `Project Arachnid Shield (${classification}`
      + `${typeof how === 'string' && how.trim() ? `, ${how.trim().slice(0, 20)} match` : ''})`;
    this.logger.error(`hash match HIT (${named}) on ${sha256.slice(0, 16)}\u2026`);
    return { match: true, source: named };
  }
}
