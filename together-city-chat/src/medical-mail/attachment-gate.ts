/**
 * ── WHAT MAY BE STORED FROM AN EMAIL (owner, 16 Sep, §24 and §40) ────────────
 *
 * Medical Mail takes attachments from strangers on the internet. Before a
 * byte is written to the health vault the file has to be a kind the vault can
 * hold — a PDF, a picture, a text file, a DICOM image — AND has to look like
 * what it says it is: the first bytes are checked against the declared type,
 * so a script renamed `report.pdf` is refused at the door. Prisma-free and
 * pure, so it is tested on paper.
 *
 * This is the seam a real malware scanner plugs into (`scan` below). Until
 * one is signed, the gate is the type check; nothing here claims more.
 */
export type GateVerdict = { ok: true; mimeType: string; ext: string } | { ok: false; reason: string };

const TIFF_LE = Buffer.from([0x49, 0x49, 0x2a, 0x00]);
const TIFF_BE = Buffer.from([0x4d, 0x4d, 0x00, 0x2a]);
const ALLOWED: Record<string, { ext: string; magic?: (b: Buffer) => boolean }> = {
  'application/pdf': { ext: 'pdf', magic: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  'image/jpeg': { ext: 'jpg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': { ext: 'png', magic: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/webp': { ext: 'webp', magic: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
  'image/heic': { ext: 'heic', magic: (b) => b.subarray(4, 8).toString('latin1') === 'ftyp' },
  'image/heif': { ext: 'heif', magic: (b) => b.subarray(4, 8).toString('latin1') === 'ftyp' },
  'image/tiff': { ext: 'tiff', magic: (b) => b.subarray(0, 4).equals(TIFF_LE) || b.subarray(0, 4).equals(TIFF_BE) },
  'application/dicom': { ext: 'dcm', magic: (b) => b.length > 132 && b.subarray(128, 132).toString('latin1') === 'DICM' },
  'text/plain': { ext: 'txt' },
};
const EXT_TO_MIME: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif', tif: 'image/tiff', tiff: 'image/tiff', dcm: 'application/dicom', txt: 'text/plain' };
const DANGEROUS_EXT = /\.(exe|bat|cmd|com|scr|pif|js|jse|vbs|vbe|ps1|msi|jar|apk|dmg|sh|html?|svg|lnk|iso|zip|rar|7z)$/i;

/** The declared type, or the one the extension implies when the sender's
 *  client declared nothing useful (`application/octet-stream` is common). */
export function resolveMime(declared: string, filename: string): string {
  const d = (declared || '').toLowerCase().split(';')[0].trim();
  if (ALLOWED[d]) return d;
  const ext = (filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '');
  return EXT_TO_MIME[ext] ?? d;
}

export function gateAttachment(filename: string, declared: string, bytes: Buffer, maxBytes: number): GateVerdict {
  if (DANGEROUS_EXT.test(filename)) return { ok: false, reason: 'Not a document type the vault stores.' };
  if (bytes.length === 0) return { ok: false, reason: 'The file was empty.' };
  if (bytes.length > maxBytes) return { ok: false, reason: `Over ${Math.round(maxBytes / 1024 / 1024)} MB.` };
  const mime = resolveMime(declared, filename);
  const spec = ALLOWED[mime];
  if (!spec) return { ok: false, reason: `Unsupported type (${mime || 'unknown'}) — PDFs, photos, scans and DICOM images are stored.` };
  if (spec.magic && !spec.magic(bytes)) return { ok: false, reason: `The file does not look like a ${spec.ext.toUpperCase()} — refused as a precaution.` };
  const scanned = scan(bytes);
  if (!scanned.ok) return scanned;
  return { ok: true, mimeType: mime, ext: spec.ext };
}

/**
 * The malware seam. A PDF that carries JavaScript or a launch action is the
 * one shape a document scanner can catch without a signature database, and
 * it is refused; everything else passes until a scanner is plugged in here.
 */
export function scan(bytes: Buffer): GateVerdict {
  if (bytes.subarray(0, 5).toString('latin1') === '%PDF-') {
    const head = bytes.subarray(0, Math.min(bytes.length, 4 * 1024 * 1024)).toString('latin1');
    if (/\/JavaScript\b|\/JS\b|\/Launch\b/.test(head)) {
      return { ok: false, reason: 'The PDF carries a script, which a medical report never does — refused.' };
    }
  }
  return { ok: true, mimeType: '', ext: '' };
}
