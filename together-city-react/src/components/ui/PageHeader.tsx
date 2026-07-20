import type { ReactNode } from 'react';

export interface PageHeaderProps { eyebrow?: string; title: ReactNode; sub?: ReactNode; children?: ReactNode; }

/** Plain page header (no banner image) — eyebrow, title and sub in the normal
 *  content flow. Used across the Nutrition & Family hubs in place of the image
 *  Hero so every sub-tab opens with a clean text header. */
export function PageHeader({ eyebrow, title, sub, children }: PageHeaderProps) {
  return (
    <div style={{ marginBottom: 24 }}>
      {eyebrow && <div className="eyebrow">{eyebrow}</div>}
      <h1 style={{ fontSize: 'clamp(24px,3vw,34px)', margin: '4px 0 0' }}>{title}</h1>
      {sub && <p className="muted" style={{ fontSize: 14, margin: '8px 0 0', maxWidth: '68ch', lineHeight: 1.55 }}>{sub}</p>}
      {children && <div style={{ marginTop: 16, display: 'flex', gap: 14, flexWrap: 'wrap' }}>{children}</div>}
    </div>
  );
}
