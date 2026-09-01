import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Card, EmptyState, Spinner } from '@/components/ui';
import { payError, useOnboarding, useSavePayoutAccount } from '../api';
import { StatusChip } from '../InvoiceBits';

/**
 * WHERE THE MONEY GOES, AND WHETHER IT MAY GO YET.
 *
 * Two things on one screen because they are one question the business is
 * asking: what do I still have to do before I get paid. The rungs at the top
 * are read from the same evidence Together City Trust already collects — a
 * business does not describe itself twice — and the form below is the one thing
 * this screen adds.
 *
 * THE ACCOUNT NUMBER IS TYPED HERE AND STORED NOWHERE. It goes to the payout
 * provider on submit; what comes back and is kept is a reference and four
 * digits. That is stated on the screen, because a person typing their bank
 * details into an app deserves to be told where they are going.
 */
const STAGE_LABEL: Record<string, string> = {
  not_started: 'Not started',
  verification_required: 'Verification required',
  under_review: 'Under review',
  verified: 'Verified',
  payouts_enabled: 'Payouts enabled',
  payouts_on_hold: 'Payouts on hold',
};

export function PayoutAccount() {
  const { id: listingId } = useParams<{ id: string }>();
  const q = useOnboarding(listingId);
  const save = useSavePayoutAccount();

  const [open, setOpen] = useState(false);
  const [legalName, setLegalName] = useState('');
  const [entityKind, setEntityKind] = useState('individual');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [taxRef, setTaxRef] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const field = {
    padding: '9px 11px', border: '1.5px solid var(--line)', borderRadius: 'var(--r-1)',
    fontSize: 13.5, fontFamily: 'inherit', background: 'var(--card)',
    width: '100%', boxSizing: 'border-box' as const,
  };

  if (q.isLoading) return <Spinner label="Checking where you stand…" />;
  if (q.isError || !q.data) {
    return (
      <div>
        <div className="eyebrow">Local Services · Payout account</div>
        <h1 style={{ fontSize: 26 }}>Payout account</h1>
        <EmptyState
          icon="⚠️"
          title="Couldn’t load your payout account"
          hint="Nothing has changed — your account details and any money waiting are untouched."
        />
      </div>
    );
  }

  const s = q.data;
  const a = s.account;
  const ready = legalName.trim().length >= 2 && /^\d{6,20}$/.test(accountNumber.trim())
    && /^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(ifsc.trim());

  const submit = () => {
    if (!listingId) return;
    setErr(null);
    save.mutate({
      listingId,
      body: {
        legalName: legalName.trim(),
        entityKind,
        accountNumber: accountNumber.trim(),
        ifsc: ifsc.trim().toUpperCase(),
        ...(taxRef.trim() ? { taxRef: taxRef.trim() } : {}),
      },
    }, {
      onSuccess: () => { setOpen(false); setAccountNumber(''); setIfsc(''); },
      onError: (e: unknown) => setErr(payError(e, 'Those details were not accepted. Check them and try again.')),
    });
  };

  return (
    <div>
      <div className="eyebrow">Local Services · Payout account</div>
      <h1 style={{ fontSize: 26 }}>Payout account</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 18px', maxWidth: '62ch' }}>
        Where your settlements are sent. Money from paid invoices accrues whether or not this is
        set up — what verification decides is whether it can leave.
      </p>

      <Card style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 14 }}>Where you stand</strong>
          <StatusChip
            status={s.stage === 'payouts_enabled' ? 'settled' : s.stage === 'payouts_on_hold' ? 'on_hold' : 'pending'}
            label={STAGE_LABEL[s.stage] ?? s.stage}
          />
        </div>
        <p style={{ fontSize: 13, margin: '8px 0 0' }}>{s.next}</p>

        <div style={{ display: 'grid', gap: 6, marginTop: 12 }}>
          <Rung done={s.identityVerified} label="Who you are" note="Phone and identity, on your Together City account" />
          <Rung done={s.businessVerified} label="What the business is" note="The verification tab on this listing" />
          <Rung done={Boolean(a?.last4)} label="Where to send the money" note="A bank account in the business's name" />
          <Rung done={Boolean(a?.payoutsEnabled)} label="Payouts on" note="Settlements leave on the next working day" />
        </div>

        <p className="muted" style={{ fontSize: 11.5, margin: '12px 0 0' }}>
          Together City keeps {s.fee.rateBp / 100}% plus ₹{s.fee.flatInr} of each payment,
          with {s.fee.taxOnFeeBp / 100}% GST on that fee. Every payout shows the arithmetic.
        </p>
      </Card>

      {a && (
        <Card style={{ marginBottom: 12 }}>
          <div className="eyebrow">The account on file</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
            <div className="flex-min">
              <div style={{ fontWeight: 700, fontSize: 15 }}>{a.legalName}</div>
              <div className="muted" style={{ fontSize: 12.5 }}>
                {a.bankName ? `${a.bankName} · ` : ''}•••• {a.last4 ?? '————'}
                {a.taxRef && ` · ${a.taxRef}`}
              </div>
            </div>
            <StatusChip
              status={a.payoutsEnabled ? 'settled' : a.status === 'rejected' ? 'failed' : 'pending'}
              label={a.payoutsEnabled ? 'Verified' : a.status === 'rejected' ? 'Not accepted' : 'Under review'}
            />
          </div>
          {a.rejectReason && (
            <p style={{ fontSize: 12.5, margin: '8px 0 0', color: 'var(--danger-ink)' }}>{a.rejectReason}</p>
          )}
          {a.holdReason && (
            <p style={{ fontSize: 12.5, margin: '8px 0 0', color: 'var(--warn-ink)' }}>{a.holdReason}</p>
          )}
        </Card>
      )}

      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 13.5 }}>{a ? 'Change the account' : 'Add an account'}</strong>
          <Button variant={a ? 'line' : 'accent'} size="sm" style={{ marginLeft: 'auto' }} onClick={() => setOpen((v) => !v)}>
            {open ? 'Cancel' : a ? 'Fix payout details' : 'Add payout account'}
          </Button>
        </div>

        {open && (
          <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            <label style={{ fontSize: 12.5 }}>
              <span className="muted">Name on the account</span>
              <input style={field} value={legalName} maxLength={140} onChange={(e) => setLegalName(e.target.value)} />
            </label>
            <label style={{ fontSize: 12.5 }}>
              <span className="muted">What the business is</span>
              <select style={field} value={entityKind} onChange={(e) => setEntityKind(e.target.value)} aria-label="Business kind">
                <option value="individual">An individual</option>
                <option value="proprietor">A sole proprietor</option>
                <option value="registered">A registered firm</option>
                <option value="company">A company</option>
              </select>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 8 }}>
              <label style={{ fontSize: 12.5 }}>
                <span className="muted">Account number</span>
                <input
                  style={field} value={accountNumber} inputMode="numeric" maxLength={20} autoComplete="off"
                  onChange={(e) => setAccountNumber(e.target.value)} aria-label="Bank account number"
                />
              </label>
              <label style={{ fontSize: 12.5 }}>
                <span className="muted">IFSC</span>
                <input
                  style={field} value={ifsc} maxLength={11} autoComplete="off"
                  onChange={(e) => setIfsc(e.target.value.toUpperCase())} aria-label="Bank IFSC code"
                />
              </label>
            </div>
            <label style={{ fontSize: 12.5 }}>
              <span className="muted">GSTIN or PAN, if you have one</span>
              <input style={field} value={taxRef} maxLength={20} onChange={(e) => setTaxRef(e.target.value.toUpperCase())} />
            </label>

            <p className="muted" style={{ fontSize: 11.5, margin: 0 }}>
              These go straight to the payment provider that will send your money. Together City keeps
              only the last four digits and the bank’s name, so it can show you which account is on file.
            </p>

            {err && <p role="alert" style={{ color: 'var(--danger-ink)', fontSize: 12.5, margin: 0 }}>{err}</p>}

            <div>
              <Button variant="accent" size="sm" disabled={!ready || save.isPending} onClick={submit}>
                {save.isPending ? 'Sending…' : 'Save account'}
              </Button>
            </div>
          </div>
        )}
      </Card>

      <div style={{ marginTop: 14 }}>
        <Link to={`/services/${listingId}/payments`} style={{ fontSize: 12.5, color: 'var(--accent-ink)', fontWeight: 600 }}>
          ← Back to payments and payouts
        </Link>
      </div>
    </div>
  );
}

function Rung({ done, label, note }: { done: boolean; label: string; note: string }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13 }}>
      <span
        aria-hidden
        style={{
          width: 18, height: 18, borderRadius: '50%', flexShrink: 0, marginTop: 1,
          display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 800,
          border: `1.5px solid ${done ? 'var(--ok-line)' : 'var(--line)'}`,
          background: done ? 'var(--ok-soft)' : 'transparent',
          color: done ? 'var(--ok-ink)' : 'var(--muted)',
        }}
      >
        {done ? '✓' : ''}
      </span>
      <span>
        <span style={{ fontWeight: 600 }}>{label}</span>
        <span className="muted" style={{ display: 'block', fontSize: 11.5 }}>{note}</span>
      </span>
    </div>
  );
}
