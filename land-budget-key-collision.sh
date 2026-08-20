#!/bin/bash
# land-budget-key-collision.sh — HOTFIX. The monthly budget was stored on top of
# the profile's own budget answer, and every beauty screen started returning 500.
#
# BACKEND ONLY (together-city-chat). Railway. Push and it recovers itself.
# PRECONDITION: land-budget-in-one-place.sh.
set -euo pipefail

cd "$(dirname "$0")"
[ -d together-city-chat ] || { echo "!! Run this from the Together-Ai repo root."; exit 1; }

if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  echo "== clearing a stale empty .git/index.lock"
  rm -f .git/index.lock
fi

NEEDS="A stored blob is not a type"
LOG="$(git log --oneline -40)"
case "$LOG" in
  *"$NEEDS"*) echo "== \"$NEEDS\" is already here. Nothing to do."; exit 0 ;;
esac
case "$LOG" in
  *"Zero is an answer"*) ;;
  *) echo "!! Run land-budget-in-one-place.sh first — this is written against the tree it produces."; exit 1 ;;
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
ZGlmZiAtLWdpdCBhL3RvZ2V0aGVyLWNpdHktY2hhdC9zcmMvYmVhdXR5L2JlYXV0eS1lbmdpbmUudHMgYi90b2dldGhlci1jaXR5LWNoYXQvc3JjL2JlYXV0eS9iZWF1dHktZW5naW5lLnRzCmluZGV4IDY2NGY4YjkuLjQxMTJiZjkgMTAwNjQ0Ci0tLSBhL3RvZ2V0aGVyLWNpdHktY2hhdC9zcmMvYmVhdXR5L2JlYXV0eS1lbmdpbmUudHMKKysrIGIvdG9nZXRoZXItY2l0eS1jaGF0L3NyYy9iZWF1dHkvYmVhdXR5LWVuZ2luZS50cwpAQCAtMjYxLDcgKzI2MSwxMyBAQCBleHBvcnQgZnVuY3Rpb24gcmVjb21tZW5kUHJvZHVjdHMob3B0czogewogCiAgIC8vIEJ1ZGdldCBiYW5kIGZyb20gdGhlIHByb2ZpbGUgKCLigrkxMDAw4oCTMjUwMCIsICJVbmRlciDigrk1MDAiLCAi4oK5NTAwMCsiKS4KICAgY29uc3QgYnVkZ2V0TWF4ID0gKCgpID0+IHsKLSAgICBjb25zdCBiID0gcHJvZmlsZS5idWRnZXQgPz8gJyc7CisgICAgLy8gVFlQRS1DSEVDS0VEIFJBVEhFUiBUSEFOIFRSVVNURUQuIGBwcm9maWxlYCBpcyBwYXJzZWQgb3V0IG9mIGEgc3RvcmVkIEpTT04KKyAgICAvLyBibG9iLCBzbyBpdHMgZmllbGRzIGFyZSB3aGF0ZXZlciB3YXMgbGFzdCB3cml0dGVuIHRoZXJlIOKAlCBhbmQgd2hlbgorICAgIC8vIHNvbWV0aGluZyB3cm90ZSBhbiBvYmplY3Qgb3ZlciB0aGlzIHN0cmluZywgYC5tYXRjaCgpYCB0aHJldyBpbnNpZGUgdGhlCisgICAgLy8gb25lIGZ1bmN0aW9uIHRoZSBtYXJrZXQsIHRoZSByb3V0aW5lIGFuZCB0aGUgcHJvZmlsZSBhbGwgcGFzcyB0aHJvdWdoLgorICAgIC8vIFRocmVlIHNjcmVlbnMsIG9uZSA1MDAsIGFuZCBhIG1lc3NhZ2UgYWJvdXQgdGhlIHJvdXRpbmUuIEEgc2hhcGUgY2hlY2sgaXMKKyAgICAvLyBvbmUgbGluZTsgYSBzdG9yZWQgYmxvYiBpcyBub3QgYSB0eXBlLgorICAgIGNvbnN0IGIgPSB0eXBlb2YgcHJvZmlsZS5idWRnZXQgPT09ICdzdHJpbmcnID8gcHJvZmlsZS5idWRnZXQgOiAnJzsKICAgICBjb25zdCBudW1zID0gKGIubWF0Y2goL1xkKy9nKSA/PyBbXSkubWFwKE51bWJlcik7CiAgICAgaWYgKCFudW1zLmxlbmd0aCkgcmV0dXJuIG51bGw7CiAgICAgcmV0dXJuIGIuaW5jbHVkZXMoJysnKSA/IEluZmluaXR5IDogTWF0aC5tYXgoLi4ubnVtcyk7CmRpZmYgLS1naXQgYS90b2dldGhlci1jaXR5LWNoYXQvc3JjL2JlYXV0eS9iZWF1dHkuc2VydmljZS50cyBiL3RvZ2V0aGVyLWNpdHktY2hhdC9zcmMvYmVhdXR5L2JlYXV0eS5zZXJ2aWNlLnRzCmluZGV4IGZhZGMyYzkuLjk1NGIxMzAgMTAwNjQ0Ci0tLSBhL3RvZ2V0aGVyLWNpdHktY2hhdC9zcmMvYmVhdXR5L2JlYXV0eS5zZXJ2aWNlLnRzCisrKyBiL3RvZ2V0aGVyLWNpdHktY2hhdC9zcmMvYmVhdXR5L2JlYXV0eS5zZXJ2aWNlLnRzCkBAIC00OTEsOCArNDkxLDEyIEBAIGV4cG9ydCBjbGFzcyBCZWF1dHlTZXJ2aWNlIHsKICAgICovCiAgIGFzeW5jIGdldEJ1ZGdldCh1c2VySWQ6IHN0cmluZyk6IFByb21pc2U8U3RvcmVkQnVkZ2V0IHwgbnVsbD4gewogICAgIGNvbnN0IHJvdyA9IGF3YWl0IHN3YWxsb3codGhpcy5iZWF1dHkuZmluZFVuaXF1ZSh7IHdoZXJlOiB7IHVzZXJJZCB9IH0pLCAnYmVhdXR5OiBwcm9maWxlIHJlYWQnLCB7IHVzZXJJZCB9KTsKLSAgICBjb25zdCBleHRyYXMgPSBzYWZlSnNvbjxCZWF1dHlQcm9maWxlSW5wdXQgJiB7IGJ1ZGdldD86IFN0b3JlZEJ1ZGdldCB9Pihyb3c/LmV4dHJhcywge30pOwotICAgIGNvbnN0IGIgPSBleHRyYXMuYnVkZ2V0OworICAgIGNvbnN0IGV4dHJhcyA9IHNhZmVKc29uPFJlY29yZDxzdHJpbmcsIHVua25vd24+Pihyb3c/LmV4dHJhcywge30pOworICAgIC8vIGBtb250aGx5QnVkZ2V0YCwgTk9UIGBidWRnZXRgIOKAlCBzZWUgc2F2ZUJ1ZGdldCBmb3IgdGhlIGNvbGxpc2lvbiB0aGlzIGtleQorICAgIC8vIGlzIGF2b2lkaW5nLiBUaGUgc2Vjb25kIGJyYW5jaCByZWNvdmVycyB0aGUgaGFuZGZ1bCBvZiBwcm9maWxlcyB3cml0dGVuCisgICAgLy8gZHVyaW5nIHRoZSBob3VyIHRoZSB3cm9uZyBrZXkgd2FzIGxpdmUuCisgICAgY29uc3QgcmF3ID0gKGV4dHJhcy5tb250aGx5QnVkZ2V0ID8/ICh0eXBlb2YgZXh0cmFzLmJ1ZGdldCA9PT0gJ29iamVjdCcgPyBleHRyYXMuYnVkZ2V0IDogbnVsbCkpIGFzIFN0b3JlZEJ1ZGdldCB8IG51bGw7CisgICAgY29uc3QgYiA9IHJhdzsKICAgICBpZiAoIWIgfHwgIVtiLmZhY2UsIGIuaGFpciwgYi5ib2R5XS5ldmVyeSgobikgPT4gdHlwZW9mIG4gPT09ICdudW1iZXInKSkgcmV0dXJuIG51bGw7CiAgICAgcmV0dXJuIHsKICAgICAgIGZhY2U6IGNsYW1wQnVkZ2V0KGIuZmFjZSksIGhhaXI6IGNsYW1wQnVkZ2V0KGIuaGFpciksIGJvZHk6IGNsYW1wQnVkZ2V0KGIuYm9keSksCkBAIC01MDAsMjAgKzUwNCwzNCBAQCBleHBvcnQgY2xhc3MgQmVhdXR5U2VydmljZSB7CiAgICAgfTsKICAgfQogCi0gIC8qKiBTYXZlIGl0LCBjbGFtcGVkLCB3aXRoIHRoZSBtb21lbnQgaXQgd2FzIHNldC4gTmV2ZXIgaW5mZXJyZWQsIG5ldmVyIGd1ZXNzZWQuICovCisgIC8qKgorICAgKiBTYXZlIGl0LCBjbGFtcGVkLCB3aXRoIHRoZSBtb21lbnQgaXQgd2FzIHNldC4gTmV2ZXIgaW5mZXJyZWQsIG5ldmVyIGd1ZXNzZWQuCisgICAqCisgICAqIFRIRSBLRVkgSVMgYG1vbnRobHlCdWRnZXRgIEFORCBUSEFUIElTIFRIRSBXSE9MRSBQT0lOVCBPRiBUSElTIENPTU1FTlQuCisgICAqIGBleHRyYXMuYnVkZ2V0YCB3YXMgYWxyZWFkeSB0YWtlbiDigJQgaXQgaXMgdGhlIHByb2ZpbGUncyBvd24gb25ib2FyZGluZworICAgKiBhbnN3ZXIsIGEgU1RSSU5HIGxpa2UgIuKCuTEwMDDigJMyNTAwIiDigJQgYW5kIHdyaXRpbmcgYW4gb2JqZWN0IG92ZXIgaXQgbWFkZQorICAgKiBgcmVjb21tZW5kUHJvZHVjdHNgIGNhbGwgYC5tYXRjaCgpYCBvbiBhbiBvYmplY3QsIHdoaWNoIGlzIGEgVHlwZUVycm9yLCBpbgorICAgKiB0aGUgb25lIGZ1bmN0aW9uIGV2ZXJ5IGJlYXV0eSBzY3JlZW4gZ29lcyB0aHJvdWdoLiBUaGUgbWFya2V0LCB0aGUgcm91dGluZQorICAgKiBhbmQgdGhlIHByb2ZpbGUgYWxsIHJldHVybmVkIDUwMCB0b2dldGhlciwgYW5kIHRoZSBvbmx5IHZpc2libGUgc3ltcHRvbSB3YXMKKyAgICogIndlIGNvdWxkbid0IGJ1aWxkIHlvdXIgcm91dGluZSIuCisgICAqCisgICAqIFRoZSBvbGQgb2JqZWN0IGlzIGFsc28gREVMRVRFRCB3aGVyZSBpdCBpcyBmb3VuZCwgc28gdGhlIHN0cmluZyBhbnN3ZXIgaXMKKyAgICogZnJlZSB0byBiZSBnaXZlbiBhZ2FpbiByYXRoZXIgdGhhbiBzdGF5aW5nIHBlcm1hbmVudGx5IG9jY3VwaWVkLgorICAgKi8KICAgYXN5bmMgc2F2ZUJ1ZGdldCh1c2VySWQ6IHN0cmluZywgZHRvOiB7IGZhY2U6IG51bWJlcjsgaGFpcjogbnVtYmVyOyBib2R5OiBudW1iZXI7IHByZWZlcmVuY2U/OiBzdHJpbmcgfSkgewogICAgIGNvbnN0IHJvdyA9IGF3YWl0IHN3YWxsb3codGhpcy5iZWF1dHkuZmluZFVuaXF1ZSh7IHdoZXJlOiB7IHVzZXJJZCB9IH0pLCAnYmVhdXR5OiBwcm9maWxlIHJlYWQnLCB7IHVzZXJJZCB9KTsKICAgICBjb25zdCBleHRyYXMgPSBzYWZlSnNvbjxSZWNvcmQ8c3RyaW5nLCB1bmtub3duPj4ocm93Py5leHRyYXMsIHt9KTsKLSAgICBjb25zdCBidWRnZXQ6IFN0b3JlZEJ1ZGdldCA9IHsKKyAgICBpZiAodHlwZW9mIGV4dHJhcy5idWRnZXQgPT09ICdvYmplY3QnICYmIGV4dHJhcy5idWRnZXQgIT09IG51bGwpIGRlbGV0ZSBleHRyYXMuYnVkZ2V0OworICAgIGNvbnN0IG1vbnRobHlCdWRnZXQ6IFN0b3JlZEJ1ZGdldCA9IHsKICAgICAgIGZhY2U6IGNsYW1wQnVkZ2V0KGR0by5mYWNlKSwgaGFpcjogY2xhbXBCdWRnZXQoZHRvLmhhaXIpLCBib2R5OiBjbGFtcEJ1ZGdldChkdG8uYm9keSksCiAgICAgICBzZXRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLCBjdXJyZW5jeTogJ0lOUicsIHByZWZlcmVuY2U6IGR0by5wcmVmZXJlbmNlID8/IG51bGwsCiAgICAgfTsKICAgICBhd2FpdCBzd2FsbG93KHRoaXMuYmVhdXR5LnVwc2VydCh7CiAgICAgICB3aGVyZTogeyB1c2VySWQgfSwKLSAgICAgIHVwZGF0ZTogeyBleHRyYXM6IEpTT04uc3RyaW5naWZ5KHsgLi4uZXh0cmFzLCBidWRnZXQgfSkgfSwKLSAgICAgIGNyZWF0ZTogeyB1c2VySWQsIGV4dHJhczogSlNPTi5zdHJpbmdpZnkoeyBidWRnZXQgfSkgfSwKKyAgICAgIHVwZGF0ZTogeyBleHRyYXM6IEpTT04uc3RyaW5naWZ5KHsgLi4uZXh0cmFzLCBtb250aGx5QnVkZ2V0IH0pIH0sCisgICAgICBjcmVhdGU6IHsgdXNlcklkLCBleHRyYXM6IEpTT04uc3RyaW5naWZ5KHsgbW9udGhseUJ1ZGdldCB9KSB9LAogICAgIH0pLCAnYmVhdXR5OiBidWRnZXQgd3JpdGUnLCB7IHVzZXJJZCB9KTsKLSAgICByZXR1cm4gYnVkZ2V0OworICAgIHJldHVybiBtb250aGx5QnVkZ2V0OwogICB9CiAKICAgLyoqCmRpZmYgLS1naXQgYS90b2dldGhlci1jaXR5LWNoYXQvc3JjL2JlYXV0eS9idWRnZXQtaXMtYS1saW1pdC5zcGVjLnRzIGIvdG9nZXRoZXItY2l0eS1jaGF0L3NyYy9iZWF1dHkvYnVkZ2V0LWlzLWEtbGltaXQuc3BlYy50cwppbmRleCA2NzlkMDQ5Li44YzhjNjczIDEwMDY0NAotLS0gYS90b2dldGhlci1jaXR5LWNoYXQvc3JjL2JlYXV0eS9idWRnZXQtaXMtYS1saW1pdC5zcGVjLnRzCisrKyBiL3RvZ2V0aGVyLWNpdHktY2hhdC9zcmMvYmVhdXR5L2J1ZGdldC1pcy1hLWxpbWl0LnNwZWMudHMKQEAgLTIyMyw2ICsyMjMsMzkgQEAgZGVzY3JpYmUoJ29uZSBjYXRlZ29yeSBkb2VzIG5vdCBzcGVuZCBhbm90aGVyIGNhdGVnb3J5XCdzIG1vbmV5JywgKCkgPT4gewogICB9KTsKIH0pOwogCitkZXNjcmliZSgndGhlIG1vbnRobHkgYnVkZ2V0IGRvZXMgbm90IHNpdCBvbiB0b3Agb2YgdGhlIHByb2ZpbGVcJ3Mgb3duIGFuc3dlcicsICgpID0+IHsKKyAgLyoqCisgICAqIFRIRSBPVVRBR0UgVEhJUyBQUkVWRU5UUy4gYGV4dHJhcy5idWRnZXRgIGlzIHRoZSBwcm9maWxlJ3Mgb25ib2FyZGluZworICAgKiBhbnN3ZXIg4oCUIGEgU1RSSU5HLCAi4oK5MTAwMOKAkzI1MDAiLiBUaGUgbW9udGhseSBidWRnZXQgd2FzIGZpcnN0IHN0b3JlZCB1bmRlcgorICAgKiB0aGF0IHNhbWUga2V5LCBzbyBhbiBvYmplY3QgbGFuZGVkIHdoZXJlIGEgc3RyaW5nIHdhcyBleHBlY3RlZCBhbmQKKyAgICogYHJlY29tbWVuZFByb2R1Y3RzYCBjYWxsZWQgYC5tYXRjaCgpYCBvbiBpdC4gVGhhdCBmdW5jdGlvbiBpcyB0aGUgb25lIGV2ZXJ5CisgICAqIGJlYXV0eSBzY3JlZW4gZ29lcyB0aHJvdWdoOiB0aGUgbWFya2V0LCB0aGUgcm91dGluZSBhbmQgdGhlIHByb2ZpbGUgYWxsCisgICAqIHJldHVybmVkIDUwMCB0b2dldGhlciwgYW5kIHRoZSBvbmx5IHRoaW5nIHRoZSBjaXRpemVuIHNhdyB3YXMgIndlIGNvdWxkbid0CisgICAqIGJ1aWxkIHlvdXIgcm91dGluZSBqdXN0IG5vdyIuCisgICAqCisgICAqIFR3byBndWFyZHMsIGJlY2F1c2UgZWl0aGVyIG9uZSBhbG9uZSB3b3VsZCBoYXZlIGJlZW4gZW5vdWdoIGFuZCBuZWl0aGVyIHdhcworICAgKiB0aGVyZTogdGhlIGtleSBpcyBkaWZmZXJlbnQsIGFuZCB0aGUgcGFyc2VyIGNoZWNrcyB0aGUgc2hhcGUuCisgICAqLworICBpdCgnc3Vydml2ZXMgYSBidWRnZXQgZmllbGQgdGhhdCBpcyBub3QgYSBzdHJpbmcgYXQgYWxsJywgKCkgPT4geworICAgIGNvbnN0IHNoZWxmID0gcmVjb21tZW5kUHJvZHVjdHMoeworICAgICAgcmVhZGluZ3M6IFJFQURJTkdTLCBjb25jZXJuczogW10sCisgICAgICAvLyBFeGFjdGx5IHdoYXQgd2FzIHdyaXR0ZW4gdG8gdGhhdCBmaWVsZCwgY2FzdCB0aHJvdWdoIGB1bmtub3duYCBiZWNhdXNlCisgICAgICAvLyB0aGUgdHlwZSBzYXlzIHN0cmluZyBhbmQgdGhlIHN0b3JlZCBibG9iIGRpZCBub3QgY2FyZS4KKyAgICAgIHByb2ZpbGU6IHsgc2tpblR5cGU6ICdjb21iaW5hdGlvbicsIGJ1ZGdldDogeyBmYWNlOiAzMDAwIH0gYXMgdW5rbm93biBhcyBzdHJpbmcgfSwKKyAgICAgIGluc2lnaHRzOiBbXSwKKyAgICB9KTsKKyAgICBleHBlY3Qoc2hlbGYubGVuZ3RoKS50b0JlR3JlYXRlclRoYW4oMCk7CisgIH0pOworCisgIGl0KCdzdGlsbCByZWFkcyBhIHJlYWwgYnVkZ2V0IHN0cmluZycsICgpID0+IHsKKyAgICBjb25zdCBjaGVhcCA9IHJlY29tbWVuZFByb2R1Y3RzKHsgcmVhZGluZ3M6IFJFQURJTkdTLCBjb25jZXJuczogW10sIHByb2ZpbGU6IHsgc2tpblR5cGU6ICdjb21iaW5hdGlvbicsIGJ1ZGdldDogJ1VuZGVyIOKCuTUwMCcgfSwgaW5zaWdodHM6IFtdIH0pOworICAgIGNvbnN0IHJpY2ggPSByZWNvbW1lbmRQcm9kdWN0cyh7IHJlYWRpbmdzOiBSRUFESU5HUywgY29uY2VybnM6IFtdLCBwcm9maWxlOiB7IHNraW5UeXBlOiAnY29tYmluYXRpb24nLCBidWRnZXQ6ICfigrk1MDAwKycgfSwgaW5zaWdodHM6IFtdIH0pOworICAgIC8vIFRoZSBiYW5kIG51ZGdlcyBwcmVmZXJlbmNlIGJ5IGEgZmV3IHBvaW50cywgc28gdGhlIE9SREVSIG9mIHRoZSBzaGVsZgorICAgIC8vIGRpZmZlcnMgZXZlbiB0aG91Z2ggdGhlIHNhbWUgcHJvZHVjdHMgYXJlIG9uIGl0LgorICAgIGV4cGVjdChjaGVhcC5tYXAoKHApID0+IHAuaWQpKS5ub3QudG9FcXVhbChyaWNoLm1hcCgocCkgPT4gcC5pZCkpOworICB9KTsKK30pOworCiBkZXNjcmliZSgnYSBwcm9maWxlIHdpdGggY29uY2VybnMgYnV0IG5vIHBob3RvIGFzc2Vzc21lbnQnLCAoKSA9PiB7CiAgIGl0KCdnZXRzIHRoZSBlc3NlbnRpYWxzIGFuZCBzdG9wcywgcmF0aGVyIHRoYW4gbm90aGluZyBvciBldmVyeXRoaW5nJywgKCkgPT4gewogICAgIC8vIE5vIG5hbWVkIG5lZWRzIG1lYW5zIG5vIHRyZWF0bWVudCBzdGVwIGFuZCBubyBvcHRpb25hbCBzdGVwcyDigJQgdGhlIHBsYW4K
B64EOF
WANT="4cb9e292acd53aacc057e5e8fa0ec452a29720adccd428f08357c7dfc5c58330"
GOT="$(shasum -a 256 "$PATCH" | awk '{print $1}')"
[ "$GOT" = "$WANT" ] || { echo "!! Patch is corrupt."; echo "   want $WANT"; echo "   got  $GOT"; exit 1; }
echo "== patch verified"
git apply --check -C1 "$PATCH" || { echo "!! Patch does not apply cleanly. Nothing written."; exit 1; }
git apply -C1 "$PATCH"
echo "== applied"

cd together-city-chat
npx tsc --noEmit
npx jest src/beauty src/security
cd ..

git add together-city-chat/src/beauty/beauty.service.ts \
        together-city-chat/src/beauty/beauty-engine.ts \
        together-city-chat/src/beauty/budget-is-a-limit.spec.ts
git commit -F - <<'MSG'
A stored blob is not a type

The Beauty hub went down the moment anybody saved a budget, and the message it
showed was about the wrong thing entirely: "We couldn't build your routine just
now." The market and the profile were failing too. One error, three screens, and
a sentence naming only the third.

THE MONTHLY BUDGET WAS WRITTEN ON TOP OF THE PROFILE'S OWN BUDGET ANSWER.
`extras.budget` has always existed — it is the onboarding question, a STRING
like "₹1000–2500", one of the eighteen the profile counts as complete. The new
per-category budget went into the same key as an OBJECT. Nothing complained:
the column is JSON, the write succeeded, and the profile looked fine.

It broke in `recommendProducts`, which reads that field to work out a price
band:

    const b = profile.budget ?? '';
    const nums = (b.match(/\d+/g) ?? []).map(Number);

`.match` on an object is a TypeError, and that function is the one thing every
beauty screen passes through — the market ranks with it, the routine plans from
its output, the profile shows what it matched. So all three returned 500
together, from a line that had been correct for months and was still correct;
what changed was the shape of something it was handed.

TWO FIXES, BECAUSE EITHER ONE ALONE WOULD HAVE BEEN ENOUGH AND NEITHER EXISTED.

  THE KEY IS `monthlyBudget` NOW, so the string answer and the object never
  share a name again. `getBudget` still accepts an object found at the old key,
  which recovers the profiles written during the hour it was live, and
  `saveBudget` DELETES it when it finds one — the onboarding question gets its
  field back rather than staying permanently occupied by a shape it cannot use.

  AND THE PARSER CHECKS THE SHAPE. `typeof profile.budget === 'string'`. The
  object came out of a stored JSON blob whose TypeScript type is a description
  of what somebody once intended to put there, not a guarantee about what is in
  it. A shape check at that boundary is one line, and its absence was a 500 in
  three places.

THE TESTS PIN BOTH: a budget field that is not a string at all still produces a
full shelf, and a real budget string still moves the ranking. 95 beauty tests.

WHAT THIS SAYS ABOUT THE ERROR MESSAGE, for the next person. The routine page
said "We couldn't build your routine just now — your profile is safe", which is
a good sentence and was describing one symptom of a hub-wide failure. It is
right that a page speaks about itself; it is worth remembering that when three
pages break at once, the first one you happen to open names only its own third
of the problem.

MSG
echo "== committed"

echo
echo "==============================================================="
echo " Landed: $NEEDS"
echo " The budget no longer overwrites the profile's own answer."
echo " Backend, so this is Railway — push, wait for the API to"
echo " redeploy, then reload the routine."
echo "==============================================================="
