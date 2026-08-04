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
 */
export function DeleteAccountCard() {
  const { signOut } = useAuth();
  const [confirmText, setConfirmText] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  /** Extracted from the button: an async onClick returns a promise React
   *  never looks at, so a failure here would have been silent. */
  const deleteAccount = async () => {
    if (!window.confirm('Permanently delete your Together City account? This cannot be undone.')) return;
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
      <p className="muted" style={{ fontSize: 13, marginTop: 2 }}>
        This permanently removes your Together City identity: your posts, photos, listings and
        social connections are erased, your profile stops existing for other citizens, and every
        device is signed out. It cannot be undone. Type <strong>DELETE</strong> and confirm your
        password to continue.
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
