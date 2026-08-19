#!/usr/bin/env bash
# land-the-one-switch.sh  ·  run from the REPO ROOT
#
# "add this button style to overall site wherever this type of button is
# there" - the owner, with a toggle from Uiverse.
set -uo pipefail
W=together-city-react

say(){ printf '\n\033[1m%s\033[0m\n' "$*"; }
ok(){  printf '   \033[32m*\033[0m %s\n' "$*"; }
die(){ printf '   \033[31mx\033[0m %s\n' "$*"; exit 1; }

[ -d "$W" ] || die "run me from the repo root"

say "1 - precondition"
if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  rm -f .git/index.lock && ok "cleared an empty index.lock"
fi
git log --oneline -80 | grep -q 'The one switch' && die "already landed - re-running is a no-op by design"
ok "this is new"

say "2 - scope"
FILES="$W/src/components/ui/index.ts $W/src/styles/layout.css $W/src/styles/tokens.css \
$W/src/features/family/pages/Search.tsx $W/src/features/nutrition/pages/Preferences.tsx \
$W/src/features/services/HoursEditor.tsx $W/src/features/services/ListingForm.tsx"
DIRTY="$(git status --porcelain -- $FILES || true)"
[ -z "$DIRTY" ] || { printf '   \033[31mx\033[0m these already have uncommitted changes:\n%s\n' "$DIRTY"; die "stop"; }
ok "the files this touches are clean"

say "3 - the one switch"
cd "$W" || die cd
cat > src/components/ui/Switch.tsx <<'TSX'
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
TSX
ok "components/ui/Switch.tsx"

python3 - <<'PY' || die "edits failed"
import re, sys

def rd(p): return open(p, encoding='utf-8').read()
def wr(p, s): open(p, 'w', encoding='utf-8').write(s)

def swap(path, old, new, label):
    s = rd(path)
    if old not in s:
        print(f'   {label}: already done'); return
    wr(path, s.replace(old, new, 1)); print(f'   {label}')

def add_import(path):
    s = rd(path)
    if re.search(r"\bSwitch\b[^;]*from '@/components/ui'", s): return
    m = re.search(r"import \{([^}]*)\} from '@/components/ui';", s)
    wr(path, s[:m.end(1)] + ', Switch' + s[m.end(1):])

swap('src/components/ui/index.ts',
     "export { Fold } from './Fold';",
     "export { Fold } from './Fold';\nexport { Switch } from './Switch';",
     'index.ts: Switch exported')

swap('src/styles/tokens.css',
"  --dur-fast: 130ms; --dur-base: 220ms; --dur-slow: 420ms;",
"""  /* THE SWITCH, THE ONE CONTROL THAT IS THE SAME IN EVERY HUB. Every other
     accent in the city is the room's — rose in Nutrition, periwinkle in Real
     Estate — because an accent says where you are. A switch says something
     else: on, or off. That is the same answer in every room, so it is the same
     amber in every room, and it is written here because a colour written in a
     stylesheet is a decision made outside the system. */
  --switch-on: #ffb500;
  --switch-off: #05012c;

  --dur-fast: 130ms; --dur-base: 220ms; --dur-slow: 420ms;""",
'tokens.css: --switch-on / --switch-off')

swap('src/styles/layout.css',
".gem-body { font-size: 13.5px; line-height: 1.85; max-width: 400px; margin: 0 auto; }",
""".gem-body { font-size: 13.5px; line-height: 1.85; max-width: 400px; margin: 0 auto; }

/* ═══════════════════════════════════════════════════════════════════════════
   THE SWITCH

   THE INPUT IS CLIPPED, NOT `display: none`. Hiding it outright takes it out of
   the tab order and out of the accessibility tree at the same time — the switch
   still looks right and stops being operable by keyboard, which is the failure
   nobody catches in review. Clipped to a pixel it stays focusable and stays
   announced, and the focus ring is drawn on the track where a sighted keyboard
   user is looking.

   NO `clip-path: inset(50%)` HERE, which is what the usual visually-hidden
   recipe reaches for. `the-sidebar-does-not-move` forbids that exact string in
   this file — it was part of the collapsing rail the owner had removed, and
   that guard's whole job is to stop it returning one rule at a time. A 1px box
   with overflow hidden is already invisible; `clip` finishes it.

   THE TRACK IS A REAL ELEMENT. Track and knob as ::before/::after on the label
   works only while every label is one line — the knob is positioned against the
   label box, so a switch carrying a title and an explanation under it puts its
   knob somewhere in the middle of the sentence. Two of the five switches here
   are exactly that shape.

   Timing is --dur-fast, not a hand-typed 125ms: motion-ceiling.mjs counts
   duration literals against the tokens, and a fourth number five milliseconds
   from an existing one is precisely the drift it exists to stop. */
.sw { display: inline-flex; }
.sw-in {
  position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0;
  border: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap;
}
/* flex-start, not centre: the track sits on the FIRST line of the label, so a
   one-line switch and a switch with a paragraph under it both read as one
   control rather than a control floating beside a block of text. */
.sw-lb {
  display: inline-flex; align-items: flex-start; gap: 9px;
  cursor: pointer; user-select: none; min-height: 44px; padding: 6px 0;
  font-size: 12.5px; line-height: 1.5; color: var(--ink-soft);
}
.sw-track {
  position: relative; flex: none; width: 25px; height: 15px; margin-top: 2px;
  border-radius: 500px; background: var(--switch-off);
  transition: background-color var(--dur-fast) ease-out;
}
.sw-track::after {
  content: ''; position: absolute; top: 1px; left: 1px;
  width: 13px; height: 13px; border-radius: 13px;
  background: var(--card); box-shadow: var(--e1);
  transition: transform var(--dur-fast) ease-out;
}
.sw-in:checked + .sw-lb .sw-track { background: var(--switch-on); }
.sw-in:checked + .sw-lb .sw-track::after { transform: translate3d(10px, 0, 0); }
.sw-in:disabled + .sw-lb { opacity: .5; cursor: default; }
.sw-in:focus-visible + .sw-lb .sw-track {
  outline: 2px solid var(--ink); outline-offset: 2px;
}
.sw-tx { min-width: 0; }
.sw-hidden {
  position: absolute; width: 1px; height: 1px; overflow: hidden;
  clip: rect(0 0 0 0); white-space: nowrap;
}
@media (prefers-reduced-motion: reduce) {
  .sw-track, .sw-track::after { transition: none; }
}""",
'layout.css: the switch')

p = 'src/features/services/HoursEditor.tsx'
swap(p,
"""              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 132, fontSize: 13 }}>
                <input type="checkbox" checked={d.open} onChange={(e) => set(d.day, { open: e.target.checked })}
                  aria-label={`Open on ${DAY_LONG[d.day]}`} />
                <span style={{ fontWeight: 600 }}>{DAY_LONG[d.day]}</span>
              </label>""",
"""              {/* Open or closed, and it takes effect as it moves — a switch,
                  not a tick. The day is the name; role="switch" says on/off. */}
              <span style={{ minWidth: 132, fontWeight: 600 }}>
                <Switch checked={d.open} onChange={(open) => set(d.day, { open })}
                  label={DAY_LONG[d.day]} />
              </span>""",
'HoursEditor: the opening days')
add_import(p)

p = 'src/features/family/pages/Search.tsx'
swap(p,
"""        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink-soft)', marginTop: 16 }}>
          <input type="checkbox" checked={safe} onChange={(e) => setSafe(e.target.checked)} /> Family-safe results only — excludes non-vegetarian dishes for vegetarian members
        </label>""",
"""        <div style={{ marginTop: 16 }}>
          <Switch checked={safe} onChange={setSafe}
            label="Family-safe results only — excludes non-vegetarian dishes for vegetarian members" />
        </div>""",
'family/Search: family-safe results')
add_import(p)

p = 'src/features/nutrition/pages/Preferences.tsx'
swap(p,
"""                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--ink-soft)', marginTop: 4, cursor: 'pointer' }}>
                  <input type="checkbox" checked={showIntl} onChange={toggleIntl} style={{ accentColor: 'var(--accent)' }} />
                  Show international ingredients (beef, pork)
                </label>""",
"""                <div style={{ marginTop: 4 }}>
                  <Switch checked={showIntl} onChange={() => toggleIntl()}
                    label="Show international ingredients (beef, pork)" />
                </div>""",
'Preferences: international ingredients')

swap(p,
"""          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, marginTop: 12, cursor: 'pointer', fontSize: 12.5 }}>
            <input type="checkbox"
              checked={!!(ex.cuisineLocks && Object.values(ex.cuisineLocks).some(Boolean))}
              onChange={(e) => setEx({ ...ex, cuisineLocks: e.target.checked ? { breakfast: true, lunch: true, dinner: true } : undefined })}
              style={{ marginTop: 2, accentColor: 'var(--accent)', cursor: 'pointer' }} />
            <span>
              <strong>Lock to these cuisines</strong>
              <span className="muted" style={{ display: 'block', fontSize: 11.5, marginTop: 1 }}>
                Every main comes strictly from your chosen cuisines. Leave off to keep them as a strong preference with some variety.
              </span>
            </span>
          </label>""",
"""          <div style={{ marginTop: 12 }}>
            <Switch
              checked={!!(ex.cuisineLocks && Object.values(ex.cuisineLocks).some(Boolean))}
              onChange={(on) => setEx({ ...ex, cuisineLocks: on ? { breakfast: true, lunch: true, dinner: true } : undefined })}
              label={<>
                <strong>Lock to these cuisines</strong>
                <span className="muted" style={{ display: 'block', fontSize: 11.5, marginTop: 1 }}>
                  Every main comes strictly from your chosen cuisines. Leave off to keep them as a strong preference with some variety.
                </span>
              </>} />
          </div>""",
'Preferences: the cuisine lock')
add_import(p)

p = 'src/features/services/ListingForm.tsx'
swap(p,
"""            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 8, minHeight: 44, cursor: phone.trim() ? 'pointer' : 'default' }}>
              <input type="checkbox" checked={phonePublic && !!phone.trim()} disabled={!phone.trim()}
                onChange={(e) => setPhonePublic(e.target.checked)} style={{ marginTop: 3, flexShrink: 0 }} />
              <span style={{ fontSize: 12.5 }}>
                Show this number on my page so people can ring me
                <span className="muted" style={{ display: 'block', fontSize: 11.5 }}>
                  Leave it off and people reach you only through the message room, where they
                  stay anonymous and so does your number.
                </span>
              </span>
            </label>""",
"""            <div style={{ marginTop: 8 }}>
              <Switch checked={phonePublic && !!phone.trim()} disabled={!phone.trim()}
                onChange={setPhonePublic}
                label={<>
                  Show this number on my page so people can ring me
                  <span className="muted" style={{ display: 'block', fontSize: 11.5 }}>
                    Leave it off and people reach you only through the message room, where they
                    stay anonymous and so does your number.
                  </span>
                </>} />
            </div>""",
'ListingForm: the number on the page')
add_import(p)
PY
ok "five controls switched"

say "4 - web gates"
npx tsc --noEmit                && ok "web tsc"        || die "web tsc"
npx vitest run                  && ok "web vitest"     || die "web vitest"
node scripts/lint-ceiling.mjs   && ok lint-ceiling     || die lint-ceiling
node scripts/nav-audit.mjs      && ok nav-audit        || die nav-audit
node scripts/a11y-audit.mjs     && ok a11y-audit       || die a11y-audit
node scripts/motion-ceiling.mjs && ok motion-ceiling   || die motion-ceiling
npm run build                   && ok "web build"      || die "web build"
cd ..

say "5 - commit"
git add "$W/src/components/ui/Switch.tsx" $FILES land-the-one-switch.sh || die "git add"
git commit -F - <<'MSG' || die commit
The one switch

"add this button style to overall site wherever this type of button is
there" - the owner, with a toggle from Uiverse.

A SWITCH IS NOT A CHECKBOX. Eighteen files write <input type="checkbox">
and most of them mean the other thing: "the kind of work you want" and
"which hubs to share" pick several from a list, "I don't know my exact
birth time" states a fact, "I agree to the terms" is a consent. Those are
correct as they are and are left alone. A switch takes effect as it moves
- a setting, a filter, a day the shop is open - and five controls in four
files are that: the opening days, family-safe search, international
ingredients, the cuisine lock, and whether a listing shows its number.

There was no shared switch to reach for, so this adds one, next to Fold
and for the same reason: the state, the label association and the aria
live in one place, because a second copy is how one of them quietly stops
announcing itself.

THREE THINGS IN THE ORIGINAL CSS COULD NOT SHIP AS WRITTEN, and the gates
said so rather than me. Its colours are hexes, and relief.spec keeps every
colour decision in tokens.css - so --switch-on and --switch-off live
there, amber in every hub, because on and off is the same answer in every
room unlike an accent. Its timings are a hand-typed .125s, five
milliseconds from --dur-fast, which is exactly the drift motion-ceiling
counts; the ceiling stays at 17. Its font stack is Helvetica Neue against
a one-typeface rule, so the label inherits.

AND IT HIDES THE INPUT WITH display: none, which is the one line that had
to change rather than be translated: that takes the control out of the tab
order and out of the accessibility tree together, so it keeps looking
right and stops being operable by keyboard or announceable at all. The
input is clipped instead - focusable, announced, role="switch" so it says
on and off rather than ticked - and the focus ring draws on the track.
The usual clip-path: inset(50%) is not used either: the-sidebar-does-not-
move forbids that exact string in layout.css, because it was part of the
collapsing rail the owner had removed, and that guard's whole job is to
stop it coming back one rule at a time.

The track is a real element rather than ::before/::after on the label.
Two of these five carry a title with an explanation under it, and an
absolutely positioned knob on a two-line label lands in the middle of the
sentence.
MSG
ok committed
say "review, then:  git push"
