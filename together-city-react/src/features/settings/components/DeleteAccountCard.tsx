import { useState } from 'react';
import { Card, Button } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { authApi } from '@/api/auth.api';

/**
 * The one door out of the city — shared by Settings and the Profile page so
 * both render the SAME protections: type DELETE, confirm your password, and
 * the server (which re-checks the password) revokes every session. One
 * component rather than two copies, because a danger zone that exists twice
 * is a danger zone that gets fixed once.
 *
 * Deletion is the deleted-then-purged flow: the account stops existing for
 * other citizens immediately; the data purge runs thirty days later
 * (privacy/account-purge.service.ts).
 *
 * ── THE COPY IS THE PROMISE, SO IT SAYS WHAT ACTUALLY HAPPENS (27 Aug) ────
 *
 * It used to read: "Erases your posts, photos, listings and connections, and
 * signs out every device." Three things were wrong with that, and all three
 * favoured us:
 *
 *   · "Erases" is present tense and the photographs are not erased for
 *     THIRTY DAYS. Somebody deleting an account because they felt unsafe read
 *     a sentence saying their pictures were gone when they were not.
 *   · It never mentioned that MESSAGES ARE KEPT FOREVER. That is a defensible
 *     decision — purge-plan.ts argues it, and a group thread full of holes is
 *     worse for the people left in it — but a decision made in the citizen's
 *     name and never told to them is not consent, it is an assumption.
 *   · "Listings" are not erased on the spot either; they go with the purge.
 *
 * And the thirty days is NOT a grace period. There is no restore path: the
 * password is replaced with an unusable value and no endpoint reverses any of
 * it. Saying "kept for thirty days" without saying that would trade one
 * comfortable misreading for another, so the copy says it outright.
 *
 * Every claim below was checked against auth.service.ts deleteAccount() and
 * privacy/purge-plan.ts, and `what-you-are-told-when-you-leave.test.ts` fails
 * if the two drift apart.
 */
/** One shared line style for the four paragraphs below — hoisted because
 *  scripts/size-system-ceiling.mjs counts inline style objects, and honest
 *  copy should not cost the codebase four of them. */
const leaveLine: React.CSSProperties = { fontSize: 13, marginTop: '8px', lineHeight: 1.6 };

export function DeleteAccountCard() {
  const { signOut } = useAuth();
  const [confirmText, setConfirmText] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  /** Extracted from the button: an async onClick returns a promise React
   *  never looks at, so a failure here would have been silent. */
  const deleteAccount = async () => {
    // "Permanently" was doing work the flow does not do on the spot. This says
    // the one thing a person needs at the last second: there is no way back.
    if (!window.confirm('Delete your Together City account? You cannot sign in again, and this cannot be undone.')) return;
    setDeleting(true); setDeleteError(null);
    try {
      await authApi.deleteAccount(deletePassword);
      // Session is already revoked server-side; clear the client and
      // land on a clean sign-in screen.
      signOut();
      window.location.assign('/sign-in');
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setDeleteError(msg ?? "Couldn't delete the account just now — please try again.");
      setDeleting(false);
    }
  };

  return (
    <Card style={{ marginTop: 18, borderColor: 'rgba(224,52,43,.4)' }}>
      <div style={{ marginBottom: 6 }}>
        <h3 style={{ margin: 0 }}>Delete account</h3>
      </div>
      <p className="muted" style={leaveLine}>
        <strong>Straight away:</strong> every device is signed out, and your posts, follows and
        connections are deleted. Your name and handle are replaced, so nobody can find you,
        message you or see you anywhere in the city.
      </p>
      <p className="muted" style={leaveLine}>
        <strong>After thirty days:</strong> everything else is destroyed — your matchmaking profile
        and its photographs, your health and medical records, your files and the rest of your
        data. Those thirty days are not a grace period: you cannot sign in again during them,
        and none of this can be undone.
      </p>
      <p className="muted" style={leaveLine}>
        <strong>Kept, deliberately:</strong> messages you sent to other people, and your
        comments and likes on their posts — deleting those would edit somebody else&rsquo;s
        conversation, and they no longer carry your name. Shared household plans and rosters
        stay for the people still in them, and payment records stay as long as the law requires.
      </p>
      <p className="muted" style={leaveLine}>
        Type <strong>DELETE</strong> and confirm your password.
      </p>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 }}>
        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="Type DELETE to confirm"
          aria-label="Type DELETE to confirm"
          style={{ flex: 1, minWidth: 170, padding: '9px 12px', border: '1px solid var(--line)', borderRadius: 8, fontFamily: 'inherit', fontSize: 14 }}
        />
        <input
          type="password" value={deletePassword} autoComplete="current-password"
          onChange={(e) => setDeletePassword(e.target.value)}
          placeholder="Your password"
          aria-label="Your password"
          style={{ flex: 1, minWidth: 170, padding: '9px 12px', border: '1px solid var(--line)', borderRadius: 8, fontFamily: 'inherit', fontSize: 14 }}
        />
        <Button size="sm" variant="line" disabled={confirmText !== 'DELETE' || !deletePassword || deleting}
          style={confirmText === 'DELETE' && deletePassword ? { borderColor: 'var(--danger-ink)', color: 'var(--danger-ink)' } : undefined}
          onClick={() => void deleteAccount()}>
          {deleting ? 'Deleting…' : 'Delete my account'}
        </Button>
      </div>
      {deleteError && (
        <p role="alert" style={{ fontSize: 12.5, marginTop: 10, color: 'var(--danger-ink)' }}>{deleteError}</p>
      )}
    </Card>
  );
}
