#!/bin/bash
# land-welcome-line.sh — the homepage welcome line becomes the owner's copy.
# One <p> in Home.tsx, which is the same page phones and desktops both read,
# so this is one change for both.
#
# FRONTEND ONLY (together-city-react). Push, and Vercel ships it.
set -euo pipefail

cd "$(dirname "$0")"
[ -d together-city-react ] || { echo "!! Run this from the Together-Ai repo root."; exit 1; }

NEEDS="Say what the city does, not what it feels like"
LOG="$(git log --oneline -40)"
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
LS0tIGEvdG9nZXRoZXItY2l0eS1yZWFjdC9zcmMvcGFnZXMvSG9tZS50c3gKKysrIGIvdG9nZXRoZXItY2l0eS1yZWFjdC9zcmMvcGFnZXMvSG9tZS50c3gKQEAgLTE1OCw3ICsxNTgsNyBAQAogICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPSJleWVicm93IiBzdHlsZT17eyBmb250U2l6ZTogJ2NsYW1wKDE0cHgsIDEuNXZ3LCAxOHB4KScsIGxldHRlclNwYWNpbmc6ICcwLjIyZW0nIH19PldlbGNvbWUgdG8gVG9nZXRoZXIgQ2l0eTwvZGl2PgogICAgICAgICAgIDxoMSBzdHlsZT17eyBtYXhXaWR0aDogJzIyY2gnLCBtYXJnaW46ICcwIGF1dG8nLCBmb250U2l6ZTogJ2NsYW1wKDM0cHgsIDUuMnZ3LCA2NHB4KScsIGxpbmVIZWlnaHQ6IDEuMSB9fT5BIHBlcnNvbmFsaXplZCBlbmdpbmUgZm9yIGV2ZXJ5IGFzcGVjdCBvZiB5b3VyIGxpZmUuPC9oMT4KICAgICAgICAgICA8cCBjbGFzc05hbWU9ImxlZGUiIHN0eWxlPXt7IG1hcmdpbjogJzIycHggYXV0byAwJywgZm9udFNpemU6ICdjbGFtcCgxOHB4LCAxLjl2dywgMjNweCknLCBsaW5lSGVpZ2h0OiAxLjYsIG1heFdpZHRoOiAnNThjaCcgfX0+Ci0gICAgICAgICAgICBFdmVyeSBodWIgYmVsb25ncyB0byB0aGUgc2FtZSBjaXR5IGJ1dCBjYXJyaWVzIGl0cyBvd24gYXRtb3NwaGVyZS4gV2FsayB0aGUgd2F0ZXJmcm9udCwgc3RlcCBpbnRvIGEgcGF2aWxpb24sIGFuZCBldmVyeXRoaW5nIOKAlCB0cmF2ZWwsIGRpbmluZywgaGVhbHRoLCBob21lLCB3b3JrLCBsb3ZlIOKAlCBpcyBwZXJzb25hbGlzZWQgYXJvdW5kIG9uZSBpZGVudGl0eTogeW91cnMuCisgICAgICAgICAgICBTZXQgeW91ciBwcmVmZXJlbmNlcyBvbmNlLCBhbmQgZXZlcnkgc2VydmljZSBpbiBUb2dldGhlciBDaXR5IGlzIHBlcnNvbmFsaXplZCBqdXN0IGZvciB5b3UuIE5vIG1vcmUgcmFuZG9tIGJyb3dzaW5nLgogICAgICAgICAgIDwvcD4KICAgICAgICAgICA8ZGl2IHN0eWxlPXt7IG1hcmdpblRvcDogMzAsIGRpc3BsYXk6ICdmbGV4JywgZ2FwOiAxNCwganVzdGlmeUNvbnRlbnQ6ICdjZW50ZXInLCBmbGV4V3JhcDogJ3dyYXAnIH19PgogICAgICAgICAgICAge2F1dGhlZCA/ICgK
B64EOF

WANT="32ed467fde277ccfbf7dfdbf37a5ccde26881cdf9bf8fda8504987878651ffb4"
GOT="$(shasum -a 256 "$PATCH" | awk '{print $1}')"
[ "$GOT" = "$WANT" ] || { echo "!! Patch is corrupt."; echo "   want $WANT"; echo "   got  $GOT"; exit 1; }
echo "== patch verified"
git apply --check -C1 "$PATCH" || { echo "!! Patch does not apply cleanly. Nothing written."; exit 1; }
git apply -C1 "$PATCH"
echo "== applied"

cd together-city-react
npx tsc --noEmit
npx vitest run
npx vite build
cd ..

git add together-city-react/src/pages/Home.tsx
git commit -F - <<'MSG'
Say what the city does, not what it feels like

The welcome line was atmosphere: "Walk the waterfront, step into a pavilion,
and everything is personalised around one identity: yours." Lovely, and it
described a mood rather than a mechanism — a first-time visitor finished it
knowing how the place felt and not what it would do for them.

The owner's replacement says the actual promise and how it is kept:

  Set your preferences once, and every service in Together City is
  personalized just for you. No more random browsing.

One <p> in Home.tsx, and Home.tsx is the page phones and desktops both read,
so web and mobile change together. Verified this sentence exists nowhere else
in the tree — a second copy of a promise is how a product ends up making two.

Copy is the owner's, verbatim, including its spelling of "personalized",
which now matches the h1 directly above it that always said it that way.

MSG
echo "== committed"

echo
echo "==============================================================="
echo " Landed: $NEEDS — push and Vercel ships it."
echo "==============================================================="
