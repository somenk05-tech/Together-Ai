#!/usr/bin/env bash
# land-the-page-has-a-cover.sh  ·  run from the REPO ROOT
#
# "exterior left and interior black right ... the name and nothing else"
# - the owner, on the passport's visa pages.
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
git log --oneline -80 | grep -q 'The page has a cover' && die "already landed - re-running is a no-op by design"
ok "this is new"

say "2 - scope"
FILES="$W/src/styles/tokens.css $W/src/styles/relief.css \
$W/src/features/profile/components/Passport.tsx"
DIRTY="$(git status --porcelain -- $FILES || true)"
[ -z "$DIRTY" ] || { printf '   \033[31mx\033[0m these already have uncommitted changes:\n%s\n' "$DIRTY"; die "stop"; }
ok "the files this touches are clean"

say "3 - the cover"
cd "$W" || die cd
python3 - <<'PY' || die "edits failed"
import sys, re
def rd(p): return open(p, encoding='utf-8').read()
def wr(p, s): open(p, 'w', encoding='utf-8').write(s)
def swap(path, old, new, label):
    s = rd(path)
    if old not in s:
        print(f'   {label}: already done'); return False
    wr(path, s.replace(old, new, 1)); print(f'   {label}'); return True

T = 'src/styles/tokens.css'
if '--pg-ground' not in rd(T):
    swap(T, "  --dur-fast: 130ms; --dur-base: 220ms; --dur-slow: 420ms;",
"""  /* THE VISA PAGE'S INTERIOR. A cover has an outside and an inside, and the
     inside of this one is dark — so it needs its own ink, because --ink on a
     near-black ground is unreadable and --card is the cover, not the page.
     Four names rather than a re-pointed ground: re-pointing --ground is a hub
     privilege, granted to three hubs by name, and this is a component. */
  --pg-ground: #101010;
  --pg-ink:    #f4f4f2;
  --pg-soft:   #a5a5a1;
  --pg-line:   #2a2a29;

  --dur-fast: 130ms; --dur-base: 220ms; --dur-slow: 420ms;""",
 'tokens.css: the interior inks')

R = 'src/styles/relief.css'
swap(R,
""".pvisa {
  position: relative; overflow: hidden; isolation: isolate;
  display: flex; flex-direction: column;
  min-height: 164px; padding: 14px 16px; text-decoration: none; color: inherit;
  border-radius: var(--r-2); background: var(--card); box-shadow: var(--e1);
  transition: transform var(--dur-base) var(--ease-out), box-shadow var(--dur-base) var(--ease-out);
}""",
""".pvisa {
  position: relative; isolation: isolate; z-index: 1;
  display: flex; flex-direction: column;
  min-height: 164px; padding: 14px 16px; text-decoration: none;
  border-radius: var(--r-2); background: var(--pg-ground); color: var(--pg-ink);
  box-shadow: var(--e1); perspective: 1500px;
  transition: transform var(--dur-base) var(--ease-out), box-shadow var(--dur-base) var(--ease-out);
}
/* A LEAF THAT SWINGS PAST ITS OWN EDGE MUST PASS OVER ITS NEIGHBOURS, not
   under them. `overflow: hidden` is gone from this rule for the same reason —
   it would clip the cover to the card and the turn would read as a wipe. */
.pvisa:hover { z-index: 5; }""",
 'relief.css: the page is the interior')

swap(R,
"""/* A visa page is cut from the middle of the same sheet — 260% and off-centre
   so no crop can catch the mark, the seal or the spine strip, which belong to
   the data page and would read as fourteen copies of them here. */
.pvisa {
  background-image: var(--passport-paper);
  background-size: 260% auto; background-position: 34% 38%;
}""",
"""/* THE PAPER MOVED TO THE COVER. A visa page used to be cut from the middle of
   the same sheet; now the sheet is what you see before you open it, and the
   page under it is dark and plain. The crop is unchanged — 260% and
   off-centre, so no crop catches the mark, the seal or the spine strip, which
   belong to the data page and would read as fourteen copies of them here. */""",
 'relief.css: the paper leaves the page')

swap(R,
""".pvisa .phead { display: flex; align-items: baseline; gap: 8px; border-bottom: 1px solid var(--line); padding-bottom: 8px; }
.pvisa .pcode { font-size: 9.5px; font-weight: 700; letter-spacing: .16em; color: var(--ink-soft); }""",
""".pvisa .phead { display: flex; align-items: baseline; gap: 8px; border-bottom: 1px solid var(--pg-line); padding-bottom: 8px; }
.pvisa .pcode { font-size: 9.5px; font-weight: 700; letter-spacing: .16em; color: var(--pg-soft); }""",
 'relief.css: the head reads on black')

swap(R,
""".pvisa .psum, .pvisa .pnone { font-size: 12.5px; line-height: 1.55; margin: 10px 76px 0 0; }
.pvisa .psum { color: var(--ink); }
.pvisa .pnone { color: var(--ink-soft); }""",
""" /* No stamp to clear any more, so the summary takes the whole measure. */
.pvisa .psum, .pvisa .pnone { font-size: 12.5px; line-height: 1.55; margin: 12px 0 0; }
.pvisa .psum { color: var(--pg-ink); }
.pvisa .pnone { color: var(--pg-soft); }""",
 'relief.css: the summary takes the measure')

s = rd(R)
old_foot = """  font-size: 9.5px; font-weight: 700; letter-spacing: .13em; text-transform: uppercase; color: var(--faint);
}"""
if '.pvisa .pfoot' in s and old_foot in s:
    i = s.index('.pvisa .pfoot')
    j = s.index(old_foot, i) + len(old_foot)
    s = s[:i] + s[i:j].replace('color: var(--faint);', 'color: var(--pg-soft);') + s[j:]
    wr(R, s); print('   relief.css: the foot reads on black')

if '.pcover' not in rd(R):
    s = rd(R)
    anchor = '.pvisa:active { transform: translateY(1px); }'
    s = s.replace(anchor, anchor + """

/* ══ THE COVER ═══════════════════════════════════════════════════════════
   /profile is a travel document and a document has a cover. This is the
   passport's own paper, the hub's name, and nothing else — a cover that
   carries the summary is a cover with no reason to open.

   PAST 90 DEGREES A LEAF SHOWS ITS BACK, and a back with a name on it renders
   the name mirrored. `backface-visibility: hidden` means the cover ceases to
   exist the moment it turns edge-on, which also stops it intercepting the
   pointer once it is out of the way.

   HOVER ONLY, and gated the way the lift above it is gated. A phone has no
   pointer, so the cover never renders there and the grid is exactly the page —
   which is the right answer rather than a fallback, because a cover you cannot
   open is a cover that hides fourteen pages for good. */
.pcover {
  position: absolute; inset: 0; z-index: 2; border-radius: var(--r-2);
  background: var(--card); background-image: var(--passport-paper);
  background-size: 260% auto; background-position: 12% 20%;
  border: 1px solid var(--line); box-shadow: var(--e2);
  display: grid; place-items: center; padding: 20px;
  transform-origin: left center;
  backface-visibility: hidden; -webkit-backface-visibility: hidden;
  transition: transform var(--dur-slow) var(--ease-out), box-shadow var(--dur-slow) var(--ease-out);
}
.pcover b { font-size: 19px; font-weight: 700; letter-spacing: -.015em; text-align: center; color: var(--ink); }
/* The spine it turns on. */
.pcover::before {
  content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px;
  border-radius: var(--r-2) 0 0 var(--r-2); background: rgb(0 0 0 / .10);
}
@media (hover: hover) and (pointer: fine) {
  .pvisa:hover .pcover { transform: rotateY(-105deg); box-shadow: var(--e3); }
}
@media (prefers-reduced-motion: reduce) { .pcover { transition: none; } }""", 1)
    wr(R, s); print('   relief.css: the cover')

P = 'src/features/profile/components/Passport.tsx'
swap(P,
"""      {/* Short enough to fit a 66px disc at every zoom. "TOGETHER CITY" set
          round a stamp this size is four wrapped lines of nothing. */}
      <span className={issued ? 'pstamp' : 'pstamp waiting'} aria-hidden="true">
        {issued ? <><b>{page.complete ? 'VALID' : 'ISSUED'}</b>TC</> : <>No<b>ENTRY</b></>}
      </span>

""", "", 'Passport.tsx: the stamp comes off')

swap(P,
"""      <div className="pfoot">
        <span>{page.percent != null ? `Complete ${page.percent}%` : 'No record'}</span>
        <span>Enter →</span>
      </div>
    </Link>""",
"""      <div className="pfoot">
        <span>{page.percent != null ? `Complete ${page.percent}%` : 'No record'}</span>
        <span>Enter →</span>
      </div>

      {/* The cover, last in the source so it sits over the page without a
          z-index race. aria-hidden because the name is already the link's
          own accessible text — a screen reader announcing it twice is the
          decoration leaking into the content. */}
      <span className="pcover" aria-hidden="true"><b>{page.label}</b></span>
    </Link>""",
 'Passport.tsx: the cover goes on')

swap(R,
"""   Everything is achromatic but the stamps, which take the root accent. Real
   visa pages differ by STAMP and by wording, not by repainting the paper. */""",
"""   IT USED TO SAY "everything is achromatic but the stamps, which take the
   root accent — real visa pages differ by STAMP and by wording, not by
   repainting the paper." The stamps are gone (owner, 19 Aug) and the sentence
   went with them rather than being left to argue for something that is no
   longer on the screen.

   WHAT REPLACED THEM IS A COVER, which is a stronger version of the same
   claim. A stamp says a page has been issued; a cover says a page is a page,
   and the book still holds fourteen of them under one bearer. The paper moved
   from the page to the cover, the page went dark, and the difference between
   an issued page and an empty one is now what the page SAYS — a summary, or
   the sentence inviting you to open the hub once. Still achromatic; still no
   page repainted to mean something. */""",
 'relief.css: the passport comment stops arguing for the stamps')
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
git add $FILES land-the-page-has-a-cover.sh || die "git add"
git commit -F - <<'MSG' || die commit
The page has a cover

"exterior left and interior black right ... the name and nothing else"
- the owner, on the passport's visa pages.

/profile is a travel document and a document has a cover. Each visa page
now wears one: the passport's own paper, the hub's name, and nothing
else. It turns back on its spine to the page underneath, which is dark
and plain and carries everything the card carried before.

A COVER THAT CARRIES THE SUMMARY IS A COVER WITH NO REASON TO OPEN, which
is why the name is alone on it - and why the stamp came off rather than
moving onto it. The difference between an issued page and an empty one is
now what the page SAYS: a summary, or the sentence inviting you to open
the hub once. The comment above the passport rules used to argue that
everything here is achromatic but the stamps; it has been rewritten
rather than left to justify something no longer on the screen.

THREE THINGS THE ORIGINAL EFFECT COULD NOT DO, and they are the reason
this is not a paste. Past 90 degrees a leaf shows its back, and a back
with a name on it renders the name mirrored - backface-visibility hides
it the moment it turns edge-on, which also stops it intercepting the
pointer once it is out of the way. A leaf that swings past its own edge
slid UNDER the card to its left, so the hovered card lifts above the grid
for the duration. And the interior needed its own ink: --ink on a
near-black ground is unreadable and --card is the cover, so --pg-ground,
--pg-ink, --pg-soft and --pg-line live in tokens.css. Four component
names rather than a re-pointed --ground, which is a hub privilege granted
to three hubs by name.

Timing is --dur-slow and the depths are --e1/--e2/--e3 rather than the
0.5s and the hand-written shadow the source used: motion-ceiling counts
duration literals and relief.spec draws every surface at one of five
named depths. The ceiling stays at 17.

Hover only, gated exactly as the lift above it is gated. A phone has no
pointer, so the cover never renders there and the grid is simply the
page - the right answer rather than a fallback, because a cover nobody
can open is a cover that hides fourteen pages for good.
MSG
ok committed
say "review, then:  git push"
