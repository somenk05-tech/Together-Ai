import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Spinner } from '@/components/ui';
import { authApi, type VerificationChannel } from '@/api/auth.api';
import { VerifyChannel } from './VerifyChannel';

const LABEL: Record<VerificationChannel, string> = { email: 'Primary email', phone: 'Phone' };

/**
 * The verification state of both contact channels, and the way to fix either.
 *
 * One card rather than two, because the question a person actually has is "is
 * my account set up properly" and the answer is the pair. Splitting it lets one
 * half be quietly missing.
 */
export function VerificationCard() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<VerificationChannel | null>(null);

  const status = useQuery({
    queryKey: ['auth', 'verification-status'],
    queryFn: () => authApi.verificationStatus(),
  });

  const done = useMutation({
    mutationFn: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['auth', 'verification-status'] }),
        qc.invalidateQueries({ queryKey: ['profile'] }),
        qc.invalidateQueries({ queryKey: ['me'] }),
      ]);
    },
  });

  if (status.isLoading) return <Card><Spinner label="Checking your contact details…" /></Card>;
  if (status.isError || !status.data) {
    return (
      <Card>
        <p style={{ fontSize: 14, margin: 0 }}>Couldn&rsquo;t load your verification status.</p>
        <Button variant="line" size="sm" style={{ marginTop: 10 }} onClick={() => void status.refetch()}>Try again</Button>
      </Card>
    );
  }

  const s = status.data;

  if (editing) {
    return (
      <Card>
        <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 4px' }}>Verify your {editing === 'email' ? 'email address' : 'phone number'}</h3>
        <p className="muted" style={{ fontSize: 13, margin: '0 0 16px' }}>
          {editing === 'email'
            ? 'This is where password resets and receipts go, so it has to be an address you can open.'
            : 'A verified number lets you get back in if you lose your password.'}
        </p>
        <VerifyChannel
          channel={editing}
          current={editing === 'email' ? s.email.target : s.phone.target}
          onVerified={() => { setEditing(null); done.mutate(); }}
          onCancel={() => setEditing(null)}
        />
      </Card>
    );
  }

  return (
    <Card>
      <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 12px' }}>Contact & verification</h3>
      <div style={{ display: 'grid', gap: 2 }}>
        {(['email', 'phone'] as const).map((channel) => {
          const row = s[channel];
          const configured = channel === 'email' ? s.emailConfigured : s.smsConfigured;
          return (
            <div key={channel} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', borderBottom: channel === 'email' ? '1px solid var(--line)' : 'none' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="muted" style={{ fontSize: 12 }}>{LABEL[channel]}</div>
                <div style={{ fontSize: 14.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.target ?? <span className="muted">Not set</span>}
                </div>
              </div>
              <StateTag verified={row.verified} hasTarget={!!row.target} />
              <Button variant={row.verified ? 'ghost' : 'accent'} size="sm" onClick={() => setEditing(channel)}>
                {row.verified ? 'Change' : row.target ? 'Verify' : 'Add'}
              </Button>
              {!configured && (
                <span className="muted" style={{ fontSize: 11 }} title={`No ${channel === 'phone' ? 'SMS' : 'email'} provider is configured on this environment.`}>
                  delivery off
                </span>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function StateTag({ verified, hasTarget }: { verified: boolean; hasTarget: boolean }) {
  if (!hasTarget) return null;
  return (
    <span
      className="tag"
      style={{
        fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 999, flex: '0 0 auto',
        background: verified ? 'var(--green-soft)' : 'var(--warn-soft)',
        color: verified ? 'var(--green)' : 'var(--ink-soft)',
      }}
    >
      {verified ? 'Verified' : 'Unverified'}
    </span>
  );
}
