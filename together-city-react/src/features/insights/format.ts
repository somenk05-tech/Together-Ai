import type { Change } from './types';

/** How the dashboard writes numbers (owner, 16 Sep): Indian grouping, no false precision. */
export const count = (n: number | null | undefined): string =>
  n === null || n === undefined ? '—' : n.toLocaleString('en-IN', { maximumFractionDigits: 1 });

export const percent = (n: number | null | undefined): string =>
  n === null || n === undefined ? '—' : `${n.toLocaleString('en-IN', { maximumFractionDigits: 1 })}%`;

export const seconds = (n: number | null | undefined): string => {
  if (n === null || n === undefined) return '—';
  if (n < 60) return `${Math.round(n)}s`;
  const min = Math.round(n / 60);
  return min < 60 ? `${min}m` : `${Math.floor(min / 60)}h ${min % 60}m`;
};

export const inr = (n: number | null | undefined): string =>
  n === null || n === undefined ? '—' : `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export const compact = (n: number | null | undefined): string => {
  if (n === null || n === undefined) return '—';
  if (Math.abs(n) >= 1e7) return `${(n / 1e7).toFixed(1)}Cr`;
  if (Math.abs(n) >= 1e5) return `${(n / 1e5).toFixed(1)}L`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return count(n);
};

/** "+38%" / "−2.1 pts" / null when there is nothing honest to say. */
export function changeText(c: Change, kind: 'pct' | 'pts'): string | null {
  if (c.pct === null) return null;
  const sign = c.pct > 0 ? '+' : c.pct < 0 ? '−' : '±';
  const v = Math.abs(c.pct).toLocaleString('en-IN', { maximumFractionDigits: 1 });
  return kind === 'pts' ? `${sign}${v} pts` : `${sign}${v}%`;
}

export const dayLabel = (day: string): string =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export const dateLabel = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export const timeLabel = (iso: string): string =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

export const RANGE_LABEL = { '24h': '24 hours', '7d': '7 days', '30d': '30 days', '90d': '90 days', all: 'All time' } as const;

export const SOURCE_LABEL: Record<string, string> = {
  direct: 'Direct', google: 'Google', instagram: 'Instagram', youtube: 'YouTube',
  referral: 'Referral', paid_social: 'Paid social', other: 'Other',
};
