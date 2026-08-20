import { SKINS, type SkinnableHub } from '@/config/skins';
import { useSkinStore } from '@/store/skin.store';

/**
 * THE TEN COLOURS A ROOM CAN BE, AS A ROW OF SWATCHES.
 *
 * ── WHY THIS IS A SHARED COMPONENT AND NOT TWO ──────────────────────────────
 * It is rendered in two places: the Appearance card in Settings, and the head
 * of the mailbox itself. Two copies of a swatch row is two rows that disagree
 * the first time a palette is added — and this week has already produced two
 * bugs of exactly that shape (a class on one hub's frost list and not another's,
 * a zod bound that did not follow the constant it was copied from). So the row
 * is one component, and the difference between the two placements is a boolean.
 *
 * ── NOT A <select> ──────────────────────────────────────────────────────────
 * Every option here IS a colour. A dropdown makes you read ten names and
 * imagine ten rooms; a swatch is the answer to the question the control asks.
 *
 * ── TWO CHIPS PER SKIN, GROUND THEN LAMP ────────────────────────────────────
 * Either alone is a lie about the room. "Rolex" as a gold square looks like a
 * gold inbox; as a green square it looks like Nutrition. The pair is what the
 * room actually is — a wall, and the thing that lights it.
 *
 * ── TEN, AND THE FIRST IS AN ABSENCE ────────────────────────────────────────
 * Nine skins plus the city. Choosing the city REMOVES the stored value and the
 * attribute, so white and black is Together City itself rather than a tenth
 * palette that imitates it and can drift from it.
 *
 * ── AND THE CHANGE IS INSTANT ───────────────────────────────────────────────
 * The store writes through on every set and the room repaints on the next
 * frame. A Save button would be asking somebody to commit to a colour they
 * cannot see yet.
 */
export function SkinSwatches({ hub, compact = false }: { hub: SkinnableHub; compact?: boolean }) {
  const current = useSkinStore((s) => s.skins[hub]);
  const setSkin = useSkinStore((s) => s.setSkin);

  const options: Array<{ key: string | null; label: string; a: string; b: string; note: string }> = [
    /* THE DEFAULT CHIP IS THE CITY'S OWN TOKENS, NOT A COPY OF THEM. Writing
       #ffffff and #1c1c1c here would be a colour decision taken in a page —
       which relief.spec catches, and is right to — and a second copy of the
       default that could drift from the first. */
    { key: null, label: 'White & black', a: 'var(--paper)', b: 'var(--accent)', note: 'the city' },
    ...SKINS.map((s) => ({ key: s.key, label: s.label, a: s.chip[0], b: s.chip[1], note: s.dark ? 'dark' : 'light' })),
  ];

  return (
    <div role="radiogroup" aria-label={`${hub} colour`} className={`skin-row${compact ? ' is-compact' : ''}`}>
      {options.map((o) => {
        const on = current === o.key;
        return (
          <button
            key={o.key ?? 'default'}
            type="button"
            role="radio"
            aria-checked={on}
            /* THE NAME IS ON THE BUTTON EVEN WHEN IT IS NOT DRAWN. In compact
               mode the label is a title and an aria-label rather than text —
               a swatch with no accessible name is a button that says nothing
               to a screen reader and nothing to a hover. */
            aria-label={o.label}
            title={`${o.label} — ${o.note}`}
            onClick={() => setSkin(hub, o.key)}
            className={on ? 'skin-key on' : 'skin-key'}
          >
            <span className="skin-chip" aria-hidden>
              <span style={{ background: o.a }} />
              <span style={{ background: o.b }} />
            </span>
            {!compact && (
              <span className="skin-name">
                {o.label}
                <small className="muted">{o.note}</small>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
