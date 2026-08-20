#!/bin/bash
# land-wordmark-bigger.sh — the "Together City" wordmark in the header, 35%
# larger. One declaration.
#
# ORDER DOES NOT MATTER. Its hunk is nowhere near the ones in
# land-letter-page.sh or land-observatory-paper.sh, and it was checked against
# the tree both before and after those two. Run it whenever.
#
# FRONTEND ONLY (together-city-react). Push, and Vercel ships it.
set -euo pipefail

cd "$(dirname "$0")"
[ -d together-city-react ] || { echo "!! Run this from the Together-Ai repo root."; exit 1; }

if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  echo "== clearing a stale empty .git/index.lock"
  rm -f .git/index.lock
fi

NEEDS="The city says its name a third louder"
case "$(git log --oneline -40)" in
  *"$NEEDS"*) echo "== \"$NEEDS\" is already here. Nothing to do."; exit 0 ;;
esac

ALLOWED='^ M together-city-react/(public/assets/img/(apple-touch-icon-180|tc-icon-1024|tc-icon-192|tc-icon-512|tc-icon-maskable-512)\.png|public/downloads/TogetherCity\.apk)$'
DIRTY="$(git status --porcelain \
  | grep -Ev '^\?\? (land-.*\.sh|push-.*\.sh|.*\.patch)$' \
  | grep -Ev "$ALLOWED" || true)"
if [ -n "$DIRTY" ]; then
  echo "!! The tree carries changes this script did not expect:"; echo "$DIRTY"; exit 1
fi

PATCH="$(mktemp "${TMPDIR:-/tmp}/land.XXXXXX")"
trap 'rm -f "$PATCH"' EXIT
cat <<'B64EOF' | tr -d '\n' | openssl base64 -d -A > "$PATCH"
LS0tIGEvdG9nZXRoZXItY2l0eS1yZWFjdC9zcmMvc3R5bGVzL3JlbGllZi5jc3MJMjAyNi0wOC0xMCAxOTo1ODo1MS4zMDMyNDAwMTcgKzAwMDAKKysrIGIvdG9nZXRoZXItY2l0eS1yZWFjdC9zcmMvc3R5bGVzL3JlbGllZi5jc3MJMjAyNi0wOC0xMCAxOTo1ODo1MS4zMjAxMjM3NDQgKzAwMDAKQEAgLTY1NSw5ICs2NTUsMjQgQEAKICAgaGVpZ2h0OiBjbGFtcCgyNnB4LCAyLjR2dywgMzRweCk7IHdpZHRoOiBhdXRvOwogICBmaWx0ZXI6IG5vbmU7CiB9CisvKiBUSEUgTkFNRSBJUyBBIFRISVJEIExBUkdFUiBUSEFOIElUIFdBUywgYXQgdGhlIG93bmVyJ3MgZXllLiAyMuKAkzMwcHggYmVjYW1lCisgICAzMOKAkzQwcHgsIHRoZSBzYW1lIDM1JSBhdCBib3RoIGVuZHMgb2YgdGhlIGNsYW1wIGFuZCBvbiB0aGUgc2xvcGUgYmV0d2VlbgorICAgdGhlbSwgc28gdGhlIHR5cGUgZG9lcyBub3QgY2hhbmdlIHNoYXBlIGFzIHRoZSB3aW5kb3cgbW92ZXMuCisKKyAgIElUIElTIFRBTExFUiBUSEFOIFRIRSBNQVJLIE5PVyBBTkQgVEhBVCBJUyBDT1JSRUNULiA0MHB4IGFnYWluc3QgdGhlCisgICBtb25vZ3JhbSdzIDM0cHggbG9va3MgaW52ZXJ0ZWQgd3JpdHRlbiBkb3duIGFuZCBpcyByaWdodCBvbiBzY3JlZW46IHRoaXMgYm94CisgICBjb250YWlucyB0aGUgVCdzIHN3YXNoIGFib3ZlIHRoZSBsZXR0ZXJzIGFuZCB0aGUgeSdzIHRhaWwgYW5kIHRoZSB1bmRlcmxpbmUKKyAgIGJlbG93IHRoZW0sIHNvIGFib3V0IGhhbGYgb2YgaXQgaXMgZmxvdXJpc2guIFRoZSBsZXR0ZXJzIGluc2lkZSByZWFkIHNtYWxsZXIKKyAgIHRoYW4gdGhlIG1vbm9ncmFtLCB3aGljaCBpcyB0aGUgaGllcmFyY2h5IHRoYXQgd2FzIHdhbnRlZC4KKworICAgTUVBU1VSRUQgQVQgVEhFIENFSUxJTkcsIFdISUNIIElTIFdIRVJFIElUIExBTkRTLiBSb3cgMSBpcyAzNHB4IGFuZCB0aGUgd29yZAorICAgbm93IG92ZXJoYW5ncyBpdCBieSBzaXgg4oCUIGRlbGliZXJhdGVseSwgYmVjYXVzZSBpdCBpcyBpbiBmbG93IGFuZCB0aGUgcm93IGlzCisgICB0aGUgc2hvcnRlciBvZiB0aGUgdHdvIHRoaW5ncyBpbiBpdC4gQXQgMTQ0MCB0aGUgc3dhc2ggZmluaXNoZXMgZXhhY3RseSBvbgorICAgdGhlIHRhYiByb3cncyB0b3AgZWRnZTogdG91Y2hpbmcsIG5vdCBjcm9zc2luZywgd2l0aCB0aGUgdGFicycgb3duIGdseXBocworICAgc3RhcnRpbmcgbG93ZXIgc3RpbGwuIFRoZXJlIGlzIG5vIHJvb20gZm9yIGEgZm91cnRoIGxhcmdlci4gKi8KIC50Yy1sb2dvIC53b3JkIHsKICAgZGlzcGxheTogYmxvY2s7Ci0gIGhlaWdodDogY2xhbXAoMjJweCwgMi4xdncsIDMwcHgpOyB3aWR0aDogYXV0bzsKKyAgaGVpZ2h0OiBjbGFtcCgzMHB4LCAyLjh2dywgNDBweCk7IHdpZHRoOiBhdXRvOwogICBmaWx0ZXI6IG5vbmU7CiB9CiAvKiBCZWxvdyAxMTAwcHggdGhlIGJ1cmdlciB0YWtlcyB0aGUgbGVmdCBjb3JuZXIsIHNvIHRoZSBwYWlyIHRyYXZlbHMK
B64EOF
WANT="397163e3bdb8439f80c390b6e85ab39008d514e3925493fae62635804c420284"
GOT="$(shasum -a 256 "$PATCH" | awk '{print $1}')"
[ "$GOT" = "$WANT" ] || { echo "!! Patch is corrupt."; echo "   want $WANT"; echo "   got  $GOT"; exit 1; }
echo "== patch verified"
git apply --check -C1 "$PATCH" || { echo "!! Patch does not apply cleanly. Nothing written."; exit 1; }
git apply -C1 "$PATCH"
echo "== applied"

cd together-city-react
npx tsc --noEmit
npx vitest run
node scripts/a11y-audit.mjs
node scripts/lint-ceiling.mjs
npx vite build
cd ..

git add together-city-react/src/styles/relief.css
git commit -F - <<'MSG'
The city says its name a third louder

The owner asked for the wordmark 35% larger. `clamp(22px, 2.1vw, 30px)` becomes
`clamp(30px, 2.8vw, 40px)` — the same third at both ends and on the slope
between them, so the type does not change shape as the window moves. That is
the whole change.

IT IS TALLER THAN THE MONOGRAM NOW, WHICH LOOKS WRONG WRITTEN DOWN AND IS RIGHT
ON SCREEN. 40px against the mark's 34px: this box contains the T's swash above
the letters and the y's tail and the underline below them, so roughly half of
it is flourish. The letters inside still read smaller than the monogram, which
is the hierarchy that was wanted when the two were separated.

MEASURED AT THE CEILING, BECAUSE THAT IS WHERE IT LANDS. Row 1 of the header is
34px and the word now overhangs it by six — it is in flow, and the row is the
shorter of the two things in it. Rendered at 1440 in the real cascade: the
swash finishes exactly on the tab row's top edge, touching and not crossing,
with the tabs' own glyphs starting lower again. At 1100 and at 390, where the
mark and the word travel together, the pair ends at 168px against actions that
begin at 258. There is no room for a fourth larger, and this note is here so
the next person asking knows that was checked rather than assumed.

tsc clean, vitest green, a11y 0, lint at ceiling, vite build clean.

MSG
echo "== committed"

echo
echo "==============================================================="
echo " Landed: $NEEDS — push and Vercel ships it."
echo "==============================================================="
