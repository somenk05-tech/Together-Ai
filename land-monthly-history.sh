#!/bin/bash
# land-monthly-history.sh — the monthly letters get an archive endpoint, so the
# page can hand somebody back the months they have already been sent.
#
# BACKEND ONLY (together-city-chat). This ships on Railway, not Vercel — the
# push is the same, the rail is not.
#
# RUN THIS BEFORE land-letter-archive.sh. The page that reads this endpoint is
# in that one, and a page shipped first would ask for a route that 404s.
set -euo pipefail

cd "$(dirname "$0")"
[ -d together-city-chat ] || { echo "!! Run this from the Together-Ai repo root."; exit 1; }

if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  echo "== clearing a stale empty .git/index.lock"
  rm -f .git/index.lock
fi

NEEDS="A month is kept as long as a month is remembered"
LOG="$(git log --oneline -40)"
case "$LOG" in
  *"$NEEDS"*) echo "== \"$NEEDS\" is already here. Nothing to do."; exit 0 ;;
esac
case "$LOG" in
  *"A letter is short or it is an article"*) ;;
  *) echo "!! Run land-letter-short.sh first — this is written against the tree it produces."; exit 1 ;;
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
ZGlmZiAtLWdpdCBhL3RvZ2V0aGVyLWNpdHktY2hhdC9zcmMvYXN0cm9sb2d5L2FzdHJvbG9neS5jb250cm9sbGVyLnRzIGIvdG9nZXRoZXItY2l0eS1jaGF0L3NyYy9hc3Ryb2xvZ3kvYXN0cm9sb2d5LmNvbnRyb2xsZXIudHMKaW5kZXggZDg5ZmU2Ni4uYzAyMGZiMSAxMDA2NDQKLS0tIGEvdG9nZXRoZXItY2l0eS1jaGF0L3NyYy9hc3Ryb2xvZ3kvYXN0cm9sb2d5LmNvbnRyb2xsZXIudHMKKysrIGIvdG9nZXRoZXItY2l0eS1jaGF0L3NyYy9hc3Ryb2xvZ3kvYXN0cm9sb2d5LmNvbnRyb2xsZXIudHMKQEAgLTgwLDYgKzgwLDEyIEBAIGV4cG9ydCBjbGFzcyBBc3Ryb2xvZ3lDb250cm9sbGVyIHsKICAgICByZXR1cm4gdGhpcy5hc3Ryb2xvZ3kubW9udGhseSh1c2VyLnN1Yik7CiAgIH0KIAorICAvKiogU2F2ZWQgbW9udGhseSBsZXR0ZXJzICh0aGUgbGFzdCB0d28geWVhcnMgb2YgdGhlbSkuICovCisgIEBHZXQoJ21vbnRobHkvaGlzdG9yeScpCisgIG1vbnRobHlIaXN0b3J5KEBDdXJyZW50VXNlcigpIHVzZXI6IEp3dFVzZXIpIHsKKyAgICByZXR1cm4gdGhpcy5hc3Ryb2xvZ3kubW9udGhseUhpc3RvcnkodXNlci5zdWIpOworICB9CisKICAgLyoqCiAgICAqIFdoYXQgdGhlIG5leHQgY29uc3VsdGF0aW9uIGNvc3RzLCBiZWZvcmUgYW55Ym9keSB3cml0ZXMgb25lLgogICAgKgpkaWZmIC0tZ2l0IGEvdG9nZXRoZXItY2l0eS1jaGF0L3NyYy9hc3Ryb2xvZ3kvYXN0cm9sb2d5LnNlcnZpY2UudHMgYi90b2dldGhlci1jaXR5LWNoYXQvc3JjL2FzdHJvbG9neS9hc3Ryb2xvZ3kuc2VydmljZS50cwppbmRleCAwNzQ1MWQ3Li42YWYxNzM4IDEwMDY0NAotLS0gYS90b2dldGhlci1jaXR5LWNoYXQvc3JjL2FzdHJvbG9neS9hc3Ryb2xvZ3kuc2VydmljZS50cworKysgYi90b2dldGhlci1jaXR5LWNoYXQvc3JjL2FzdHJvbG9neS9hc3Ryb2xvZ3kuc2VydmljZS50cwpAQCAtNDYyLDYgKzQ2MiwyMyBAQCBleHBvcnQgY2xhc3MgQXN0cm9sb2d5U2VydmljZSB7CiAgICAgcmV0dXJuIHsgbmVlZHNQcm9maWxlOiBmYWxzZSBhcyBjb25zdCwgcGVuZGluZzogZmFsc2UgYXMgY29uc3QsIC4uLmxldHRlciB9OwogICB9CiAKKyAgLyoqCisgICAqIEV2ZXJ5IG1vbnRoIGJlZm9yZSB0aGlzIG9uZSwgbmV3ZXN0IGZpcnN0LgorICAgKgorICAgKiBUV0VOVFktRk9VUiBSQVRIRVIgVEhBTiBUSEUgREFJTFknUyBUSElSVFksIGFuZCB0aGUgdHdvIG51bWJlcnMgbWVhbiB0aGUKKyAgICogc2FtZSB0aGluZzogYWJvdXQgYXMgbXVjaCBhcyBhIHBlcnNvbiB3b3VsZCB0aGluayBvZiBhcyAidGhlIGxldHRlcnMgSQorICAgKiBoYXZlIGJlZW4gc2VudCIuIFRoaXJ0eSBkYXlzIGlzIGEgbW9udGggb2YgZGFpbGllczsgdHdlbnR5LWZvdXIgbW9udGhzIGlzCisgICAqIHR3byB5ZWFycyBvZiBtb250aGxpZXMsIGFuZCBhIG1vbnRobHkgbGV0dGVyIGlzIHRoZSBraW5kIHNvbWVib2R5IGdvZXMKKyAgICogYmFjayB0byBhIHllYXIgbGF0ZXIuCisgICAqCisgICAqIFRoZSByb3dzIGNhcnJ5IGBtb250aGAg4oCUICJBdWd1c3QgMjAyNiIsIHdyaXR0ZW4gb3V0IGF0IHRoZSB0aW1lIHRoZSBsZXR0ZXIKKyAgICogd2FzIOKAlCBzbyB0aGUgYXJjaGl2ZSBwcmludHMgdGhlIG1vbnRoIHRoZSBsZXR0ZXIgd2FzIEZPUiByYXRoZXIgdGhhbgorICAgKiByZS1kZXJpdmluZyBvbmUgZnJvbSBhIGtleSBpbiB3aGF0ZXZlciB0aW1lem9uZSB0aGUgYnJvd3NlciBpcyBpbi4KKyAgICovCisgIGFzeW5jIG1vbnRobHlIaXN0b3J5KHVzZXJJZDogc3RyaW5nKSB7CisgICAgcmV0dXJuIHRoaXMucmVjZW50TGV0dGVycyh1c2VySWQsICdtb250aGx5JywgMjQpOworICB9CisKICAgcHJpdmF0ZSBhc3luYyB3cml0ZU1vbnRobHlMZXR0ZXIocm93OiBBc3Ryb1Byb2ZpbGVSb3csIHVzZXJJZDogc3RyaW5nLCBsb2NhbDogRGF0ZSk6IFByb21pc2U8RGF0ZWRMZXR0ZXIgfCBudWxsPiB7CiAgICAgY29uc3QgY2hhcnQgPSB0aGlzLmNoYXJ0T2Yocm93KTsKICAgICBjb25zdCBhc3RybyA9IHNjYW5Nb250aChjaGFydCwgbG9jYWwuZ2V0VVRDRnVsbFllYXIoKSwgbG9jYWwuZ2V0VVRDTW9udGgoKSArIDEpOwo=
B64EOF
WANT="569977b63292f62c0d794f4f4835d6b810b379435c29c17d399636f923acdd58"
GOT="$(shasum -a 256 "$PATCH" | awk '{print $1}')"
[ "$GOT" = "$WANT" ] || { echo "!! Patch is corrupt."; echo "   want $WANT"; echo "   got  $GOT"; exit 1; }
echo "== patch verified"
git apply --check -C1 "$PATCH" || { echo "!! Patch does not apply cleanly. Nothing written."; exit 1; }
git apply -C1 "$PATCH"
echo "== applied"

cd together-city-chat
npx tsc --noEmit
# JEST, NOT VITEST. This backend runs jest; the react app is the vitest one and
# they live in the same repository.
npx jest src/astrology
cd ..

git add together-city-chat/src/astrology/astrology.service.ts \
        together-city-chat/src/astrology/astrology.controller.ts
git commit -F - <<'MSG'
A month is kept as long as a month is remembered

The daily letters have had an archive endpoint since they were written. The
monthly ones never did, and nobody noticed because the page never asked — it
rendered this month and nothing else, so every letter before it was in the
database and unreachable.

That is the wrong way round. A daily letter is read on the day it arrives; a
monthly one is the kind somebody goes back to in November to see what August
said. Of the two archives, this is the one that was worth more, and it is the
one that did not exist.

THREE LINES, BECAUSE THE WORK WAS ALREADY DONE. `recentLetters()` has always
taken `kind` — it is how the writer is shown the last two months so it does not
repeat itself — and it orders by the period key, which for a monthly row is
`v6:2026-08` and sorts newest-first as a string. So this is the same call the
writer already makes, with a bigger `take` and a route in front of it. No
query, no migration, no shape of its own.

TWENTY-FOUR MONTHS AGAINST THE DAILY'S THIRTY DAYS, and the two numbers are
the same intention: roughly what a person would think of as "the letters I have
been sent". Thirty days is a month of dailies. Two years is a fair answer for
something that arrives twelve times a year, and a monthly letter from last
autumn is a thing somebody might genuinely go looking for.

THE ROWS ALREADY CARRY THEIR OWN MONTH NAME. `month` — "August 2026" — is
stored on the letter at the time it is written, from the citizen's own clock.
The archive prints that rather than re-deriving a name from the key, because
deriving it in the browser means deriving it in the browser's timezone, and
`new Date('2026-08')` is UTC midnight — the previous month for everybody west
of Greenwich. The letter says which month it was for; nothing downstream has to
work it out again.

No test file: this is a pass-through to a helper the letter suite already
covers, exactly as `dailyHistory` is, and a spec asserting that one method
calls another with the number 24 is a spec that fails when the number changes
for a good reason.

tsc clean, the astrology jest suite green (thirteen spec files, 139 tests).

MSG
echo "== committed"

echo
echo "==============================================================="
echo " Landed: $NEEDS"
echo " GET /astrology/monthly/history — two years of letters."
echo " Backend, so this is Railway. Run land-letter-archive.sh next."
echo "==============================================================="
