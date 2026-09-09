import { Confirm } from '@/features/social/Confirm';
import type { UnsavedGuard as Guard } from '@/hooks/useUnsavedGuard';

/**
 * The question `useUnsavedGuard` holds, asked in the city's own dialog.
 *
 * One wording for the whole site. An editor that writes its own sentence here
 * is an editor whose sentence drifts from the other eleven, and the point of
 * the audit this came out of was that there were eleven of everything.
 */
export function UnsavedGuard({ guard, what = 'changes' }: { guard: Guard; what?: string }) {
  return (
    <Confirm
      open={guard.asking}
      title="Leave without saving?"
      body={`Your ${what} haven’t been saved. Leave this page and they’re gone.`}
      confirmLabel="Leave without saving"
      danger
      onConfirm={guard.discard}
      onClose={guard.keep}
    />
  );
}
