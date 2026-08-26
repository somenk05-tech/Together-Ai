/**
 * What the selfie marker actually means (H5).
 *
 * This was a blue ✓ labelled "Verified" / "Camera-verified", shown to a stranger
 * deciding whether to meet somebody. A blue tick beside a name has one meaning
 * everywhere on the internet, and it is "we checked that this is who they say
 * they are". Nothing checks that.
 *
 * What IS checked: a selfie is stored on the profile. That is all the server
 * knows. Two things it does not know:
 *
 *  1. That the selfie came from a camera. The camera-only rule is enforced by
 *     the capture UI in the browser. `upsertProfile` stores the `extras` JSON it
 *     is handed, so a request made outside the app can set `selfieVerified` with
 *     any image at all. SelfieVerify's own comment says there is "no way to mark
 *     yourself verified by uploading a photo" — there is; it just isn't in the UI.
 *  2. That the person in the selfie is the person in the profile photos. No
 *     face match runs anywhere. A genuine live selfie of somebody else earns the
 *     same marker.
 *
 * So the marker now says what is true, and it is deliberately NOT a blue tick.
 * Relabelling the tooltip while keeping the tick would have left the claim
 * exactly where it was, because the tick is the claim.
 *
 * When a real face match ships, this component is where "verified" comes back —
 * with `verified` meaning it, and a different mark to say so.
 */
export function SelfieOnFile({ on, size = 'md' }: { on: boolean; size?: 'sm' | 'md' }) {
  if (!on) return null;
  const px = size === 'sm' ? 16 : 20;
  return (
    <span
      title="A selfie is on file. It has not been checked against their photos, so it is not proof of identity."
      aria-label="Selfie on file — not identity-checked"
      style={{
        display: 'inline-grid', placeItems: 'center', width: px, height: px, borderRadius: '50%',
        background: 'var(--paper)', border: '1px solid var(--line)', color: 'var(--muted)',
        fontSize: px * 0.55, flex: 'none', lineHeight: 1,
      }}
    >
      📷
    </span>
  );
}

/** The same fact in words, for a line of body copy rather than a name row. */
export const SELFIE_ON_FILE_NOTE =
  'A selfie is on file for this member. We don’t yet check it against their photos, '
  + 'so treat it as a sign of effort, not proof of who they are.';

/**
 * What `verified` on a candidate ACTUALLY means, since 26 Aug: the server
 * confirmed their email address. It is not a selfie — the client-authored
 * selfie flag is stripped on save and nothing reads it — so drawing the
 * camera for it was the same claim the blue tick made, one step removed.
 * An envelope, and a sentence that says exactly what was checked.
 */
export const EMAIL_CONFIRMED_NOTE =
  'Their email address is confirmed. That is all we have checked — it is not proof of who they are.';

export function EmailConfirmed({ on, size = 'md' }: { on: boolean; size?: 'sm' | 'md' }) {
  if (!on) return null;
  const px = size === 'sm' ? 16 : 20;
  return (
    <span
      title={EMAIL_CONFIRMED_NOTE}
      aria-label="Email confirmed — not identity-checked"
      style={{
        display: 'inline-grid', placeItems: 'center', width: px, height: px, borderRadius: '50%',
        background: 'var(--paper)', border: '1px solid var(--line)', color: 'var(--muted)',
        fontSize: px * 0.55, flex: 'none', lineHeight: 1,
      }}
    >
      ✉
    </span>
  );
}
