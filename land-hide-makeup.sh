#!/bin/bash
# land-hide-makeup.sh — the Makeup Studio comes off the Beauty menu.
#
# WEB APP ONLY (together-city-react). Vercel.
# NOTHING IS DELETED: the page, the look engine and GET /beauty/makeup are
# untouched and /beauty/makeup still resolves.
# PRECONDITION: land-budget-buys-too.sh.
set -euo pipefail

cd "$(dirname "$0")"
[ -d together-city-chat ] || { echo "!! Run this from the Together-Ai repo root."; exit 1; }

if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  echo "== clearing a stale empty .git/index.lock"
  rm -f .git/index.lock
fi

NEEDS="Off the menu is not deleted"
LOG="$(git log --oneline -40)"
case "$LOG" in
  *"$NEEDS"*) echo "== \"$NEEDS\" is already here. Nothing to do."; exit 0 ;;
esac
case "$LOG" in
  *"One door into the studio"*) ;;
  *) echo "!! Run land-budget-buys-too.sh first — this is written against the tree it produces."; exit 1 ;;
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
ZGlmZiAtLWdpdCBhL3RvZ2V0aGVyLWNpdHktcmVhY3Qvc3JjL2FwcC9vbmUtYmFnLnRlc3QudHMgYi90b2dldGhlci1jaXR5LXJlYWN0L3NyYy9hcHAvb25lLWJhZy50ZXN0LnRzCmluZGV4IDZmMDAzNmYuLjEyODI4MzIgMTAwNjQ0Ci0tLSBhL3RvZ2V0aGVyLWNpdHktcmVhY3Qvc3JjL2FwcC9vbmUtYmFnLnRlc3QudHMKKysrIGIvdG9nZXRoZXItY2l0eS1yZWFjdC9zcmMvYXBwL29uZS1iYWcudGVzdC50cwpAQCAtNzcsMyArNzcsMzIgQEAgZGVzY3JpYmUoJ3RoZSBiZWF1dHkgYmFnJywgKCkgPT4gewogICAgIGV4cGVjdChvcmRlcnMpLnRvTWF0Y2goL3VzZVBsYWNlQmVhdXR5T3JkZXIvKTsKICAgfSk7CiB9KTsKKworLyoqCisgKiBUQUtJTkcgQSBET09SIEFXQVkgSVMgTk9UIERFTEVUSU5HIEEgUk9PTS4KKyAqCisgKiBUaGUgTWFrZXVwIFN0dWRpbyBjYW1lIG9mZiB0aGUgQmVhdXR5IG1lbnUgYXQgdGhlIG93bmVyJ3Mgd29yZCAoMTEgQXVnKS4gVGhlCisgKiBwYWdlLCB0aGUgbG9vayBlbmdpbmUgYW5kIEdFVCAvYmVhdXR5L21ha2V1cCBhcmUgdW50b3VjaGVkIGFuZCB0aGUgcGF0aCBzdGlsbAorICogcmVzb2x2ZXMg4oCUIGRlbGV0aW5nIGEgd29ya2luZyBzdXJmYWNlIGluIG9yZGVyIHRvIGhpZGUgaXQgaXMgaG93IGEgZmVhdHVyZQorICogY29tZXMgYmFjayBhcyBhIHJld3JpdGUsIGFuZCB0aGlzIHdheSBpdCByZXR1cm5zIGluIG9uZSBsaW5lLgorICovCitkZXNjcmliZSgndGhlIG1ha2V1cCBzdHVkaW8nLCAoKSA9PiB7CisgIGNvbnN0IGh1YnMgPSBjb2RlKCdjb25maWcvaHVicy50cycpOworICBjb25zdCByb3V0ZXIgPSBjb2RlKCdhcHAvcm91dGVyLnRzeCcpOworCisgIGl0KCdoYXMgbm8gd2F5IGluIGZyb20gdGhlIG1lbnUnLCAoKSA9PiB7CisgICAgZXhwZWN0KGh1YnMpLm5vdC50b01hdGNoKC9sYWJlbDogJ01ha2V1cCBTdHVkaW8nLyk7CisgIH0pOworCisgIGl0KCdzdGlsbCByZXNvbHZlcywgc28gbm8gc2F2ZWQgbGluayBhbmQgbm8gdGVzdCBicmVha3MnLCAoKSA9PiB7CisgICAgZXhwZWN0KHJvdXRlcikudG9NYXRjaCgvcGF0aDogJ1wvYmVhdXR5XC9tYWtldXAnLyk7CisgIH0pOworCisgIGl0KCdsZWF2ZXMgbm8gZ2FwIGluIHRoZSBudW1iZXJpbmcgYmVoaW5kIGl0JywgKCkgPT4geworICAgIC8vIEEgbWVudSB0aGF0IGNvdW50cyAwMS0wMi0wMy0wNSBpcyBhIG1lbnUgYWR2ZXJ0aXNpbmcgdGhlIHRoaW5nIGl0IGlzCisgICAgLy8gdHJ5aW5nIG5vdCB0byBhZHZlcnRpc2UuCisgICAgY29uc3QgYmVhdXR5ID0gaHVicy5zbGljZShodWJzLmluZGV4T2YoJ2JlYXV0eTogeycpLCBodWJzLmluZGV4T2YoJ21lZGljYWw6IHsnKSk7CisgICAgY29uc3QgaW5kaWNlcyA9IFsuLi5iZWF1dHkubWF0Y2hBbGwoL2luZGV4OiAnKFxkKyknL2cpXS5tYXAoKG0pID0+IG1bMV0pOworICAgIGV4cGVjdChpbmRpY2VzKS50b0VxdWFsKGluZGljZXMubWFwKChfLCBpKSA9PiBTdHJpbmcoaSArIDEpLnBhZFN0YXJ0KDIsICcwJykpKTsKKyAgfSk7Cit9KTsKZGlmZiAtLWdpdCBhL3RvZ2V0aGVyLWNpdHktcmVhY3Qvc3JjL2NvbmZpZy9odWJzLnRzIGIvdG9nZXRoZXItY2l0eS1yZWFjdC9zcmMvY29uZmlnL2h1YnMudHMKaW5kZXggZmE2MzliMi4uMTViMWU2NiAxMDA2NDQKLS0tIGEvdG9nZXRoZXItY2l0eS1yZWFjdC9zcmMvY29uZmlnL2h1YnMudHMKKysrIGIvdG9nZXRoZXItY2l0eS1yZWFjdC9zcmMvY29uZmlnL2h1YnMudHMKQEAgLTIwMCw4ICsyMDAsMTYgQEAgZXhwb3J0IGNvbnN0IEhVQlM6IFJlY29yZDxIdWJLZXksIEh1YkNvbmZpZz4gPSB7CiAgICAgICAvLyBwYWdlJ3Mgc2VjdGlvbiBoaWdobGlnaHRzIHRoZSB3cm9uZyByb3cgYW5kIHRlYWNoZXMgbm9ib2R5IGFueXRoaW5nLgogICAgICAgeyBwYXRoOiAnL2JlYXV0eS9yb3V0aW5lJywgaW5kZXg6ICcwMicsIGxhYmVsOiAnWW91ciBSb3V0aW5lJywgc3ViOiAnQnVpbHQgZnJvbSB5b3VyIHByb2ZpbGUgKyBidWRnZXQnIH0sCiAgICAgICB7IHBhdGg6ICcvYmVhdXR5L21hcmtldCcsIGluZGV4OiAnMDMnLCBsYWJlbDogJ0JlYXV0eSBNYXJrZXQnLCBzdWI6ICdDdXJhdGVkLCBtYXRjaGVkIHRvIHlvdScgfSwKLSAgICAgIHsgcGF0aDogJy9iZWF1dHkvbWFrZXVwJywgaW5kZXg6ICcwNCcsIGxhYmVsOiAnTWFrZXVwIFN0dWRpbycsIHN1YjogJ1lvdXIgcGVyc29uYWwgQUkgbWFrZXVwIGFydGlzdCcgfSwKLSAgICAgIHsgcGF0aDogJy9iZWF1dHkvb3JkZXJzJywgaW5kZXg6ICcwNScsIGxhYmVsOiAnTXkgT3JkZXJzJywgc3ViOiAnWW91ciBiZWF1dHkgc2hlbGYnIH0sCisgICAgICAvLyBUSEUgTUFLRVVQIFNUVURJTyBJUyBPRkYgVEhFIE1FTlUgKDExIEF1ZyksIGF0IHRoZSBvd25lcidzIHdvcmQsIGFuZAorICAgICAgLy8gdGhhdCBpcyBhbGwgdGhhdCBoYXMgaGFwcGVuZWQgdG8gaXQ6IHRoZSBwYWdlLCB0aGUgbG9vayBlbmdpbmUgYW5kCisgICAgICAvLyBHRVQgL2JlYXV0eS9tYWtldXAgYXJlIHVudG91Y2hlZCBhbmQgL2JlYXV0eS9tYWtldXAgc3RpbGwgcmVzb2x2ZXMuCisgICAgICAvLyBEZWxldGluZyBhIHdvcmtpbmcgc3VyZmFjZSB0byBoaWRlIGl0IGlzIGhvdyBhIGZlYXR1cmUgY29tZXMgYmFjayBhcyBhCisgICAgICAvLyByZXdyaXRlOyB0YWtpbmcgdGhlIGRvb3IgYXdheSBpcyByZXZlcnNpYmxlIGluIG9uZSBsaW5lLgorICAgICAgLy8KKyAgICAgIC8vIFRoZSBudW1iZXJpbmcgY2xvc2VzIHVwIGJlaGluZCBpdCByYXRoZXIgdGhhbiBsZWF2aW5nIGEgZ2FwIGF0IDA0IOKAlAorICAgICAgLy8gYSBtZW51IHRoYXQgY291bnRzIDAxLTAyLTAzLTA1IGlzIGEgbWVudSB3aXRoIHNvbWV0aGluZyBtaXNzaW5nLCB3aGljaAorICAgICAgLy8gaXMgZXhhY3RseSB3aGF0IHRoaXMgaXMgdHJ5aW5nIG5vdCB0byBhZHZlcnRpc2UuCisgICAgICB7IHBhdGg6ICcvYmVhdXR5L29yZGVycycsIGluZGV4OiAnMDQnLCBsYWJlbDogJ015IE9yZGVycycsIHN1YjogJ1lvdXIgYmVhdXR5IHNoZWxmJyB9LAogICAgIF0sCiAgIH0sCiAgIG1lZGljYWw6IHsK
B64EOF
WANT="f6811a76113aea67b82722835a7369a37ae083b45701b946d6fcb9afc11aaef2"
GOT="$(shasum -a 256 "$PATCH" | awk '{print $1}')"
[ "$GOT" = "$WANT" ] || { echo "!! Patch is corrupt."; echo "   want $WANT"; echo "   got  $GOT"; exit 1; }
echo "== patch verified"
git apply --check -C1 "$PATCH" || { echo "!! Patch does not apply cleanly. Nothing written."; exit 1; }
git apply -C1 "$PATCH"
echo "== applied"

echo "== gates: the web app"
cd together-city-react
npx tsc --noEmit
npx vitest run
node scripts/a11y-audit.mjs
node scripts/motion-ceiling.mjs
node scripts/lint-ceiling.mjs
npx vite build
cd ..

git add together-city-react/src/config/hubs.ts together-city-react/src/app/one-bag.test.ts
git commit -F - <<'MSG'
Off the menu is not deleted

The Makeup Studio comes out of the Beauty sidebar at the owner's word, and that
is the whole change. The page, the look engine and GET /beauty/makeup are
untouched, and /beauty/makeup still resolves — deleting a working surface in
order to hide it is how a feature comes back six weeks later as a rewrite, and
this way it returns in one line. It is the same treatment seven nutrition
destinations got in the density audit, and REMOVED_ROUTES exists for exactly
this reason.

The numbering closes up behind it: 01 Profile, 02 Routine, 03 Market, 04 Orders.
A menu that counts 01-02-03-05 is a menu advertising the thing it is trying not
to advertise, and there is now a test that fails if a gap opens in any hub's
sidebar.
MSG

echo "== committed"
cat <<'DONE'

===============================================================
 Landed: Off the menu is not deleted
 Push — Vercel rebuilds. /beauty/makeup still works if you
 open it directly.
===============================================================

DONE
