/**
 * Take the location out of a photo before it leaves the phone (BE-13.2/FE-13.2).
 *
 * A photo taken on a phone carries an Exif block, and in that block, by
 * default, are the GPS coordinates of the spot it was taken from — to about
 * five metres. Post it to the City Feed and those coordinates go with it. The
 * picture is the thing the citizen meant to share. Their home address is not.
 *
 * Uploads here go straight from the browser to R2 with a pre-signed URL, so
 * the server never sees the bytes and cannot strip anything. The only moment
 * the coordinates can be removed before they leave the device is here.
 *
 * This works on the bytes rather than re-encoding through a canvas, for two
 * reasons. Re-encoding is lossy — it would quietly degrade every photo anyone
 * posts — and it is unpredictable, because what a canvas emits depends on the
 * browser. Dropping a segment from a container is neither: the remaining bytes
 * are the original bytes, and the same input always gives the same output,
 * which is a thing you can write a test about.
 *
 * ORIENTATION IS THE EXCEPTION and the reason this file is not fifty lines.
 * Exif also carries the flag that says which way up the photo is; a phone
 * writes the sensor's raw frame and sets Orientation rather than rotating the
 * pixels. Drop the whole block and every portrait photo in the city appears on
 * its side. So Exif is not dropped — it is replaced with a new block
 * containing exactly one tag: Orientation. Nothing else survives: no GPS, no
 * timestamp, no camera serial, no thumbnail (which, notoriously, can be the
 * pre-crop image).
 */

export type Container = 'jpeg' | 'png' | 'webp';

export interface StripResult {
  bytes: Uint8Array;
  /** Segment or chunk names removed, in the order met. Empty means it was already clean. */
  removed: string[];
  container: Container;
}

const be16 = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const be32 = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const le32 = (b: Uint8Array, i: number) => ((b[i + 3] << 24) | (b[i + 2] << 16) | (b[i + 1] << 8) | b[i]) >>> 0;

function ascii(b: Uint8Array, i: number, n: number): string {
  let s = '';
  for (let k = 0; k < n && i + k < b.length; k++) s += String.fromCharCode(b[i + k]);
  return s;
}

function concat(parts: Uint8Array[]): Uint8Array {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

export function sniff(bytes: Uint8Array): Container | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(bytes, 1, 3) === 'PNG') return 'png';
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'webp';
  return null;
}

// ── JPEG ──────────────────────────────────────────────────────────────────

/** Markers that stand alone: no length, no payload. */
const STANDALONE = new Set([0x01, 0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9]);

/**
 * Read the Orientation tag out of an Exif payload (the bytes after "Exif\0\0").
 * Returns 1..8, or 1 when the block does not say — which is what "the right way
 * up already" means, so a missing tag and a normal photo take the same path.
 */
export function readOrientation(exif: Uint8Array): number {
  if (exif.length < 12) return 1;
  const order = ascii(exif, 0, 2);
  if (order !== 'II' && order !== 'MM') return 1;
  const big = order === 'MM';
  const u16 = (i: number) => (big ? be16(exif, i) : exif[i] | (exif[i + 1] << 8));
  const u32 = (i: number) => (big ? be32(exif, i) : le32(exif, i));
  if (u16(2) !== 0x002a) return 1;
  const ifd0 = u32(4);
  if (ifd0 + 2 > exif.length) return 1;
  const count = u16(ifd0);
  for (let k = 0; k < count; k++) {
    const at = ifd0 + 2 + k * 12;
    if (at + 12 > exif.length) break;
    if (u16(at) !== 0x0112) continue;
    const type = u16(at + 2);
    if (type !== 3) continue;                       // SHORT, inline in the value field
    const v = u16(at + 8);
    return v >= 1 && v <= 8 ? v : 1;
  }
  return 1;
}

/** A complete APP1 segment holding one tag: Orientation. 36 bytes, always. */
export function orientationOnlyApp1(orientation: number): Uint8Array {
  const o = orientation >= 1 && orientation <= 8 ? orientation : 1;
  return new Uint8Array([
    0xff, 0xe1, 0x00, 0x22,                          // APP1, length 34 (includes these two)
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00,              // "Exif\0\0"
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08,  // big-endian TIFF, IFD0 at offset 8
    0x00, 0x01,                                      // one entry
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, o, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,                          // no next IFD
  ]);
}

const XMP_NS = 'http://ns.adobe.com/xap/1.0/';

export function stripJpeg(bytes: Uint8Array): StripResult | null {
  if (sniff(bytes) !== 'jpeg') return null;
  const out: Uint8Array[] = [bytes.subarray(0, 2)];   // SOI
  const removed: string[] = [];
  let orientation = 1;
  let i = 2;

  while (i + 1 < bytes.length) {
    if (bytes[i] !== 0xff) return null;               // not where a marker should be: refuse to guess
    const marker = bytes[i + 1];
    if (marker === 0xff) { out.push(bytes.subarray(i, i + 1)); i += 1; continue; }   // fill byte
    if (STANDALONE.has(marker)) { out.push(bytes.subarray(i, i + 2)); i += 2; continue; }
    if (i + 3 >= bytes.length) return null;
    const len = be16(bytes, i + 2);
    if (len < 2 || i + 2 + len > bytes.length) return null;
    const payload = bytes.subarray(i + 4, i + 2 + len);

    if (marker === 0xda) {                            // start of scan: image data to the end
      out.push(bytes.subarray(i));
      i = bytes.length;
      break;
    }

    let drop: string | null = null;
    if (marker === 0xe1) {
      if (ascii(payload, 0, 6) === 'Exif\0\0') {
        orientation = readOrientation(payload.subarray(6));
        drop = 'Exif';
      } else if (ascii(payload, 0, XMP_NS.length) === XMP_NS) {
        drop = 'XMP';
      }
    } else if (marker === 0xed) {
      drop = 'IPTC';                                  // Photoshop resource block: captions, credit, location
    } else if (marker === 0xee && ascii(payload, 0, 5) === 'Adobe') {
      drop = null;                                    // colour transform: needed to decode correctly
    }

    if (drop) removed.push(drop);
    else out.push(bytes.subarray(i, i + 2 + len));
    i += 2 + len;
  }

  // Bytes left over that were neither a segment nor the scan mean this is not
  // the file it claims to be. Half-understood is not understood.
  if (i < bytes.length) return null;

  if (removed.includes('Exif')) {
    out.splice(1, 0, orientationOnlyApp1(orientation));   // straight after SOI, where it belongs
  }
  return { bytes: concat(out), removed, container: 'jpeg' };
}

// ── PNG ───────────────────────────────────────────────────────────────────

/** Chunks that can carry location or identity. PNG has no orientation flag. */
const PNG_DROP = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt']);

export function stripPng(bytes: Uint8Array): StripResult | null {
  if (sniff(bytes) !== 'png') return null;
  const out: Uint8Array[] = [bytes.subarray(0, 8)];
  const removed: string[] = [];
  let i = 8;
  while (i + 8 <= bytes.length) {
    const len = be32(bytes, i);
    const type = ascii(bytes, i + 4, 4);
    const end = i + 12 + len;                          // len + type(4) + data + crc(4)
    if (end > bytes.length) return null;
    if (PNG_DROP.has(type)) removed.push(type);
    else out.push(bytes.subarray(i, end));
    i = end;
    if (type === 'IEND') break;
  }
  return { bytes: concat(out), removed, container: 'png' };
}

// ── WebP ──────────────────────────────────────────────────────────────────

const VP8X_EXIF = 0x08;
const VP8X_XMP = 0x04;

export function stripWebp(bytes: Uint8Array): StripResult | null {
  if (sniff(bytes) !== 'webp') return null;
  const body: Uint8Array[] = [];
  const removed: string[] = [];
  let i = 12;
  while (i + 8 <= bytes.length) {
    const fourcc = ascii(bytes, i, 4);
    const len = le32(bytes, i + 4);
    const padded = len + (len % 2);                    // chunks are even-aligned
    const end = i + 8 + padded;
    if (end > bytes.length) return null;
    if (fourcc === 'EXIF' || fourcc === 'XMP ') {
      removed.push(fourcc.trim());
    } else if (fourcc === 'VP8X') {
      // The extended header advertises which optional chunks are present. Leave
      // it claiming an Exif chunk we just deleted and strict decoders reject
      // the file, so clear those two bits as well.
      const chunk = bytes.slice(i, end);
      chunk[8] &= ~(VP8X_EXIF | VP8X_XMP);
      body.push(chunk);
    } else {
      body.push(bytes.subarray(i, end));
    }
    i = end;
  }
  const joined = concat(body);
  const head = new Uint8Array(12);
  head.set(bytes.subarray(0, 12));
  const size = joined.length + 4;                      // "WEBP" + chunks
  head[4] = size & 0xff;
  head[5] = (size >>> 8) & 0xff;
  head[6] = (size >>> 16) & 0xff;
  head[7] = (size >>> 24) & 0xff;
  return { bytes: concat([head, joined]), removed, container: 'webp' };
}

/**
 * Strip whichever container this is. Returns null when the bytes are not one we
 * can take apart — the caller decides what to do about that, because the right
 * answer differs between a public post and a private health record.
 */
export function stripMetadata(bytes: Uint8Array): StripResult | null {
  switch (sniff(bytes)) {
    case 'jpeg': return stripJpeg(bytes);
    case 'png': return stripPng(bytes);
    case 'webp': return stripWebp(bytes);
    default: return null;
  }
}
