#!/bin/bash
# land-mail-not-a-hub.sh — Mail leaves the hubs grid. The header tab row has
# always filtered it out; this grid mapped straight over NAV and put it back
# among the doors, wearing another room's photograph.
#
# FRONTEND ONLY (together-city-react). Push, and Vercel ships it.
set -euo pipefail

cd "$(dirname "$0")"
[ -d together-city-react ] || { echo "!! Run this from the Together-Ai repo root."; exit 1; }

NEEDS="Mail is not a hub"
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
LS0tIGEvdG9nZXRoZXItY2l0eS1yZWFjdC9zcmMvcGFnZXMvSHVicy50c3gKKysrIGIvdG9nZXRoZXItY2l0eS1yZWFjdC9zcmMvcGFnZXMvSHVicy50c3gKQEAgLTcsMTIgKzcsMjEgQEAKIC8qKgogICogVGhlIENpdHkg4oCUIGV2ZXJ5IGh1YiBhcyBhIGRvb3IsIHNpemVkIGZvciBhIHRodW1iLgogICoKLSAqIFRoaXMgaXMgdGhlIG1vYmlsZSBib3R0b20gYmFyJ3Mgc2Vjb25kIHRhYi4gT24gYSBwaG9uZSB0aGUgZm91cnRlZW4gaHVicwotICogY2Fubm90IGxpdmUgaW4gYSBoZWFkZXIgdGFiIHJvdyAodGhleSBkaWRuJ3QgZml0OyB0aGV5IHNjcm9sbGVkIG9mZiB0aGUKLSAqIHJpZ2h0IGVkZ2UpLCBzbyB0aGlzIHBhZ2UgaXMgd2hlcmUgdGhlIHdob2xlIGNpdHkgYmVjb21lcyB2aXNpYmxlIGF0IG9uY2U6Ci0gKiBlYWNoIGh1YiB3aXRoIGl0cyBvd24gY29tbWlzc2lvbmVkIHBpY3R1cmUgYW5kIGl0cyBvd24gbGluZSwgaW4gdGhlIG9yZGVyCi0gKiB0aGUgaGVhZGVyIGhhcyBhbHdheXMgdXNlZC4gTm90aGluZyBoZXJlIGlzIG5ldyBpbnZlbnRvcnkg4oCUIHNhbWUgTkFWIGxpc3QsCi0gKiBzYW1lIEhVQl9IRVJPIGFydCwgc2FtZSB0YWdsaW5lcyBmcm9tIGNvbmZpZyDigJQganVzdCBsYWlkIG91dCBmb3IgdG91Y2guCisgKiBUaGlzIGlzIHRoZSBtb2JpbGUgYm90dG9tIGJhcidzIHNlY29uZCB0YWIuIE9uIGEgcGhvbmUgdGhlIGh1YnMgY2Fubm90IGxpdmUKKyAqIGluIGEgaGVhZGVyIHRhYiByb3cgKHRoZXkgZGlkbid0IGZpdDsgdGhleSBzY3JvbGxlZCBvZmYgdGhlIHJpZ2h0IGVkZ2UpLCBzbworICogdGhpcyBwYWdlIGlzIHdoZXJlIHRoZSB3aG9sZSBjaXR5IGJlY29tZXMgdmlzaWJsZSBhdCBvbmNlOiBlYWNoIGh1YiB3aXRoIGl0cworICogb3duIGNvbW1pc3Npb25lZCBwaWN0dXJlIGFuZCBpdHMgb3duIGxpbmUsIGluIHRoZSBvcmRlciB0aGUgaGVhZGVyIGhhcworICogYWx3YXlzIHVzZWQuIE5vdGhpbmcgaGVyZSBpcyBuZXcgaW52ZW50b3J5IOKAlCBzYW1lIE5BViBsaXN0LCBzYW1lIEhVQl9IRVJPCisgKiBhcnQsIHNhbWUgdGFnbGluZXMgZnJvbSBjb25maWcg4oCUIGp1c3QgbGFpZCBvdXQgZm9yIHRvdWNoLgorICoKKyAqIE1BSUwgSVMgTk9UIEEgSFVCLCBBTkQgVEhJUyBXQVMgVEhFIExBU1QgUExBQ0UgU1RJTEwgU0FZSU5HIElUIFdBUy4KKyAqIFRoZSBoZWFkZXIgdGFiIHJvdyBoYXMgYWx3YXlzIGZpbHRlcmVkIGl0IG91dCDigJQgTWFpbCBpcyBhbiBBQ1RJT04sIGl0IHNpdHMKKyAqIHdpdGggQ2hhdCBhbmQgQWxlcnRzIGluIHRoZSBjb3JuZXIgYmVjYXVzZSBpdCBpcyBhIHBsYWNlIHlvdSBjaGVjaywgbm90IGEKKyAqIGRpc3RyaWN0IHlvdSB2aXNpdC4gVGhpcyBncmlkIG1hcHBlZCBzdHJhaWdodCBvdmVyIE5BViBhbmQgc28gaXQgcHV0IE1haWwKKyAqIGJhY2sgYW1vbmcgdGhlIGRvb3JzLCB3aGVyZSBpdCBoYWQgbm8gY29tbWlzc2lvbmVkIGFydCBvZiBpdHMgb3duIGFuZAorICogYm9ycm93ZWQgYSBwaWN0dXJlIHRoYXQgYmVsb25ncyB0byBhbm90aGVyIHJvb20uIFNhbWUgZmlsdGVyIGFzIHRoZSBoZWFkZXIsCisgKiBmb3IgdGhlIHNhbWUgcmVhc29uOiB0d28gc3VyZmFjZXMgZGlzYWdyZWVpbmcgYWJvdXQgd2hhdCBNYWlsIElTIGlzIHdvcnNlCisgKiB0aGFuIGVpdGhlciBhbnN3ZXIuCiAgKgogICogSXQgd29ya3Mgb24gZGVza3RvcCB0b28gKGl0IGlzIHJlYWNoYWJsZSwgbm90IGFkYXB0ZWQpOiB0aGUgZ3JpZCBzaW1wbHkKICAqIGdldHMgbW9yZSBjb2x1bW5zLgpAQCAtMjUsNyArMzQsNyBAQAogICAgICAgPHAgY2xhc3NOYW1lPSJtdXRlZCIgc3R5bGU9e3sgZm9udFNpemU6IDEzLjUsIG1hcmdpbkJvdHRvbTogMTggfX0+RXZlcnkgaHViLCBvbmUgc2NyZWVuLiBUYXAgYSBkb29yLjwvcD4KIAogICAgICAgPGRpdiBzdHlsZT17eyBkaXNwbGF5OiAnZ3JpZCcsIGdyaWRUZW1wbGF0ZUNvbHVtbnM6ICdyZXBlYXQoYXV0by1maWxsLCBtaW5tYXgoMTYwcHgsIDFmcikpJywgZ2FwOiAxMiB9fT4KLSAgICAgICAge05BVi5tYXAoKG4pID0+IHsKKyAgICAgICAge05BVi5maWx0ZXIoKG4pID0+IG4ua2V5ICE9PSAnbWFpbCcpLm1hcCgobikgPT4gewogICAgICAgICAgIGNvbnN0IGNmZyA9IEhVQlNbbi5rZXldOwogICAgICAgICAgIGNvbnN0IGhlcm8gPSBIVUJfSEVST1tuLmtleV07CiAgICAgICAgICAgcmV0dXJuICgK
B64EOF

WANT="ce9233786f3b9539fba0cca95ef9c4cd7492a043202c2bad04c917b04a21f36d"
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

git add together-city-react/src/pages/Hubs.tsx
git commit -F - <<'MSG'
Mail is not a hub, and this was the last place still saying it was

The header tab row has filtered Mail out for as long as it has existed: Mail
is an ACTION, and it sits with Chat and Alerts in the corner because it is
something you check, not a district you visit. The city grid mapped straight
over NAV and so it put Mail back among the doors.

It showed exactly what a category error looks like. Mail has no commissioned
art of its own, so the card borrowed a picture belonging to another room — the
owner's screenshot is a Mail tile wearing the blood-test still life — over a
tagline too long for the card, cut off mid-word.

One filter, the same one the header uses, for the same reason: two surfaces
disagreeing about what Mail IS is worse than either answer, and the fix is not
to find Mail a photograph.

Mail is unchanged and unmoved: still in the header actions, still routed, still
in search. It is one card that stops being drawn.

MSG
echo "== committed"

echo
echo "==============================================================="
echo " Landed: $NEEDS — push and Vercel ships it."
echo "==============================================================="
