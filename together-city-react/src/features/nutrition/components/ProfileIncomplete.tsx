import { Link } from 'react-router-dom';

/** Shown instead of a meal plan when the profile is missing required preferences.
 *  The planner never guesses — it asks the user to complete these first. */
export function ProfileIncomplete({ missing, to = '/nutrition/preferences' }: { missing?: { key: string; label: string }[]; to?: string }) {
  const items = missing ?? [];
  return (
    <div style={{ maxWidth: 560, margin: '40px auto', padding: '0 20px', textAlign: 'center' }}>
      <div style={{ fontSize: 34 }}>📝</div>
      <h2 style={{ margin: '10px 0 6px' }}>Complete your food profile</h2>
      <p className="muted" style={{ fontSize: 14, lineHeight: 1.6 }}>
        Your meal plan is built entirely from your preferences — so we won’t guess. Add the details below and
        your personalised week generates instantly.
      </p>
      {items.length > 0 && (
        <div style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', margin: '16px 0 4px' }}>
          {items.map((m) => (
            <span key={m.key} style={{ fontSize: 12.5, fontWeight: 600, border: '1.5px solid var(--line)', borderRadius: 999, padding: '6px 12px' }}>
              {m.label}
            </span>
          ))}
        </div>
      )}
      <div style={{ marginTop: 18 }}>
        <Link to={to} className="btn btn-accent">Complete my profile →</Link>
      </div>
    </div>
  );
}
