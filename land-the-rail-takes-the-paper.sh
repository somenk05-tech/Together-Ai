#!/usr/bin/env bash
# land-the-rail-takes-the-paper.sh  ·  run from the REPO ROOT
#
# "Match the button color with the background color" - the owner, on the
# Astrology rail. And the weight caveat on the gemstone sheet.
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
git log --oneline -80 | grep -q 'The rail takes the paper' && die "already landed - re-running is a no-op by design"
ok "this is new"

say "2 - scope"
FILES="$W/src/styles/tokens.css $W/src/features/astrology/pages/AstroGemstones.tsx \
$W/src/app/one-stone-answer.test.ts"
DIRTY="$(git status --porcelain -- $FILES || true)"
[ -z "$DIRTY" ] || { printf '   \033[31mx\033[0m these already have uncommitted changes:\n%s\n' "$DIRTY"; die "stop"; }
ok "the files this touches are clean"

say "3 - edits"
cd "$W" || die cd
python3 - <<'PY' || die "edits failed"
def rd(p): return open(p, encoding='utf-8').read()
def wr(p,s): open(p,'w',encoding='utf-8').write(s)

# GUARD ON THE RESULT, NOT THE ANCHOR. Every anchor below survives its own
# edit, so checking the anchor would insert a second copy on a re-run - which
# is exactly how the switch lander broke tsc when it was run twice.

T='src/styles/tokens.css'; s=rd(T)
if '--rail-well: #ebe8e3' in s: print('   tokens.css: already done')
else:
    old = """[data-hub="astrology"] {
  --ground: #ebe8e3;
  --paper:  #ebe8e3;
  --card:   #ffffff;"""
    assert old in s, 'the astrology block is not in its reviewed form'
    wr(T, s.replace(old, old + """
  /* THE RAIL TAKES THE PAPER (owner, 19 Aug). --rail-well is #ffffff at the
     root, and a white rail beside a cream letter is a seam down the middle of
     the screen — two surfaces where the hub means one. The keys are
     --lens-face, which is translucent, so they take the cream with it and stay
     legible: every ink this hub declares clears AA on #ebe8e3 — black 17.2,
     --ink-soft 14.0, --muted 4.70, --faint 5.60. */
  --rail-well: #ebe8e3;""", 1))
    print('   tokens.css: the rail takes the paper')

P='src/features/astrology/pages/AstroGemstones.tsx'; s=rd(P)
NEW = "Your body weight, against the weight this stone is traditionally worn at."
if NEW in s: print('   AstroGemstones.tsx: already done')
else:
    old = """            Custom rather than calculation. A chart-specific weight is an astrologer's call on your
            whole chart — have this confirmed before you commission the stone."""
    assert old in s, 'the weight caveat is not in its reviewed form'
    wr(P, s.replace(old, "            " + NEW, 1))
    print('   AstroGemstones.tsx: the caveat becomes a statement')

S='src/app/one-stone-answer.test.ts'; s=rd(S)
if 'against the weight this stone' in s: print('   one-stone-answer.test.ts: already done')
else:
    old = "    expect(gems).toMatch(/Custom rather than calculation/);"
    assert old in s, 'the assertion is not in its reviewed form'
    wr(S, s.replace(old,
"""    // THE SENTENCE CHANGED, THE RULE DID NOT (owner, 19 Aug). It read "Custom
    // rather than calculation. A chart-specific weight is an astrologer's call
    // on your whole chart — have this confirmed before you commission the
    // stone." The owner found it apologetic about a figure that IS worked out
    // for the wearer, so it now names the two inputs instead of naming what
    // they are not. What must not go is the page naming them at all: the chart
    // chooses the STONE and has no part in the WEIGHT, and a page that lets
    // somebody infer otherwise is selling a five-figure commission on it.
    expect(gems).toMatch(/against the weight this stone is traditionally worn at/);""", 1))
    print('   one-stone-answer.test.ts: the guard follows the sentence')
PY
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
git add $FILES land-the-rail-takes-the-paper.sh || die "git add"
git commit -F - <<'MSG' || die commit
The rail takes the paper

"Match the button color with the background color" - the owner, on the
Astrology rail.

--rail-well is #ffffff at the root and Astrology's ground is #ebe8e3, so
the hub ran a white rail down the left of a cream letter: two surfaces
where it means one, and a seam exactly where the eye crosses from the
keys to the page. The rail now takes the paper. The keys are --lens-face,
which is translucent, so they come with it rather than needing their own
value.

EVERY INK THIS HUB DECLARES STILL CLEARS AA on the new ground - black
17.2, --ink-soft 14.0, --muted 4.70, --faint 5.60 - which is checked
rather than assumed, because a ground change is exactly where contrast
quietly stops being true. Astrology is one of the three hubs granted a
re-pointed ground, so this adds a token to a block that already has four
and changes no rule about who may.

AND THE WEIGHT CAVEAT BECOMES A STATEMENT. The gemstone sheet said
"Custom rather than calculation. A chart-specific weight is an
astrologer's call on your whole chart - have this confirmed before you
commission the stone." The owner found it apologetic about a figure that
IS worked out for the wearer, and it is: gem-weight.ts takes the stone's
customary range and places the wearer inside it by body weight. So the
line now names those two inputs instead of naming what they are not.

WHAT DID NOT CHANGE IS THE RULE UNDERNEATH IT. one-stone-answer.test.ts
holds this page to saying which rule bound the figure, and that assertion
moved to the new sentence rather than being deleted with the old one. The
chart chooses the STONE and has no part in the WEIGHT; a page that lets
somebody infer otherwise is selling a five-figure commission on it. One
rule for all thirty stones once prescribed nine carats of blue sapphire,
which is why the guard exists at all.
MSG
ok committed
say "review, then:  git push"
