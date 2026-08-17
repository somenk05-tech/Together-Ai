/** Shared helpers for the Social Life hub pages. */
import { Avatar as CityAvatar } from '@/components/ui';

/** Base path for the image set that ships in /public/assets/img. */
export const IMG = '/assets/img/';

/** Initials from a display name, e.g. "Aarav Mehta" → "AM". */
export function initials(name: string): string {
  return (name || '?')
    .split(' ')
    .map((w) => w[0] || '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/** Compact "time since" label — mirrors tc-social.js timeAgo(). */
export function timeAgo(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/** Round avatar disc with initials or an emoji — or the photograph, when there
 *  is one. The disc had no `src` to receive a picture with, so a citizen with a
 *  photo on their account was drawn here as two letters; the city's own Avatar
 *  draws the face, and the coloured disc stays for everybody without one,
 *  because the colour is what tells these rows apart. */
export function Avatar({
  label, color, src, size = 44, className = 'av',
}: { label: string; color?: string; src?: string | null; size?: number; className?: string }) {
  if (src) return <CityAvatar src={src} name={label} size={size} className={className} />;
  return (
    <div
      className={className}
      style={{
        width: size, height: size, borderRadius: '50%', display: 'flex',
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        background: color || 'var(--accent)', color: 'var(--on-accent)', fontWeight: 600,
        fontSize: size <= 34 ? 12 : 14,
      }}
    >
      {label}
    </div>
  );
}
