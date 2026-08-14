/** What Mira is doing. The mark says it with the gap, never with colour. */
export type MarkState = 'dormant' | 'listening' | 'thinking' | 'speaking' | 'waiting';

/**
 * Mira's mark: a ring with a break in it, and MIRA across the middle.
 *
 * The break is the whole design. An orb can only scale and glow; a ring with a
 * gap has somewhere for the gap to BE — travelling while she thinks, parked
 * while she waits, closed while she rests. The motion means something instead
 * of decorating something.
 *
 * Drawn in `currentColor` throughout, so it inverts for free: dark ink on the
 * city's paper, white on the two dark hubs, and the hub's accent when she is
 * working inside one. One file, not a light one and a dark one — the same
 * argument the header mark already makes about having one alt between two
 * images.
 *
 * The wordmark stops being legible below about 48px, which is expected rather
 * than a defect: `showWord={false}` is the app-size mark, and it is the same
 * split already in the header — monogram in the corner, wordmark in the middle.
 */
export function MiraMark({
  size = 96,
  state = 'listening',
  showWord = true,
  title = 'Mira',
}: {
  size?: number;
  state?: MarkState;
  showWord?: boolean;
  title?: string;
}) {
  // r=100 → circumference ≈ 628. The dash pair is (drawn, gap).
  const DASH: Record<MarkState, string> = {
    dormant: '628 0',
    listening: '470 158',
    thinking: '470 158',
    speaking: '470 158',
    waiting: '540 88',
  };
  const OFFSET: Record<MarkState, number> = {
    dormant: 0, listening: 0, thinking: 0, speaking: 0, waiting: 135,
  };

  return (
    <svg
      viewBox="0 0 500 500"
      width={size}
      height={size}
      role="img"
      aria-label={title}
      className={`miramark is-${state}`}
      style={{ overflow: 'visible' }}
    >
      {/* The faint full circle keeps the form readable when the gap is wide.
          Without it, "waiting" reads as a broken crescent rather than a ring
          that has paused. */}
      <circle cx="250" cy="250" r="100" fill="none" stroke="currentColor" strokeWidth={1} opacity={0.16} />
      <circle
        className="miramark-arc"
        cx="250" cy="250" r="100"
        fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round"
        strokeDasharray={DASH[state]}
        strokeDashoffset={OFFSET[state]}
        transform="rotate(-108 250 250)"
      />
      {showWord && (
        <g fill="currentColor">
          <path d="M138 272V228h7l15 24 15-24h7v44h-8v-30l-13 21h-3l-13-21v30z" />
          <path d="M216 228h8v44h-8z" />
          <path d="M262 272v-44h20a14 14 0 0 1 0 28h-3l11 16h-9l-10-16h-1v16zm8-23h11a7 7 0 0 0 0-14h-11z" />
          <path d="M322 272l18-44h7l18 44h-9l-4-11h-17l-4 11zm16-18h11l-5.5-15z" />
        </g>
      )}
    </svg>
  );
}
