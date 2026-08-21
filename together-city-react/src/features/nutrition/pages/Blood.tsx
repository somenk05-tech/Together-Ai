import { Link } from 'react-router-dom';
import { Button, Spinner } from '@/components/ui';
import { useConsents, useSetConsent, useLatestPanel } from '@/features/medical/api';

/** Connect with Blood Test — a single consent toggle that mirrors the Medical Hub
 *  privacy setting. When on, meal plans and recipes are personalised from the
 *  user's latest blood panel (which lives in the Medical Hub — the source of truth). */
export function Blood() {
  const consents = useConsents();
  const setConsent = useSetConsent();
  const latest = useLatestPanel();

  if (consents.isLoading) return <Spinner label="Checking your connection…" />;

  const nutrition = consents.data?.find((c) => c.hub === 'nutrition');
  const on = !!nutrition?.granted;
  /**
   * A SWITCH THAT CANNOT BE READ MUST NOT BE DRAWN.
   *
   * `on` is `!!consents.data?.find(…)?.granted`, so a failed read made it false
   * and this page rendered the switch OFF — grey, with `aria-checked={false}`
   * announced to a screen reader, under the sentence "Turn on to design recipes
   * and plans around your biology."
   *
   * That is not an empty state getting a fact wrong. It is a PRIVACY CONTROL
   * reporting the opposite of what may be true. The citizen it fails is the one
   * who came here on purpose to check, or to revoke: they are told the
   * connection to their blood panel is already off, so they close the page, and
   * it is still on.
   *
   * There is no honest way to render a two-position switch for a state we do not
   * know. Rendering it disabled would still show a position; `aria-checked` has
   * no value that means "we couldn't check" for role="switch". So the switch is
   * not drawn at all, and the card says what happened and where the same setting
   * can be read from its source.
   */
  const consentUnknown = consents.isError || !consents.data;
  const hasPanel = (latest.data?.markers?.length ?? 0) > 0;
  const toggle = () => setConsent.mutate({ hub: 'nutrition', granted: !on });

  return (
    <div>
      <div className="eyebrow">Nutrition Hub · 01</div>
      <h1 style={{ fontSize: 26 }}>Connect with Blood Test</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 0' }}>
        Personalise every plan by your real biology — not guesses. Synced automatically with your <strong>Medical Hub</strong>.
      </p>

      <div className="card" style={{ marginTop: 14 }}>
        <p style={{ fontSize: 13.5, margin: 0, lineHeight: 1.6 }}>
          All medical records live in your <strong>Medical Hub</strong> — the single source of truth. Nutrition reads your
          biomarkers <strong>by reference</strong> (never a copy), only while this connection is on.
        </p>
      </div>

      {/* The one toggle */}
      <div className="card" style={{ marginTop: 14 }}>
        {consentUnknown ? (
          <>
            <strong style={{ fontSize: 15 }}>Connect to Medical Hub</strong>
            <p className="muted" style={{ fontSize: 13, margin: '6px 0 0', lineHeight: 1.6 }}>
              We couldn’t check whether this connection is on, so we’re not showing you a switch —
              one that guessed would be worse than none. Nothing has changed either way.
            </p>
            <p className="muted" style={{ fontSize: 12.5, margin: '10px 0 0', lineHeight: 1.6 }}>
              If you came here to turn it off, you can read and change the same setting in{' '}
              <Link to="/medical/consent" style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>Medical Hub · Privacy &amp; Consent</Link>.
            </p>
            <div style={{ marginTop: 12 }}>
              <Button variant="line" onClick={() => void consents.refetch()}>Try again</Button>
            </div>
          </>
        ) : (
          <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong style={{ fontSize: 15 }}>Connect to Medical Hub</strong>
            <p className="muted" style={{ fontSize: 13, margin: '4px 0 0', lineHeight: 1.55 }}>
              When on, your recipes and meal plans are designed around your latest blood panel.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={on}
            disabled={setConsent.isPending}
            onClick={toggle}
            style={{
              flex: '0 0 auto', width: 52, height: 30, borderRadius: 'var(--r-full)', border: 'none', cursor: 'pointer', position: 'relative',
              background: on ? 'var(--accent)' : 'var(--line)', transition: 'background .15s', opacity: setConsent.isPending ? 0.6 : 1,
            }}
          >
            <span style={{ position: 'absolute', top: 3, left: on ? 25 : 3, width: 24, height: 24, borderRadius: '50%', background: 'var(--card)', transition: 'left .15s', boxShadow: '0 1px 3px rgba(0,0,0,.25)' }} />
          </button>
        </div>

        {on ? (
          <p style={{ fontSize: 12.5, marginTop: 12, padding: '10px 12px', background: 'var(--ok-soft)', borderRadius: 'var(--r-1)', lineHeight: 1.55 }}>
            ✓ Connected — your plans are personalised from your blood test.{' '}
            {hasPanel
              ? <Link to="/medical/blood" style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>View your analysis →</Link>
              : <>No panel yet — <Link to="/medical/blood" style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>upload a report in the Medical Hub →</Link></>}
          </p>
        ) : (
          <p className="muted" style={{ fontSize: 12.5, marginTop: 12, lineHeight: 1.55 }}>
            Turn on to design recipes and plans around your biology. You can switch this off anytime — here or in{' '}
            <Link to="/medical/consent" style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>Medical Hub · Privacy &amp; Consent</Link>.
          </p>
        )}
          </>
        )}
      </div>
    </div>
  );
}
