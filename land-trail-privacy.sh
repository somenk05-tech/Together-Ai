#!/bin/bash
# land-trail-privacy.sh — HEAD is red. "A database key is not a page title"
# taught MessageView to file the mail SUBJECT into the recent-pages trail, and
# did it without asking who is signed in — which is the one thing
# recent-privacy.test.ts exists to forbid. This adds the auth gate.
#
# RUN THIS FIRST. Nothing else can pass its vitest gate until it does.
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

NEEDS="A subject line is not filed for a stranger"
case "$(git log --oneline -40)" in
  *"$NEEDS"*) echo "== \"$NEEDS\" is already here. Nothing to do."; exit 0 ;;
esac

# The swipe work is sitting uncommitted in this tree and is not this script's
# business — it is allowed through, everything else is not.
DIRTY="$(git status --porcelain \
  | grep -Ev '^\?\? (land-.*\.sh|push-.*\.sh|.*\.patch)$' \
  | grep -Ev '^( M together-city-react/src/features/dating/pages/DatingChats\.tsx|\?\? together-city-react/src/app/motion-props-name-their-timing\.test\.ts)$' \
  || true)"
if [ -n "$DIRTY" ]; then
  echo "!! The tree carries changes this script did not expect:"; echo "$DIRTY"; exit 1
fi

PATCH="$(mktemp "${TMPDIR:-/tmp}/land.XXXXXX")"
trap 'rm -f "$PATCH"' EXIT
cat <<'B64EOF' | tr -d '\n' | openssl base64 -d -A > "$PATCH"
LS0tIGEvdG9nZXRoZXItY2l0eS1yZWFjdC9zcmMvZmVhdHVyZXMvbWFpbC9wYWdlcy9NZXNzYWdlVmlldy50c3gJMjAyNi0wOC0xMCAxMzo1OToyNi40ODA2NTgzOTAgKzAwMDAKKysrIGIvdG9nZXRoZXItY2l0eS1yZWFjdC9zcmMvZmVhdHVyZXMvbWFpbC9wYWdlcy9NZXNzYWdlVmlldy50c3gJMjAyNi0wOC0xMCAxMzo1OToyNi40OTY4MTE1NTAgKzAwMDAKQEAgLTIsNiArMiw3IEBACiBpbXBvcnQgeyB1c2VTY2FsZUxvY2sgfSBmcm9tICdAL2hvb2tzL3VzZVNjYWxlTG9jayc7CiBpbXBvcnQgeyB1c2VOYXZpZ2F0ZSwgdXNlUGFyYW1zIH0gZnJvbSAncmVhY3Qtcm91dGVyLWRvbSc7CiBpbXBvcnQgeyB1c2VSZWNlbnRTdG9yZSB9IGZyb20gJ0Avc3RvcmUvcmVjZW50LnN0b3JlJzsKK2ltcG9ydCB7IHVzZUF1dGhTdG9yZSB9IGZyb20gJ0Avc3RvcmUvYXV0aC5zdG9yZSc7CiBpbXBvcnQgeyB1c2VRdWVyeSB9IGZyb20gJ0B0YW5zdGFjay9yZWFjdC1xdWVyeSc7CiBpbXBvcnQgeyBCdXR0b24sIEVtcHR5U3RhdGUsIFNwaW5uZXIgfSBmcm9tICdAL2NvbXBvbmVudHMvdWknOwogaW1wb3J0IHsgbWFpbEFwaSB9IGZyb20gJy4uL2FwaSc7CkBAIC0yMDEsMTMgKzIwMiwyMCBAQAogICAgICBoZXJlLCB0aGUgc2FtZSBlbnRyeSBpcyBmaWxlZCBhZ2FpbiB1bmRlciBpdHMgb3duIHN1YmplY3Qg4oCUIHRoZSBzdG9yZQogICAgICBkZS1kdXBlcyBieSBwYXRoLCBzbyB0aGlzIHJlcGxhY2VzIHJhdGhlciB0aGFuIHJlcGVhdHMg4oCUIGFuZCAiQ29udGludWUKICAgICAgd2hlcmUgeW91IGxlZnQgb2ZmIiBvZmZlcnMgYSBsaW5lIHRoZSBjaXRpemVuIHdyb3RlIG9yIHJlYWQgaW5zdGVhZCBvZiBhCi0gICAgIGtleSBmcm9tIGEgZGF0YWJhc2UuICovCisgICAgIGtleSBmcm9tIGEgZGF0YWJhc2UuCisKKyAgICAgQU5EIElUIEZJTEVTIE5PVEhJTkcgRk9SIEEgU1RSQU5HRVIuIFRoZSB0cmFpbCBpcyBvbmUgY2l0aXplbidzIHByaXZhdGUKKyAgICAgbW92ZW1lbnRzIGFuZCBpdCByZW5kZXJzIG9uIGEgcHVibGljIGhvbWVwYWdlOyByZWNlbnQtcHJpdmFjeS50ZXN0LnRzCisgICAgIG1ha2VzIGV2ZXJ5IFJFQURFUiBvZiBpdCBjb25zdWx0IHRoZSBhdXRoIHN0b3JlLCBhbmQgYSB3cml0ZXIgdGhhdCBydW5zCisgICAgIHdoaWxlIG5vYm9keSBpcyBzaWduZWQgaW4gaXMgdGhlIHNhbWUgbGVhayBhcnJpdmluZyBvbmUgc3RlcCBlYXJsaWVyIOKAlAorICAgICBhIHN1YmplY3QgbGluZSBmcm9tIHRoZSBsYXN0IHNlc3Npb24sIHdhaXRpbmcgb24gYSBzaGFyZWQgbWFjaGluZS4gKi8KICAgY29uc3QgcmVjb3JkUmVjZW50ID0gdXNlUmVjZW50U3RvcmUoKHMpID0+IHMucmVjb3JkKTsKKyAgY29uc3QgYXV0aGVkRm9yVHJhaWwgPSB1c2VBdXRoU3RvcmUoKHMpID0+IEJvb2xlYW4ocy50b2tlbnM/LmFjY2Vzc1Rva2VuICYmIHMudXNlcikpOwogICBjb25zdCBzdWJqZWN0ID0gcS5kYXRhPy5zdWJqZWN0OwogICB1c2VFZmZlY3QoKCkgPT4gewotICAgIGlmICghaWQgfHwgIXN1YmplY3QpIHJldHVybjsKKyAgICBpZiAoIWF1dGhlZEZvclRyYWlsIHx8ICFpZCB8fCAhc3ViamVjdCkgcmV0dXJuOwogICAgIHJlY29yZFJlY2VudCh7IHBhdGg6IGAvbWFpbC9tZXNzYWdlLyR7aWR9YCwgbGFiZWw6IHN1YmplY3QsIGh1YjogJ21haWwnIH0pOwotICB9LCBbaWQsIHN1YmplY3QsIHJlY29yZFJlY2VudF0pOworICB9LCBbYXV0aGVkRm9yVHJhaWwsIGlkLCBzdWJqZWN0LCByZWNvcmRSZWNlbnRdKTsKICAgLyoqCiAgICAqIFdISUNIIE1FU1NBR0VTIEFSRSBPUEVOLCBBTkQgV0hPIERFQ0lERVMuCiAgICAqCg==
B64EOF

WANT="0b8d5fe82d97563343246d05983bc38b58f5c7373f2ea20673e8d0e4df2f689b"
GOT="$(shasum -a 256 "$PATCH" | awk '{print $1}')"
[ "$GOT" = "$WANT" ] || { echo "!! Patch is corrupt."; echo "   want $WANT"; echo "   got  $GOT"; exit 1; }
echo "== patch verified"
git apply --check -C1 "$PATCH" || { echo "!! Patch does not apply cleanly. Nothing written."; exit 1; }
git apply -C1 "$PATCH"
echo "== applied"

cd together-city-react
npx tsc --noEmit
# The one that was failing. Run it alone first so the fix is visible before
# the other 446 tests scroll it off the screen.
npx vitest run src/app/recent-privacy.test.ts
npx vitest run
node scripts/a11y-audit.mjs
npx vite build
cd ..

git add together-city-react/src/features/mail/pages/MessageView.tsx
git commit -F - <<'MSG'
A subject line is not filed for a stranger

HEAD was red. "A database key is not a page title" gave MessageView the right
idea — file the mail SUBJECT into the recent-pages trail so "Continue where you
left off" offers a line a person wrote instead of a database key — and shipped
it without asking who is signed in. `recent-privacy.test.ts` caught it
immediately and has been failing ever since.

The rule that test enforces is about READERS: anything rendering the trail must
consult the auth store, because the trail is one citizen's private movements
and the homepage it appears on is public. A WRITER that runs while nobody is
signed in is the same leak arriving one step earlier — the subject of the last
person's mail, sitting in local storage on a shared machine, waiting to be
rendered to whoever opens the laptop next. Mail subjects are the most revealing
strings in this application; "Connect with Blood Test" was the example that
started this rule.

So the effect gates on the same expression every other reader uses —
`Boolean(s.tokens?.accessToken && s.user)` — and the comment above it now says
why, so the next person to add a `recordRecent` call has the reason in front of
them rather than a test failure behind them.

Nothing else changes: the subject is still filed, still de-duped by path, still
replaces the placeholder `useTrackRecent` writes on navigation.

tsc clean, recent-privacy green, vitest 447/447, a11y 0, vite build clean.

MSG
echo "== committed"

echo
echo "==============================================================="
echo " Landed: $NEEDS — HEAD is green again."
echo " Next: land-swipe-finish.sh, then land-tc-mark.sh"
echo "==============================================================="
