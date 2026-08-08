import { Link } from 'react-router-dom';
import { consentFor } from './consent.config';
import { Icon } from '@/components/ui/Icon';

/**
 * Inline privacy reassurance shown at the point of data entry on a sensitive
 * form (audit 2.5). Trust is built where data is collected — not in a settings
 * page nobody opens. Pass the hub key; optionally override the copy.
 */
export function PrivacyNote({ hub, text, learnMore = true, style }: {
  hub: string; text?: string; learnMore?: boolean; style?: React.CSSProperties;
}) {
  const cfg = consentFor(hub);
  const message = text ?? cfg?.inline;
  if (!message) return null;
  return (
    // The class carries no styling of its own — it is the note's NAME, so a
    // stage that re-points the ink variables (medical's atmosphere) can hand
    // this light surface the city's ink back. Inline var() styles cannot be
    // reached any other way.
    <div className="privacy-note" style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '10px 12px', borderRadius: 12,
      background: 'var(--accent-soft)', border: '1px solid var(--line)', fontSize: 12.5, lineHeight: 1.55, ...style }}>
      <Icon name="shield" size={15} style={{ color: 'var(--accent-ink)', marginTop: 1 }} />
      <span style={{ flex: 1, minWidth: 0, color: 'var(--ink)' }}>
        {message}{' '}
        {learnMore && (
          <Link to="/settings/privacy" style={{ color: 'var(--accent-ink)', fontWeight: 600, whiteSpace: 'nowrap' }}>Learn more</Link>
        )}
      </span>
    </div>
  );
}
