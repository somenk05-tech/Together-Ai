import type { ReactNode } from 'react';
import { ActionBar, Button, Modal } from '@/components/ui';

/**
 * A question with two answers, in the product's own dialog.
 *
 * Delete post, Block, and Leave-the-composer each went through
 * `window.confirm` (4 Sep audit): a native box the app cannot style, that
 * ignores the design system, the focus trap and the visual-viewport work the
 * shared Modal already does, and that reads its text in the browser's voice
 * rather than the city's. The Modal's own comment named this as the base for
 * "branded confirmations, replacing native window.confirm"; this is that.
 */
export function Confirm({ open, title, body, confirmLabel, danger = false, busy = false, onConfirm, onClose }: {
  open: boolean;
  title: ReactNode;
  body?: ReactNode;
  confirmLabel: string;
  /** A destructive answer is drawn as one. */
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} width={420}
      footer={(
        <ActionBar>
          <Button variant="line" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
          {/* No danger variant in the nine-name enum, deliberately (Button.tsx);
              the line button carries the danger ink the way the chat's own
              delete confirmation does. */}
          <Button variant={danger ? 'line' : 'accent'} size="sm" onClick={onConfirm} disabled={busy}
            style={danger ? { color: 'var(--danger-ink)', borderColor: 'var(--danger-line)' } : undefined}>{confirmLabel}</Button>
        </ActionBar>
      )}>
      {body != null && <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.55 }}>{body}</p>}
    </Modal>
  );
}
