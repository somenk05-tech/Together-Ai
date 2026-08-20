/**
 * ── PET PHOTOS: THE RULES, AWAY FROM THE UI ─────────────────────────────────
 *
 * Five photographs per pet, and everything that decides whether a file becomes
 * one of them lives here rather than in the component — because the interesting
 * failures are not visual. A HEIC straight off an iPhone, an eight-megabyte
 * burst frame, the same file added twice, a sixth file dropped onto a full
 * gallery: each needs a specific sentence back, and a component that grew those
 * five branches inline is a component nobody can test.
 *
 * TWO REPO FACILITIES DO THE HARD PART, AND THIS FILE DOES NOT REIMPLEMENT
 * EITHER OF THEM.
 *
 * · `lib/scrub-image.ts` takes the location out. A photo of a dog in a garden
 *   carries the GPS coordinates of that garden, and the citizen who uploads it
 *   is not thinking about that. `scrubImage` strips the Exif block where it can
 *   open the container, and re-encodes through a canvas where it cannot (which
 *   is also the HEIC path). It is called here even though nothing leaves the
 *   device yet, because the day these photos reach the server is not the day to
 *   remember privacy.
 *
 * · `lib/resizeAvatar.ts` does the square centre-crop and the downscale. It
 *   exists because a phone photo is three to eight megabytes and every list
 *   that draws a face would read it back. A second crop written here would be a
 *   second crop that drifts from the one the rest of the city uses.
 *
 * WHAT IS DELIBERATELY NOT HERE: an upload. `api/upload-chokepoint.test.ts`
 * makes `api/media.api.ts` the only module allowed to PUT bytes to storage, so
 * that photos cannot leave by a path that skipped the scrubber. When the Pet
 * District gets a server, `storePetPhoto` below becomes one call to
 * `mediaApi.upload` and nothing else in this feature changes.
 */

import { scrubImage, UnreadableImageError } from '@/lib/scrub-image';
import { resizeAvatar } from '@/lib/resizeAvatar';
import type { PetPhoto } from '../types';

/** The ask: five per pet. One number, read by the gallery, the counter and the
 *  rejection message, so they cannot disagree about what "full" means. */
export const MAX_PET_PHOTOS = 5;

/** Big enough to fill the profile card on a retina screen, small enough that
 *  five of them are a few hundred kilobytes rather than forty megabytes. */
export const PET_PHOTO_PX = 640;

/** Read before decode. A 40 MB raw file should be refused by its size, not by
 *  locking the tab up while a canvas tries to open it. */
export const MAX_SOURCE_BYTES = 12 * 1024 * 1024;

export interface PhotoRejection {
  name: string;
  reason: string;
}

export interface PhotoIntake {
  photos: PetPhoto[];
  rejected: PhotoRejection[];
}

const prettyBytes = (n: number) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;

/** Same file, added twice — by name, size and mtime. Cheap, and it catches the
 *  real case: the citizen picks the same photo from the picker again. */
const fingerprint = (file: File) => `${file.name}:${file.size}:${file.lastModified}`;

/**
 * Turn chosen files into stored photos, in order, stopping at the cap.
 *
 * Every file gets its own verdict: one bad photo in a selection of four must
 * not cost the other three. `rejected` carries a sentence per file, addressed
 * to the person who chose it.
 */
export async function acceptPetPhotos(
  files: File[],
  existing: PetPhoto[],
): Promise<PhotoIntake> {
  const photos: PetPhoto[] = [];
  const rejected: PhotoRejection[] = [];
  const seen = new Set(existing.map((p) => p.fingerprint));
  let room = MAX_PET_PHOTOS - existing.length;

  for (const file of files) {
    if (room <= 0) {
      rejected.push({
        name: file.name,
        reason: `Only ${MAX_PET_PHOTOS} photos per pet — remove one to add this.`,
      });
      continue;
    }
    if (!file.type.startsWith('image/')) {
      rejected.push({ name: file.name, reason: 'Not an image file.' });
      continue;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      rejected.push({
        name: file.name,
        reason: `${prettyBytes(file.size)} is too large — keep photos under ${prettyBytes(MAX_SOURCE_BYTES)}.`,
      });
      continue;
    }
    const print = fingerprint(file);
    if (seen.has(print)) {
      rejected.push({ name: file.name, reason: 'Already added.' });
      continue;
    }

    try {
      // Location first, always — see the note at the top of this file.
      const scrubbed = await scrubImage(file, 'private');
      const url = await resizeAvatar(scrubbed.file, PET_PHOTO_PX);
      seen.add(print);
      room -= 1;
      photos.push({
        id: `photo-${print.replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 40)}-${photos.length}`,
        url,
        name: file.name,
        bytes: Math.round((url.length * 3) / 4),
        fingerprint: print,
        /** What the scrubber took out, so the UI can say so once rather than
         *  claim a privacy feature it did not perform on this file. */
        removed: scrubbed.removed,
        addedAt: new Date().toISOString(),
        /* Not yet. The store uploads it and swaps in the row the server
           returns; until that resolves this tile is optimistic. */
        saved: false,
      });
    } catch (err) {
      rejected.push({
        name: file.name,
        reason: err instanceof UnreadableImageError
          ? err.message
          : 'This browser could not open that image. iPhone HEIC photos often need to be saved as JPEG first.',
      });
    }
  }

  return { photos, rejected };
}

/**
 * The square JPEG, back as a file the vault can be given.
 *
 * `acceptPetPhotos` hands back a data URL because that is what a tile draws.
 * The uploader needs bytes, and re-encoding through a canvas a second time
 * would cost another generation of JPEG loss for nothing — so this decodes the
 * base64 the resize already produced and wraps it, unchanged.
 */
export function photoFile(photo: PetPhoto): File {
  const [head, b64] = photo.url.split(',');
  const type = /data:([^;]+)/.exec(head)?.[1] ?? 'image/jpeg';
  const binary = atob(b64 ?? '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], photo.name || 'pet.jpg', { type });
}

/** The photo a card draws. First is main — reordering IS choosing. */
export const mainPhoto = (photos: PetPhoto[]): PetPhoto | null => photos[0] ?? null;

/** Move one to the front without disturbing the order of the others. */
export function promotePhoto(photos: PetPhoto[], id: string): PetPhoto[] {
  const found = photos.find((p) => p.id === id);
  if (!found) return photos;
  return [found, ...photos.filter((p) => p.id !== id)];
}

/** How many photographs actually carried coordinates, for the one-line notice. */
export const scrubbedCount = (photos: PetPhoto[]) =>
  photos.filter((p) => p.removed.length > 0).length;
