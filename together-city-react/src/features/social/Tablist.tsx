import { useRef, type KeyboardEvent, type ReactNode } from 'react';

/**
 * A TAB ROW THE KEYBOARD CAN WALK (4 Sep audit).
 *
 * The feed's five lenses and the profile's five grids were `role="tablist"`
 * with `role="tab"` buttons and nothing else: every tab was in the Tab order,
 * none was linked to its panel, and Left/Right did nothing — the semantics of
 * a tab row without the behaviour that makes the semantics true. This is the
 * pattern as the ARIA authoring practices draw it, once, for both rows:
 *
 *   • one tab stop — the selected tab — and Left/Right/Home/End move between
 *     the rest, selecting as they go (a lens is cheap to open);
 *   • `aria-controls` names the panel and the panel names its tab back.
 *
 * Presentation is untouched: the same `.sl-tabs`/`.sl-tab` classes, the same
 * `rise` rhythm the profile hands in through `className`.
 */
export function Tablist({ tabs, value, onChange, label, panelId, className }: {
  tabs: ReadonlyArray<{ key: string; label: ReactNode }>;
  value: string;
  onChange: (key: string) => void;
  label: string;
  /** The id of the `role="tabpanel"` this row controls. */
  panelId: string;
  className?: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  /* NO SELECTED TAB IS NOT NO FOCUSABLE TAB (5 Sep). When `value` matched
     none of the tabs — a lens key restored from a URL after the lens list
     changed — every button carried tabIndex=-1 and the arrow keys returned
     early: the row was unreachable by keyboard. The first tab stands in as
     the roving-tabindex home whenever nothing is selected. */
  const selected = tabs.findIndex((t) => t.key === value);
  const home = selected < 0 ? 0 : selected;
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!tabs.length) return;
    const i = home;
    let next = i;
    if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    else return;
    e.preventDefault();
    onChange(tabs[next].key);
    refs.current[next]?.focus();
  };
  return (
    <div className={`sl-tabs${className ? ` ${className}` : ''}`} role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {tabs.map((t, i) => {
        const on = t.key === value;
        return (
          <button key={t.key} type="button" role="tab" id={`${panelId}-tab-${t.key}`}
            ref={(el) => { refs.current[i] = el; }}
            className={`sl-tab${on ? ' on' : ''}`}
            aria-selected={on} aria-controls={panelId} tabIndex={i === home ? 0 : -1}
            onClick={() => onChange(t.key)}>
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
