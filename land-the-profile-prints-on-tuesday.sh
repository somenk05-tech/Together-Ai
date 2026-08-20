#!/usr/bin/env bash
# land-the-profile-prints-on-tuesday.sh  ·  run from the REPO ROOT
set -uo pipefail
W=together-city-react

[ -f .git/index.lock ] && [ ! -s .git/index.lock ] && rm -f .git/index.lock && echo "  cleared empty index.lock"
say(){ printf '\n\033[1m%s\033[0m\n' "$*"; }
ok(){  printf '   \033[32m*\033[0m %s\n' "$*"; }
die(){ printf '   \033[31mx\033[0m %s\n' "$*"; exit 1; }

[ -d "$W" ] || die "run me from the repo root (no $W/ here)"
[ -f food-paper.block.css ] || die "food-paper.block.css not at the repo root"

say "1 - precondition"
git fetch -q origin main 2>/dev/null || true
N=$(git rev-list --count origin/main..HEAD 2>/dev/null || echo 0)
[ "$N" = "0" ] || die "$N local commit(s) not pushed - push or review them before landing on top"
git log --oneline -20 | grep -q 'prints on Tuesday' && die "already landed - re-running is a no-op by design"
ok "base is clean and pushed, not yet landed"

say "2 - scope"
for f in $(git status --porcelain | awk '{print $2}'); do
  case "$f" in
    $W/src/styles/tokens.css|$W/src/styles/relief.css|$W/src/features/nutrition/pages/Preferences.tsx) ;;
    food-paper.block.css|land-the-profile-prints-on-tuesday.sh) ;;
    *) die "unexpected modified file: $f — another session may be working here. Do not force past this." ;;
  esac
done
ok "tree clean of anything this change does not touch"

say "3 - apply, with exactly-once assertions"
python3 - "$W" <<'PYEOF' || die "an anchor did not match exactly once - see above"
import sys, pathlib
W = pathlib.Path(sys.argv[1])
def edit(rel, old, new, label):
    p = W / rel; s = p.read_text(); n = s.count(old)
    if n != 1:
        print(f"   x {label}: anchor found {n} times, expected 1"); sys.exit(1)
    p.write_text(s.replace(old, new)); print(f"   * {label}")

edit('src/styles/tokens.css',
     '[data-paper="tue"] .press-recto {',
     '[data-paper="tue"] .press-recto,\n[data-paper="tue"] .food-paper {',
     'tokens.css   .food-paper joins Tuesday')

edit('src/features/nutrition/pages/Preferences.tsx',
     '  return (\n    <div>\n      <div className="eyebrow">Nutrition Hub \u00b7 02</div>',
     '  return (\n    <div className="food-paper" data-paper="tue">\n      <div className="eyebrow">Nutrition Hub \u00b7 02</div>',
     'Preferences   page wears Tuesday')

edit('src/features/nutrition/pages/Preferences.tsx',
     '{collapsed && (\n        <div className="card" style={{ marginTop: 16 }}>',
     '{collapsed && (\n        <div className="food-print" style={{ marginTop: 16 }}>',
     'Preferences   saved view prints')

css = W / 'src/styles/relief.css'; body = css.read_text()
if '.food-paper' in body:
    print('   x relief.css already contains .food-paper'); sys.exit(1)
css.write_text(body.rstrip() + '\n' + pathlib.Path('food-paper.block.css').read_text())
print('   * relief.css  block appended')
PYEOF

say "4 - sha256"
for f in src/styles/tokens.css src/styles/relief.css src/features/nutrition/pages/Preferences.tsx; do
  ok "$(shasum -a 256 "$W/$f" | cut -c1-16)  $f"
done

say "5 - gates"
cd "$W" || die cd
npx tsc --noEmit                && ok tsc            || die tsc
npx vitest run                  && ok vitest         || die vitest
node scripts/lint-ceiling.mjs   && ok lint-ceiling   || die lint-ceiling
node scripts/nav-audit.mjs      && ok nav-audit      || die nav-audit
node scripts/a11y-audit.mjs     && ok a11y-audit     || die a11y-audit
node scripts/motion-ceiling.mjs && ok motion-ceiling || die motion-ceiling
npm run build                   && ok build          || die build

say "6 - reported, not gated"
node scripts/dead-export-audit.mjs || true
node scripts/paper.mjs || true
cd ..

say "7 - commit"
git add $W/src/styles/tokens.css $W/src/styles/relief.css $W/src/features/nutrition/pages/Preferences.tsx
git commit -F - <<'MSG'
The profile prints on Tuesday

The Food Preference Profile takes Tuesday's recto as its ground, and its saved
view stops being a card.

NOT A HUB GROUND GRANT. No [data-hub] block is touched, so relief.spec.ts's
grounded set still reads exactly astrology, beauty, entertainment, and the
argument in tokens.css for why nutrition lost its ground stands untouched - the
hub is still a name and a colour. This is one page taking a day's paper, which
is the owner's call of 12 Aug: other nutrition pages take a day's paper as
their ground and keep Relief's cards, buttons and sans. Nor does the press
spread - .food-paper carries no data-press, so the wearer list still finds
three files.

THE VEIL STAYS AT .52. Veiling until the city's own inks cleared AA needs .78,
at which point the photograph is 78 percent erased and little is left of the
reason it was chosen. The press's method is the opposite and it is the right
one: veil to the minimum that turns a picture into a ground, then re-point the
inks. Only three city tokens fail on this ground - --muted at 2.39, --faint at
2.09, --line at 2.05 - and they take --press-recto-ink-2, -ink-3 and -rule, all
already solved for this sheet and reused rather than restated, so the page and
Tuesday's recto cannot drift apart.

--faint lands at 3.38 here, which is --press-ink-3's floor: labels and metadata
only, never body copy. Preferences.tsx uses --faint nowhere, so nothing moved.

THE INK IS SET, THE TOKENS ARE NOT RE-POINTED. Re-pointing --muted on the page
would carry it into all thirteen cards of the edit form, which stand on white
and need the city's grey. Setting color instead leaves var(--muted) holding its
root value, so the restore is a reference rather than a second copy of #666666
living in relief.css. This is .cstage's shape, for .cstage's reason, and it is
why muted and card sit on no-borrowed-class-names' allow-list.

THE SAVED VIEW IS PRINTED, NOT CARDED. A white surface is 1.01:1 against this
sheet - its lightest pixel is pure white and no white veil changes that. The
card did not dissolve a little, it had no edge at all. A page listing what you
eat, printed on paper, is the thing itself rather than a panel describing it.

THE EDIT FORM KEEPS ITS CARDS AND GAINS AN EDGE. Behind the button there are
thirteen, plus every text input, which paints var(--card). That is not a
document, it is a long form, and a text field with no ground on a photograph is
unusable rather than merely undecorated. The edge is --press-ink-3, not
--press-recto-rule: rgba(51,44,37,.32) composites to #bebbb9 on a white card,
1.89:1, which is not an edge. That token draws rules ON the paper, not a
boundary against it. --press-ink-3 is 3.64:1 against the sheet and 3.67:1
against the card interior, so it separates without becoming a border. One rule,
so a fourteenth card is edged the day it is written.
MSG

ok committed
say "review, then:  git push"
