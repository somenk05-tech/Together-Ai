import { Injectable, Logger, type OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import type { Readable } from 'stream';
import { apiUrl } from '../shared/api-prefix';
import { mintPhotoToken, readPhotoToken } from '../dating/photo-link';
import { mintCacheableMediaToken } from './media-link';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, HeadObjectCommand, PutBucketCorsCommand, GetBucketCorsCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ReadCache } from '../shared/cache/read-cache.service';

/** Origins allowed to upload directly to the bucket from the browser. Overridable
 *  via MEDIA_CORS_ORIGINS (comma-separated). */
const DEFAULT_CORS_ORIGINS = [
  'https://togethercity.app',
  'https://www.togethercity.app',
  'https://*.togethercity.app',
  'https://*.vercel.app',
  'http://localhost:5173',
];

export interface PresignedUpload {
  uploadUrl: string; // PUT here directly from the client
  publicUrl: string; // final object URL to store on the Attachment
  key: string;
  expiresInSec: number;
}

/**
 * Cloudflare R2 / AWS S3 pre-signed upload provider.
 *
 * R2 is S3-compatible, so the same AWS SDK client works for both: set
 * `S3_ENDPOINT` to your R2 endpoint (https://<accountid>.r2.cloudflarestorage.com),
 * `S3_REGION=auto`, and the R2 access key/secret. When those env vars are absent
 * (dev/demo/test), it falls back to an unsigned deterministic URL so the media
 * flow still runs end-to-end without cloud credentials.
 */
@Injectable()
export class StorageProvider implements OnModuleInit {
  private readonly logger = new Logger(StorageProvider.name);
  private readonly s3: S3Client | null;
  private readonly bucket: string;
  private readonly healthBucket: string;
  private readonly publicBase: string;
  private readonly cdnBase: string;
  private readonly apiBase: string;
  private readonly linkSecret: string;
  private readonly endpoint: string;
  private readonly corsOrigins: string[];
  private readonly expiresInSec = 900;

  /**
   * A DATING PHOTO'S UPLOAD WINDOW IS NOT A HEALTH DOCUMENT'S. (Fourth audit,
   * 28 Aug.)
   *
   * A presigned PUT is reusable until it expires, and the review that decides
   * whether strangers may see a dating photograph runs ONCE per key. Fifteen
   * minutes therefore meant: upload something ordinary, save the profile, let
   * it be approved, and then PUT whatever you like to the same URL with a
   * verdict already recorded against it.
   *
   * Two minutes is enough for a phone on a bad connection to finish a 12 MB
   * photograph and short enough to be a poor attack window. It is not the fix
   * on its own — the fix is that the verdict is bound to the BYTES (see the
   * etag on DatingPhotoReview) — it is the part that shrinks the opportunity
   * rather than catching it afterwards.
   */
  private readonly datingUploadExpiresInSec = 120;
  private readonly downloadTtlSec = 300; // signed GET links for private health docs
  /**
   * Dating photos get a WINDOW OF THEIR OWN, and a fifth of the health one
   * (audit finding 19). A presigned URL is a bearer link: anyone holding the
   * string fetches the image with no session, because S3 checks the signature
   * and nothing else — access is decided when the URL is MINTED, inside an
   * authenticated card request, and never again. That class of problem does
   * not shrink to zero without serving images through an authenticated
   * channel, which is its own project. What CAN shrink is the window: a
   * dating photo URL that leaks — a screenshot, a proxy log, a shared link —
   * is now dead in sixty seconds instead of five minutes, and sixty is still
   * three times what a card needs to load its pictures. Health documents
   * keep 300: their URLs are handed to their OWNER, who may legitimately
   * take minutes over a lab report.
   */
  private readonly datingPhotoTtlSec = 60;
  /**
   * How long a signed link to a post's photograph or video stays good.
   *
   * A dating photo gets 60 seconds because it is the most sensitive image in
   * the application and it is looked at once. A post is scrolled past, scrolled
   * back to, and left on screen while somebody makes tea — sixty seconds there
   * is a wall of broken images. An hour is long enough that no ordinary reading
   * session outlives it and short enough that a copied link is not a permanent
   * publication, which is what these URLs were before (30 Aug audit).
   */
  private readonly postMediaTtlSec = 3600;

  /**
   * SIXTY SECONDS WAS REVOCATION. IT IS NOT REVOCATION ANY MORE, AND IT WAS
   * STILL TAKING THE PICTURES OFF THE SCREEN. (28 Aug.)
   *
   * The paragraph above is about a PRESIGNED link, where the expiry is the
   * only thing that ever ends access: S3 checks a signature and asks nobody
   * anything, so a short window was the entire defence and sixty seconds was
   * the right answer.
   *
   * The proxy route changed what a short window buys. `GET /dating/photo/:token`
   * runs mayViewPhoto on EVERY fetch — approval, visibility, blocking, the
   * profile still being here — so a photo is revoked the instant the rows say
   * so, whatever the token's expiry says. The sixty seconds now protects only
   * against a token copied out of a page and replayed by somebody the live
   * rows would still allow. Ten minutes is the same protection an hour later.
   *
   * What sixty seconds cost: the web app caches for five minutes
   * (queryClient gcTime) and every photograph is `loading="lazy"`. So a render
   * from cache more than a minute old, or a scroll that reaches a card a
   * minute after the list was signed, asks for a link that died — and the
   * route answers 404 for every refusal alike, which is right for an oracle
   * and useless for a diagnosis. The link has to outlive the cache that holds
   * it; PHOTO_LINK_TTL_SEC is that number and it is deliberately larger than
   * the client's own window rather than equal to it.
   *
   * The PRESIGNED fallback above keeps 60. There the expiry really is the
   * whole of the revocation, and that path exists only when PUBLIC_API_URL is
   * unset — a deployment with no authenticated channel to be lenient about.
   */
  private readonly proxyPhotoTtlSec = 600;

  constructor(private readonly config: ConfigService, @Optional() private readonly cache?: ReadCache) {
    const originsCsv = this.config.get<string>('media.corsOrigins') ?? '';
    this.corsOrigins = originsCsv.split(',').map((s) => s.trim()).filter(Boolean);
    if (!this.corsOrigins.length) this.corsOrigins = DEFAULT_CORS_ORIGINS;
    this.bucket = this.config.get<string>('media.bucket') ?? '';
    /**
     * The private vault: health documents, Drive files and dating photos.
     *
     * THIS FALLBACK IS A DEVELOPMENT CONVENIENCE AND NOTHING MORE. It used to
     * carry the note "health docs are still served ONLY via short-lived signed
     * links (never a stored public URL) either way", which is true of this code
     * and beside the point: the signing discipline protects the LINK, and the
     * fallback moves the OBJECT into a bucket published at
     * MEDIA_PUBLIC_BASE_URL. A signed link to a file anyone can already GET is
     * a lock on an open door.
     *
     * Production can no longer reach this line with an empty private bucket —
     * assertProductionConfig() in shared/config/configuration.ts refuses to
     * boot, in the same block as the JWT secrets and for the same reason.
     */
    this.healthBucket = this.config.get<string>('media.privateBucket') || this.bucket;
    this.publicBase = this.config.get<string>('media.publicBaseUrl') ?? '';
    /**
     * ── THE EDGE, IF THERE IS ONE ───────────────────────────────────────────
     *
     * MEDIA_CDN_BASE is the host `workers/media-edge` answers on. Set it and
     * post media is served from Cloudflare's cache for a token this API signs;
     * leave it unset and every line below behaves exactly as it did.
     *
     * That fallback is the point, and it is the same one `datingPhotoUrl`
     * makes for the same reason: a missing or mistyped variable must not take
     * every photograph in the city off the screen on a deploy morning.
     */
    this.cdnBase = (this.config.get<string>('media.cdnBaseUrl') ?? '').replace(/\/+$/, '');
    this.apiBase = this.config.get<string>('media.apiPublicBaseUrl') ?? '';
    this.linkSecret = this.config.get<string>('jwt.accessSecret') ?? '';
    const endpoint = this.config.get<string>('media.endpoint') ?? '';
    this.endpoint = endpoint;
    const accessKeyId = this.config.get<string>('media.accessKeyId') ?? '';
    const secretAccessKey = this.config.get<string>('media.secretAccessKey') ?? '';
    const region = this.config.get<string>('media.region') ?? 'auto';

    if (endpoint && accessKeyId && secretAccessKey && this.bucket) {
      this.s3 = new S3Client({
        region,
        endpoint,
        credentials: { accessKeyId, secretAccessKey },
        forcePathStyle: true, // R2 requires path-style addressing
      });
    } else {
      this.s3 = null;
      this.logger.warn(
        'Media storage not fully configured (missing S3_ENDPOINT / keys / MEDIA_BUCKET) — returning unsigned URLs.',
      );
    }
  }

  /**
   * On boot: make sure a browser can actually upload, and say so only when it
   * cannot.
   *
   * ── THE WARNING THAT FIRED EVERY BOOT AND MEANT NOTHING (28 Aug) ─────────
   *
   * This used to attempt `PutBucketCors` and warn when it failed. It failed
   * every single time, because the R2 token has no bucket-CONFIGURATION
   * rights, and both buckets have had a correct policy all along — set by
   * hand. So a WARN naming two buckets printed on every boot, for a state that
   * was fine.
   *
   * An earlier pass fixed the WORDING — stopped it claiming the policy was
   * missing, since a failed write says nothing about what is already there.
   * That was honest and it was not enough. A warning nobody can act on is
   * still a warning nobody acts on, and it sits in the boot log next to the
   * ones that matter (`Photo review is not configured`, `MIRA_LOG_SALT is not
   * set`), teaching whoever reads it that yellow at boot is normal here.
   *
   * ── SO ASK THE QUESTION INSTEAD OF INFERRING IT ──────────────────────────
   *
   * `corsStatus()` twenty lines below has always known how to answer this
   * properly: it fires a REAL preflight — OPTIONS with an Origin and
   * `Access-Control-Request-Method: PUT` — which is exactly what the browser
   * does, and needs no token rights at all. The check existed; boot just never
   * used it.
   *
   * Now boot uses it, and the log says one of three true things per bucket:
   *
   *   uploads work                → LOG. Nothing is owed. This is the case
   *                                 that used to print a warning.
   *   uploads are refused         → WARN, with the rule to set, because now it
   *                                 IS a repair somebody owes and the browser
   *                                 has said so rather than a failed write.
   *   the probe could not run     → LOG, naming the reason. Not knowing is not
   *                                 the same as being broken, and a network
   *                                 blip at boot is not an operator's problem.
   *
   * The write is still attempted first, but only quietly: if the token ever
   * gains the rights, the policy gets applied and the preflight confirms it in
   * the same breath. A failed write is no longer an event.
   */
  async onModuleInit(): Promise<void> {
    if (!this.s3) return;
    const rule = {
      AllowedOrigins: this.corsOrigins,
      AllowedMethods: ['PUT', 'GET', 'HEAD'],
      AllowedHeaders: ['*'],
      ExposeHeaders: ['ETag'],
      MaxAgeSeconds: 3600,
    };
    const buckets = Array.from(new Set([this.bucket, this.healthBucket].filter(Boolean)));
    for (const Bucket of buckets) {
      // Quietly. Success is worth a line; failure is the normal case and the
      // preflight below is what decides whether anything is actually wrong.
      let applied = false;
      try {
        await this.s3.send(new PutBucketCorsCommand({ Bucket, CORSConfiguration: { CORSRules: [rule] } }));
        applied = true;
      } catch { /* no bucket-configuration rights: expected, and not a verdict */ }

      const probe = await this.preflightAllows(Bucket);
      if (probe.allowed) {
        this.logger.log(
          `R2/S3 CORS on "${Bucket}": browser uploads allowed${applied ? ' (policy applied this boot)' : ''}.`,
        );
      } else if (probe.reason === 'refused') {
        this.logger.warn(
          `Browser uploads are REFUSED by bucket "${Bucket}" — a real preflight (OPTIONS + Origin + PUT) came ` +
          `back with Access-Control-Allow-Origin: ${probe.allowOrigin ?? 'none'}. Set this in ` +
          `Cloudflare R2 → Settings → CORS Policy: ` +
          JSON.stringify([rule]),
        );
      } else {
        this.logger.log(
          `R2/S3 CORS on "${Bucket}": could not check (${probe.detail}). Uploads may be fine; this is the probe ` +
          `failing, not the bucket.`,
        );
      }
    }
  }

  /**
   * A browser-style preflight against one bucket. No token rights needed — this
   * is the same request the browser makes before a presigned PUT, so its answer
   * is the one that decides whether an upload works.
   */
  private async preflightAllows(bucket: string): Promise<{ allowed: boolean; reason: 'ok' | 'refused' | 'unknown'; allowOrigin?: string | null; detail?: string }> {
    const site = this.corsOrigins.find((o) => o.includes('togethercity.app')) ?? this.corsOrigins[0];
    if (!site) return { allowed: false, reason: 'unknown', detail: 'no CORS origin configured to probe with' };
    try {
      const res = await fetch(`${this.endpoint}/${bucket}/cors-preflight-probe`, {
        method: 'OPTIONS',
        headers: { Origin: site, 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'content-type' },
      });
      const allowOrigin = res.headers.get('access-control-allow-origin');
      const allowed = allowOrigin === '*' || allowOrigin === site;
      return allowed ? { allowed: true, reason: 'ok', allowOrigin } : { allowed: false, reason: 'refused', allowOrigin };
    } catch (e) {
      return { allowed: false, reason: 'unknown', detail: (e as Error).message };
    }
  }

  /**
   * Confirm browser uploads will be accepted. `uploadAllowed` is the source of
   * truth: it fires a REAL CORS preflight (OPTIONS + Origin + PUT) at the bucket
   * — exactly what the browser does — so it works even when the token can't read
   * bucket config. `configReadable`/`origins` come from GetBucketCors when the
   * token permits it (nice-to-have, not required).
   */
  async corsStatus(): Promise<{ configured: boolean; site: string; buckets: Array<Record<string, unknown>> }> {
    const site = this.corsOrigins.find((o) => o.includes('togethercity.app')) ?? 'https://togethercity.app';
    if (!this.s3) return { configured: false, site, buckets: [] };
    const names = Array.from(new Set([this.bucket, this.healthBucket].filter(Boolean)));
    const buckets: Array<Record<string, unknown>> = [];
    for (const bucket of names) {
      // 1) The definitive check — a browser-style preflight.
      let uploadAllowed = false; let allowOrigin: string | null = null; let preflightError: string | undefined;
      try {
        const res = await fetch(`${this.endpoint}/${bucket}/cors-preflight-probe`, {
          method: 'OPTIONS',
          headers: { Origin: site, 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'content-type' },
        });
        allowOrigin = res.headers.get('access-control-allow-origin');
        uploadAllowed = allowOrigin === '*' || allowOrigin === site;
      } catch (e) { preflightError = (e as Error).message; }

      // 2) Best-effort config read (only if the token is allowed to).
      let configReadable = false; let origins: string[] = []; let methods: string[] = [];
      try {
        const cors = await this.s3.send(new GetBucketCorsCommand({ Bucket: bucket }));
        const rules = cors.CORSRules ?? [];
        origins = Array.from(new Set(rules.flatMap((r) => r.AllowedOrigins ?? [])));
        methods = Array.from(new Set(rules.flatMap((r) => r.AllowedMethods ?? [])));
        configReadable = true;
      } catch { /* token can't read bucket config — fine, preflight is authoritative */ }

      buckets.push({ bucket, uploadAllowed, allowOrigin, configReadable, origins, methods, ...(preflightError ? { preflightError } : {}) });
    }
    return { configured: true, site, buckets };
  }

  async presignUpload(userId: string, mimeType: string, ext: string): Promise<PresignedUpload> {
    const key = `uploads/${userId}/${randomUUID()}.${ext}`;

    if (!this.s3) {
      // Unconfigured fallback — keeps dev/demo working without cloud creds.
      return {
        uploadUrl: `${this.publicBase}/__presigned__/${key}`,
        publicUrl: `${this.publicBase}/${key}`,
        key,
        expiresInSec: this.expiresInSec,
      };
    }

    const uploadUrl = await getSignedUrl(
      this.s3,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: mimeType }),
      { expiresIn: this.expiresInSec },
    );

    return {
      uploadUrl,
      publicUrl: `${this.publicBase}/${key}`,
      key,
      expiresInSec: this.expiresInSec,
    };
  }

  get configured(): boolean { return this.s3 !== null; }

  /** Server-side upload of bytes we generated ourselves (e.g. a video poster
   *  frame extracted with ffmpeg). Returns the public URL. */
  async putObject(userId: string, body: Buffer, contentType: string, ext: string): Promise<string> {
    const key = `uploads/${userId}/${randomUUID()}.${ext}`;
    if (!this.s3) return `${this.publicBase}/${key}`;
    await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
    return `${this.publicBase}/${key}`;
  }

  // ─────────── private health-document vault (signed links only) ───────────

  /** Presign a PUT into the private health bucket. Returns the object key — NO
   *  public URL, because health documents must never be publicly reachable. */
  async presignHealthUpload(userId: string, mimeType: string, ext: string): Promise<{ uploadUrl: string; key: string; expiresInSec: number }> {
    const key = `health/${userId}/${randomUUID()}.${ext}`;
    if (!this.s3) {
      return { uploadUrl: `${this.publicBase}/__presigned__/${key}`, key, expiresInSec: this.expiresInSec };
    }
    const uploadUrl = await getSignedUrl(
      this.s3,
      new PutObjectCommand({ Bucket: this.healthBucket, Key: key, ContentType: mimeType }),
      { expiresIn: this.expiresInSec },
    );
    return { uploadUrl, key, expiresInSec: this.expiresInSec };
  }

  /**
   * Presign an upload into the user's private DRIVE space. Same private bucket
   * as the health vault (one 10 GB vault per citizen), namespaced under
   * `drive/<userId>/` so ownership is provable from the key itself.
   */
  async presignDriveUpload(userId: string, mimeType: string, ext: string): Promise<{ uploadUrl: string; key: string; expiresInSec: number }> {
    const safeExt = (ext || 'bin').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) || 'bin';
    const key = `drive/${userId}/${randomUUID()}.${safeExt}`;
    if (!this.s3) {
      return { uploadUrl: `${this.publicBase}/__presigned__/${key}`, key, expiresInSec: this.expiresInSec };
    }
    const uploadUrl = await getSignedUrl(
      this.s3,
      new PutObjectCommand({ Bucket: this.healthBucket, Key: key, ContentType: mimeType }),
      { expiresIn: this.expiresInSec },
    );
    return { uploadUrl, key, expiresInSec: this.expiresInSec };
  }

  /**
   * Presign a PUT for a DATING PHOTO. (M3.)
   *
   * The private bucket, not the public one, and that is the whole design.
   * Dating photos were base64 blobs inlined in every payload, which was slow
   * but had one accidental virtue: only a viewer the service had already judged
   * eligible ever received the bytes. Moving them to a public URL would have
   * made them faster AND permanently reachable by anyone who ever saw one —
   * trading a performance problem for a privacy one, and falsifying the Dating
   * Terms' promise that photos are shown only to people the profile allows.
   *
   * So: private object, short-lived signed GET issued per eligible viewer.
   */
  /**
   * Presign a PUT for a POST's photograph or video — private bucket, key only.
   *
   * Post media used to go through `presignUpload`, which writes to the PUBLIC
   * bucket and hands back `${publicBase}/${key}`: a permanent, unauthenticated
   * URL, stored verbatim on PostMedia.url and shipped to every viewer. Anyone
   * who saw a "Family" video could copy the `<video src>` and hand the string
   * to anybody, forever, with no session — and deleting the post did not stop
   * it. "Only Me" was a label on a public file (30 Aug audit).
   *
   * Its own prefix, following the rule this file already carries for the
   * daybook and the dating selfie: ONE PREFIX PER THING THAT CAN BE OWNED. The
   * userId is IN the key, so "is this yours" is something the key answers
   * rather than something a lookup has to be trusted to check.
   */
  async presignPostUpload(userId: string, mimeType: string, ext: string): Promise<{ uploadUrl: string; key: string; expiresInSec: number }> {
    const safeExt = (ext || 'bin').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) || 'bin';
    const key = `social/${userId}/${randomUUID()}.${safeExt}`;
    if (!this.s3) {
      return { uploadUrl: `${this.publicBase}/__presigned__/${key}`, key, expiresInSec: this.expiresInSec };
    }
    const uploadUrl = await getSignedUrl(
      this.s3,
      new PutObjectCommand({ Bucket: this.healthBucket, Key: key, ContentType: mimeType }),
      { expiresIn: this.expiresInSec },
    );
    return { uploadUrl, key, expiresInSec: this.expiresInSec };
  }

  /**
   * Presign a PUT for a SNAP — a temporary chat photograph. Private bucket,
   * key only, its own prefix.
   *
   * ITS OWN PREFIX IS THE POINT, and it is the rule this file already keeps
   * for the daybook, the dating selfie and post media: ONE PREFIX PER THING
   * THAT CAN BE OWNED. `snaps/<userId>/<uuid>.<ext>` makes "is this yours to
   * send" a question the key answers rather than one a lookup has to be
   * trusted to ask — and it makes the reverse true too, which matters more
   * here: a snap key can never be handed to the Drive download route, the
   * health vault reader or the post signer, because none of them match this
   * shape.
   *
   * The public bucket was never an option. A snap served from a permanent
   * unauthenticated URL is a "view once" anybody can re-fetch forever, so the
   * ephemerality would have been a caption rather than a property.
   */
  async presignSnapUpload(userId: string, mimeType: string, ext: string): Promise<{ uploadUrl: string; key: string; expiresInSec: number }> {
    const safeExt = (ext || 'bin').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) || 'bin';
    const key = `snaps/${userId}/${randomUUID()}.${safeExt}`;
    if (!this.s3) {
      return { uploadUrl: `${this.publicBase}/__presigned__/${key}`, key, expiresInSec: this.expiresInSec };
    }
    const uploadUrl = await getSignedUrl(
      this.s3,
      new PutObjectCommand({ Bucket: this.healthBucket, Key: key, ContentType: mimeType }),
      { expiresIn: this.expiresInSec },
    );
    return { uploadUrl, key, expiresInSec: this.expiresInSec };
  }

  /** True when a value is a snap key at all — as opposed to a public
   *  attachment URL, which is what every other Attachment.url holds. */
  isSnapKey(value: string): boolean {
    return /^snaps\/[^/]+\/[A-Za-z0-9._-]+$/.test(value);
  }

  /** True when `key` belongs to `userId`. The prefix is the ownership proof —
   *  no lookup, nothing to forget to check. */
  isOwnSnapKey(userId: string, key: string): boolean {
    return this.isSnapKey(key) && key.startsWith(`snaps/${userId}/`);
  }

  /** The ranged read the media guard needs, against the private bucket where
   *  snaps live. Same reason as the public and post versions: the declared
   *  Content-Type is the claim being checked, so it cannot be the thing that
   *  answers. */
  async getSnapObjectPrefix(key: string, n: number): Promise<Buffer | null> {
    return this.objectPrefix(this.healthBucket, key, n, 'getSnapObjectPrefix');
  }

  /** A snap read whole, for handing to the image classifier. */
  async getSnapObjectBase64(key: string): Promise<{ base64: string; contentType: string } | null> {
    return this.getObjectBase64(key, this.healthBucket);
  }

  /** True when a stored PostMedia value is one of OUR private keys, rather than
   *  a legacy public URL or an inline `data:` photo. Both of those still exist
   *  in the table and both still have to render. */
  isPostKey(value: string): boolean {
    return /^social\/[^/]+\/[A-Za-z0-9._-]+$/.test(value);
  }

  /** True when `key` belongs to `userId` — the prefix is the ownership proof. */
  isOwnPostKey(userId: string, key: string): boolean {
    return this.isPostKey(key) && key.startsWith(`social/${userId}/`);
  }

  /**
   * Sign every post-media key in one pass and hand back a lookup.
   *
   * A feed page is twenty posts and up to forty media rows, and signing is a
   * local HMAC rather than a call to the bucket — so this is one `Promise.all`
   * over a de-duplicated set, and the shaping stays synchronous. Legacy values
   * are simply absent from the map and pass through untouched.
   */
  async signPostMedia(values: Array<string | null | undefined>): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const keys = [...new Set(values.filter((v): v is string => Boolean(v) && this.isPostKey(v as string)))];
    if (!keys.length) return out;
    /**
     * ── THE EDGE PATH, WHEN THERE IS AN EDGE ────────────────────────────────
     *
     * No network call at all: the token is an HMAC over the key, so this is a
     * string concatenation and a hash rather than a presign. It is also the
     * SAME string for every viewer inside the window — that is what makes the
     * edge cache work, and it is why the token names no viewer. See
     * media-link.ts.
     *
     * The signature cache below is skipped on this path deliberately. It exists
     * to avoid re-presigning, and there is nothing here to avoid; caching a
     * value cheaper to compute than to fetch is a Redis round trip for
     * nothing.
     *
     * ABOVE the no-S3 early return, and a test is why. Minting a token is an
     * HMAC over a string: it needs no S3 client, no bucket and no network. Left
     * below that return, a deployment with an edge and no S3 credentials would
     * have been handed the development placeholder instead of a URL that works
     * perfectly well.
     */
    if (this.cdnBase && this.linkSecret) {
      for (const k of keys) {
        out.set(k, `${this.cdnBase}/m/${encodeURIComponent(mintCacheableMediaToken(this.linkSecret, k, this.postMediaTtlSec, Date.now()))}`);
      }
      return out;
    }

    const s3 = this.s3;
    if (!s3) {
      for (const k of keys) out.set(k, `${this.publicBase}/__private__/${k}`);
      return out;
    }

    /**
     * ── SIGNING IS CHEAP, AND FOUR HUNDRED OF ANYTHING IS NOT ───────────────
     *
     * The note above is right that this is a local HMAC rather than a call to
     * the bucket. It is also, per key, a fresh SigV4 canonical request: a URL
     * assembled, a handful of SHA-256s, a signing key derived. A feed page of
     * twenty posts carrying media is up to four hundred of them, on the event
     * loop, on every page of every scroll of every citizen — and unlike a
     * query, none of it is waiting on anything, so it is four hundred
     * synchronous CPU slices in the middle of the request that cannot be
     * overlapped away.
     *
     * A signed URL is also the ideal thing to cache: it is deterministic for a
     * key, it carries its own expiry, and handing the same one to two viewers
     * is what a CDN in front of this would do anyway.
     *
     * CACHED FOR HALF ITS LIFE, DELIBERATELY. The URL is valid for
     * `postMediaTtlSec`; caching it for that long means the copy handed out in
     * the last second before eviction expires a second later, and the citizen
     * gets a broken image with no way to explain it. At half, the worst URL
     * anyone receives still has half an hour on it — longer than the page will
     * be open.
     */
    const ttl = Math.max(1, Math.floor(this.postMediaTtlSec / 2));
    const cache = this.cache;
    const cached = cache ? await Promise.all(keys.map((k) => cache.get<string>(`sig:${k}`))) : [];
    const missing: string[] = [];
    keys.forEach((k, i) => {
      const hit = cached[i];
      if (hit) out.set(k, hit);
      else missing.push(k);
    });
    if (!missing.length) return out;

    await Promise.all(missing.map(async (k) => {
      try {
        /**
         * ── AND NO `ResponseCacheControl`, BECAUSE R2 DOES NOT IMPLEMENT IT ─
         *
         * This asked for `private, max-age=31536000, immutable` as a signed
         * `response-cache-control` override, on the reasoning that it would
         * apply to every object already in the bucket with no backfill. That
         * reasoning is sound and it is about Amazon S3. THIS BUCKET IS R2, and
         * R2's S3 compatibility table does not implement the `response-*`
         * overrides on GetObject — so the parameter was, at best, ignored. A
         * docblock claiming a behaviour the storage does not have is worse
         * than no docblock, so it is gone rather than reworded.
         *
         * WHERE THE HEADER COMES FROM NOW. `putPrivateObject` sets
         * `Cache-Control` as object metadata, which R2 does implement, so
         * anything this API writes carries it. And the edge Worker sets the
         * header on its own responses, which is the path that matters — see
         * `workers/media-edge`. What is left uncovered is an object uploaded
         * by a browser through a presigned PUT before the Worker is live: the
         * browser falls back to heuristic caching for those, as it did before
         * today. Signing `Cache-Control` into a presigned PUT would fix that
         * and would also make every upload fail with SignatureDoesNotMatch the
         * moment a client forgot to send the header, which is a poor trade for
         * a gap the Worker closes.
         */
        const url = await getSignedUrl(s3, new GetObjectCommand({
          Bucket: this.healthBucket,
          Key: k,
        }), { expiresIn: this.postMediaTtlSec });
        out.set(k, url);
        await cache?.set(`sig:${k}`, url, ttl);
      } catch (e) {
        this.logger.warn(`signPostMedia failed for ${k}: ${(e as Error).message}`);
      }
    }));
    return out;
  }

  /** One signed GET for a post's own media — used where ffmpeg needs to read
   *  the video the citizen is setting a cover frame from. Short, because it is
   *  handed to a subprocess and not to a browser. */
  async signPostObject(key: string, ttlSec = 120): Promise<string | null> {
    if (!this.s3 || !this.isPostKey(key)) return null;
    try {
      return await getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.healthBucket, Key: key }), { expiresIn: ttlSec });
    } catch (e) {
      this.logger.warn(`signPostObject failed for ${key}: ${(e as Error).message}`);
      return null;
    }
  }

  /**
   * ── THE DECLARED SIZE IS SIGNED IN, OR IT IS NOT A LIMIT ───────────────────
   *
   * `requestDatingUpload` refuses a photograph over the ceiling by reading the
   * `sizeBytes` the client declares. That number reached this method and was
   * DROPPED: the PUT was signed with a Content-Type and nothing else, so the
   * signature said nothing at all about length. Ask for a presign for a 1 MB
   * JPEG and PUT three gigabytes with it — every check upstream passed, on a
   * number the bucket never saw.
   *
   * `ContentLength` puts it into SignedHeaders, so the object cannot be created
   * at any other size and the ceiling becomes a property of the signature
   * rather than of a form field. It is the same argument the docblock above
   * `signPostMedia` makes AGAINST signing Cache-Control into a presigned PUT —
   * that a client which forgets the header fails with SignatureDoesNotMatch —
   * and here that trade is the right way round: a browser always sends
   * content-length on a PUT of a file, and the failure mode of not signing it
   * is an unbounded object in a private bucket.
   */
  async presignDatingUpload(userId: string, mimeType: string, ext: string, sizeBytes: number): Promise<{ uploadUrl: string; key: string; expiresInSec: number }> {
    const safeExt = (ext || 'bin').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) || 'bin';
    const key = `dating/${userId}/${randomUUID()}.${safeExt}`;
    if (!this.s3) {
      return { uploadUrl: `${this.publicBase}/__presigned__/${key}`, key, expiresInSec: this.expiresInSec };
    }
    const uploadUrl = await getSignedUrl(
      this.s3,
      new PutObjectCommand({ Bucket: this.healthBucket, Key: key, ContentType: mimeType, ContentLength: sizeBytes }),
      { expiresIn: this.datingUploadExpiresInSec },
    );
    return { uploadUrl, key, expiresInSec: this.datingUploadExpiresInSec };
  }

  /**
   * Presign a PUT for a VERIFICATION SELFIE — and its own prefix is the point.
   *
   * Owner, 27 Aug: "the selfie should not become the part of the profile
   * pictures displayed, that should be only for verification."
   *
   * It shipped under `dating/<userId>/` — the same namespace as the photos
   * people choose to show. Nothing displayed it, but nothing STOPPED it being
   * displayed either: `ownPhotosOnly` admits any key in that namespace, so one
   * line placing the selfie in `extras.photos` would have put a frame nobody
   * chose to show onto a profile, and no check anywhere could have told the
   * two apart afterwards. This module already carries the rule, written for
   * the daybook two weeks earlier: ONE PREFIX PER THING THAT CAN BE OWNED.
   *
   * So a selfie lives at `dating-selfie/<userId>/`, `isOwnDatingKey` does not
   * match it, and "not a profile photo" stops being a convention and becomes
   * something the type of the key says. Same private bucket, same short signed
   * GETs — it is a stricter thing than a photo, not a laxer one.
   */
  async presignDatingSelfieUpload(userId: string, mimeType: string, ext: string): Promise<{ uploadUrl: string; key: string; expiresInSec: number }> {
    const safeExt = (ext || 'bin').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) || 'bin';
    const key = `dating-selfie/${userId}/${randomUUID()}.${safeExt}`;
    if (!this.s3) {
      return { uploadUrl: `${this.publicBase}/__presigned__/${key}`, key, expiresInSec: this.expiresInSec };
    }
    const uploadUrl = await getSignedUrl(
      this.s3,
      new PutObjectCommand({ Bucket: this.healthBucket, Key: key, ContentType: mimeType }),
      { expiresIn: this.datingUploadExpiresInSec },
    );
    return { uploadUrl, key, expiresInSec: this.datingUploadExpiresInSec };
  }

  /**
   * Presign a PUT for a DAYBOOK PHOTOGRAPH — a picture somebody put in their
   * diary. (15 Aug.)
   *
   * Its own namespace rather than the health vault's, though both are the same
   * private bucket. The prefix IS the permission: `isOwnHealthKey` guards three
   * medical routes that take a client-supplied key, and filing diary photos
   * under `health/` would mean a key from one feature satisfies another
   * feature's ownership check. One prefix per thing that can be owned.
   *
   * The public bucket was never a candidate. A post, a listing and a menu photo
   * all want a permanent public address; the picture of the afternoon somebody
   * wrote about wants the opposite, and the only reason it is a decision at all
   * is that the public path is one line shorter to write.
   */
  async presignDaybookUpload(userId: string, mimeType: string, ext: string): Promise<{ uploadUrl: string; key: string; expiresInSec: number }> {
    const safeExt = (ext || 'bin').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) || 'bin';
    const key = `daybook/${userId}/${randomUUID()}.${safeExt}`;
    if (!this.s3) {
      return { uploadUrl: `${this.publicBase}/__presigned__/${key}`, key, expiresInSec: this.expiresInSec };
    }
    const uploadUrl = await getSignedUrl(
      this.s3,
      new PutObjectCommand({ Bucket: this.healthBucket, Key: key, ContentType: mimeType }),
      { expiresIn: this.expiresInSec },
    );
    return { uploadUrl, key, expiresInSec: this.expiresInSec };
  }

  /**
   * A PLACE TO PUT A PHOTOGRAPH OF SOMEBODY'S ANIMAL.
   *
   * The private vault, under `pets/<userId>/`, for the same reason the daybook
   * uses it: the public bucket hands out a permanent address, and a photo of a
   * dog is a photo of the room the dog is standing in. The bytes go
   * browser→vault; nothing here ever holds them.
   */
  async presignPetUpload(userId: string, mimeType: string, ext: string): Promise<{ uploadUrl: string; key: string; expiresInSec: number }> {
    const safeExt = (ext || 'bin').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) || 'bin';
    const key = `pets/${userId}/${randomUUID()}.${safeExt}`;
    if (!this.s3) {
      return { uploadUrl: `${this.publicBase}/__presigned__/${key}`, key, expiresInSec: this.expiresInSec };
    }
    const uploadUrl = await getSignedUrl(
      this.s3,
      new PutObjectCommand({ Bucket: this.healthBucket, Key: key, ContentType: mimeType }),
      { expiresIn: this.expiresInSec },
    );
    return { uploadUrl, key, expiresInSec: this.expiresInSec };
  }

  /** True when this key belongs to the given user's pet namespace. */
  static isOwnPetKey(userId: string, key: string): boolean {
    return typeof key === 'string' && key.startsWith(`pets/${userId}/`);
  }

  /** True when this key belongs to the given user's daybook namespace. */
  static isOwnDaybookKey(userId: string, key: string): boolean {
    return typeof key === 'string' && key.startsWith(`daybook/${userId}/`);
  }

  /**
   * ── THE TWO FILES THAT WERE IN THE WRONG BUCKET (launch blocker 3, 2 Sep) ──
   *
   * A CV and a business-verification video both went through `presignUpload`
   * into the PUBLIC bucket: a permanent, unauthenticated address for somebody's
   * career history, and for a clip of an owner standing in their shop saying
   * their name. Neither is a thing a stranger should be able to fetch by
   * guessing, and neither is a thing deleting the row could take back.
   *
   * Both live in the vault now, each under its own prefix — `cv/<userId>/`
   * and `kyc/<userId>/` — because ONE PREFIX PER THING THAT CAN BE OWNED is
   * the rule this file keeps: the key answers "is this yours" without a
   * lookup, and a CV key can never be handed to the Drive download route or
   * the health reader, because it does not match their shape.
   */
  async presignResumeUpload(userId: string, mimeType: string, ext: string): Promise<{ uploadUrl: string; key: string; expiresInSec: number }> {
    return this.presignVaultUpload(`cv/${userId}/`, mimeType, ext);
  }

  async presignVerificationVideoUpload(userId: string, mimeType: string, ext: string): Promise<{ uploadUrl: string; key: string; expiresInSec: number }> {
    return this.presignVaultUpload(`kyc/${userId}/`, mimeType, ext);
  }

  static isOwnResumeKey(userId: string, key: string): boolean {
    return typeof key === 'string' && key.startsWith(`cv/${userId}/`);
  }

  static isOwnKycKey(userId: string, key: string): boolean {
    return typeof key === 'string' && key.startsWith(`kyc/${userId}/`);
  }

  /** True when a value is a vault key of either of those two shapes — as
   *  opposed to the public URL the same columns held before 2 Sep. */
  static isCvOrKycKey(value: string): boolean {
    return typeof value === 'string' && /^(cv|kyc)\/[^/]+\/[A-Za-z0-9._-]+$/.test(value);
  }

  private async presignVaultUpload(prefix: string, mimeType: string, ext: string): Promise<{ uploadUrl: string; key: string; expiresInSec: number }> {
    const safeExt = (ext || 'bin').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) || 'bin';
    const key = `${prefix}${randomUUID()}.${safeExt}`;
    if (!this.s3) {
      return { uploadUrl: `${this.publicBase}/__presigned__/${key}`, key, expiresInSec: this.expiresInSec };
    }
    const uploadUrl = await getSignedUrl(
      this.s3,
      new PutObjectCommand({ Bucket: this.healthBucket, Key: key, ContentType: mimeType }),
      { expiresIn: this.expiresInSec },
    );
    return { uploadUrl, key, expiresInSec: this.expiresInSec };
  }

  /* THE THREE HELPERS BELOW ARE BUCKET-LEVEL, NOT HEALTH-LEVEL. They are named
     for the vault's first tenant and operate on every object in it — drive,
     dating and now daybook all use them. These aliases say so at the call site,
     so a diary photo is not deleted by something called `deleteHealthObject`. */
  async privateObjectExists(key: string): Promise<boolean> { return this.healthObjectExists(key); }
  async deletePrivateObject(key: string): Promise<boolean> { return this.deleteHealthObject(key); }

  /**
   * True when this key belongs to the given user's dating namespace.
   *
   * The same guard Drive and the health vault carry, for the same reason: the
   * key arrives from the client when a profile is saved, and without this a
   * citizen could file somebody else's object as their own photo.
   */
  /** The citizen a `dating/<userId>/<uuid>.<ext>` key belongs to, or null for a
   *  key of any other shape — a selfie, a health object, or a mangled string. */
  static datingKeyOwner(key: string): string | null {
    const m = /^dating\/([^/]+)\/[^/]+$/.exec(typeof key === 'string' ? key : '');
    return m ? m[1] : null;
  }

  static isOwnDatingKey(userId: string, key: string): boolean {
    return typeof key === 'string' && key.startsWith(`dating/${userId}/`);
  }

  /**
   * True when this key is the given user's VERIFICATION SELFIE.
   *
   * A separate namespace, so this is a separate check — and deliberately not a
   * widening of `isOwnDatingKey`. The selfie is the one dating object that is
   * never displayed to anybody, and the two questions a caller can ask ("may
   * this be shown on their profile" / "is this their selfie") must have
   * different answers for the same string. See presignDatingSelfieUpload.
   */
  static isOwnDatingSelfieKey(userId: string, key: string): boolean {
    return typeof key === 'string' && key.startsWith(`dating-selfie/${userId}/`);
  }

  /** True when this key belongs to the given user's private drive namespace. */
  static isOwnDriveKey(userId: string, key: string): boolean {
    return typeof key === 'string' && key.startsWith(`drive/${userId}/`);
  }

  /**
   * True when this key belongs to the given user's private health namespace.
   *
   * The health vault takes a client-supplied key on three routes, and until
   * this existed there was no equivalent of the Drive check — filing a key
   * from someone else's namespace would have created a record pointing at
   * their document, which the download and delete routes then honoured.
   * Reaching that needed the key, which is a randomUUID nothing discloses, but
   * the sibling module guards the identical pattern and this one should too.
   */
  static isOwnHealthKey(userId: string, key: string): boolean {
    return typeof key === 'string' && key.startsWith(`health/${userId}/`);
  }

  /**
   * A longer-lived signed GET link, for files handed to someone OUTSIDE the
   * city (e.g. a big attachment emailed as a download link rather than MIME).
   * Capped at 7 days — the maximum lifetime S3/R2 signatures allow.
   */
  async presignShareLink(key: string, ttlSec = 7 * 24 * 3600): Promise<string | null> {
    if (!this.s3 || !key) return null;
    const expiresIn = Math.min(Math.max(60, ttlSec), 7 * 24 * 3600);
    try {
      return await getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.healthBucket, Key: key }), { expiresIn });
    } catch (e) {
      this.logger.warn(`presignShareLink failed for ${key}: ${(e as Error).message}`);
      return null;
    }
  }

  /**
   * Server-side write into the private vault, for bytes this API produced
   * itself (an avatar it drew, say) rather than bytes a browser uploaded.
   *
   * Returns the object key, or null when storage isn't configured — null rather
   * than a plausible-looking key, so a caller cannot file a row pointing at a
   * file that was never written.
   */
  async putPrivateObject(prefix: string, userId: string, body: Buffer, contentType: string, ext: string): Promise<string | null> {
    if (!this.s3) return null;
    const safePrefix = (prefix || 'misc').replace(/[^a-z0-9-]/gi, '').slice(0, 24) || 'misc';
    const safeExt = (ext || 'bin').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) || 'bin';
    const key = `${safePrefix}/${userId}/${randomUUID()}.${safeExt}`;
    try {
      await this.s3.send(new PutObjectCommand({
        Bucket: this.healthBucket, Key: key, Body: body, ContentType: contentType,
        /* R2 stores this and returns it on every GET. The key is a uuid written
           once and never rewritten — a changed picture is a new key — so
           `immutable` is a fact here rather than a hope. `private` because the
           bucket is: the citizen's own browser may keep a copy, no shared cache
           in between may. */
        CacheControl: 'private, max-age=31536000, immutable',
      }));
      return key;
    } catch (e) {
      this.logger.warn(`putPrivateObject failed for ${key}: ${(e as Error).message}`);
      return null;
    }
  }

  /** Short-lived signed GET URL for a private DATING object — a card photo.
   *  Same bucket as health, a fifth of the window; see datingPhotoTtlSec. */
  /**
   * A DATING PHOTO URL FOR ONE NAMED VIEWER.
   *
   * The proxy link when this API knows where it answers from, and the presigned
   * S3 link — exactly what shipped before — when it does not. The fallback is
   * the point: setting PUBLIC_API_URL turns the authenticated channel on, and
   * not setting it changes nothing, so a missing environment variable cannot
   * take every photograph in the hub off the screen on a launch morning.
   */
  async datingPhotoUrl(viewerId: string, key: string): Promise<string | null> {
    if (!this.apiBase || !viewerId || !key) return this.presignPrivateDownload(key);
    return apiUrl(this.apiBase, `dating/photo/${mintPhotoToken(this.linkSecret, viewerId, key, this.proxyPhotoTtlSec, Date.now())}`);
  }

  /** The viewer and key a photo token names, or null for every kind of failure. */
  readDatingPhotoToken(token: string): { viewerId: string; key: string } | null {
    return readPhotoToken(this.linkSecret, token, Date.now());
  }

  /**
   * The bytes themselves, for the one caller that serves them through the API
   * rather than handing out a link to S3 (`GET /dating/photo/:token`).
   *
   * Null when there is no S3 or the object is gone — the route turns that into
   * a 404 rather than an error page, because a missing photo is a missing
   * photo whichever layer noticed.
   */
  async readPrivateObject(key: string): Promise<{ body: Readable; contentType: string; contentLength?: number; etag?: string | null } | null> {
    if (!this.s3 || !key) return null;
    try {
      const out = await this.s3.send(new GetObjectCommand({ Bucket: this.healthBucket, Key: key }));
      if (!out.Body) return null;
      return {
        body: out.Body as unknown as Readable,
        contentType: out.ContentType ?? 'application/octet-stream',
        contentLength: out.ContentLength,
        // Free: the GET that serves the bytes already carries it.
        etag: out.ETag ?? null,
      };
    } catch (e) {
      this.logger.warn(`readPrivateObject failed for ${key}: ${(e as Error).message}`);
      return null;
    }
  }

  async presignPrivateDownload(key: string): Promise<string | null> {
    if (!this.s3 || !key) return null;
    try {
      return await getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.healthBucket, Key: key }), { expiresIn: this.datingPhotoTtlSec });
    } catch (e) {
      this.logger.warn(`presignPrivateDownload failed for ${key}: ${(e as Error).message}`);
      return null;
    }
  }

  /**
   * A DOWNLOAD IS A DOWNLOAD, NOT A PAGE (fifth audit, 29 Aug).
   *
   * This signed a bare GET, so the browser did whatever the object's own
   * Content-Type told it to — and a mail attachment is a file a stranger chose
   * and sent. Drive has no MIME allowlist and the mail client opens this URL in
   * a tab, so an emailed `.html` or `.svg` RENDERED, with script, on the
   * storage origin. `main.ts` reflects any `*.togethercity.app` origin, so on a
   * bucket served from a city subdomain that is same-site.
   *
   * `ResponseContentDisposition` is the fix and it is one header: the object is
   * offered as a file to save, whatever it claims to be. `filename` is the
   * caller's, quoted and stripped of anything that could close the quote or
   * split the header — a name is chosen by whoever sent the mail.
   */
  async presignHealthDownload(
    key: string,
    /* OPT-IN, AND THE DEFAULT IS UNCHANGED ON PURPOSE. Four callers share this
       signer and they do not want the same thing: an avatar and a scanned
       medical report are meant to be LOOKED at, and forcing a download on
       those would break two working screens to fix a third. The two that hand
       over a file somebody else chose — a mail attachment, a Drive file — ask
       for it explicitly. */
    opts: { asAttachment?: boolean; filename?: string } = {},
  ): Promise<string | null> {
    if (!this.s3 || !key) return null;
    try {
      const safe = (opts.filename ?? '').replace(/[^A-Za-z0-9._ -]/g, '_').slice(0, 120).trim();
      return await getSignedUrl(this.s3, new GetObjectCommand({
        Bucket: this.healthBucket,
        Key: key,
        ...(opts.asAttachment
          ? {
              ResponseContentDisposition: safe ? `attachment; filename="${safe}"` : 'attachment',
              // Belt and braces: offered as a download AND typed as bytes, so
              // that a proxy stripping the disposition header still cannot
              // leave a browser willing to execute what it got.
              ResponseContentType: 'application/octet-stream',
            }
          : {}),
      }), { expiresIn: this.downloadTtlSec });
    } catch (e) {
      this.logger.warn(`presignHealthDownload failed for ${key}: ${(e as Error).message}`);
      return null;
    }
  }

  async getHealthObjectBase64(key: string): Promise<{ base64: string; contentType: string; etag: string | null } | null> {
    return this.getObjectBase64(key, this.healthBucket);
  }

  /**
   * The same, from the PUBLIC bucket — where chat attachments live.
   *
   * Reading a public object server-side looks redundant when anybody can fetch
   * the URL, and is not: the point is to look at the bytes BEFORE deciding to
   * deliver the message that names them, and a URL fetch would take the round
   * trip out through the internet and back for a file we already hold.
   */
  async getPublicObjectBase64(key: string): Promise<{ base64: string; contentType: string } | null> {
    return this.getObjectBase64(key, this.bucket);
  }

  /** Confirm a just-uploaded health object actually landed in the vault, so we
   *  never file a record that points at a file the browser failed to PUT. When
   *  storage isn't configured (dev/demo) we can't check, so we don't block. */
  async healthObjectExists(key: string): Promise<boolean> {
    if (!this.s3 || !key) return true;
    try {
      await this.s3.send(new HeadObjectCommand({ Bucket: this.healthBucket, Key: key }));
      return true;
    } catch (e) {
      this.logger.warn(`healthObjectExists: ${key} not found (${(e as Error).message})`);
      return false;
    }
  }

  /** The stored size of a vault object, or null when it cannot be read. */
  /**
   * The object's ETag — S3's identifier for the BYTES, not for the name.
   *
   * This is what lets a review verdict be about a photograph rather than about
   * a key: record it when the machine looks, compare it when the image is
   * served, and a swap on a still-valid upload URL stops being invisible.
   */
  async healthObjectETag(key: string): Promise<string | null> {
    if (!this.s3 || !key) return null;
    try {
      const head = await this.s3.send(new HeadObjectCommand({ Bucket: this.healthBucket, Key: key }));
      return head.ETag ?? null;
    } catch (e) {
      this.logger.warn(`healthObjectETag: ${key} (${(e as Error).message})`);
      return null;
    }
  }

  async healthObjectSize(key: string): Promise<number | null> {
    if (!this.s3 || !key) return null;
    try {
      const head = await this.s3.send(new HeadObjectCommand({ Bucket: this.healthBucket, Key: key }));
      return head.ContentLength ?? null;
    } catch (e) {
      this.logger.warn(`healthObjectSize: ${key} (${(e as Error).message})`);
      return null;
    }
  }

  async deleteHealthObject(key: string): Promise<boolean> {
    return this.deleteObject(key, this.healthBucket);
  }

  /** Read an object back as base64 (for AI vision on uploaded reports). Returns
   *  null when storage isn't configured or the object can't be read. */
  async getObjectBase64(key: string, bucket?: string): Promise<{ base64: string; contentType: string; etag: string | null } | null> {
    if (!this.s3) return null;
    try {
      const res = await this.s3.send(new GetObjectCommand({ Bucket: bucket ?? this.bucket, Key: key }));
      const bytes = await res.Body?.transformToByteArray();
      if (!bytes) return null;
      return {
        base64: Buffer.from(bytes).toString('base64'),
        contentType: res.ContentType ?? 'application/octet-stream',
        // Free, and the identity of exactly these bytes: the GET that read
        // them carries it, so a verdict can be recorded about what was READ
        // rather than about whatever a later HEAD happens to find (fifth
        // audit, 31 Aug, medium 4).
        etag: res.ETag ?? null,
      };
    } catch (e) {
      this.logger.warn(`getObject failed for ${key}: ${(e as Error).message}`);
      return null;
    }
  }

  /**
   * The FIRST N BYTES of a public object, for deciding what a file actually is.
   *
   * A ranged GET rather than the whole object, because the caller asks this of
   * EVERY attachment — voice notes and documents included — and the upload cap
   * is 50MB. Sixteen bytes is enough for every container we recognise; pulling
   * fifty megabytes to read twelve of them is the reason this is not
   * `getPublicObjectBase64`.
   *
   * HeadObject would be cheaper still and is no use: its ContentType is the
   * one the uploader declared, which is precisely the claim we are checking.
   */
  async getPublicObjectPrefix(key: string, n: number): Promise<Buffer | null> {
    return this.objectPrefix(this.bucket, key, n, 'getPublicObjectPrefix');
  }

  /** The same ranged read, against the PRIVATE bucket where post media lives.
   *  Social posts moved there on 30 Aug; the screening guard needs the first
   *  bytes for the same reason chat does — the declared Content-Type is the
   *  claim being checked, so it cannot be the thing that answers. */
  async getPostObjectPrefix(key: string, n: number): Promise<Buffer | null> {
    return this.objectPrefix(this.healthBucket, key, n, 'getPostObjectPrefix');
  }

  /** Read a post-media object whole, for handing to an image classifier. */
  async getPostObjectBase64(key: string): Promise<{ base64: string; contentType: string } | null> {
    return this.getObjectBase64(key, this.healthBucket);
  }

  private async objectPrefix(bucket: string, key: string, n: number, where: string): Promise<Buffer | null> {
    if (!this.s3 || !key) return null;
    try {
      const res = await this.s3.send(new GetObjectCommand({
        Bucket: bucket, Key: key, Range: `bytes=0-${Math.max(0, n - 1)}`,
      }));
      const bytes = await res.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : null;
    } catch (e) {
      this.logger.warn(`${where} failed for ${key}: ${(e as Error).message}`);
      return null;
    }
  }

  /**
   * ── IT SAYS WHETHER THE OBJECT IS GONE, BECAUSE CALLERS ASKED AND IT LIED ──
   *
   * This returned `void` and caught its own error, so "the bucket refused" and
   * "the object is deleted" were the same answer. Two callers had already
   * written the careful version of the failure — `purgePostObjects` in
   * AuthService and `purgeListingObjects` in LocalServicesService both collect
   * the keys that failed and log them, with the reasoning that after the rows
   * are deleted that log line is the ONLY record of what was left in the
   * bucket. Neither could ever fire. Their `catch` blocks were unreachable,
   * their `failed` arrays were always empty, and `removed` counted every
   * failure as a success — so a deletion that left a hundred photographs
   * behind logged "removed 100 post object(s)".
   *
   * It reports rather than throws, deliberately. Every caller here is
   * best-effort ON PURPOSE: a bucket having a bad day must not stop a citizen
   * deleting their account, their listing or their post. Throwing would turn a
   * silent wrong answer into a loud broken one at two dozen call sites that
   * were right to keep going. A boolean lets the callers who log what was lost
   * log the truth, and leaves the rest exactly as they were.
   *
   *   true  — the object is gone, or there was no key to delete.
   *   false — it may still be there. Say so if you are about to delete the
   *           row that names it.
   *
   * `no S3 client` is FALSE, not true. An unconfigured provider has not
   * deleted anything; claiming otherwise is the same lie one level up.
   */
  async deleteObject(key: string, bucket?: string): Promise<boolean> {
    if (!key) return true;
    if (!this.s3) {
      this.logger.error(`deleteObject: storage is not configured — ${key} was NOT removed.`);
      return false;
    }
    try {
      await this.s3.send(new DeleteObjectCommand({ Bucket: bucket ?? this.bucket, Key: key }));
      return true;
    } catch (e) {
      // error, not warn: a file we meant to destroy and did not is not a
      // degraded nicety.
      this.logger.error(`deleteObject failed for ${key}: ${(e as Error).message}`);
      return false;
    }
  }

  /**
   * ── MANY OBJECTS, FEW ROUND TRIPS ───────────────────────────────────────
   *
   * `purgePostObjects` deleted a departing citizen's photographs ONE AT A
   * TIME, inside the delete-account request, with a page loop that would walk
   * up to a hundred thousand rows. A prolific account could not finish before
   * the proxy gave up — and the ordering made that the worst possible failure:
   * the objects go before the rows, so a request killed halfway left the
   * ACCOUNT ALIVE and SOME OF THE PHOTOGRAPHS GONE. The citizen got an error,
   * kept their account, and lost a arbitrary prefix of their pictures.
   *
   * S3 takes a thousand keys per call. That is the difference between two
   * hundred thousand round trips and two hundred, and for an ordinary account
   * between a few hundred and one.
   *
   * It returns the keys it could NOT delete, which is what a caller about to
   * destroy the rows that name them needs — the same contract as
   * `deleteObject`, in the plural. A partial failure is per-key: S3 answers
   * with an Errors array, and every key in it is still there.
   */
  async deleteObjects(keys: string[], bucket?: string): Promise<{ failed: string[] }> {
    const wanted = [...new Set(keys.filter(Boolean))];
    if (!wanted.length) return { failed: [] };
    if (!this.s3) {
      this.logger.error(`deleteObjects: storage is not configured — ${wanted.length} object(s) were NOT removed.`);
      return { failed: wanted };
    }
    const failed: string[] = [];
    for (let i = 0; i < wanted.length; i += 1000) {
      const batch = wanted.slice(i, i + 1000);
      try {
        const res = await this.s3.send(new DeleteObjectsCommand({
          Bucket: bucket ?? this.bucket,
          Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
        }));
        for (const e of res.Errors ?? []) if (e.Key) failed.push(e.Key);
      } catch (e) {
        // The whole batch is unaccounted for. Naming all of it is the point:
        // a caller that logs "12 failed" without the keys cannot act on it.
        this.logger.error(`deleteObjects failed for ${batch.length} key(s): ${(e as Error).message}`);
        failed.push(...batch);
      }
    }
    return { failed };
  }

  /** The private-bucket plural of `deletePrivateObject`. */
  async deletePrivateObjects(keys: string[]): Promise<{ failed: string[] }> {
    return this.deleteObjects(keys, this.healthBucket);
  }

  /** Derive the object key from a stored public URL (for legacy rows without a key). */
  keyFromUrl(url: string): string {
    if (this.publicBase && url.startsWith(this.publicBase)) return url.slice(this.publicBase.length + 1);
    return '';
  }
}
