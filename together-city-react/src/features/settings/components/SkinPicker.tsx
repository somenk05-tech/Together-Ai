import { SKINS, type SkinnableHub } from '@/config/skins';
import { useSkinStore } from '@/store/skin.store';

/**
 * ONE ROOM'S SKIN, CHOSEN AS A ROW OF SWATCHES.
 *
 * NOT A <select>. Every option here IS a colour, and a dropdown makes you read
 * nine names and imagine nine rooms. A swatch is the answer to the question the
 * control is asking, so the name underneath is a label rather than the whole
 * information.
 *
 * TWO CHIPS PER SKIN, GROUND THEN LAMP, because either one alone is a lie about
 * the room. "Rolex" shown as a gold square looks like a gold inbox; shown as a
 * green square it looks like Nutrition. The pair is what the room actually is —
 * a wall and the thing that lights it.
 *
 * DEFAULT IS FIRST AND IT IS AN ABSENCE. Selecting it removes the stored value
 * and the attribute, so "White & black" is the city itself rather than a skin
 * that happens to look like it.
 *
 * WHY THE CHANGE IS INSTANT AND HAS NO SAVE BUTTON: the store writes through to
 * localStorage on every set, and the room repaints on the next frame. A Save
 * step would be asking somebody to commit to a colour they cannot see yet.
 */
export function SkinPicker({ hub, label, hint }: { hub: SkinnableHub; label: string; hint: string }) {
  const current = useSkinStore((s) => s.skins[hub]);
  const setSkin = useSkinStore((s) => s.setSkin);

  const Chip = ({ a, b }: { a: string; b: string }) => (
    <span aria-hidden style={{ display: 'inline-flex', borderRadius: 7, overflow: 'hidden', width: 34, height: 22, flex: 'none', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.14)' }}>
      <span style={{ background: a, width: '65%' }} />
      <span style={{ background: b, width: '35%' }} />
    </span>
  );

  const options: Array<{ key: string | null; label: string; a: string; b: string; note?: string }> = [
    /* THE DEFAULT CHIP IS THE CITY'S OWN TOKENS, NOT A COPY OF THEM. Writing
       #ffffff and #1c1c1c here would be a colour decision taken in a page —
       which relief.spec catches, and is right to — and it would also be a
       second copy of the default that could drift from the first. Settings is
       not a skinnable room, so these resolve to the city's white and near-black
       exactly as the swatch claims, and they follow if the city ever moves. */
    { key: null, label: 'White & black', a: 'var(--paper)', b: 'var(--accent)', note: 'the city' },
    ...SKINS.map((s) => ({ key: s.key, label: s.label, a: s.chip[0], b: s.chip[1], note: s.dark ? 'dark' : 'light' })),
  ];

  return (
    <div style={{ padding: '13px 0', borderTop: '1px solid var(--line)' }}>
      <div style={{ fontWeight: 600, fontSize: 14 }}>{label}</div>
      <div className="muted" style={{ fontSize: 12.5, margin: '2px 0 10px' }}>{hint}</div>
      <div role="radiogroup" aria-label={`${label} colour`} style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
        {options.map((o) => {
          const on = current === o.key;
          return (
            <button
              key={o.key ?? 'default'}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setSkin(hub, o.key)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                borderRadius: 999, padding: '6px 13px 6px 7px', fontFamily: 'inherit',
                fontSize: 12, fontWeight: 600, minHeight: 44,
                border: `1.5px solid ${on ? 'var(--accent)' : 'var(--line)'}`,
                background: on ? 'var(--accent-soft)' : 'transparent',
                color: 'var(--ink)',
              }}
            >
              <Chip a={o.a} b={o.b} />
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.25 }}>
                {o.label}
                {o.note && <span className="muted" style={{ fontSize: 10, fontWeight: 500 }}>{o.note}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
