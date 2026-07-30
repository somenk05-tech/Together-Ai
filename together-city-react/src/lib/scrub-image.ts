import { stripMetadata } from './image-metadata';

/**
 * The browser half of taking the location out of a photo (FE-13.2).
 *
 * image-metadata.ts does the part that can be reasoned about and tested: given
 * bytes, give back the same bytes without the Exif block. This file does the
 * part that can only happen in a browser — reading the File, and deciding what
 * to do about a photo in a format we cannot take apart.
 *
 * That decision is the whole of the design here. A HEIC straight off an iPhone
 * carries GPS coordinates and is not a container this code can open. Uploading
 * it anyway publishes someone's front door. Refusing it tells them their photo
 * is not welcome. Neither is acceptable, so there is a third path: hand the
 * file to the browser's own decoder and re-encode it through a canvas, which
 * produces an image with no metadata at all — no Exif, no XMP, nothing. It is
 * lossy, which is why it is the fallback and not the method; but it is only
 * reached by files that would otherwise have to be refused.
 *
 * Only if the browser cannot decode it either does this refuse, and by then
 * "we could not read this image" is simply true.
 */

export type Scrubbed = {
  file: File;
  /** What was taken out. Empty means the photo carried nothing to take out. */
  removed: string[];
  /** How: untouched bytes, or a re-encode that cost some quality. */
  how: 'clean' | 'stripped' | 're-encoded' | 'not-an-image';
};

/** Where the file is going, which is what decides how strict to be. */
export type Destination = 'public' | 'private';

const CANVAS_TYPE = 'image/jpeg';
const CANVAS_QUALITY = 0.92;

async function reEncode(file: File): Promise<File | null> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null;
  let bitmap: ImageBitmap;
  try {
    // 'from-image' applies the Exif rotation to the pixels, which matters here:
    // the flag that said which way up it was is about to stop existing.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return null;
  }
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, CANVAS_TYPE, CANVAS_QUALITY));
    if (!blob) return null;
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: CANVAS_TYPE, lastModified: file.lastModified });
  } finally {
    bitmap.close();
  }
}

export class UnreadableImageError extends Error {
  constructor() {
    super('We could not read this image, so we could not check it for location data before posting it. Please try a different photo, or save it as a JPEG first.');
    this.name = 'UnreadableImageError';
  }
}

/**
 * Return the file that should actually be uploaded.
 *
 * A non-image passes straight through: a PDF or a docx is not something this
 * knows how to open, and a health record is not a thing to silently rewrite.
 * Somewhere public, an image we cannot open is refused rather than published.
 * Somewhere private — the health vault, reachable only by short-lived signed
 * link — it goes as it is, because the alternative is a citizen unable to file
 * their own scan.
 */
export async function scrubImage(file: File, to: Destination): Promise<Scrubbed> {
  if (!file.type.startsWith('image/')) return { file, removed: [], how: 'not-an-image' };

  const result = stripMetadata(new Uint8Array(await file.arrayBuffer()));

  if (result) {
    if (result.removed.length === 0) return { file, removed: [], how: 'clean' };
    // Into a buffer of its own: File wants an ArrayBuffer, and the stripper's
    // output can be a view onto the one we read the photo into.
    const buffer = new ArrayBuffer(result.bytes.byteLength);
    new Uint8Array(buffer).set(result.bytes);
    const stripped = new File([buffer], file.name, { type: file.type, lastModified: file.lastModified });
    return { file: stripped, removed: result.removed, how: 'stripped' };
  }

  const reencoded = await reEncode(file);
  if (reencoded) return { file: reencoded, removed: ['all metadata'], how: 're-encoded' };

  if (to === 'public') throw new UnreadableImageError();
  return { file, removed: [], how: 'not-an-image' };
}
