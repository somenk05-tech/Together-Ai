import { useId, type ReactNode } from 'react';

/**
 * THE ONE SWITCH IN THE CITY.
 *
 * A SWITCH IS NOT A CHECKBOX, and the difference is not decoration. A switch
 * takes effect the moment it moves — a setting, a filter, a day the shop is
 * open. A checkbox states a fact or picks among several options in a form you
 * then submit: "I don't know my exact birth time", "the kind of work you want",
 * "I agree to the terms". Eighteen files in this app write
 * `<input type="checkbox">`; most of them mean the second thing, are correct as
 * they are, and are deliberately left alone.
 *
 * THE INPUT IS CLIPPED, NOT `display: none`. The design this came from hides
 * the checkbox outright, which is the one thing that must not be copied: a
 * display-none input leaves the tab order and the accessibility tree together,
 * so the control keeps looking right and stops being operable by keyboard or
 * announceable at all. It is clipped to a pixel instead — still focusable,
 * still announced, `role="switch"` so it is announced as on/off rather than
 * ticked — and the focus ring is drawn on the track, which is what a sighted
 * keyboard user is looking at.
 *
 * THE TRACK IS AN ELEMENT, NOT A PSEUDO-ELEMENT. The original puts both track
 * and knob on the label as ::before and ::after, which works only while every
 * label is one line: the knob is absolutely positioned against the label box,
 * so the moment a switch carries a title and a line of explanation under it —
 * which two of the five here do — the knob leaves the track. A real span is one
 * more node and cannot drift.
 */
export function Switch({
  checked, onChange, label, hideLabel = false, disabled = false, id: idProp,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Always required — a switch with no name is a switch nobody can describe. */
  label: ReactNode;
  /** Keeps the name for screen readers when the row is already labelled. */
  hideLabel?: boolean;
  disabled?: boolean;
  id?: string;
}) {
  const auto = useId();
  const id = idProp ?? auto;
  return (
    <span className="sw">
      <input id={id} className="sw-in" type="checkbox" role="switch"
        checked={checked} disabled={disabled}
        onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={id} className="sw-lb">
        <span className="sw-track" aria-hidden />
        <span className={hideLabel ? 'sw-hidden' : 'sw-tx'}>{label}</span>
      </label>
    </span>
  );
}
