import { useId, useState, type ReactNode } from 'react';

/**
 * A section that gets out of the way once it has done its job.
 *
 * THE PROFILE IS AN INPUT STAGE, NOT THE CONTENT. Before this, finishing your
 * skin and hair profile meant every future visit began with the form you
 * already filled in, the six photos you already uploaded and the assessment you
 * already read — several screens of your own answers between you and the
 * routine they exist to produce. The answers are kept and remembered; they are
 * simply folded away.
 *
 * OPEN IS A PROP, NOT A DEFAULT. Which sections start open is a decision about
 * what somebody came for, and it belongs to the page rather than to this
 * component. On the profile that is the progress photos and the budget: one is
 * the reason to come back, the other is the next thing to do.
 *
 * NO HEIGHT ANIMATION. Animating to `auto` needs a measured height, and a
 * measured height on a section holding lazily-loaded product photographs is
 * measured before they land and wrong afterwards. The header state is instant
 * and honest; the motion budget in this app is spent where it carries meaning.
 */
export function Collapsible(
  { title, meta, defaultOpen = false, action, children }:
  { title: string; meta?: ReactNode; defaultOpen?: boolean; action?: ReactNode; children: ReactNode },
) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <section className="card" style={{ marginBottom: 14, padding: open ? undefined : '14px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {/* THE WHOLE HEADER IS THE BUTTON, not a chevron at the end of it. A
            12px target at the right-hand edge of a wide card is the hardest
            thing on the page to hit and the easiest to miss. */}
        <button type="button" onClick={() => setOpen(!open)}
          aria-expanded={open} aria-controls={id}
          style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
            background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
          <span aria-hidden style={{ fontSize: 11, color: 'var(--muted)', width: 12, flex: 'none' }}>{open ? '▾' : '▸'}</span>
          <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em' }}>{title}</span>
          {meta && <span className="muted" style={{ fontSize: 11.5, fontWeight: 400, minWidth: 0 }}>{meta}</span>}
        </button>
        {action}
      </div>
      {open && <div id={id} style={{ marginTop: 14 }}>{children}</div>}
    </section>
  );
}
