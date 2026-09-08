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

/** No vendor configured. Answers nothing, and says so every time. */
export class NoHashMatchProvider implements HashMatchProvider {
  readonly name = 'none';
  readonly ready = false;
  check(): Promise<HashVerdict> {
    return Promise.reject(new HashMatchUnavailable('no matcher is configured (CSAM_MATCH_URL is unset)'));
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
