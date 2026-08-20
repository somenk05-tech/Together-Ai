#!/bin/bash
# land-districts-az.sh (v2) — "Walk the districts" runs A to Z, by the name on
# the plate rather than by the key underneath it.
#
# WHY THIS IS A VERIFY-AND-COMMIT RATHER THAN A PATCH. v1 applied its patch,
# failed tsc and left the tree dirty: it inserted the sorted list ABOVE the
# array it sorts, which is a temporal-dead-zone error the author should have
# caught and did not. The block has since been moved below PANELS in the
# working tree. So this script writes no code — it checks the file on disk is
# byte-for-byte the corrected version, runs every gate, and commits.
#
# FRONTEND ONLY (together-city-react). Push, and Vercel ships it.
set -euo pipefail

cd "$(dirname "$0")"
[ -d together-city-react ] || { echo "!! Run this from the Together-Ai repo root."; exit 1; }

# A Cowork session read this repo's status over the file bridge, which cannot
# unlink, so an empty .git/index.lock may be sitting there blocking every git
# command. Removing a zero-byte lock is safe when no git process is running.
if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  echo "== clearing a stale empty .git/index.lock"
  rm -f .git/index.lock
fi

NEEDS="The districts are walked in alphabetical order"
case "$(git log --oneline -40)" in
  *"$NEEDS"*) echo "== \"$NEEDS\" is already here. Nothing to do."; exit 0 ;;
esac

# ── The file, byte for byte ─────────────────────────────────────────────────
WANT="d7e2fe836d8d9e8b0ec902189d1ca96524f9e5739d14b495695a994d85779483"
GOT="$(shasum -a 256 together-city-react/src/pages/Home.tsx | awk '{print $1}')"
if [ "$GOT" != "$WANT" ]; then
  echo "!! Home.tsx is not the version this script verified."
  echo "   want $WANT"
  echo "   got  $GOT"
  echo "   Somebody has edited it since. Nothing committed — look at the diff first."
  exit 1
fi
echo "== Home.tsx verified"

# ── The tree ────────────────────────────────────────────────────────────────
# The icon set and the APK belong to ANOTHER session's work and are none of
# this script's business: they are allowed to sit there, and they are not
# staged or committed below. Anything else stops this.
ALLOWED='^( M together-city-react/src/pages/Home\.tsx| M together-city-react/public/assets/img/(apple-touch-icon-180|tc-icon-1024|tc-icon-192|tc-icon-512|tc-icon-maskable-512)\.png| M together-city-react/public/downloads/TogetherCity\.apk)$'
DIRTY="$(git status --porcelain \
  | grep -Ev '^\?\? (land-.*\.sh|push-.*\.sh|.*\.patch)$' \
  | grep -Ev "$ALLOWED" || true)"
if [ -n "$DIRTY" ]; then
  echo "!! The tree carries changes this script did not expect:"; echo "$DIRTY"; exit 1
fi
echo "== tree is what was expected (the icon work is left untouched)"

# ── The order, checked before the build rather than after the deploy ────────
node - <<'ORDER'
const want = ['Astrology','Beauty','E-Commerce','Entertainment','Financial','Fitness','Jobs','Local Services','Matchmaking','Medical','Nutrition','Real Estate','Social Life','Travel'];
const got = [...want].sort((a, b) => a.localeCompare(b));
if (JSON.stringify(want) !== JSON.stringify(got)) {
  console.error('!! The expected order is not the order localeCompare produces.');
  console.error('   expected:', want.join(' · '));
  console.error('   sorted:  ', got.join(' · '));
  process.exit(1);
}
console.log('== A to Z:', got.join(' · '));
ORDER

cd together-city-react
npx tsc --noEmit
npx vitest run
node scripts/a11y-audit.mjs
node scripts/lint-ceiling.mjs
npx vite build
cd ..

git add together-city-react/src/pages/Home.tsx
git commit -F - <<'MSG'
The districts are walked in alphabetical order

The owner asked for "Walk the districts" to be sorted A to Z. It was in a
hand-typed order that started with Travel and ended with E-Commerce — somebody's
sense of a good opening rather than anything a visitor could predict. The hub
tabs directly above the run have been alphabetical all along, so the two lists
disagreed on screen.

SORTED BY WHAT THE PLATE SAYS, NOT BY THE KEY UNDERNEATH IT. This is the whole
subtlety. A district's billboard name is not its key and not always its hub
name: `dating` reads "Matchmaking" and belongs under M, `services` reads "Local
Services" and belongs under L, `ecommerce` has no hub config at all. Sorting
the keys would have produced a list that is alphabetical in the source and
visibly scrambled on the page, which is worse than leaving it alone.

So `districtName()` now owns that three-source fallback — billboard copy, hub
config, then the one literal for E-Commerce — and both the sort and the
rendered <h2> read from it. They cannot disagree, because there is nothing left
to disagree with.

AND IT IS SORTED, NOT RETYPED. A hand-ordered array would be correct today and
quietly wrong the first time a district is renamed — one plate in the wrong
place, which nobody reports. `PANELS` keeps its own order because it answers a
different question: which districts exist and which photograph each wears.

The run now reads: Astrology, Beauty, E-Commerce, Entertainment, Financial,
Fitness, Jobs, Local Services, Matchmaking, Medical, Nutrition, Real Estate,
Social Life, Travel.

A NOTE ON HOW THIS LANDED, BECAUSE IT DID NOT LAND CLEANLY. The first attempt
inserted the sorted constant ABOVE the array it sorts — a temporal dead zone,
caught by tsc on the owner's machine rather than by the author, who wrote the
patch by line offset and never compiled it. The block was moved below PANELS
and this commit is the verified result. The lesson is the boring one: a patch
that reorders declarations is not a text edit, and the type checker is the only
thing that knows the difference.

ONE CONSEQUENCE WORTH NAMING: E-Commerce is the only district with no rooms
behind it, and alphabetically it lands third — so the third plate a visitor
walks past says "Coming soon". That is what alphabetical means here; it was not
overlooked. Sinking the unbuilt districts to the end is one comparator clause
away if it reads badly.

tsc clean, vitest all green, a11y 0, lint at ceiling, vite build clean.

MSG
echo "== committed"

echo
echo "==============================================================="
echo " Landed: $NEEDS — push and Vercel ships it."
echo " The icon PNGs and the APK are still uncommitted; they belong"
echo " to another session's work and were deliberately left alone."
echo "==============================================================="
