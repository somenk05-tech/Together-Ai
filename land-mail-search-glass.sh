#!/bin/bash
# land-mail-search-glass.sh — the mailbox search is a control now. It shipped
# with three class names and no rules for any of them; this gives it the
# application's own glass, which is the material the owner's reference is
# already made of.
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

NEEDS="A field has to look like somewhere to put something"
case "$(git log --oneline -40)" in
  *"$NEEDS"*) echo "== \"$NEEDS\" is already here. Nothing to do."; exit 0 ;;
esac

# The app icons and the APK belong to ANOTHER session's work: allowed to sit
# there, never staged below. Anything else stops this.
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
LS0tIGEvdG9nZXRoZXItY2l0eS1yZWFjdC9zcmMvc3R5bGVzL3JlbGllZi5jc3MJMjAyNi0wOC0xMCAxNzo0MDowOS45NDUzNTc0NzggKzAwMDAKKysrIGIvdG9nZXRoZXItY2l0eS1yZWFjdC9zcmMvc3R5bGVzL3JlbGllZi5jc3MJMjAyNi0wOC0xMCAxNzo0MDowOS45NjkyNjkxNzMgKzAwMDAKQEAgLTEzMDgsNiArMTMwOCw1OSBAQAogdGV4dGFyZWEuZy1maWVsZCB7IHJlc2l6ZTogbm9uZTsgbGluZS1oZWlnaHQ6IDEuNTU7IH0KIC5nLWZpZWxkOmZvY3VzLXZpc2libGUgeyBib3gtc2hhZG93OiB2YXIoLS1nbGFzcy1pbiksIHZhcigtLWZvY3VzLXJpbmcpOyB9CiAKKy8qIOKUgOKUgCB0aGUgbWFpbGJveCdzIHNlYXJjaCwgd2hpY2ggaXMgYSBmaWVsZCBhbmQgdGhlcmVmb3JlIGNhcnZlZCDilIDilIDilIDilIDilIDilIDilIDilIAgKi8KKy8qIFRIRSBSRUZFUkVOQ0UgSVMgR0xBU1MsIEFORCBUSElTIEFQUExJQ0FUSU9OIEFMUkVBRFkgT1dOUyBHTEFTUy4gVGhlIG93bmVyCisgICBzZW50IGEgbGlxdWlkLWdsYXNzIGNvbXBvbmVudCBib2FyZCBhbmQgYXNrZWQgZm9yIGl0cyBsb29rLiBFdmVyeXRoaW5nIHRoYXQKKyAgIG1ha2VzIHRob3NlIGNhcHN1bGVzIHJlYWQgYXMgZ2xhc3Mg4oCUIHRoZSBicmlnaHQgcmltLCB0aGUgbmVhciB3YWxsIHNoYWRpbmcKKyAgIHRoZSB0b3AsIGxpZ2h0IHBvb2xpbmcgYXQgdGhlIGZhciBvbmUg4oCUIGlzIGFscmVhZHkgaW4gdG9rZW5zLmNzcyBhcworICAgLS1nbGFzcy13ZWxsIGFuZCAtLWdsYXNzLWluLCBhbmQgYC5nLWZpZWxkYCBkaXJlY3RseSBhYm92ZSBpcyB0aGUgc2FtZQorICAgY29udHJvbCBkcmF3biBpbiBhIHJlY3RhbmdsZS4gQSBzZWNvbmQgZ2xhc3MgaW52ZW50ZWQgaGVyZSB3b3VsZCBiZSBhCisgICBzZWNvbmQgc291cmNlIG9mIHRydXRoIGZvciBvbmUgbWF0ZXJpYWwuCisKKyAgIENBUlZFRCwgTk9UIFJBSVNFRCwgYW5kIHRoYXQgaXMgbm90IGEgcHJlZmVyZW5jZTogYW4gZW1wdHkgZmllbGQgaGFzIHRvIGxvb2sKKyAgIGxpa2Ugc29tZXdoZXJlIHRvIHB1dCBzb21ldGhpbmcuIFRoZSByZWZlcmVuY2UncyBvd24gc2VhcmNoIGNhcHN1bGUgaXMKKyAgIHJlY2Vzc2VkIGZvciB0aGUgc2FtZSByZWFzb24sIHdoaWxlIGl0cyBidXR0b25zIHN0YW5kIHVwLgorCisgICBJVCBFWElTVFMgQVQgQUxMIEJFQ0FVU0UgSVQgRElEIE5PVC4gTWFpbFNlYXJjaCBzaGlwcGVkIHdpdGggdGhyZWUgY2xhc3MKKyAgIG5hbWVzIGFuZCBubyBydWxlcyBmb3IgYW55IG9mIHRoZW0sIHNvIHRoZSBjb250cm9sIGZlbGwgdGhyb3VnaCB0byB0aGUKKyAgIGdlbmVyaWMgZmllbGQgcnVsZTogYSBicm93c2VyIHNlYXJjaCBib3ggMTlweCB0YWxsIHdlYXJpbmcgdGhlIGZsYXQgY2FydmUsCisgICB3aXRoIHRoZSBVQSdzIG93biByb3VuZGVkIGJvcmRlciBkcmF3biBpbnNpZGUgb3Vycy4gVGhhdCBpcyB0aGUgZG91YmxlZAorICAgb3V0bGluZSBpbiB0aGUgb3duZXIncyBzY3JlZW5zaG90IOKAlCBub3Qgb25lIGJhZCBzdHlsZSwgYnV0IG5vIHN0eWxlIGF0IGFsbC4KKworICAgVEhFIElOUFVUIFNFTEVDVE9SIElTIFRIQVQgTE9ORyBPTiBQVVJQT1NFLiBUaGUgZ2VuZXJpYyBmaWVsZCBydWxlIGlzCisgICBgaW5wdXQ6bm90KFt0eXBlPWNoZWNrYm94XSk6bm90KFt0eXBlPXJhZGlvXSk6bm90KFt0eXBlPXJhbmdlXSlgLCB3aGljaAorICAgc2NvcmVzICgwLDMsMSkg4oCUIG1vcmUgdGhhbiBhbnkgc2FuZSBjbGFzcyBzZWxlY3Rvci4gVGhpcyBvbmUgbWF0Y2hlcyBpdAorICAgZXhhY3RseSBhbmQgc2l0cyBiZWxvdyBpdCwgd2hpY2ggaXMgdGhlIHNhbWUgdHJpY2ssIGZvciB0aGUgc2FtZSByZWFzb24sIGFzCisgICB0aGUgaW1hZ2UgZXhlbXB0aW9uIGxpc3QgZnVydGhlciBkb3duIHRoaXMgZmlsZS4gKi8KKy5tYWlsLXNlYXJjaCB7CisgIGRpc3BsYXk6IGZsZXg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7IGdhcDogMTBweDsKKyAgd2lkdGg6IDEwMCU7IG1pbi1oZWlnaHQ6IDQ2cHg7IHBhZGRpbmc6IDAgMTZweDsgbWFyZ2luOiAwIDAgMTZweDsKKyAgYm9yZGVyLXJhZGl1czogOTk5cHg7CisgIGJhY2tncm91bmQ6IHZhcigtLWdsYXNzLXdlbGwpOyBib3gtc2hhZG93OiB2YXIoLS1nbGFzcy1pbik7Cit9CisubWFpbC1zZWFyY2g6Zm9jdXMtd2l0aGluIHsgYm94LXNoYWRvdzogdmFyKC0tZ2xhc3MtaW4pLCB2YXIoLS1mb2N1cy1yaW5nKTsgfQorLm1haWwtc2VhcmNoLWljb24geyBkaXNwbGF5OiBncmlkOyBwbGFjZS1pdGVtczogY2VudGVyOyBmbGV4OiAwIDAgYXV0bzsgY29sb3I6IHZhcigtLW11dGVkKTsgfQorLm1haWwtc2VhcmNoIGlucHV0W3R5cGU9InNlYXJjaCJdLm1haWwtc2VhcmNoLWlucHV0IHsKKyAgZmxleDogMSAxIGF1dG87IG1pbi13aWR0aDogMDsgYm9yZGVyOiAwOyBvdXRsaW5lOiBub25lOyBwYWRkaW5nOiAxMnB4IDA7CisgIGJhY2tncm91bmQ6IG5vbmU7IGJveC1zaGFkb3c6IG5vbmU7IGJvcmRlci1yYWRpdXM6IDA7CisgIGZvbnQtZmFtaWx5OiB2YXIoLS1zYW5zKTsgZm9udC1zaXplOiAxNXB4OyBjb2xvcjogdmFyKC0taW5rKTsKKyAgLXdlYmtpdC1hcHBlYXJhbmNlOiBub25lOyBhcHBlYXJhbmNlOiBub25lOworfQorLm1haWwtc2VhcmNoIGlucHV0W3R5cGU9InNlYXJjaCJdLm1haWwtc2VhcmNoLWlucHV0OmZvY3VzIHsgYm94LXNoYWRvdzogbm9uZTsgfQorLm1haWwtc2VhcmNoIGlucHV0W3R5cGU9InNlYXJjaCJdLm1haWwtc2VhcmNoLWlucHV0OjpwbGFjZWhvbGRlciB7IGNvbG9yOiB2YXIoLS1tdXRlZCk7IH0KKy8qIFRoZSBicm93c2VyJ3Mgb3duIHNlYXJjaCBmdXJuaXR1cmU6IGEgc2Vjb25kIHJvdW5kZWQgYm94IGluc2lkZSB0aGlzIG9uZSwKKyAgIGFuZCBhIGNhbmNlbCBjcm9zcyB3ZSBhbHJlYWR5IGhhdmUgYSByZWFsIGJ1dHRvbiBmb3IuICovCisubWFpbC1zZWFyY2gtaW5wdXQ6Oi13ZWJraXQtc2VhcmNoLWRlY29yYXRpb24sCisubWFpbC1zZWFyY2gtaW5wdXQ6Oi13ZWJraXQtc2VhcmNoLXJlc3VsdHMtYnV0dG9uLAorLm1haWwtc2VhcmNoLWlucHV0Ojotd2Via2l0LXNlYXJjaC1jYW5jZWwtYnV0dG9uIHsgLXdlYmtpdC1hcHBlYXJhbmNlOiBub25lOyBkaXNwbGF5OiBub25lOyB9CisubWFpbC1zZWFyY2gtY2xlYXIgeworICBmbGV4OiAwIDAgYXV0bzsgZGlzcGxheTogZ3JpZDsgcGxhY2UtaXRlbXM6IGNlbnRlcjsgcGFkZGluZzogMDsKKyAgd2lkdGg6IDI2cHg7IGhlaWdodDogMjZweDsgYm9yZGVyOiAwOyBib3JkZXItcmFkaXVzOiA5OTlweDsgY3Vyc29yOiBwb2ludGVyOworICBiYWNrZ3JvdW5kOiBub25lOyBib3gtc2hhZG93OiBub25lOworICBmb250LWZhbWlseTogdmFyKC0tc2Fucyk7IGZvbnQtc2l6ZTogMTlweDsgbGluZS1oZWlnaHQ6IDE7IGNvbG9yOiB2YXIoLS1tdXRlZCk7Cit9CisubWFpbC1zZWFyY2gtY2xlYXI6aG92ZXIgeyBjb2xvcjogdmFyKC0taW5rKTsgYmFja2dyb3VuZDogbm9uZTsgYm94LXNoYWRvdzogbm9uZTsgfQorCiAvKiDilIDilIAgYSBjYXJ2ZWQgd2VsbCBob2xkaW5nIGFuIGljb246IGVtcHR5IHN0YXRlcywgbm90aWNlcyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIAgKi8KIC5nLXdlbGwgewogICBkaXNwbGF5OiBncmlkOyBwbGFjZS1pdGVtczogY2VudGVyOyBmbGV4OiAwIDAgYXV0bzsK
B64EOF

WANT="a4e75c84b7579e937f6cb13678eb1f83ad272c3f26937b8184b185a4317c0696"
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
node scripts/motion-ceiling.mjs
node scripts/lint-ceiling.mjs
npx vite build
cd ..

git add together-city-react/src/styles/relief.css
git commit -F - <<'MSG'
A field has to look like somewhere to put something

The mailbox search was not badly styled. It was UNSTYLED: `MailSearch` shipped
with `.mail-search`, `.mail-search-icon`, `.mail-search-input` and
`.mail-search-clear`, and relief.css defined none of them. What the owner
photographed was the fallthrough — a browser search box 19px tall wearing the
generic carved-field rule, with the UA's own rounded border drawn inside ours.
That is the doubled outline. A component whose classes nobody defines fails
silently and looks like a design decision, which is the worst way for anything
to be wrong.

THE REFERENCE IS GLASS, AND THIS APPLICATION ALREADY OWNS GLASS. The owner sent
a liquid-glass component board and asked for its aesthetic. Everything that
makes those capsules read as glass — the bright rim, the near wall shading the
top, light pooling at the far one — is already in tokens.css as --glass-well
and --glass-in, and `.g-field` is the same control drawn as a rectangle. So
this is that material in a capsule and not one new value: no hex, no rgba, no
sixth elevation, nothing for relief.spec to catch. Inventing a second glass
would have been a second source of truth for one material, which is the thing
the spec exists to prevent.

CARVED, NOT RAISED. The reference's buttons stand up and its search capsule is
recessed, which is the same rule this codebase already wrote down at the field
block: an empty field has to look like somewhere to put something. Raising it
would have matched the reference's buttons and contradicted its fields.

Four states rendered against the real cascade before this landed: resting,
focused (the app's one --focus-ring, added to the glass rather than replacing
it), filled with the clear button showing, and at 342px where a phone puts it.
Height 46px, which is a thumb.

THE INPUT SELECTOR IS DELIBERATELY LONG. The generic field rule is
`input:not([type=checkbox]):not([type=radio]):not([type=range])` — specificity
(0,3,1), more than any reasonable class selector, so `.mail-search-input`
alone would have lost to it and the fix would have looked applied and done
nothing. The override matches that specificity exactly and sits below it. This
file already carries the same trick, with the same explanation, in the image
exemption list — worth noticing it is the second time.

tsc clean, vitest all green, a11y 0, motion at ceiling, lint at ceiling, vite
build clean.

MSG
echo "== committed"

echo
echo "==============================================================="
echo " Landed: $NEEDS — push and Vercel ships it."
echo " The mailbox search is a glass capsule: /mail/inbox, and the"
echo " same control on a phone."
echo "==============================================================="
