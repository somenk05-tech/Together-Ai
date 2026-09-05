import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageProvider, PresignedUpload } from './storage.provider';

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',        // iPhone photos of reports
  'image/heif': 'heif',
  'image/tiff': 'tiff',        // scanned documents
  'image/bmp': 'bmp',
  'video/mp4': 'mp4',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/plain': 'txt',
  'text/csv': 'csv',
};

/**
 * The extension to store a file under. Health documents come in every shape a
 * clinic hands out — phone photos (HEIC), scans (TIFF), doctor letters (DOCX) —
 * so we never reject a real file: unknown types fall back to a safe extension
 * derived from the MIME subtype rather than throwing "Unsupported mime type".
 */
/** The four photo types a dating profile accepts, and the extension each is stored under. */
export const DATING_PHOTO_MIME: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic',
};
/**
 * The types a browser executes when it is handed them from a bucket origin.
 * An SVG is the one that surprises people: it is an image everywhere else in
 * the product and a script document here.
 */
export const EXECUTABLE_IN_A_BROWSER = new Set([
  'image/svg+xml', 'text/html', 'application/xhtml+xml',
  'text/javascript', 'application/javascript', 'application/x-javascript',
]);

/**
 * What a post may carry — an allowlist, and the contrast with the denylist
 * above is the whole point.
 *
 * The general upload door takes whatever somebody attaches to a message, so it
 * can only name the four things a browser will RUN and refuse those. A post
 * carries a photograph or a clip, so it can say what it accepts. `image/*`
 * would have admitted `image/svg+xml`, which is an image that runs script —
 * the same argument `requestDatingUpload` makes for the same reason.
 */
export const POSTABLE_MEDIA = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
  'video/mp4', 'video/quicktime', 'video/webm',
]);

/** What a snap may be: the three containers the moderation guard can actually
 *  screen. See requestSnapUpload for why the list is not longer. */
export const SNAPPABLE_IMAGE = new Set(['image/jpeg', 'image/png', 'image/webp']);
/** And how big. Matches MAX_SCREEN_BYTES in chat-media-guard.ts on purpose: a
 *  snap the guard cannot read is a snap that can only be refused. */
export const MAX_SNAP_BYTES = 8 * 1024 * 1024;

/**
 * The type, without its parameters and without the whitespace either side of
 * them.
 *
 * THE FIRST VERSION TRIMMED AND THEN SPLIT, and that is one space away from
 * useless (re-audit, 29 Aug): `media-type = type "/" subtype *( OWS ";" OWS
 * parameter )`, so `image/svg+xml ; charset=utf-8` is a legal way to write it,
 * and trimming BEFORE the split leaves the trailing space attached to the
 * subtype — `'image/svg+xml '`, which is in no set. Browsers parse it as
 * `image/svg+xml` and run it. Split first, trim after.
 */
export function bareMimeType(mimeType: string): string {
  return (mimeType ?? '').split(';')[0].trim().toLowerCase();
}

/** Rekognition reads bytes up to 5 MB; that is the ceiling for a dating photo. */
export const DATING_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

function extFor(mimeType: string): string {
  if (EXT[mimeType]) return EXT[mimeType];
  const sub = (mimeType.split('/')[1] || '').replace(/[^a-z0-9]/gi, '').slice(0, 8).toLowerCase();
  return sub || 'bin';
}

@Injectable()
export class MediaService {
  constructor(
    private readonly storage: StorageProvider,
    private readonly config: ConfigService,
  ) {}

  /**
   * Issue a pre-signed URL. The client uploads directly to R2/S3, then sends a
   * message with the returned publicUrl as an attachment.
   *
   * Post-upload processing (thumbnail generation, image compression, video
   * transcode) is designed as an async worker triggered by an R2/S3 event or a
   * queue — see ARCHITECTURE.md → Media pipeline. Hooks: generateThumbnail(),
   * compressImage(), transcodeVideo().
   */
  /** What a post may carry. Named rather than inferred from `image/*`, because
   *  an SVG is an image that runs script and `image/*` admits it. */
  static readonly POSTABLE = POSTABLE_MEDIA;

  async requestUpload(userId: string, mimeType: string, sizeBytes: number): Promise<PresignedUpload> {
    const max = this.config.get<number>('policy.maxUploadBytes') ?? 52428800;
    if (sizeBytes > max) throw new BadRequestException(`File exceeds ${max} bytes`);
    if (!mimeType) throw new BadRequestException('Missing file type');
    /**
     * A DENYLIST HERE, AN ALLOWLIST BELOW, AND THE DIFFERENCE IS THE DOOR
     * (fifth audit, 29 Aug).
     *
     * `requestDatingUpload` twenty lines down takes photographs and nothing
     * else, so it names the four it accepts and says why: "an SVG is an image
     * that runs script". THIS door takes whatever a citizen attaches to a
     * message — photos, voice notes, documents, video — so an allowlist would
     * refuse real files, and there was no check at all: the Content-Type is
     * signed into the PUT, so an SVG landed in the PUBLIC bucket served at
     * `MEDIA_PUBLIC_BASE_URL` typed as an image the browser will execute.
     *
     * Dating chats were covered by `screenAttachments`, which sniffs the bytes
     * and refuses anything that is not a JPEG, PNG or WebP. City chats were
     * not covered by anything.
     *
     * So: the four things a browser will RUN from a bucket origin, refused by
     * name. Everything else is unchanged.
     */
    if (EXECUTABLE_IN_A_BROWSER.has(bareMimeType(mimeType))) {
      throw new BadRequestException('That kind of file cannot be uploaded here — it is a document a browser would run.');
    }
    /* THE "VIRUS-SCAN HOOK" STUB IS GONE, AND WHAT REPLACED IT IS NOT A VIRUS
       SCAN (30 Aug audit, the last launch blocker).
       A comment saying a scan would happen here was doing the work of making
       the gap look temporary. It could never have gone here anyway: this is
       the PRESIGN, and the bytes do not exist yet — the browser PUTs them
       straight to the bucket afterwards, and nothing server-side ever sees
       them on the way.
       So screening happens where the object first becomes something another
       citizen can reach. For a social post that is `createPost`, in
       SocialService.screenMedia via PostMediaGuard; for a dating chat it is
       the send, via ChatMediaGuard. Both fail closed. What stands here
       instead is the denylist above, which is a different question — "would a
       browser RUN this file" rather than "should a person SEE it" — and both
       are needed. */
    return this.storage.presignUpload(userId, mimeType, extFor(mimeType), sizeBytes);
  }

  /** Presign a PUT for a dating photo — private bucket, no public URL. (M3.) */
  async requestDatingUpload(userId: string, mimeType: string, sizeBytes: number): Promise<{ uploadUrl: string; key: string; expiresInSec: number }> {
    // An allowlist, not `image/*`: the Content-Type is signed into the PUT and
    // an SVG is an image that runs script. The size must be a real number —
    // `Number(undefined)` is NaN, and NaN > max is false, so a body with no
    // size used to sail through. Reviewed after upload against the stored
    // size too (photo-moderation.service.ts), which is the check that holds.
    const ext = DATING_PHOTO_MIME[mimeType];
    if (!ext) throw new BadRequestException('A matchmaking photo must be a JPEG, PNG, WebP or HEIC image.');
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) throw new BadRequestException('Say how large the photo is.');
    if (sizeBytes > DATING_PHOTO_MAX_BYTES) throw new BadRequestException(`A matchmaking photo must be under ${Math.round(DATING_PHOTO_MAX_BYTES / 1024 / 1024)} MB.`);
    // The declared size travels WITH the presign now: it is signed into the PUT
    // as ContentLength, so the ceiling checked two lines up is enforced by the
    // bucket rather than only by this function. See presignDatingUpload.
    return this.storage.presignDatingUpload(userId, mimeType, ext, sizeBytes);
  }

  /**
   * Presign a PUT for a VERIFICATION SELFIE. Same rules as a dating photo —
   * same allowlist, same ceiling — into its own namespace, because the one
   * thing that must be true of a selfie is that it can never be filed as a
   * photo somebody chose to show. See presignDatingSelfieUpload.
   */
  async requestDatingSelfieUpload(userId: string, mimeType: string, sizeBytes: number): Promise<{ uploadUrl: string; key: string; expiresInSec: number }> {
    const ext = DATING_PHOTO_MIME[mimeType];
    if (!ext) throw new BadRequestException('A selfie must be a JPEG, PNG, WebP or HEIC image.');
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) throw new BadRequestException('Say how large the selfie is.');
    if (sizeBytes > DATING_PHOTO_MAX_BYTES) throw new BadRequestException(`A selfie must be under ${Math.round(DATING_PHOTO_MAX_BYTES / 1024 / 1024)} MB.`);
    return this.storage.presignDatingSelfieUpload(userId, mimeType, ext);
  }

  /** Presign a PUT into the PRIVATE health vault (no public URL is returned). */
  /**
   * Presign a PUT for a POST's photograph or video.
   *
   * AN ALLOWLIST, LIKE THE DATING DOOR AND UNLIKE THE GENERAL ONE. The general
   * `requestUpload` above takes whatever a citizen attaches to a message, so it
   * can only name the four things a browser will RUN and refuse those. A post
   * carries a photograph or a clip and nothing else, so it can say what it
   * accepts — and an allowlist is the difference between "we thought of that
   * one" and "it is not on the list".
   *
   * The cap here is the SECOND of two. `sizeBytes` is whatever the client
   * says, so this one is advisory and always was; `SocialService.createPost`
   * reads the real object size out of the bucket before the media is attached
   * to anything. Both, because a small lie should be refused before 200MB is
   * pushed into the bucket, and a big one has to be refused after.
   */
  async requestPostUpload(userId: string, mimeType: string, sizeBytes: number): Promise<{ uploadUrl: string; key: string; expiresInSec: number }> {
    const max = this.config.get<number>('policy.maxUploadBytes') ?? 52428800;
    if (sizeBytes > max) throw new BadRequestException(`File exceeds ${max} bytes`);
    const bare = bareMimeType(mimeType);
    if (!POSTABLE_MEDIA.has(bare)) {
      throw new BadRequestException('A post takes a photograph or a video — that file is neither.');
    }
    return this.storage.presignPostUpload(userId, mimeType, extFor(mimeType));
  }

  /**
   * Presign a SNAP — a temporary chat photograph. (2 Sep.)
   *
   * THREE TYPES AND A SMALLER CEILING, and both narrowings are deliberate.
   *
   * JPEG, PNG and WebP because those are exactly what Rekognition takes, and a
   * snap is screened before it is delivered — accepting HEIC or GIF here would
   * mean accepting a file the guard can only refuse, one upload too late. The
   * dating profile door draws the same line for the same reason.
   *
   * 8 MB rather than the 50 MB general cap because these bytes are STREAMED
   * THROUGH THE API on every open rather than fetched from a bucket, and
   * because `MAX_SCREEN_BYTES` in the guard refuses anything larger anyway. A
   * ceiling that lets somebody upload 50 MB and then refuses to send it is a
   * ceiling in the wrong place.
   */
  async requestSnapUpload(userId: string, mimeType: string, sizeBytes: number): Promise<{ uploadUrl: string; key: string; expiresInSec: number }> {
    const bare = bareMimeType(mimeType);
    if (!SNAPPABLE_IMAGE.has(bare)) {
      throw new BadRequestException('A snap is a photograph — JPEG, PNG or WebP.');
    }
    if (sizeBytes > MAX_SNAP_BYTES) {
      throw new BadRequestException(`A snap must be under ${Math.round(MAX_SNAP_BYTES / 1024 / 1024)} MB.`);
    }
    return this.storage.presignSnapUpload(userId, mimeType, extFor(mimeType));
  }

  async requestPrivateUpload(userId: string, mimeType: string, sizeBytes: number): Promise<{ uploadUrl: string; key: string; expiresInSec: number }> {
    const max = this.config.get<number>('policy.maxUploadBytes') ?? 52428800;
    if (sizeBytes > max) throw new BadRequestException(`File exceeds ${max} bytes`);
    if (!mimeType) throw new BadRequestException('Missing file type');
    /* THE PRIVATE DOOR NEEDS THE SAME RULE (re-audit, 29 Aug). The first
       version guarded the public bucket only, reasoning that the public one is
       what MEDIA_PUBLIC_BASE_URL serves. But the private bucket is served
       through signed links from a city origin, and Drive fills it from here:
       upload `text/html`, register it as a Drive file, ask for its download
       URL, and it renders on that origin — which `cors-policy.ts` reflects
       with credentials. */
    if (EXECUTABLE_IN_A_BROWSER.has(bareMimeType(mimeType))) {
      throw new BadRequestException('That kind of file cannot be uploaded here — it is a document a browser would run.');
    }
    return this.storage.presignHealthUpload(userId, mimeType, extFor(mimeType));
  }
}
