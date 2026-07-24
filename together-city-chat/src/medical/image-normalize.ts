import sharp from 'sharp';

/**
 * Media types the vision API accepts for image blocks. Anything else — HEIC/HEIF
 * (every iPhone photo), TIFF, BMP, unknown octet-streams — must be converted or
 * the extraction call fails before the model ever sees the report.
 */
const VISION_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/** Keep the encoded image safely under the API's 5 MB per-image limit. */
const MAX_BYTES = 4 * 1024 * 1024;

async function heicToJpeg(buf: Buffer): Promise<Buffer> {
  // Pure-JS decoder (libheif wasm) — sharp's prebuilt binaries can't read HEIC.
  const convert = (await import('heic-convert')).default;
  const out = await convert({ buffer: buf, format: 'JPEG', quality: 0.85 });
  return Buffer.from(out);
}

/**
 * Normalise an uploaded report photo for AI vision: convert unsupported formats
 * to JPEG and downscale anything over the size limit. Best-effort — on any
 * failure the original bytes are returned so the caller's own error path (and
 * manual entry fallback) still applies.
 */
export async function normalizeReportImage(
  base64: string,
  mimeType: string,
): Promise<{ base64: string; mediaType: string; changed: boolean }> {
  try {
    let buf: Buffer = Buffer.from(base64, 'base64');
    let type = (mimeType || '').toLowerCase();
    const looksHeic = /heic|heif/.test(type);

    if (looksHeic) {
      buf = await heicToJpeg(buf);
      type = 'image/jpeg';
    } else if (!VISION_TYPES.has(type)) {
      // TIFF/BMP/unknown → decode with sharp and re-encode as JPEG.
      buf = await sharp(buf).rotate().jpeg({ quality: 85 }).toBuffer();
      type = 'image/jpeg';
    }

    if (buf.length > MAX_BYTES) {
      // Downscale progressively until it fits; lab reports stay perfectly
      // readable at 2000px.
      for (const width of [2400, 2000, 1600, 1200]) {
        buf = await sharp(buf).rotate().resize({ width, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
        type = 'image/jpeg';
        if (buf.length <= MAX_BYTES) break;
      }
    }

    const changed = type !== (mimeType || '').toLowerCase() || buf.length !== Buffer.from(base64, 'base64').length;
    return { base64: buf.toString('base64'), mediaType: type, changed };
  } catch {
    return { base64, mediaType: mimeType || 'image/jpeg', changed: false };
  }
}
