#!/usr/bin/env bash
# land-the-stage-goes-slate.sh  ·  run from the REPO ROOT
#
# The owner, with a reference image of gunmetal glass: "Mira's chat box
# remains red... but overall chat system color changes from black to the
# reference image."
#
# One file changes — tokens.css, the stage block — and the whole chat system
# follows, because the stage was built as tokens from the start. Mira's room
# has its own tokens and is not touched: still red.
#
# Independent of land-she-reads-one-chat.sh — different files, either order.
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
LOG="$(git log --oneline -60)"
printf '%s\n' "$LOG" | grep 'The stage goes slate' >/dev/null
[ $? -ne 0 ] || die "already landed - re-running is a no-op by design"
ok "this is new"

say "2 - scope"
STRAY="$(git status --porcelain -- "$W/src/styles/tokens.css" \
  | grep -Ev 'src/styles/tokens\.css$' || true)"
[ -z "$STRAY" ] || { printf '   \033[31mx\033[0m unexpected:\n%s\n' "$STRAY"; die "stop"; }
ok "only the token file moves"

say "3 - sha256"
got="$(shasum -a 256 "$W/src/styles/tokens.css" | awk '{print $1}')"
[ "$got" = "1fe3f92b80a64744b4233f85337b5d84faf11d0d7a4c8ec51c1bd0efa1976b0b" ] \
  && ok "tokens.css" || die "tokens.css is not the reviewed file (sha256 $got)"

say "4 - web gates"
cd "$W" || die cd
npx tsc --noEmit                && ok "web tsc"        || die "web tsc"
npx vitest run                  && ok "web vitest"     || die "web vitest"
node scripts/lint-ceiling.mjs   && ok lint-ceiling     || die lint-ceiling
node scripts/nav-audit.mjs      && ok nav-audit        || die nav-audit
node scripts/a11y-audit.mjs     && ok a11y-audit       || die a11y-audit
node scripts/motion-ceiling.mjs && ok motion-ceiling   || die motion-ceiling
npm run build                   && ok "web build"      || die "web build"
cd ..

say "5 - commit"
git add "$W/src/styles/tokens.css" land-the-stage-goes-slate.sh || die "git add"
git commit -F - <<'MSG' || die commit
The stage goes slate

"Mira's chat box remains red... but overall chat system color changes from
black to the reference image" - the owner, with a frame of gunmetal glass:
misted blue-grey ground, frosted panels, silver ink.

One block in tokens.css changes and the whole chat system follows - list,
thread, header, search, composer, every hub that borrows the stage -
because the stage was built as eleven tokens and no literal ever left them.
Mira's room has its own tokens and is untouched: still red, as asked.

The reference was measured before it was copied. Its own grey (#6b737e)
eats quiet ink - 3:1 and worse - so the lit end of the gradient is darkened
to #565e68 and the quiet inks lightened until the old stage's discipline
held again: 6.2:1, 5.2:1 and 4.8:1 against the palest ground, the same
>=4.6 floor the black stage kept. The glass lives in the fittings - panel,
line and hover alphas roughly doubled, which is what reads as frost - while
the bubbles stay opaque tiles (16.9:1 and 14.0:1), because translucent
bubbles were tried on paper and the reference's alpha lands ink below 3:1.
The room is restyled; the speaking is not.
MSG
ok committed
say "review, then:  git push"
