/**
 * The nutrition hub's inline icon set. Extracted from MealPlan.tsx when the
 * composed meal card moved into its own component — both files draw from it,
 * and duplicating a path table is how two icon sets quietly drift apart.
 */
export const NPATH: Record<string, string> = {
  flame: 'M13 3c0 3 3 4 3 8a4 4 0 1 1-8 0c0-2 2-3 2-5 0 0 3 1 3-3z', leaf: 'M5 20c7 1 14-4 15-16C11 3 4 9 5 20zM9 16c2-4 5-6 8-7',
  wheat: 'M12 21V8M12 10c-2-1-4-1-5 1 2 1 4 1 5-1zM12 10c2-1 4-1 5 1-2 1-4 1-5-1zM12 15c-2-1-4-1-5 1 2 1 4 1 5-1zM12 15c2-1 4-1 5 1-2 1-4 1-5-1z',
  drop: 'M12 3s6 6 6 10a6 6 0 1 1-12 0c0-4 6-10 6-10z', sprout: 'M12 21v-7M12 14c0-3-2-5-5-5 0 3 2 5 5 5zM12 14c0-3 2-5 5-5 0 3-2 5-5 5z',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10c1 1 1 2 1 3h6c0-1 0-2 1-3a6 6 0 0 0-4-10z', check: 'M20 6L9 17l-5-5',
  clock: 'M12 7v5l3 2M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z', chevL: 'M15 6l-6 6 6 6', chevR: 'M9 6l6 6-6 6',
  heart: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 5.5-7 10-7 10z',
  refresh: 'M20 11a8 8 0 0 0-14-4M4 5v3h3M4 13a8 8 0 0 0 14 4M20 19v-3h-3', skip: 'M6 6l12 12M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z',
};
export function NIc({ name, size = 18, stroke = 1.7, style }: { name: string; size?: number; stroke?: number; style?: React.CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={{ flex: '0 0 auto', ...style }} aria-hidden><path d={NPATH[name] ?? NPATH.leaf} /></svg>;
}

