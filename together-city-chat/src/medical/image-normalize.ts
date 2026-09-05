/**
 * sharp is loaded ON FIRST USE, not at import.
 *
 * It is a NATIVE module — a platform-specific `.node` binary — and importing it
 * at module scope means every file that transitively reaches MedicalService
 * loads it, including test files that never touch an image. That is a slower
 * boot for every process and a hard failure on any machine whose installed
 * binary does not match the running architecture:
 *
 *     Could not load the "sharp" module using the linux-arm64 runtime
 *
 * `heic-convert` two functions down was already deferred, for the same reason
 * and without the reason written down. The two now match.
 */
/* sharp 0.35 ships ESM-first typings (`export default sharp`), so the callable
   is the module's default; at runtime our CJS build gets `module.exports =
   sharp` from index.cjs, so the value may be the module itself. Type from the
   one, read from either. */
type Sharp = typeof import('sharp').default;
let loaded: Sharp | null = null;
async function sharpLib(): Promise<Sharp> {
  const mod = (await import('sharp')) as unknown as { default?: Sharp };
  loaded ??= mod.default ?? (mod as unknown as Sharp);
  return loaded;
}

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
      buf = await (await sharpLib())(buf).rotate().jpeg({ quality: 85 }).toBuffer();
      type = 'image/jpeg';
    }

    if (buf.length > MAX_BYTES) {
      // Downscale progressively until it fits; lab reports stay perfectly
      // readable at 2000px.
      for (const width of [2400, 2000, 1600, 1200]) {
        buf = await (await sharpLib())(buf).rotate().resize({ width, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
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
