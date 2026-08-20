import { SkinSwatches } from '@/components/SkinSwatches';
import type { SkinnableHub } from '@/config/skins';

/**
 * One room's colour, as a labelled row inside the Appearance card.
 *
 * The swatches themselves live in `components/SkinSwatches` because the head of
 * the mailbox draws the same row — this is the label, the sentence and the rule
 * above it, which are what a settings page adds and a room does not need.
 */
export function SkinPicker({ hub, label, hint }: { hub: SkinnableHub; label: string; hint: string }) {
  return (
    <div style={{ padding: '13px 0', borderTop: '1px solid var(--line)' }}>
      <div style={{ fontWeight: 600, fontSize: 14 }}>{label}</div>
      <div className="muted" style={{ fontSize: 12.5, margin: '2px 0 10px' }}>{hint}</div>
      <SkinSwatches hub={hub} />
    </div>
  );
}
