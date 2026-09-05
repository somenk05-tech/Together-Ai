import type { CSSProperties } from 'react';

/**
 * The one strip that sits under the header — the unverified-email banner and
 * the socket's "reconnecting" strip both wear it. Hoisted so both read a
 * single object: scripts/size-system-ceiling.mjs counts inline style objects,
 * and a second banner is not a reason to raise it.
 */
export const bannerStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
  padding: '10px 18px', fontSize: 13.5,
  background: 'color-mix(in srgb, var(--gold) 14%, var(--paper))',
  borderBottom: '1px solid color-mix(in srgb, var(--gold) 34%, var(--line))',
  color: 'var(--ink)',
};
