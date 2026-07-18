import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Card, Button, Spinner, EmptyState } from '@/components/ui';
import { useProfileSummary } from '../hooks';
import { MemberFinder } from '../components/MemberFinder';

/** Unified profile — account identity + live cross-hub data + detail sections. */
export function Profile() {
  const { user, signOut } = useAuth();
  const { data, isLoading, isError } = useProfileSummary();

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '36px 24px 80px' }}>
      <div className="eyebrow">Together City</div>
      <h1 style={{ marginBottom: 18 }}>Your profile</h1>

      {/* Account identity — from the auth store */}
      <Card style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div className="tc-avatar" style={{ width: 56, height: 56, fontSize: 18 }}>
            {(user?.name ?? 'You').slice(0, 2).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <h3 style={{ margin: 0 }}>{user?.name ?? 'Your name'}</h3>
            <p className="muted" style={{ fontSize: 13 }}>
              @{user?.handle ?? '—'}{user?.handle ? ` · ${user.handle}@togethercity.tech` : ''}
            </p>
            <p className="muted" style={{ fontSize: 12 }}>
              {data ? `Member since ${new Date(data.memberSince).toLocaleDateString()}` : 'Your Together City identity'}
            </p>
          </div>
          <Button variant="line" size="sm" onClick={signOut}>Sign out</Button>
        </div>
      </Card>

      {/* Find & connect with other citizens */}
      <MemberFinder />

      {/* Your data across Together City — live from the backend */}
      <h4 style={{ margin: '10px 0 12px' }}>Your data across Together City</h4>
      {isLoading && <Spinner />}
      {isError && <EmptyState title="Couldn't load your data" hint="Start the backend and reload." />}
      {data && data.hubs.length === 0 && (
        <EmptyState icon="✨" title="A fresh identity" hint="As you use each hub, what it knows about you appears here." />
      )}
      {data && data.hubs.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 14, marginBottom: 28 }}>
          {data.hubs.map((h) => (
            <Link key={h.hub} to={h.href} className="card lift" style={{ display: 'block' }}>
              <div className="eyebrow" style={{ marginBottom: 4 }}>{h.label}</div>
              <p style={{ fontSize: 13 }}>{h.summary}</p>
            </Link>
          ))}
        </div>
      )}

      {/* Detail sections */}
      {data && data.sections.length > 0 && (
        <Card>
          {data.sections.map((s) => (
            <div key={s.key} style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 0', borderTop: '1px solid var(--line)' }}>
              <span className="muted" style={{ fontSize: 13 }}>{s.label}</span>
              <span style={{ fontSize: 13.5, color: s.value ? 'var(--ink)' : 'var(--muted)' }}>{s.value ?? 'Not set'}</span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
