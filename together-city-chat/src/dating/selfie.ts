/**
 * ── A MARK ONLY THE SERVER MAY WRITE ────────────────────────────────────────
 *
 * Owner, 27 Aug: "fix self verification for getting that verified profile tab."
 *
 * WHAT WAS BROKEN. The capture worked; the mark never stuck. `extras` is a
 * free-form blob the client posts back whole, so a badge living in it can be
 * forged — and `upsertProfile` rightly deleted `selfieVerified` on every write.
 * Nothing ever wrote it anywhere else. So a citizen took a selfie, saved the
 * profile, and the page said "No selfie yet" again, forever.
 *
 * THE FIX IS NOT TO TRUST THE BLOB. The bytes go to the private bucket and the
 * KEY is written by a dedicated endpoint under the server's own hand. A profile
 * save may neither set the mark nor clear it: `carrySelfie` strips whatever the
 * client sent and re-applies what the record already held, so an edit cannot
 * forge a selfie and cannot lose one.
 *
 * AND IT IS NOT A PICTURE ANYBODY CHOSE TO SHOW (owner, same day: "the selfie
 * should not become the part of the profile pictures displayed, that should be
 * only for verification"). It has its own storage namespace —
 * `dating-selfie/<userId>/`, not the photos' `dating/<userId>/` — so the check
 * that decides what may appear on a profile cannot match a selfie key, and the
 * check that accepts a selfie cannot match a photo. The promise is a property
 * of the string, not of the code that happens to be around it.
 *
 * WHAT THE MARK DOES NOT MEAN is unchanged, and it is stated wherever it is
 * drawn (components/SelfieOnFile.tsx): a selfie is on file, nothing has
 * compared it to their photos, and it is not proof of who they are.
 */
export const SELFIE_KEY = 'selfieKey';
export const SELFIE_AT = 'selfieAt';

/** Everything a client could once claim about its own selfie. All of it is
 *  dropped on every profile write — including the two server-owned names, so
 *  a hand-written request cannot set them either. */
const CLIENT_AUTHORED = ['selfieVerified', 'selfiePhoto', 'selfieVerifiedAt', SELFIE_KEY, SELFIE_AT];

type DX = Record<string, unknown>;

/** The extras a profile save should store: the citizen's own fields, minus any
 *  selfie claim they made, plus the mark the record already carried. */
export function carrySelfie(incoming: DX, stored: DX | null | undefined): DX {
  const out: DX = { ...incoming };
  for (const k of CLIENT_AUTHORED) delete out[k];
  const key = stored?.[SELFIE_KEY];
  if (typeof key === 'string' && key !== '') {
    out[SELFIE_KEY] = key;
    const at = stored?.[SELFIE_AT];
    if (typeof at === 'string' && at !== '') out[SELFIE_AT] = at;
  }
  return out;
}

/** Is a selfie on file? The key's presence is the whole fact — there is no
 *  separate boolean to disagree with it. */
export function selfieOnFile(dx: DX | null | undefined): boolean {
  const key = dx?.[SELFIE_KEY];
  return typeof key === 'string' && key !== '';
}

/** When it was taken, if the record says so. */
export function selfieTakenAt(dx: DX | null | undefined): string | null {
  const at = dx?.[SELFIE_AT];
  return selfieOnFile(dx) && typeof at === 'string' && at !== '' ? at : null;
}
