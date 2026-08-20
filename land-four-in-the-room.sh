#!/bin/bash
# land-four-in-the-room.sh — the four faults measured on the live site.
#
#   1. GHOST CONTROLS. A select, a text field and an outline button are lit
#      surfaces and were not in the wall's ink-restore list, so their labels
#      inherited the near-white and the controls read as empty.
#   2. THE RAIL TAKES THE BEIGE. It was still the city's white.
#   3. MARKET AND ORDERS GET A SHEET, so the black shows only at the edges.
#   4. THE LAST OUTBOUND LINK GOES, on the Market tile.
#
# Measured in the browser before writing anything: on /beauty/market the sort
# control's face was rgb(231,222,209) with rgb(237,233,226) text, .tc-side was
# rgb(255,255,255), the page carried one .beauty-sheet (the bag bar), and the
# tile title was an <a> to plumgoodness.com.
#
# BUILT AGAINST THIS MACHINE'S OWN FILES, staged off it — the cloud container's
# clone had rolled back and a patch cut there would have reverted the routine
# cards and the image fix.
#
# WEB APP ONLY (together-city-react). Vercel. No API change, no migration.
# PRECONDITION: land-the-whole-picture.sh ("The whole picture").
set -euo pipefail

cd "$(dirname "$0")"
[ -d together-city-chat ] || { echo "!! Run this from the Together-Ai repo root."; exit 1; }

if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  echo "== clearing a stale empty .git/index.lock"
  rm -f .git/index.lock
fi

NEEDS="Four faults in one room"
LOG="$(git log --oneline -40)"
case "$LOG" in
  *"$NEEDS"*) echo "== \"$NEEDS\" is already here. Nothing to do."; exit 0 ;;
esac
case "$LOG" in
  *"The whole picture"*) ;;
  *) echo "!! Run land-the-whole-picture.sh first — this is written against the tree it produces."; exit 1 ;;
esac

ALLOWED='^ M together-city-react/(public/assets/img/(apple-touch-icon-180|tc-icon-1024|tc-icon-192|tc-icon-512|tc-icon-maskable-512)\.png|public/downloads/TogetherCity\.apk)$'
DIRTY="$(git status --porcelain \
  | grep -Ev '^\?\? (land-.*\.sh|push-.*\.sh|.*\.patch|.*\.json|.*\.mjs)$' \
  | grep -Ev "$ALLOWED" || true)"
if [ -n "$DIRTY" ]; then
  echo "!! The tree carries changes this script did not expect:"; echo "$DIRTY"; exit 1
fi

PATCH="$(mktemp "${TMPDIR:-/tmp}/land.XXXXXX")"
trap 'rm -f "$PATCH"' EXIT
cat <<'B64EOF' | tr -d '\n' | openssl base64 -d -A > "$PATCH"
ZGlmZiAtLWdpdCBhL3RvZ2V0aGVyLWNpdHktcmVhY3Qvc3JjL2FwcC9hLXJlYWQtc2VjdGlvbi1mb2xkcy1pdHNlbGYudGVzdC50cyBiL3RvZ2V0aGVyLWNpdHktcmVhY3Qvc3JjL2FwcC9hLXJlYWQtc2VjdGlvbi1mb2xkcy1pdHNlbGYudGVzdC50cwppbmRleCA4YjZiODQ3Li41YjQ2OTliIDEwMDY0NAotLS0gYS90b2dldGhlci1jaXR5LXJlYWN0L3NyYy9hcHAvYS1yZWFkLXNlY3Rpb24tZm9sZHMtaXRzZWxmLnRlc3QudHMKKysrIGIvdG9nZXRoZXItY2l0eS1yZWFjdC9zcmMvYXBwL2EtcmVhZC1zZWN0aW9uLWZvbGRzLWl0c2VsZi50ZXN0LnRzCkBAIC0yNDIsOSArMjQyLDE5IEBAIGRlc2NyaWJlKCd0aGUgYmVhdXR5IGh1YiBwcmludHMgb24gaXRzIG93biBwYXBlcicsICgpID0+IHsKICAgICAvLyB0aGlzIGxpc3QgaXMgdGhhdCBidWcgYWdhaW4uCiAgICAgY29uc3QgcmVsaWVmID0gcmVhZCgnc3R5bGVzL3JlbGllZi5jc3MnKTsKICAgICBjb25zdCBsaXN0ID0gcmVsaWVmLnNsaWNlKHJlbGllZi5pbmRleE9mKCdbZGF0YS1odWI9ImJlYXV0eSJdIC5jYXJkLCcpKTsKLSAgICBmb3IgKGNvbnN0IGNscyBvZiBbJy5iZWF1dHktcGxhdGUnLCAnLmJlYXV0eS1zaGVldCcsICcuYmVhdXR5LWxlYWYtb3BlbicsICcucm91dGluZS1jYXJkJ10pIHsKKyAgICAvLyBDb250cm9scyBqb2luZWQgdGhlIGxpc3QgYWZ0ZXIgdGhlIGxpdmUgTWFya2V0IHBhZ2Ugd2FzIG1lYXN1cmVkOiB0aGUKKyAgICAvLyBzb3J0IHNlbGVjdCdzIGZhY2Ugd2FzIGNyZWFtIGFuZCBpdHMgbGFiZWwgbmVhci13aGl0ZS4gQSBmb3JtIGNvbnRyb2wgaXMKKyAgICAvLyBhIGxpdCBzdXJmYWNlIGV4YWN0bHkgbGlrZSBhIGNhcmQsIGFuZCBpdCBpcyB0aGUga2luZCBvZiB0aGluZyBub2JvZHkKKyAgICAvLyB0aGlua3Mgb2YgYXMgYSAic3VyZmFjZSIgdW50aWwgaXQgaXMgaW52aXNpYmxlLgorICAgIGZvciAoY29uc3QgY2xzIG9mIFsnLmJlYXV0eS1wbGF0ZScsICcuYmVhdXR5LXNoZWV0JywgJy5iZWF1dHktbGVhZi1vcGVuJywgJy5yb3V0aW5lLWNhcmQnLAorICAgICAgICAgICAgICAgICAgICAgICAnLmJ0bi1saW5lJywgJ3NlbGVjdCcsICdpbnB1dCcsICd0ZXh0YXJlYSddKSB7CiAgICAgICBleHBlY3QobGlzdC5zbGljZSgwLCBsaXN0LmluZGV4T2YoJ3snKSkpLnRvQ29udGFpbihgW2RhdGEtaHViPSJiZWF1dHkiXSAke2Nsc31gKTsKICAgICB9CisgICAgLy8g4oCmYW5kIHRoZSBsb3VkIGJ1dHRvbiBtdXN0IHN0YXkgT1VUIG9mIGl0OiBpdCBpcyBhIGJsYWNrIGZhY2Ugd2l0aCBpdHMgb3duCisgICAgLy8gZm9yZWdyb3VuZCwgYW5kIHRoZSBwYXBlcidzIGluayB3b3VsZCBlcmFzZSBpdHMgbGFiZWwgaW5zdGVhZCBvZiBzYXZpbmcgaXQuCisgICAgZm9yIChjb25zdCBjbHMgb2YgWycuYnRuLWxvdWQnLCAnLmJ0bi1hY2NlbnQnXSkgeworICAgICAgZXhwZWN0KGxpc3Quc2xpY2UoMCwgbGlzdC5pbmRleE9mKCd7JykpKS5ub3QudG9Db250YWluKGBbZGF0YS1odWI9ImJlYXV0eSJdICR7Y2xzfWApOworICAgIH0KICAgfSk7CiAKICAgaXQoJ25ldmVyIGluZmxhdGVzIG9yIGNyb3BzIGEgcHJvZHVjdCBwaG90b2dyYXBoJywgKCkgPT4gewpAQCAtMjc2LDEwICsyODYsMjcgQEAgZGVzY3JpYmUoJ3RoZSBiZWF1dHkgaHViIHByaW50cyBvbiBpdHMgb3duIHBhcGVyJywgKCkgPT4gewogICAgIGV4cGVjdCh0b2tlbnMpLnRvTWF0Y2goLy0tc2hvdC1ncm91bmQ6ICNmZmZmZmYvKTsgICAgICAgICAgICAvLyB3aGl0ZSBpbiB0aGlzIGh1YgogICB9KTsKIAotICBpdCgnZG9lcyBub3Qgc2VuZCBzb21lYm9keSB0byBhIHJldGFpbGVyIGZyb20gdGhlIG1pZGRsZSBvZiBpdHMgb3duIGNoZWNrb3V0JywgKCkgPT4geworICBpdCgnZG9lcyBub3Qgc2VuZCBzb21lYm9keSB0byBhIHJldGFpbGVyIGZyb20gYW55d2hlcmUgaW4gdGhlIGh1YicsICgpID0+IHsKICAgICAvLyBUaGUgY2FyZCBjYXJyaWVzIHRoZSBwaG90b2dyYXBoLCB0aGUgYnJhbmQsIHRoZSBzaXplLCB0aGUgbGlmZSBhbmQgdGhlCiAgICAgLy8gcHJpY2Ug4oCUIGl0IElTIHRoZSBwcm9kdWN0IHBhZ2Ug4oCUIGFuZCB0aGUgbmV4dCB0aGluZyBpdCB3YW50cyBpcyB0aGUgYmFnLgotICAgIGNvbnN0IHJvdXRpbmUgPSByZWFkKCdmZWF0dXJlcy9iZWF1dHkvcGFnZXMvUm91dGluZS50c3gnKTsKLSAgICBleHBlY3Qocm91dGluZSkubm90LnRvTWF0Y2goLzxhIGhyZWY9XHtzXC5wcm9kdWN0VXJsXH0vKTsKKyAgICAvLyBCb3RoIHBhZ2VzLCBiZWNhdXNlIHRoZSBNYXJrZXQga2VwdCBpdHMgbGluayBmb3IgYSBkYXkgYWZ0ZXIgdGhlIFJvdXRpbmUKKyAgICAvLyBsb3N0IG9uZSBhbmQgdGhlIGluY29uc2lzdGVuY3kgaXMgd2hhdCBtYWRlIGl0IGVhc3kgdG8gbWlzcy4KKyAgICBmb3IgKGNvbnN0IGYgb2YgWydmZWF0dXJlcy9iZWF1dHkvcGFnZXMvUm91dGluZS50c3gnLCAnZmVhdHVyZXMvYmVhdXR5L3BhZ2VzL01hcmtldC50c3gnXSkgeworICAgICAgZXhwZWN0KHJlYWQoZikpLm5vdC50b01hdGNoKC90YXJnZXQ9Il9ibGFuayIvKTsKKyAgICB9CisgIH0pOworCisgIGl0KCdnaXZlcyB0aGUgc2hvcCBhbmQgdGhlIHNoZWxmIGEgc2hlZXQgdG8gc3RhbmQgb24nLCAoKSA9PiB7CisgICAgLy8gV2l0aG91dCBvbmUsIGEgZ3JpZCBvZiB3aGl0ZSBwcm9kdWN0IHRpbGVzIHNpdHMgc3RyYWlnaHQgb24gdGhlIGJsYWNrCisgICAgLy8gd2FsbCBhbmQgdGhlIHBhZ2UgcmVhZHMgYXMgYSBkaWZmZXJlbnQgYXBwbGljYXRpb24gZnJvbSB0aGUgcmVzdCBvZiB0aGUKKyAgICAvLyBodWIuIFRoZSBvd25lciBjaG9zZTogd2FsbCBzdGF5cywgZXZlcnkgcGFnZSBnZXRzIGEgc2hlZXQuCisgICAgZm9yIChjb25zdCBmIG9mIFsnZmVhdHVyZXMvYmVhdXR5L3BhZ2VzL01hcmtldC50c3gnLCAnZmVhdHVyZXMvYmVhdXR5L3BhZ2VzL09yZGVycy50c3gnXSkgeworICAgICAgZXhwZWN0KHJlYWQoZikpLnRvTWF0Y2goLzxkaXYgY2xhc3NOYW1lPSJiZWF1dHktc2hlZXQiPi8pOworICAgIH0KKyAgfSk7CisKKyAgaXQoJ2dpdmVzIHRoZSByYWlsIHRoZSBodWIgb3duIHBhcGVyJywgKCkgPT4geworICAgIGNvbnN0IHJlbGllZiA9IHJlYWQoJ3N0eWxlcy9yZWxpZWYuY3NzJyk7CisgICAgZXhwZWN0KHJlbGllZikudG9NYXRjaCgvXFtkYXRhLWh1Yj0iYmVhdXR5IlxdIFwudGMtc2lkZSBceyBiYWNrZ3JvdW5kOiB2YXJcKC0tY2FyZFwpOyBcfS8pOwogICB9KTsKIH0pOwpkaWZmIC0tZ2l0IGEvdG9nZXRoZXItY2l0eS1yZWFjdC9zcmMvZmVhdHVyZXMvYmVhdXR5L3BhZ2VzL01hcmtldC50c3ggYi90b2dldGhlci1jaXR5LXJlYWN0L3NyYy9mZWF0dXJlcy9iZWF1dHkvcGFnZXMvTWFya2V0LnRzeAppbmRleCAxNWQ1Y2IwLi5hYTFlOTMzIDEwMDY0NAotLS0gYS90b2dldGhlci1jaXR5LXJlYWN0L3NyYy9mZWF0dXJlcy9iZWF1dHkvcGFnZXMvTWFya2V0LnRzeAorKysgYi90b2dldGhlci1jaXR5LXJlYWN0L3NyYy9mZWF0dXJlcy9iZWF1dHkvcGFnZXMvTWFya2V0LnRzeApAQCAtODgsOSArODgsMTQgQEAgZnVuY3Rpb24gVGlsZSgKICAgICAgIDxkaXYgc3R5bGU9e3sgdGV4dEFsaWduOiAnY2VudGVyJywgcGFkZGluZzogJzAgNnB4JyB9fT4KICAgICAgICAgPGRpdiBjbGFzc05hbWU9Im11dGVkIiBzdHlsZT17eyBmb250U2l6ZTogMTAsIGZvbnRXZWlnaHQ6IDcwMCwgbGV0dGVyU3BhY2luZzogJy4wOWVtJywgdGV4dFRyYW5zZm9ybTogJ3VwcGVyY2FzZScgfX0+e3AuYnJhbmR9PC9kaXY+CiAgICAgICAgIDxkaXYgc3R5bGU9e3sgbWFyZ2luVG9wOiAzIH19PgotICAgICAgICAgIHtwLnByb2R1Y3RVcmwKLSAgICAgICAgICAgID8gPGEgaHJlZj17cC5wcm9kdWN0VXJsfSB0YXJnZXQ9Il9ibGFuayIgcmVsPSJub29wZW5lciBub3JlZmVycmVyIiBzdHlsZT17eyBmb250U2l6ZTogMTMuNSwgZm9udFdlaWdodDogNjAwLCBjb2xvcjogJ3ZhcigtLWluayknLCBsaW5lSGVpZ2h0OiAxLjM1IH19PntwLm5hbWV9PC9hPgotICAgICAgICAgICAgOiA8c3BhbiBzdHlsZT17eyBmb250U2l6ZTogMTMuNSwgZm9udFdlaWdodDogNjAwLCBsaW5lSGVpZ2h0OiAxLjM1IH19PntwLm5hbWV9PC9zcGFuPn0KKyAgICAgICAgICB7LyogTk8gV0FZIE9VVCBPRiBUSEUgU0hPUC4gVGhlIGxhc3Qgb3V0Ym91bmQgbGluayBpbiB0aGUgaHViIOKAlCB0aGUKKyAgICAgICAgICAgICAgdGlsZSdzIG5hbWUgb3BlbmVkIHRoZSByZXRhaWxlcidzIG93biBwYWdlIGluIGEgbmV3IHRhYi4gVGhlCisgICAgICAgICAgICAgIHJvdXRpbmUncyBlcXVpdmFsZW50IHdlbnQgYXQgdGhlIG93bmVyJ3Mgd29yZCBhbmQgdGhpcyBpcyB0aGUKKyAgICAgICAgICAgICAgc2FtZSBhcmd1bWVudCBvbmUgcGFnZSBvdmVyOiBhIG1hcmtldCB0aGF0IHNlbmRzIHlvdSB0bworICAgICAgICAgICAgICBwbHVtZ29vZG5lc3MuY29tIGlzIGEgbWFya2V0IHNob3dpbmcgeW91IHRoZSBkb29yIG9uIHRoZSB3YXkgdG8KKyAgICAgICAgICAgICAgaXRzIG93biBjaGVja291dC4gYHByb2R1Y3RVcmxgIHN0YXlzIG9uIHRoZSB3aXJlOyB0aGUgc2hlbGYgc3BlYworICAgICAgICAgICAgICByZXF1aXJlcyBpdCBhbmQgaXQgaXMgd2hhdCB0aGUgb3JkZXIgaXMgZnVsZmlsbGVkIGFnYWluc3QuICovfQorICAgICAgICAgIDxzcGFuIHN0eWxlPXt7IGZvbnRTaXplOiAxMy41LCBmb250V2VpZ2h0OiA2MDAsIGxpbmVIZWlnaHQ6IDEuMzUgfX0+e3AubmFtZX08L3NwYW4+CiAgICAgICAgIDwvZGl2PgogICAgICAgICA8ZGl2IGNsYXNzTmFtZT0ibXV0ZWQiIHN0eWxlPXt7IGZvbnRTaXplOiAxMi41LCBtYXJnaW5Ub3A6IDQgfX0+4oK5e3AucHJpY2VJbnIudG9Mb2NhbGVTdHJpbmcoJ2VuLUlOJyl9PC9kaXY+CiAKQEAgLTIyNSw3ICsyMzAsMTYgQEAgZXhwb3J0IGZ1bmN0aW9uIE1hcmtldCgpIHsKICAgY29uc3QgaGVhZGluZyA9IGNhdCB8fCAocS50cmltKCkgPyBg4oCcJHtxLnRyaW0oKX3igJ1gIDogYEFsbCAke1NFR01FTlRTLmZpbmQoKHMpID0+IHMua2V5ID09PSBzZWcpIS5sYWJlbC50b0xvd2VyQ2FzZSgpfWApOwogCiAgIHJldHVybiAoCi0gICAgPGRpdj4KKyAgICAvKiBUSEUgU0hFRVQgSVMgV0hBVCBNQUtFUyBUSElTIFBBR0UgUEFSVCBPRiBUSEUgSFVCLiBQcm9maWxlIGFuZCBSb3V0aW5lCisgICAgICAgcmVhZCBhcyBiZWlnZSBiZWNhdXNlIHRoZWlyIHBsYXRlcyBhbmQgc2hlZXRzIGNvdmVyIHRoZSBwYWdlOyB0aGlzIG9uZQorICAgICAgIGhhZCBub3RoaW5nLCBzbyBhIGdyaWQgb2Ygd2hpdGUgcHJvZHVjdCB0aWxlcyBzYXQgc3RyYWlnaHQgb24gdGhlIGJsYWNrCisgICAgICAgd2FsbCBhbmQgdGhlIHdob2xlIHNob3AgcmVhZCBhcyBhIGRpZmZlcmVudCBhcHBsaWNhdGlvbi4gVGhlIG93bmVyJ3MKKyAgICAgICBjYWxsIHdhcyBleHBsaWNpdDogdGhlIHdhbGwgc3RheXMsIGFuZCBldmVyeSBwYWdlIGdldHMgYSBzaGVldCBzbyB0aGUKKyAgICAgICBibGFjayBzaG93cyBvbmx5IGF0IHRoZSBlZGdlcy4KKworICAgICAgIE5PVCBvbiBgLnBhZ2VgIGdsb2JhbGx5IOKAlCB0aGF0IG1ha2VzIG9uZSB1bmRpZmZlcmVudGlhdGVkIGNyZWFtIHNsYWIgYW5kCisgICAgICAgdGhlIHBsYXRlcyBsb3NlIHRoZSBlZGdlIHRoYXQgbWFrZXMgdGhlbSByZWFkIGFzIHBsYXRlcy4gKi8KKyAgICA8ZGl2IGNsYXNzTmFtZT0iYmVhdXR5LXNoZWV0Ij4KICAgICAgIDxkaXYgY2xhc3NOYW1lPSJleWVicm93Ij5CZWF1dHkgTWFya2V0IMK3IFNob3A8L2Rpdj4KIAogICAgICAgey8qIOKUgOKUgCB0aGUgY2F0ZWdvcnkgcm93LCBhY3Jvc3MgdGhlIHRvcCwgYXMgaW4gdGhlIHJlZmVyZW5jZSDilIDilIDilIDilIDilIDilIDilIDilIDilIAgKi99CmRpZmYgLS1naXQgYS90b2dldGhlci1jaXR5LXJlYWN0L3NyYy9mZWF0dXJlcy9iZWF1dHkvcGFnZXMvT3JkZXJzLnRzeCBiL3RvZ2V0aGVyLWNpdHktcmVhY3Qvc3JjL2ZlYXR1cmVzL2JlYXV0eS9wYWdlcy9PcmRlcnMudHN4CmluZGV4IGJjNmE3MzkuLjg5NTYxODAgMTAwNjQ0Ci0tLSBhL3RvZ2V0aGVyLWNpdHktcmVhY3Qvc3JjL2ZlYXR1cmVzL2JlYXV0eS9wYWdlcy9PcmRlcnMudHN4CisrKyBiL3RvZ2V0aGVyLWNpdHktcmVhY3Qvc3JjL2ZlYXR1cmVzL2JlYXV0eS9wYWdlcy9PcmRlcnMudHN4CkBAIC01MCw3ICs1MCw4IEBAIGV4cG9ydCBmdW5jdGlvbiBPcmRlcnMoKSB7CiAgIGNvbnN0IGxpc3QgPSBvcmRlcnMuZGF0YSA/PyBbXTsKIAogICByZXR1cm4gKAotICAgIDxkaXY+CisgICAgLyogU2FtZSBzaGVldCBhcyB0aGUgTWFya2V0LCBmb3IgdGhlIHNhbWUgcmVhc29uIOKAlCBzZWUgdGhlIG5vdGUgdGhlcmUuICovCisgICAgPGRpdiBjbGFzc05hbWU9ImJlYXV0eS1zaGVldCI+CiAgICAgICA8ZGl2IGNsYXNzTmFtZT0iZXllYnJvdyI+QmVhdXR5IE1hcmtldCDCtyBPcmRlcnM8L2Rpdj4KICAgICAgIDxoMSBzdHlsZT17eyBmb250U2l6ZTogMjYgfX0+e2hhc0JhZyA/ICdZb3VyIGJhZycgOiAnWW91ciBvcmRlcnMnfTwvaDE+CiAKZGlmZiAtLWdpdCBhL3RvZ2V0aGVyLWNpdHktcmVhY3Qvc3JjL3N0eWxlcy9yZWxpZWYuY3NzIGIvdG9nZXRoZXItY2l0eS1yZWFjdC9zcmMvc3R5bGVzL3JlbGllZi5jc3MKaW5kZXggNzU0YjQ5OS4uYTdmMWVkMyAxMDA2NDQKLS0tIGEvdG9nZXRoZXItY2l0eS1yZWFjdC9zcmMvc3R5bGVzL3JlbGllZi5jc3MKKysrIGIvdG9nZXRoZXItY2l0eS1yZWFjdC9zcmMvc3R5bGVzL3JlbGllZi5jc3MKQEAgLTI5NzIsNiArMjk3MiwxMSBAQCB0ZXh0YXJlYS5nLWZpZWxkIHsgcmVzaXplOiBub25lOyBsaW5lLWhlaWdodDogMS41NTsgfQogICAgYWRkcyB0byBhIGJlYXV0eSBwYWdlIGlzIGRhcmsgaW5rIG9uIGEgYmxhY2sgd2FsbCBhbmQgbG9va3MgZmluZSBpbiByZXZpZXcsCiAgICBiZWNhdXNlIHdob2V2ZXIgd3JpdGVzIGl0IGhhcyB0aGUgY2FyZCB0aGV5IHdlcmUgd29ya2luZyBpbiBvbiBzY3JlZW4uICovCiBbZGF0YS1odWI9ImJlYXV0eSJdIGJvZHkgeyBiYWNrZ3JvdW5kOiB0cmFuc3BhcmVudDsgfQorLyogVEhFIFJBSUwgSVMgRlVSTklUVVJFIElOIFRIRSBST09NLCBOT1QgQSBIT0xFIElOIFRIRSBXQUxMLiBJdCBzdGF5ZWQgdGhlCisgICBjaXR5J3Mgd2hpdGUgd2hpbGUgZXZlcnkgc3VyZmFjZSBiZXNpZGUgaXQgd2VudCBjcmVhbSwgc28gdGhlIG9uZSBwZXJtYW5lbnQKKyAgIG9iamVjdCBvbiBzY3JlZW4gd2FzIHRoZSBvbmUgb2JqZWN0IHRoYXQgZGlkIG5vdCBiZWxvbmcgdG8gdGhlIGh1Yi4gSXRzIGluaworICAgaXMgYWxyZWFkeSB0aGUgcGFwZXIncywgZnJvbSB0aGUgbGlzdCBiZWxvdzsgdGhpcyBpcyB0aGUgZmFjZS4gKi8KK1tkYXRhLWh1Yj0iYmVhdXR5Il0gLnRjLXNpZGUgeyBiYWNrZ3JvdW5kOiB2YXIoLS1jYXJkKTsgfQogW2RhdGEtaHViPSJiZWF1dHkiXSAudGMtc2hlbGwsCiBbZGF0YS1odWI9ImJlYXV0eSJdIC50Yy1tYWluLAogW2RhdGEtaHViPSJiZWF1dHkiXSAucGFnZSB7IGJhY2tncm91bmQ6IHRyYW5zcGFyZW50OyB9CkBAIC0zMDAxLDcgKzMwMDYsMTkgQEAgdGV4dGFyZWEuZy1maWVsZCB7IHJlc2l6ZTogbm9uZTsgbGluZS1oZWlnaHQ6IDEuNTU7IH0KIFtkYXRhLWh1Yj0iYmVhdXR5Il0gLnJvdXRpbmUtY2FyZCwKIFtkYXRhLWh1Yj0iYmVhdXR5Il0gLm1vZGFsLAogW2RhdGEtaHViPSJiZWF1dHkiXSAuc2hlZXQsCi1bZGF0YS1odWI9ImJlYXV0eSJdIC50Yy1zaWRlIHsKK1tkYXRhLWh1Yj0iYmVhdXR5Il0gLnRjLXNpZGUsCisvKiBBIENPTlRST0wgSVMgQSBMSVQgU1VSRkFDRSBUT08sIHdoaWNoIGlzIHRoZSB0aGlyZCB0aW1lIHRoaXMgbGlzdCBoYXMgYmVlbgorICAgdGhlIGFuc3dlciBhbmQgdGhlIGZpcnN0IHRpbWUgaXQgaGFzIGJlZW4gYWJvdXQgc29tZXRoaW5nIG90aGVyIHRoYW4gYSBjYXJkLgorICAgQW4gb3V0bGluZSBidXR0b24sIGEgc2VsZWN0IGFuZCBhIHRleHQgZmllbGQgYWxsIHBhaW50IHRoZW1zZWx2ZXMgaW4gLS1wYXBlcgorICAgb3Igd2hpdGUgYW5kIHRoZW4gZHJhdyBhIGxhYmVsIG9uIHRvcDsgb24gdGhlIHdhbGwgdGhhdCBsYWJlbCBpbmhlcml0ZWQgdGhlCisgICBuZWFyLXdoaXRlIGFuZCB0aGUgYnV0dG9uIHJlYWQgYXMgZW1wdHkuIE1lYXN1cmVkIG9uIHRoZSBsaXZlIE1hcmtldCBwYWdlOgorICAgdGhlIHNvcnQgY29udHJvbCdzIGZhY2Ugd2FzIHJnYigyMzEsMjIyLDIwOSkgYW5kIGl0cyB0ZXh0IHJnYigyMzcsMjMzLDIyNikuCisgICAuYnRuLWxvdWQgYW5kIC5idG4tYWNjZW50IGFyZSBkZWxpYmVyYXRlbHkgTk9UIGhlcmUg4oCUIHRob3NlIGFyZSBibGFjayBmYWNlcworICAgdGhhdCBzZXQgdGhlaXIgb3duIC0tb24tbG91ZCwgYW5kIGRhcmsgaW5rIHdvdWxkIGVyYXNlIHRoZW0gaW5zdGVhZC4gKi8KK1tkYXRhLWh1Yj0iYmVhdXR5Il0gLmJ0bi1saW5lLAorW2RhdGEtaHViPSJiZWF1dHkiXSBzZWxlY3QsCitbZGF0YS1odWI9ImJlYXV0eSJdIGlucHV0LAorW2RhdGEtaHViPSJiZWF1dHkiXSB0ZXh0YXJlYSB7CiAgIC0taW5rOiAgICAgIHZhcigtLW9uLXBhcGVyKTsKICAgLS1pbmstc29mdDogdmFyKC0tb24tcGFwZXItc29mdCk7CiAgIC0tbXV0ZWQ6ICAgIHZhcigtLW9uLXBhcGVyLW11dGVkKTsK
B64EOF
WANT="ecb5d229f3c014c2e2171498f6ebd321864532de2d26579a5ca41909a2a6d960"
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

git add -A together-city-react/src
git commit -F - <<'MSG'
Four faults in one room

All four measured in the browser on the live site before a line was written,
which is the only reason the third one was found at all — it does not look
broken in a screenshot, it looks like a design choice.

── 1. A CONTROL IS A LIT SURFACE TOO ──────────────────────────────────────────

The gallery wall re-points --ink to near-white inside .tc-main by inheritance,
and every surface that paints itself cream must put the paper's ink back through
one list in relief.css. An outline button, a select and a text field all do
exactly that — paint a light face, then draw a label on it — and none of them
was on the list. On /beauty/market the sort control measured a face of
rgb(231,222,209) with rgb(237,233,226) text: a cream pill with a cream label.

This is the third time that list has been the answer and the first time it has
been about something other than a card, which is the lesson: "surface" is not a
synonym for "card". .btn-loud and .btn-accent stay OUT of it deliberately —
those are black faces with their own foreground, and the paper's ink would erase
their labels rather than save them. The test now asserts both halves: the four
that must be in, and the two that must not.

── 2. THE RAIL IS FURNITURE IN THE ROOM, NOT A HOLE IN THE WALL ───────────────

.tc-side was still rgb(255,255,255) while every surface beside it had gone
cream, so the one permanent object on screen was the one object that did not
belong to the hub. Its ink was already right; only the face was missing.

── 3. THE SHOP AND THE SHELF GET A SHEET ──────────────────────────────────────

Profile and Routine read as beige because their plates and sheets cover the
page. Market had exactly one .beauty-sheet on it — the bag bar — so a grid of
white product tiles sat straight on the black wall and the shop read as a
different application from the rest of the hub. Orders had the same hole.

The owner's call was explicit when asked: the wall stays, and every page gets a
sheet so the black shows only at the edges. Not on `.page` globally — that makes
one undifferentiated cream slab and the plates lose the edge that makes them
read as plates.

── 4. NO WAY OUT OF THE SHOP ──────────────────────────────────────────────────

The last outbound link in the hub: the Market tile's name opened
plumgoodness.com in a new tab. The Routine's equivalent went yesterday at the
owner's word and this is the same argument one page over — a market that sends
you to the manufacturer is a market showing you the door on the way to its own
checkout. `productUrl` stays on the wire; the shelf spec requires it and it is
what an order is fulfilled against. The test now checks both pages, because the
Market kept its link for a day after the Routine lost one and that inconsistency
is exactly what made it easy to miss.

Backend untouched: no route, no schema, no query changed.
MSG

echo "== committed"
cat <<'DONE'

===============================================================
 Landed: Four faults in one room
 Push — Vercel rebuilds. /beauty/market: cream sheet under the
 grid, readable sort control, beige rail, no link out.
===============================================================

DONE
