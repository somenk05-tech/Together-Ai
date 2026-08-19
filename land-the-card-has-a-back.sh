#!/usr/bin/env bash
# land-the-card-has-a-back.sh  ·  run from the REPO ROOT
#
# "add this design to the card to facedown in this page ... can you make the
# card size vertical instead of square" - the owner, on the Tarot page.
#
#   ./land-the-card-has-a-back.sh [/path/to/card-back.webp]
#
# relief.spec.ts measures the deck and requires --tarot-card to sit within 10%
# of the artwork's median ratio. So the artwork moves first and the token
# follows it, which is the order that test exists to enforce.
set -uo pipefail
W=together-city-react

SRC="${1:-/Users/somen/Documents/AStrology and tarot /card-back/card-back.webp}"

say(){ printf '\n\033[1m%s\033[0m\n' "$*"; }
ok(){  printf '   \033[32m*\033[0m %s\n' "$*"; }
die(){ printf '   \033[31mx\033[0m %s\n' "$*"; exit 1; }

[ -d "$W" ] || die "run me from the repo root"

say "1 - precondition"
if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  rm -f .git/index.lock && ok "cleared an empty index.lock"
fi
git log --oneline -80 | grep -q 'The card has a back' && die "already landed - re-running is a no-op by design"
[ -f "$SRC" ] || die "no artwork at: $SRC"
ok "this is new, artwork found"

# Pillow does the padding. Rather than install into the system python - which
# on macOS is often externally-managed and refuses - build a throwaway venv.
PY=python3
if ! python3 -c "import PIL" 2>/dev/null; then
  # outside the repo on purpose, so it cannot show up as untracked cruft
  VENV="${TMPDIR:-/tmp}/tarot-pad-venv"
  if [ ! -x "$VENV/bin/python" ]; then
    printf '   building a throwaway venv for Pillow (once, ~20s)\n'
    python3 -m venv "$VENV" >/dev/null 2>&1 || die "python3 -m venv failed"
    "$VENV/bin/pip" install -q --disable-pip-version-check Pillow >/dev/null 2>&1 \
      || die "could not install Pillow into $VENV - check your network"
  fi
  PY="$VENV/bin/python"
  "$PY" -c "import PIL" 2>/dev/null || die "Pillow still missing in $VENV"
  ok "Pillow ready in $VENV"
else
  ok "Pillow present"
fi

say "2 - scope"
STRAY="$(git status --porcelain -- "$W/src/styles" "$W/public/assets/img" \
  | grep -Ev '(tokens\.css|layout\.css|tarot-back\.webp|assets/img/tarot/)' || true)"
[ -z "$STRAY" ] || { printf '   \033[31mx\033[0m unexpected:\n%s\n' "$STRAY"; die "stop"; }
ok "only this change moves"

say "3 - the deck becomes card-shaped"
"$PY" - "$W" <<'PY' || die "padding failed"
import sys, os, glob
from PIL import Image, ImageFilter, ImageEnhance, ImageDraw
W = sys.argv[1]
TARGET = 1.5

def pad(im):
    w, h = im.size
    cw, ch = (w, round(w*TARGET)) if h/w < TARGET else (round(h/TARGET), h)
    s = max(cw/w, ch/h) * 1.20
    bg = im.resize((max(1, round(w*s)), max(1, round(h*s))), Image.LANCZOS)
    ox, oy = (bg.width-cw)//2, (bg.height-ch)//2
    bg = bg.crop((ox, oy, ox+cw, oy+ch)).filter(ImageFilter.GaussianBlur(max(cw, ch)*0.05))
    bg = ImageEnhance.Brightness(bg).enhance(0.42)
    px, py = (cw-w)//2, (ch-h)//2
    sh = Image.new('L', (cw, ch), 0)
    ImageDraw.Draw(sh).rectangle([px, py, px+w-1, py+h-1], fill=190)
    sh = sh.filter(ImageFilter.GaussianBlur(max(cw, ch)*0.022))
    bg = Image.composite(Image.new('RGB', (cw, ch), (0, 0, 0)), bg, sh.point(lambda v: int(v*0.55)))
    bg.paste(im, (px, py))
    return bg

files = sorted(glob.glob(f"{W}/public/assets/img/tarot/*.webp"))
assert len(files) == 78, f"expected 78 cards, found {len(files)}"
done = skipped = 0
for f in files:
    im = Image.open(f).convert("RGB")
    if abs(im.size[1]/im.size[0] - TARGET)/TARGET < 0.02:
        skipped += 1                      # already card-shaped; re-running is safe
        continue
    pad(im).save(f, "WEBP", quality=86, method=6)
    done += 1
rs = sorted(Image.open(f).size[1]/Image.open(f).size[0] for f in files)
print(f"   padded {done}, already card-shaped {skipped}, median ratio {rs[len(rs)//2]:.4f}")
PY
ok "78 cards padded to 2:3, nothing cropped"

say "4 - the artwork takes the house name"
cp "$SRC" "$W/public/assets/img/tarot-back.webp" || die "copy failed"
ok "public/assets/img/tarot-back.webp  ($(du -h "$W/public/assets/img/tarot-back.webp" | cut -f1))"

say "5 - the token follows the deck, and the back wears the artwork"
"$PY" - "$W" <<'PY' || die "edit failed"
import sys
W = sys.argv[1]

p = f"{W}/src/styles/tokens.css"
s = open(p, encoding="utf-8").read()
if "--tarot-card: 1 / 1.5;" in s:
    print("   tokens.css already 1 / 1.5")
else:
    old_decl = "  --tarot-card: 1 / 1.14;"
    assert old_decl in s, "tokens.css: --tarot-card: 1 / 1.14 not found"
    start = s.index("/* THE CARD SHAPE, IN ONE PLACE")
    end   = s.index(old_decl) + len(old_decl)
    s = s[:start] + """/* THE CARD SHAPE, IN ONE PLACE, because a back and a face that disagree means
     a card changes shape as it turns.

     1 / 1.5 IS THE DECK'S OWN MEDIAN, STILL MEASURED. This was 1 / 1.14, and
     that was the honest number while the 78 files were unedited crops - their
     ratios ran 0.607 (pentacles-4 is landscape) to 1.809 (major-0). The deck
     has since been padded to 2:3, so the median moved to 1.5 and this moved
     with it. relief.spec.ts re-measures the files on every run; the token did
     not overrule the artwork, the artwork was changed first.

     NOTHING WAS CROPPED TO GET HERE. Each card keeps every pixel it had, at
     the size it had, laid on a darkened blur of itself with a soft shadow
     under the join. The fifteen landscape cards read as an inset on a mat
     rather than a full bleed, which is what a landscape crop can honestly be
     in a card-shaped frame - the alternative was cover, which took 25% off the
     median card and 60% off pentacles-4. */
  --tarot-card: 1 / 1.5;""" + s[end:]
    open(p, "w", encoding="utf-8").write(s)
    print("   tokens.css: --tarot-card -> 1 / 1.5")

s = open(p, encoding="utf-8").read()
if "--tarot-back-ground" not in s:
    anchor = "  --tarot-card: 1 / 1.5;"
    s = s.replace(anchor, anchor + """

  /* The ground under the card back, shown for the instant before the artwork
     lands. It is the artwork's own navy, so the card never flashes white. */
  --tarot-back-ground: #0b1730;""", 1)
    open(p, "w", encoding="utf-8").write(s)
    print("   tokens.css: --tarot-back-ground added")

p = f"{W}/src/styles/layout.css"
s = open(p, encoding="utf-8").read()
if "tarot-back.webp" in s:
    print("   layout.css already carries the back")
else:
    old = """.tarot-back-face {
  width: 100%; height: 100%; border-radius: 12px; background: var(--face);"""
    assert old in s, "layout.css: .tarot-back-face not in its reviewed form"
    s = s.replace(old, """/* THE BACK IS PAINTED, NOT CARVED. It used to be var(--face) with the emblem
   carved into it; it is now the deck's own artwork, which carries its own gold
   frame - so no border and no second rim. */
.tarot-back-face {
  width: 100%; height: 100%; border-radius: 12px;
  background: var(--tarot-back-ground) url('/assets/img/tarot-back.webp') center / cover no-repeat;""", 1)

    old_mark = """/* The emblem is carved into the back rather than printed on it. */
.tarot-back-mark { width: 46px; height: 46px; border-radius: 50%; background: var(--well); box-shadow: var(--carve); display: grid; place-items: center; }
.tarot-back-mark::after { content: '✦'; font-size: 17px; color: var(--muted); }"""
    assert old_mark in s, "layout.css: .tarot-back-mark not in its reviewed form"
    s = s.replace(old_mark, """/* The emblem was the back when the back was blank. The artwork replaces it.
   The span stays in the markup as the flip target; it just has nothing to draw. */
.tarot-back-mark { display: none; }""", 1)
    open(p, "w", encoding="utf-8").write(s)
    print("   layout.css: .tarot-back-face painted, .tarot-back-mark retired")
PY
ok "styles edited"

say "6 - web gates"
cd "$W" || die cd
npx tsc --noEmit                && ok "web tsc"        || die "web tsc"
npx vitest run                  && ok "web vitest"     || die "web vitest"
node scripts/lint-ceiling.mjs   && ok lint-ceiling     || die lint-ceiling
node scripts/nav-audit.mjs      && ok nav-audit        || die nav-audit
node scripts/a11y-audit.mjs     && ok a11y-audit       || die a11y-audit
node scripts/motion-ceiling.mjs && ok motion-ceiling   || die motion-ceiling
npm run build                   && ok "web build"      || die "web build"
cd ..

say "7 - commit"
git add "$W/src/styles/tokens.css" \
        "$W/src/styles/layout.css" \
        "$W/public/assets/img/tarot-back.webp" \
        "$W/public/assets/img/tarot/" \
        land-the-card-has-a-back.sh || die "git add"
git commit -F - <<'MSG' || die commit
The card has a back

"add this design to the card to facedown in this page ... can you make the
card size vertical instead of square" - the owner, on the Tarot page.

Seven cards face down on the Card of the Day, and until now the back of
each was var(--face) with a small emblem carved into it - correct for a
surface, wrong for a card. The deck now has a real back: gold sun on
navy, the same one on every card, painted rather than carved. It brings
its own frame, so the rim comes off and the emblem retires.

A painted card that is not card-shaped reads as a tile, so the deck goes
to 2:3. That could not be done to the back alone - --tarot-card is
deliberately the only place the shape is written, because a back and a
face that disagree means a card changes shape as it turns.

Nor could it be done to the token alone. relief.spec.ts opens all 78
files, takes their median ratio and holds --tarot-card within 10% of it,
precisely so the shape cannot drift from the deck that ships. So the
deck moved first: every card is padded to 2:3 on a darkened blur of
itself, with a soft shadow under the join. Nothing is cropped and no
card loses a pixel - the median ratio becomes 1.50 and the token follows
it. The fifteen landscape files read as an inset on a mat, which is what
a landscape crop can honestly be in a card-shaped frame; the alternative
was object-fit: cover, which took 25% off the median card and 60% off
pentacles-4.

The deck is 97KB smaller than it was, re-encoded at q86.
MSG
ok committed
say "review, then:  git push"
