/**
 * THE THREE STATES EVERY SCREEN OWES A READER.
 *
 * Loading, empty and error, written once. They are here rather than improvised
 * per page because the empty state is the one a first-time citizen sees and it
 * is the screen most likely to be left as a blank div — and because an error
 * with no retry is a dead end wearing an apology.
 */

import type { ReactNode } from 'react';
import { Button, Spinner } from '@/components/ui';

export function Loading({ line }: { line: string }) {
  return (
    <div style={{ display: 'grid', placeItems: 'center', gap: 14, padding: '64px 20px', textAlign: 'center' }}>
      <Spinner />
      <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>{line}</p>
    </div>
  );
}

export function Empty(
  { glyph, title, line, action }: { glyph: string; title: string; line: string; action?: ReactNode },
) {
  return (
    <div className="card" style={{ display: 'grid', placeItems: 'center', gap: 10, padding: '48px 24px', textAlign: 'center' }}>
      <span aria-hidden style={{ fontSize: 34, lineHeight: 1 }}>{glyph}</span>
      <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{title}</h3>
      <p className="muted" style={{ margin: 0, fontSize: 13.5, maxWidth: 380, lineHeight: 1.6 }}>{line}</p>
      {action}
    </div>
  );
}

export function ErrorState({ line, onRetry }: { line: string; onRetry?: () => void }) {
  return (
    <div
      className="card"
      role="alert"
      style={{
        display: 'grid', gap: 10, padding: '24px', textAlign: 'center', placeItems: 'center',
        border: '1px solid var(--danger-line)', background: 'var(--danger-soft)',
      }}
    >
      <strong style={{ fontSize: 15, color: 'var(--danger-ink)' }}>That didn’t work</strong>
      <p className="muted" style={{ margin: 0, fontSize: 13.5, maxWidth: 420, lineHeight: 1.6 }}>{line}</p>
      {onRetry && <Button variant="line" onClick={onRetry}>Try again</Button>}
    </div>
  );
}
