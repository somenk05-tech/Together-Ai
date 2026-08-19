#!/usr/bin/env bash
# land-the-reference-folds.sh  ·  run from the REPO ROOT
#
# "make this section for each stone collapsable and expandable" - the owner,
# on the Gemstones sheet.
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
git log --oneline -80 | grep -q 'The reference folds' && die "already landed - re-running is a no-op by design"
ok "this is new"

say "2 - scope"
STRAY="$(git status --porcelain -- "$W/src/features/astrology/pages/AstroGemstones.tsx" \
  "$W/src/styles/layout.css" | grep -Ev '(AstroGemstones\.tsx|layout\.css)$' || true)"
[ -z "$STRAY" ] || { printf '   \033[31mx\033[0m unexpected:\n%s\n' "$STRAY"; die "stop"; }
ok "only this change moves"

say "3 - the sheet folds"
cd "$W" || die cd
python3 - <<'PY_ONE' || die "page edit failed"
import sys, re
P = 'src/features/astrology/pages/AstroGemstones.tsx'
s = open(P, encoding='utf-8').read()

if 'gem-fold' in s:
    print('   AstroGemstones.tsx already folds'); sys.exit(0)

# 1 — the import
old_imp = "import { Button, Card, Spinner } from '@/components/ui';"
assert old_imp in s, 'import line not found'
s = s.replace(old_imp, old_imp + "\nimport { Fold } from '@/components/ui/Fold';", 1)

# 2 — open the fold just before the first labelled section
open_anchor = """      {/* ── the personalised section, and the reason this page exists ────────
          The reference is a catalogue sheet and has nothing like it. It goes
          first among the labelled sections because it is the only one written
          about the reader rather than about the stone. */}
      <Sub>Why this stone, for you</Sub>"""
assert open_anchor in s, 'open anchor not found'
s = s.replace(open_anchor, """      {/* ── the reference, folded ───────────────────────────────────────────
          EIGHT LABELLED SECTIONS TIMES FOUR STONES IS A WALL. Everything from
          here to the weight is reference: true, worth having, and read once.
          Printed open on every visit it buries the three things that are not
          reference — which stone, how much of it, and the way in — under four
          screens of prose somebody has already read.

          So it folds, on the sheet's own vocabulary rather than the city's
          rounded card: a tracked capital line between two hairlines. The
          rounded card is the one thing on this page from another design, which
          is the whole argument of `.gem-sub` above it.

          THE CLOSED LINE CARRIES THE FACTS, not the section count. "How it is
          worn, and why" alone is a section nobody opens; the finger, the metal
          and the day are the answer most people came for, and the stand-in with
          its price is the one thing here that changes a decision. */}
      <Fold face="gem-fold" panel="gem-fold-open"
        title="How it is worn, and why"
        meta={[
          `${wearing.finger}, ${wearing.hand.toLowerCase()}`,
          wearing.metal.toLowerCase(),
          wearing.day,
          rec.substitutes[0]
            ? `${rec.substitutes[0].gem.name.toLowerCase()} in its place`
            : null,
        ].filter(Boolean).join(' · ')}
      >
      {/* ── the personalised section, and the reason this page exists ────────
          The reference is a catalogue sheet and has nothing like it. It goes
          first among the labelled sections because it is the only one written
          about the reader rather than about the stone. */}
      <Sub>Why this stone, for you</Sub>""", 1)

# 3 — close it immediately before the weight, which stays out in the open
close_anchor = """      {/* ── how much stone, and therefore what it costs ─────────────────────"""
assert close_anchor in s, 'close anchor not found'
s = s.replace(close_anchor, """      </Fold>

      {/* THE WEIGHT, THE PRICE AND THE WAY IN STAY OUT OF THE FOLD. Everything
          above is the reference; this is the decision. A carat figure, what it
          costs at that figure and the button that starts the commission are
          the three things somebody came to the page for, and a fold is a very
          good way to make a way in invisible. */}
      {/* ── how much stone, and therefore what it costs ─────────────────────""", 1)

open(P, 'w', encoding='utf-8').write(s)
print('   AstroGemstones.tsx: the reference sections fold')
PY_ONE
python3 - <<'PY_TWO' || die "style edit failed"
import sys
P = 'src/styles/layout.css'
s = open(P, encoding='utf-8').read()
if '.gem-fold' in s:
    print('   layout.css already has the gem fold'); sys.exit(0)
anchor = ".gem-body { font-size: 13.5px; line-height: 1.85; max-width: 400px; margin: 0 auto; }"
assert anchor in s, 'gem-body rule not found'
s = s.replace(anchor, anchor + """
/* THE REFERENCE FOLDS, ON THE SHEET'S OWN VOCABULARY. `Fold` is the city's one
   disclosure and this is its third skin, because a second implementation is how
   one of them quietly stops announcing itself — see components/ui/Fold.tsx.
   What it must NOT borrow is `.fold`, the ordinary rounded card: this sheet is
   centred, tracked and borderless, and a rounded card with a shadow in the
   middle of it is the one thing on the page from another design. So the face is
   a tracked capital line between two hairlines, which is `.gem-sub` wearing a
   rule — the vocabulary already on the card.

   Colour comes from --gem-title, set on the card element from the owner's
   catalogue payload beside the photograph. Nothing here names a colour. */
.gem-fold {
  display: flex; align-items: baseline; justify-content: center;
  gap: 6px 14px; flex-wrap: wrap; width: 100%; min-height: 44px;
  margin: 30px 0 0; padding: 13px 8px; text-align: center;
  background: none; border: 0;
  border-top: 1px solid var(--line); border-bottom: 1px solid var(--line);
  font-family: inherit; color: var(--gem-title, var(--ink)); cursor: pointer;
}
.gem-fold .t {
  font-size: 10px; letter-spacing: .26em; text-transform: uppercase; font-weight: 700;
}
/* The closed line's payload — the finger, the metal, the day and the stand-in.
   Sentence case against the tracked capitals, because it is a fact rather than
   a heading. */
.gem-fold .m { font-size: 12px; opacity: .82; }
.gem-fold .s {
  font-size: 10px; letter-spacing: .16em; text-transform: uppercase;
  font-weight: 700; opacity: .62;
}
.gem-fold-open { padding-top: 2px; }
/* On a phone the three parts stack rather than squeezing: the tracked name is
   the one that has to stay whole, the same treatment .fold and the beauty leaf
   already get. */
@media (max-width: 560px) {
  .gem-fold { flex-direction: column; row-gap: 5px; }
  .gem-fold .m { order: 3; }
}""", 1)
open(P, 'w', encoding='utf-8').write(s)
print('   layout.css: .gem-fold / .gem-fold-open added')
PY_TWO
ok "edited"

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
git add "$W/src/features/astrology/pages/AstroGemstones.tsx" \
        "$W/src/styles/layout.css" \
        land-the-reference-folds.sh || die "git add"
git commit -F - <<'MSG' || die commit
The reference folds

"make this section for each stone collapsable and expandable" - the owner,
on the Gemstones sheet.

Eight labelled sections times four stones is a wall. Everything from "Why
this stone, for you" to the weight is reference - true, worth having, and
read once - and printed open on every visit it buried the three things
that are not reference under four screens of prose somebody had already
read.

So it folds, on Fold, which is the city's one disclosure: the state, the
id and the two aria attributes in one place, because a second copy is how
one of them quietly stops announcing itself. This is its third skin. What
it does NOT borrow is .fold, the ordinary rounded card - the sheet is
centred, tracked and borderless, and a rounded card with a shadow in the
middle of it is the one thing on the page from another design, which is
the whole argument of .gem-sub above it. The face is a tracked capital
line between two hairlines instead.

THE CLOSED LINE CARRIES THE FACTS. "How it is worn, and why" on its own is
a section nobody opens, so it wears the finger, the hand, the metal and
the day - the answer most people came for - and names the stand-in stone
when there is one, which is the single thing here that changes a decision.

THE WEIGHT, THE PRICE AND THE WAY IN STAY OUT OF THE FOLD. The carat
figure, what it costs at that figure and the button that starts the
commission are what somebody came to the page for, and a fold is a very
good way to make a way in invisible.
MSG
ok committed
say "review, then:  git push"
