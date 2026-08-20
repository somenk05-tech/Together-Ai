#!/bin/bash
# land-hub-names.sh — the hub's name comes back to the plate's foot, sitting
# directly above its line and at exactly the same size: one step of weight and
# one of ink separate them. Desktop districts and hub landings (>=900px);
# phones keep the frosted card untouched.
#
# FRONTEND ONLY (together-city-react). Push, and Vercel ships it.
set -euo pipefail

cd "$(dirname "$0")"
[ -d together-city-react ] || { echo "!! Run this from the Together-Ai repo root."; exit 1; }

LOG="$(git log --oneline -40)"
MARK="The lockup is one object, so it is one image"
case "$LOG" in
  *"$MARK"*) ;;
  *) echo "!! This patch applies on top of \"$MARK\" — run land-lockup.sh first."; exit 1 ;;
esac
NEEDS="The plate says which room it is"
case "$LOG" in
  *"$NEEDS"*) echo "== \"$NEEDS\" is already here. Nothing to do."; exit 0 ;;
esac
DIRTY="$(git status --porcelain | grep -Ev '^\?\? (land-.*\.sh|push-.*\.sh|.*\.patch)$' || true)"
if [ -n "$DIRTY" ]; then
  echo "!! Working tree is dirty. Commit or stash first:"; echo "$DIRTY"; exit 1
fi

PATCH="$(mktemp "${TMPDIR:-/tmp}/land.XXXXXX")"
trap 'rm -f "$PATCH"' EXIT
cat <<'B64EOF' | tr -d '\n' | openssl base64 -d -A > "$PATCH"
LS0tIGEvdG9nZXRoZXItY2l0eS1yZWFjdC9zcmMvc3R5bGVzL3JlbGllZi5jc3MKKysrIGIvdG9nZXRoZXItY2l0eS1yZWFjdC9zcmMvc3R5bGVzL3JlbGllZi5jc3MKQEAgLTEwNzgsMTUgKzEwNzgsMjkgQEAKICAgICBwYWRkaW5nOiBjbGFtcCgyMnB4LCAyLjJ2dywgMzRweCkgY2xhbXAoMjRweCwgMi42dncsIDQ0cHgpOwogICAgIGJhY2tncm91bmQ6IHZhcigtLWNhcmQpOwogICB9Ci0gIC8qIFRoZSBuYW1lIHN0YXlzIGluIHRoZSBkb2N1bWVudCBmb3IgdGhlIGNpdGl6ZW4gd2hvIGNhbm5vdCBzZWUgdGhlCi0gICAgIGJ1aWxkaW5nIOKAlCBhIHNjcmVlbiByZWFkZXIgZ2V0cyB0aGUgaGVhZGluZywgYW5kIG9uIHRoZSBob21lcGFnZSBpdCBpcwotICAgICBhbHNvIHRoZSBhY2Nlc3NpYmxlIG5hbWUgb2YgdGhlIGxpbmsuIEhpZGluZyBpdCB3aXRoIGBkaXNwbGF5OiBub25lYAotICAgICB3b3VsZCB0YWtlIGl0IGZyb20gdGhlbSB0b28uICovCiAgIC5odWItcGxhdGUgLmh1Yi1wbGF0ZS1zYWlkIHsgZGlzcGxheTogYmxvY2s7IG1pbi13aWR0aDogMDsgfQorICAvKiBUSEUgTkFNRSBDT01FUyBCQUNLLCBBVCBUSEUgTElORSdTIE9XTiBTSVpFLgorICAgICBJdCB3YXMgaGlkZGVuIHdoZW4gdGhlIHdvcmRzIGNhbWUgb2ZmIHRoZSBwaG90b2dyYXBoLCBvbiB0aGUgYXJndW1lbnQgdGhhdAorICAgICB0aGUgYnVpbGRpbmcgYWxyZWFkeSB3ZWFycyBpdHMgbmFtZSDigJQgYW5kIHRoYXQgaXMgc3RpbGwgdHJ1ZSBvZiB0aGUKKyAgICAgUElDVFVSRS4gSXQgd2FzIG5vdCB0cnVlIG9mIHRoZSBmb290LCB3aGVyZSB0aGUgbGluZSBzYXQgYWxvbmUgd2l0aAorICAgICBub3RoaW5nIHNheWluZyB3aGljaCByb29tIGl0IGJlbG9uZ3MgdG87IGEgY2l0aXplbiBzY3JvbGxpbmcgZm91cnRlZW4gb2YKKyAgICAgdGhlc2UgcmVhZHMgZm91cnRlZW4gcHJvbWlzZXMgYW5kIG5vIGFkZHJlc3Nlcy4KKyAgICAgVGhlIG93bmVyJ3MgaW5zdHJ1Y3Rpb24gd2FzIGV4YWN0OiB0aGUgc2FtZSBzaXplIGFzIHRoZSBsaW5lLiBXaGljaCBtZWFucworICAgICB0aGUgc2VwYXJhdGlvbiBjYW5ub3QgY29tZSBmcm9tIHNjYWxlLCBzbyBpdCBjb21lcyBmcm9tIHRoZSBvbmx5IHR3byBvdGhlcgorICAgICB0aGluZ3MgYSBtb25vY2hyb21lIGNpdHkgaGFzIOKAlCBvbmUgc3RlcCBvZiB3ZWlnaHQgYW5kIG9uZSBvZiBpbmsuIEFueSBtb3JlCisgICAgIHRoYW4gdGhhdCBhbmQgdGhlIG5hbWUgc3RhcnRzIGJlY29taW5nIGEgaGVhZGxpbmUgYWdhaW4sIHdoaWNoIGlzIHRoZQorICAgICB0aGluZyB0aGF0IHdhcyByZW1vdmVkLgorICAgICBJdCBpcyBhbHNvLCBxdWlldGx5LCB0aGUgYWNjZXNzaWJpbGl0eSBmaXg6IHRoaXMgaGVhZGluZyBpcyB0aGUgYWNjZXNzaWJsZQorICAgICBuYW1lIG9mIHRoZSBob21lcGFnZSdzIGxpbmssIGFuZCBpdCBpcyBub3cgdmlzaWJsZSB0byBldmVyeWJvZHkgcmF0aGVyCisgICAgIHRoYW4gb25seSB0byBhIHNjcmVlbiByZWFkZXIuICovCiAgIC5odWItcGxhdGUgLmh1Yi1wbGF0ZS1zYWlkIGgxLAogICAuaHViLXBsYXRlIC5odWItcGxhdGUtc2FpZCBoMiB7Ci0gICAgcG9zaXRpb246IGFic29sdXRlOyB3aWR0aDogMXB4OyBoZWlnaHQ6IDFweDsgbWFyZ2luOiAtMXB4OwotICAgIG92ZXJmbG93OiBoaWRkZW47IGNsaXAtcGF0aDogaW5zZXQoNTAlKTsgd2hpdGUtc3BhY2U6IG5vd3JhcDsKKyAgICBwb3NpdGlvbjogc3RhdGljOyB3aWR0aDogYXV0bzsgaGVpZ2h0OiBhdXRvOyBvdmVyZmxvdzogdmlzaWJsZTsKKyAgICBjbGlwLXBhdGg6IG5vbmU7IHdoaXRlLXNwYWNlOiBub3JtYWw7CisgICAgbWFyZ2luOiAwIDAgMnB4OworICAgIGZvbnQtc2l6ZTogY2xhbXAoMTZweCwgMS4zdncsIDIwcHgpOyBsaW5lLWhlaWdodDogMS4zNTsKKyAgICBmb250LXdlaWdodDogNzAwOyBsZXR0ZXItc3BhY2luZzogMDsgdGV4dC10cmFuc2Zvcm06IG5vbmU7CisgICAgY29sb3I6IHZhcigtLWluayk7IHRleHQtc2hhZG93OiBub25lOwogICB9CiAgIC5odWItcGxhdGUgLmh1Yi1wbGF0ZS1zYWlkIHAgewogICAgIG1hcmdpbjogMDsgbWF4LXdpZHRoOiA2MmNoOwo=
B64EOF

WANT="3913cee32da854a8bd582d10d5906529b600bd26cad443ea035c6479a8f6b8c2"
GOT="$(shasum -a 256 "$PATCH" | awk '{print $1}')"
[ "$GOT" = "$WANT" ] || { echo "!! Patch is corrupt."; echo "   want $WANT"; echo "   got  $GOT"; exit 1; }
echo "== patch verified"
git apply --check -C1 "$PATCH" || { echo "!! Patch does not apply cleanly. Nothing written."; exit 1; }
git apply -C1 "$PATCH"
echo "== applied"

cd together-city-react
npx tsc --noEmit
npx vitest run
npx eslint src || true
node scripts/lint-ceiling.mjs
node scripts/dead-export-audit.mjs
node scripts/motion-ceiling.mjs
node scripts/a11y-audit.mjs
node scripts/nav-audit.mjs
npx vite build
cd ..

git add together-city-react/src/styles/relief.css
git commit -F - <<'MSG'
The plate says which room it is

The name came off the picture two commits ago on the argument that the
building already wears it — and that is still true of the PICTURE. It was not
true of the FOOT, where the line sat alone with nothing saying which room it
belongs to. A citizen scrolling fourteen plates read fourteen promises and no
addresses: "Your world, planned your way" is a lovely sentence and it is not a
door with a sign on it.

So the name returns, above the line, in the foot. The owner's instruction was
exact — the same size as the line — which is the interesting constraint,
because it takes scale off the table as a way of separating them. What is left
in a black-and-white city is one step of weight and one step of ink: the name
at 700 in --ink, the line at 400 in --ink-soft, two pixels apart. Any more
separation than that and the name starts becoming a headline again, which is
the thing that was removed.

Names are the ones already in the data — Travel, Astrology, Matchmaking — so
no copy is invented here and the homepage and the landing keep speaking from
one source.

QUIETLY, IT IS ALSO THE ACCESSIBILITY FIX. That heading was visually hidden
but present, because on the homepage it is the accessible NAME of the link
that wraps the whole plate. It was doing a job nobody could see. It now does
the same job in the open, which is strictly better than a screen-reader-only
string a sighted citizen never gets.

Scoped >=900px like everything else in this block, so "The districts wear
glass" keeps the phone exactly as it is.

relief.spec 26/26, suite green, vite build clean, all ceilings unchanged.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019qSREyzo69hB7j1ryn26SB
MSG
echo "== committed"

echo
echo "==============================================================="
echo " Landed: $NEEDS — push and Vercel ships it."
echo " Name above the line, same size, all fourteen plates."
echo "==============================================================="
