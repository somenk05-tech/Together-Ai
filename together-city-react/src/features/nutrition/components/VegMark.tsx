/**
 * The classic Indian veg / non-veg / egg symbol — a coloured square with a dot
 * (veg), triangle (non-veg) or dot (egg). Purely a visual marker; no mechanics.
 */
export type VegKind = 'veg' | 'nonveg' | 'egg';

/** Map any diet label (DietKey or composer diet) to a veg/non-veg/egg kind. */
export function dietKind(diet?: string | null): VegKind {
  const d = (diet ?? '').toLowerCase();
  if (/nonveg|non-veg|pesc|fish|chicken|mutton|meat|everything/.test(d)) return 'nonveg';
  if (/^egg|eggetarian/.test(d)) return 'egg';
  return 'veg'; // veg, vegan, vegetarian, jain, jainvegan, unknown → veg (safe default)
}

const META: Record<VegKind, { color: string; label: string }> = {
  veg: { color: '#3a8a4a', label: 'Vegetarian' },
  egg: { color: '#e0a53b', label: 'Contains egg' },
  nonveg: { color: '#c0392b', label: 'Non-vegetarian' },
};

export function VegMark({ diet, size = 16, title }: { diet?: string | null; size?: number; title?: string }) {
  const kind = dietKind(diet);
  const { color, label } = META[kind];
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" role="img" aria-label={title ?? label} style={{ flex: '0 0 auto' }}>
      <title>{title ?? label}</title>
      <rect x="1.5" y="1.5" width="17" height="17" rx="3.5" fill="#fff" stroke={color} strokeWidth="2" />
      {kind === 'nonveg'
        ? <path d="M10 5.5l4.2 8H5.8z" fill={color} />
        : <circle cx="10" cy="10" r="4" fill={color} />}
    </svg>
  );
}

/** The veg/non-veg kind for a whole meal — most "non-veg" wins across its parts. */
export function mealKind(diets: (string | undefined)[]): VegKind {
  if (diets.some((d) => dietKind(d) === 'nonveg')) return 'nonveg';
  if (diets.some((d) => dietKind(d) === 'egg')) return 'egg';
  return 'veg';
}
