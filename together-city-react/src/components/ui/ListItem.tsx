import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export interface ListItemProps {
  title: ReactNode;
  sub?: ReactNode;
  /** Leading visual — an Icon, avatar, index number or emoji-for-UGC. */
  leading?: ReactNode;
  /** Trailing slot — a chevron, value, toggle or small action. */
  trailing?: ReactNode;
  to?: string;
  onClick?: () => void;
  style?: React.CSSProperties;
}

/**
 * Standard row (audit 9.1): leading visual · title/sub · trailing slot.
 * Renders as a link, a button or a static row depending on props, so every
 * list across the city — settings, results, records, matches — looks the same.
 */
export function ListItem({ title, sub, leading, trailing, to, onClick, style }: ListItemProps) {
  const inner = (
    <>
      {leading != null && <span style={{ flexShrink: 0, display: 'grid', placeItems: 'center' }}>{leading}</span>}
      <span className="flex-min">
        <span style={{ display: 'block', fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>
        {sub && <span className="muted" style={{ display: 'block', fontSize: 12.5, marginTop: 1, lineHeight: 1.45 }}>{sub}</span>}
      </span>
      {trailing != null && <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center' }}>{trailing}</span>}
    </>
  );
  const base: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
    padding: '12px 14px', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--card)',
    color: 'inherit', textDecoration: 'none', fontFamily: 'inherit', ...style,
  };
  if (to) return <Link to={to} style={base}>{inner}</Link>;
  if (onClick) return <button type="button" onClick={onClick} style={{ ...base, cursor: 'pointer' }}>{inner}</button>;
  return <div style={base}>{inner}</div>;
}
