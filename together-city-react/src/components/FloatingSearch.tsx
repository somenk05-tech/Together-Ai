import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useFloatingSearchStore } from '@/store/floatingSearch.store';
import { Icon } from '@/components/ui/Icon';

const MARGIN = 10;

/**
 * Draggable floating search tab (opens the ⌘K command palette). The user can
 * grab it and drop it anywhere on screen; its position is remembered. A small
 * move threshold distinguishes a drag from a click so dropping it doesn't also
 * open the palette.
 */
export function FloatingSearch() {
  const saved = useFloatingSearchStore((s) => ({ x: s.x, y: s.y }));
  const setPos = useFloatingSearchStore((s) => s.setPos);
  const ref = useRef<HTMLButtonElement>(null);
  const [pos, setLocal] = useState<{ x: number; y: number } | null>(null);

  const drag = useRef({ active: false, moved: false, px: 0, py: 0, ox: 0, oy: 0 });

  const clamp = (x: number, y: number) => {
    const el = ref.current;
    const w = el?.offsetWidth ?? 120;
    const h = el?.offsetHeight ?? 44;
    return {
      x: Math.min(Math.max(x, MARGIN), window.innerWidth - w - MARGIN),
      y: Math.min(Math.max(y, MARGIN), window.innerHeight - h - MARGIN),
    };
  };

  // Initial position: saved, else bottom-right.
  useLayoutEffect(() => {
    const el = ref.current;
    const w = el?.offsetWidth ?? 120;
    const h = el?.offsetHeight ?? 44;
    const initial = saved.x != null && saved.y != null
      ? { x: saved.x, y: saved.y }
      : { x: window.innerWidth - w - 24, y: window.innerHeight - h - 88 };
    setLocal(clamp(initial.x, initial.y));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-clamp once the REAL pill has painted. The measuring pass above reads
  // the hidden placeholder — which is an EMPTY button, ~6px wide — so the
  // first computed x sits `realWidth - placeholderWidth` (~88px) past the
  // right edge, and on a phone that left nothing visible but a sliver of the
  // pill. One more clamp against the rendered width pulls it fully on-screen;
  // it is a no-op whenever the position was already legal (drags re-clamp on
  // their own, so this never fights the user's chosen spot).
  useLayoutEffect(() => {
    if (!pos) return;
    const next = clamp(pos.x, pos.y);
    if (next.x !== pos.x || next.y !== pos.y) setLocal(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos?.x, pos?.y]);

  // Keep it on-screen if the window resizes.
  useEffect(() => {
    const onResize = () => setLocal((p) => (p ? clamp(p.x, p.y) : p));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!pos) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { active: true, moved: false, px: e.clientX, py: e.clientY, ox: pos.x, oy: pos.y };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!drag.current.active) return;
    const dx = e.clientX - drag.current.px;
    const dy = e.clientY - drag.current.py;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) drag.current.moved = true;
    setLocal(clamp(drag.current.ox + dx, drag.current.oy + dy));
  };
  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!drag.current.active) return;
    drag.current.active = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (pos) setPos(pos.x, pos.y);
  };
  const onClick = () => {
    if (drag.current.moved) { drag.current.moved = false; return; }
    window.dispatchEvent(new Event('tc:command'));
  };

  if (!pos) {
    // Render invisibly first so we can measure, then position.
    return <button ref={ref} aria-hidden style={{ position: 'fixed', visibility: 'hidden', left: -9999, top: -9999 }} />;
  }

  return (
    <button
      ref={ref}
      type="button"
      aria-label="Search — jump to anything (Ctrl/Cmd K). Drag to reposition."
      title="Search (⌘K) · drag to move"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClick={onClick}
      style={{
        position: 'fixed', left: pos.x, top: pos.y, zIndex: 1100,
        display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px',
        borderRadius: 'var(--r-full)', border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink)',
        fontSize: 11, letterSpacing: '.06em', fontWeight: 700, textTransform: 'uppercase', fontFamily: 'inherit',
        boxShadow: 'var(--e2)', cursor: 'grab', touchAction: 'none', userSelect: 'none',
      }}
      onPointerDownCapture={(e) => { (e.currentTarget as HTMLElement).style.cursor = 'grabbing'; }}
      onPointerUpCapture={(e) => { (e.currentTarget as HTMLElement).style.cursor = 'grab'; }}
    >
      <Icon name="search" size={17} style={{ color: 'var(--accent-ink)' }} /> Search
    </button>
  );
}
