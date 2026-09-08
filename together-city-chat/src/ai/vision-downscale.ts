/**
 * ── A PHOTOGRAPH COSTS BY THE PIXEL ─────────────────────────────────────────
 *
 * An image block is billed at roughly (width × height) / 750 input tokens. A
 * modern phone photograph is ~4000 × 3000, which is about sixteen thousand
 * tokens — for ONE picture, on the most expensive tier in the file.
 *
 * The beauty analysis accepted eight photographs at four million base64
 * characters each and passed six of them straight through to Opus vision,
 * undownscaled. That is on the order of ₹14 for one FREE analysis, against the
 * ₹1.70 the codebase's own costing assumes in beauty/analysis-quota.ts, and it
 * is what prices the ₹100 second analysis wrong by about eight times.
 *
 * `medical/image-normalize.ts` already does the neighbouring job — convert HEIC
 * and anything else vision cannot read, and keep the encoded file under the 5 MB
 * per-image limit. This is a different question with a different answer: not
 * "will the API accept it" but "how many pixels does the model actually need".
 * For reading a face for skin texture, or a plate for what is on it, the answer
 * is about a thousand across; the enormous version costs sixteen times as much
 * and tells the model nothing more.
 *
 * BEST-EFFORT, ALWAYS. Every failure path returns the original bytes. A photo
 * that could not be resized is a photo that costs what it used to cost, which
 * is exactly what happened before this file existed. (1M-DAU pass, 6 Sep.)
 *
 * sharp is loaded ON FIRST USE, not at import — it is a native module, and
 * importing it at module scope loads a platform-specific binary into every
 * process that transitively reaches AiService, including specs that never touch
 * an image. Same reasoning, same shape, as image-normalize.ts.
 */
type Sharp = typeof import('sharp').default;
let loaded: Sharp | null = null;
async function sharpLib(): Promise<Sharp> {
  const mod = (await import('sharp')) as unknown as { default?: Sharp };
  loaded ??= mod.default ?? (mod as unknown as Sharp);
  return loaded;
}

/** Longest edge a vision read needs. ~1024² / 750 ≈ 1,400 tokens per image. */
export const VISION_MAX_EDGE = 1024;

/** Below this there is nothing worth re-encoding — the image is already small. */
const SKIP_UNDER_BYTES = 120 * 1024;

/**
 * Shrink one image for a vision call. Returns JPEG when it re-encodes, and the
 * input untouched when it cannot or need not.
 */
export async function downscaleForVision(
  base64: string,
  mediaType: string,
  maxEdge = VISION_MAX_EDGE,
): Promise<{ base64: string; mediaType: string }> {
  try {
    const buf = Buffer.from(base64, 'base64');
    if (buf.length <= SKIP_UNDER_BYTES) return { base64, mediaType };
    const out = await (await sharpLib())(buf)
      // `rotate()` with no argument applies the EXIF orientation, which every
      // phone photograph carries and which the model would otherwise read
      // sideways.
      .rotate()
      .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
    // A re-encode that made the file BIGGER is a re-encode worth discarding —
    // a small PNG screenshot turned into a large JPEG, for instance.
    if (out.length >= buf.length) return { base64, mediaType };
    return { base64: out.toString('base64'), mediaType: 'image/jpeg' };
  } catch {
    return { base64, mediaType };
  }
}

/** The same, for a set. Order is preserved; one failure does not spoil the rest. */
export async function downscaleAllForVision(
  images: ReadonlyArray<{ base64: string; mediaType: string }>,
  maxEdge = VISION_MAX_EDGE,
): Promise<Array<{ base64: string; mediaType: string }>> {
  return Promise.all(images.map((i) => downscaleForVision(i.base64, i.mediaType, maxEdge)));
}
